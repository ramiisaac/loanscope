"use server";

import { LoanPurpose, Occupancy, PropertyType, money, ratePct } from "@loanscope/domain";
import { quickQuoteToTransaction } from "@loanscope/engine";
import { filterDisplayProducts, getAllProducts } from "@loanscope/products";
import { simulate, type SimulationObjective, type SimulationPlan } from "@loanscope/sim";
import { describeAction } from "@loanscope/sim";

export interface SimulateInput {
  loanAmount: number;
  purchasePrice: number;
  fico: number;
  monthlyIncome: number;
  noteRate: number;
  maxDepth: number;
  objectives: string[];
}

export interface SimulateFixResult {
  productId: string;
  productName: string;
  eligible: boolean;
  actions: string[];
  cashRequired: number;
}

export interface SimulateResult {
  fixes: SimulateFixResult[];
  statesExplored: number;
  terminated: "complete" | "limit" | "timeout";
  error?: string;
}

const VALID_OBJECTIVES = new Set<string>([
  "MaximizeEligible",
  "MinimizeCash",
  "MinimizeActions",
  "MaximizeWorstMargin",
]);

export async function runSimulation(input: SimulateInput): Promise<SimulateResult> {
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
      monthlyDebts: money(0),
    });

    const allProducts = getAllProducts();
    const displayProducts = filterDisplayProducts(allProducts);

    const objectives: SimulationObjective[] = input.objectives.filter(
      (o): o is SimulationObjective => VALID_OBJECTIVES.has(o),
    );

    if (objectives.length === 0) {
      objectives.push("MaximizeEligible");
    }

    const plan: SimulationPlan = {
      borrowerSets: [transaction.borrowers.map((b) => b.id)],
      payoffCandidates: (transaction.liabilities ?? []).map((l) => l.id),
      maxPayoffCount: 2,
      maxLoanPaydown: money(50000),
      maxDownPaymentAdjust: money(100000),
      objectives,
      limits: {
        maxStates: 500,
        maxDepth: input.maxDepth,
        timeoutMs: 10000,
      },
    };

    const report = simulate(transaction, displayProducts, plan);

    const fixes: SimulateFixResult[] = report.perProductFixes.map((fix) => ({
      productId: fix.productId,
      productName: fix.productName,
      eligible: fix.eligible,
      actions: fix.actions.map((action) => describeAction(action)),
      cashRequired: Number(fix.cashRequired),
    }));

    // Sort: eligible first, then by cash required ascending
    fixes.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.cashRequired - b.cashRequired;
    });

    return {
      fixes,
      statesExplored: report.statesExplored,
      terminated: report.terminated,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      fixes: [],
      statesExplored: 0,
      terminated: "complete",
      error: message,
    };
  }
}
