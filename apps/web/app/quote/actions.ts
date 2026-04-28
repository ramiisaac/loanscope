"use server";

import { quickQuoteToTransaction, evaluateAll } from "@loanscope/engine";
import { filterDisplayProducts, getAllProducts } from "@loanscope/products";
import { money, ratePct } from "@loanscope/domain";
import { Occupancy, LoanPurpose, PropertyType } from "@loanscope/domain";
import type { QuickQuoteInput } from "@loanscope/domain";
import type { Units } from "@loanscope/domain";

export interface QuoteInput {
  loanAmount: number;
  purchasePrice: number;
  fico: number;
  monthlyIncome: number;
  noteRate: number;
  occupancy: string;
  loanPurpose: string;
  propertyType: string;
  units: number;
}

export interface SerializableResult {
  productId: string;
  productName: string;
  eligible: boolean;
  ltv: number | null;
  dti: number | null;
  monthlyPayment: number | null;
  failReasons: string[];
  warnings: string[];
}

export interface QuoteResult {
  results: SerializableResult[];
  error?: string;
}

function parseOccupancy(value: string): Occupancy {
  const map: Record<string, Occupancy> = {
    Primary: Occupancy.Primary,
    Secondary: Occupancy.Secondary,
    Investment: Occupancy.Investment,
  };
  const result = map[value];
  if (result === undefined) {
    throw new Error(`Invalid occupancy: ${value}`);
  }
  return result;
}

function parseLoanPurpose(value: string): LoanPurpose {
  const map: Record<string, LoanPurpose> = {
    Purchase: LoanPurpose.Purchase,
    RateTermRefi: LoanPurpose.RateTermRefi,
    CashOutRefi: LoanPurpose.CashOutRefi,
  };
  const result = map[value];
  if (result === undefined) {
    throw new Error(`Invalid loan purpose: ${value}`);
  }
  return result;
}

function parsePropertyType(value: string): PropertyType {
  const map: Record<string, PropertyType> = {
    SFR: PropertyType.SFR,
    Condo: PropertyType.Condo,
    Townhome: PropertyType.Townhome,
    MultiUnit: PropertyType.MultiUnit,
    Manufactured: PropertyType.Manufactured,
    CoOp: PropertyType.CoOp,
    Leasehold: PropertyType.Leasehold,
    PUD: PropertyType.PUD,
  };
  const result = map[value];
  if (result === undefined) {
    throw new Error(`Invalid property type: ${value}`);
  }
  return result;
}

function parseUnits(value: number): Units {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }
  throw new Error(`Invalid units: ${value}`);
}

export async function runQuote(input: QuoteInput): Promise<QuoteResult> {
  try {
    const quickQuoteInput: QuickQuoteInput = {
      loanAmount: money(input.loanAmount),
      loanPurpose: parseLoanPurpose(input.loanPurpose),
      occupancy: parseOccupancy(input.occupancy),
      propertyType: parsePropertyType(input.propertyType),
      fico: input.fico,
      purchasePrice: money(input.purchasePrice),
      monthlyIncome: money(input.monthlyIncome),
      noteRatePct: ratePct(input.noteRate),
      units: parseUnits(input.units),
    };

    const transaction = quickQuoteToTransaction(quickQuoteInput);

    const allProducts = getAllProducts();
    const displayProducts = filterDisplayProducts(allProducts);

    const groups = evaluateAll(transaction, displayProducts);

    // Flatten all variant results (quick quote typically has one variant)
    const allResults = groups.flatMap((group) => group.results);

    const serialized: SerializableResult[] = allResults.map((result) => ({
      productId: result.productId,
      productName: result.productName,
      eligible: result.eligible,
      ltv:
        result.derived.ltvRatio !== undefined
          ? Number((Number(result.derived.ltvRatio) * 100).toFixed(2))
          : null,
      dti: Number((Number(result.derived.cashFlow.dtiBackEndRatio) * 100).toFixed(2)),
      monthlyPayment:
        result.derived.qualifyingPayment !== undefined
          ? Number(Number(result.derived.qualifyingPayment).toFixed(2))
          : null,
      failReasons: result.failureReasons,
      warnings: result.warnings,
    }));

    // Sort: eligible first, then by product name
    serialized.sort((a, b) => {
      if (a.eligible !== b.eligible) {
        return a.eligible ? -1 : 1;
      }
      return a.productName.localeCompare(b.productName);
    });

    return { results: serialized };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { results: [], error: message };
  }
}
