"use server";

import {
  ComparisonGridBuilder,
  executeGrid,
  ltvSteps,
  loanAmountSteps,
  rateDimension,
  type GridResult,
} from "@loanscope/compare";
import {
  LoanPurpose,
  Occupancy,
  PropertyType,
  money,
  ratePct,
  type RatePct,
} from "@loanscope/domain";
import { quickQuoteToTransaction } from "@loanscope/engine";
import { filterDisplayProducts, getAllProducts } from "@loanscope/products";

export interface CompareInput {
  loanAmount: number;
  purchasePrice: number;
  fico: number;
  monthlyIncome: number;
  noteRate: number;
  sweepType: "ltv" | "rate" | "loanAmount";
  sweepMin: number;
  sweepMax: number;
  sweepStep: number;
}

export interface CompareProductCell {
  productId: string;
  productName: string;
  eligible: boolean | null;
  monthlyPayment: number | null;
  ltv: number | null;
  dti: number | null;
}

export interface CompareRow {
  dimension: string;
  products: CompareProductCell[];
}

export interface CompareResult {
  headers: string[];
  rows: CompareRow[];
  summary: {
    totalCells: number;
    passCount: number;
    failCount: number;
    errorCount: number;
  };
  error?: string;
}

function buildDimensionLabel(sweepType: CompareInput["sweepType"], value: unknown): string {
  const num = Number(value);
  switch (sweepType) {
    case "ltv":
      return `${(num * 100).toFixed(1)}%`;
    case "rate":
      return `${num.toFixed(3)}%`;
    case "loanAmount":
      return `$${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
}

function dimensionCoordKey(sweepType: CompareInput["sweepType"]): string {
  switch (sweepType) {
    case "ltv":
      return "ltv";
    case "rate":
      return "rate";
    case "loanAmount":
      return "loanAmount";
  }
}

export async function runComparison(input: CompareInput): Promise<CompareResult> {
  try {
    const transaction = quickQuoteToTransaction({
      loanAmount: money(input.loanAmount),
      purchasePrice: money(input.purchasePrice),
      fico: input.fico,
      monthlyIncome: money(input.monthlyIncome),
      noteRatePct: ratePct(input.noteRate),
      loanPurpose: LoanPurpose.Purchase,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
    });

    const allProducts = getAllProducts();
    const displayProducts = filterDisplayProducts(allProducts);

    const builder = ComparisonGridBuilder.fromTransaction(transaction);
    builder.withProducts(displayProducts);

    switch (input.sweepType) {
      case "ltv":
        builder.withDimension(
          ltvSteps(
            input.sweepMin as ReturnType<typeof money> & {
              readonly __brand: "Ratio";
            },
            input.sweepMax as ReturnType<typeof money> & {
              readonly __brand: "Ratio";
            },
            input.sweepStep as ReturnType<typeof money> & {
              readonly __brand: "Ratio";
            },
          ),
        );
        break;
      case "rate": {
        const rateValues: RatePct[] = [];
        for (let r = input.sweepMin; r <= input.sweepMax + 1e-9; r += input.sweepStep) {
          rateValues.push(ratePct(Number(r.toFixed(4))));
        }
        builder.withDimension(rateDimension(rateValues));
        break;
      }
      case "loanAmount":
        builder.withDimension(
          loanAmountSteps(money(input.sweepMin), money(input.sweepMax), money(input.sweepStep)),
        );
        break;
    }

    const grid = builder.build();
    const result: GridResult = executeGrid(grid, displayProducts);

    return serializeGridResult(
      result,
      input.sweepType,
      displayProducts.map((p) => p.id),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      headers: [],
      rows: [],
      summary: { totalCells: 0, passCount: 0, failCount: 0, errorCount: 0 },
      error: message,
    };
  }
}

function serializeGridResult(
  result: GridResult,
  sweepType: CompareInput["sweepType"],
  productIds: string[],
): CompareResult {
  const coordKey = dimensionCoordKey(sweepType);

  // Collect unique dimension values and unique product names
  const dimensionValues = new Map<string, unknown>();
  const productMap = new Map<string, string>(); // productId -> productName

  for (const cell of result.cells) {
    const dimVal = cell.coordinates[coordKey];
    const dimKey = String(dimVal);
    if (!dimensionValues.has(dimKey)) {
      dimensionValues.set(dimKey, dimVal);
    }
    productMap.set(cell.result.productId, cell.result.productName);
  }

  // Also collect product info from errors
  for (const err of result.errors) {
    const dimVal = err.coordinates[coordKey];
    const dimKey = String(dimVal);
    if (!dimensionValues.has(dimKey)) {
      dimensionValues.set(dimKey, dimVal);
    }
  }

  const orderedProductIds = productIds.filter((id) => productMap.has(id));
  const headers = orderedProductIds.map((id) => productMap.get(id) ?? id);

  // Build a lookup: dimKey+productId -> cell
  const cellLookup = new Map<string, (typeof result.cells)[number]>();
  for (const cell of result.cells) {
    const dimKey = String(cell.coordinates[coordKey]);
    cellLookup.set(`${dimKey}::${cell.result.productId}`, cell);
  }

  // Sort dimension values numerically
  const sortedDimEntries = [...dimensionValues.entries()].sort(
    (a, b) => Number(a[1]) - Number(b[1]),
  );

  const rows: CompareRow[] = sortedDimEntries.map(([dimKey, dimVal]) => {
    const products: CompareProductCell[] = orderedProductIds.map((productId) => {
      const cell = cellLookup.get(`${dimKey}::${productId}`);
      if (!cell) {
        return {
          productId,
          productName: productMap.get(productId) ?? productId,
          eligible: null,
          monthlyPayment: null,
          ltv: null,
          dti: null,
        };
      }
      return {
        productId: cell.result.productId,
        productName: cell.result.productName,
        eligible: cell.result.full?.eligible ?? null,
        monthlyPayment:
          cell.result.pricing?.payment != null ? Number(cell.result.pricing.payment) : null,
        ltv: cell.result.ltv?.ltvPct != null ? Number(cell.result.ltv.ltvPct) : null,
        dti: cell.result.dti?.dtiPct != null ? Number(cell.result.dti.dtiPct) : null,
      };
    });
    return {
      dimension: buildDimensionLabel(sweepType, dimVal),
      products,
    };
  });

  return {
    headers,
    rows,
    summary: {
      totalCells: result.summary.totalCells,
      passCount: result.summary.passCount,
      failCount: result.summary.failCount,
      errorCount: result.summary.errorCount,
    },
  };
}
