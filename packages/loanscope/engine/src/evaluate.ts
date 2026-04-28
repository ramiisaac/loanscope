import Decimal from "decimal.js";
import { buildMortgageGraph } from "@loanscope/calculations";
import { evaluate as evaluateGraph } from "@loanscope/graph";
import type { EvaluationResult } from "@loanscope/graph";
import { AmortizationType, ProgramKind } from "@loanscope/domain";
import type {
  Money,
  ProductDefinition,
  ProgramRules,
  Transaction,
  TransactionVariant,
} from "@loanscope/domain";
import { money, months, ratio } from "@loanscope/domain";
import { buildEffectiveData } from "./effective-data";
import { getEffectiveConstraints, resolveVariant } from "./tier-resolver";

const DEFAULT_RULES: Readonly<Partial<ProgramRules>> = {
  unitsAllowed: [1, 2, 3, 4],
  allowedTerms: [360],
  minFico: 620,
  maxDTIRatio: ratio(0.5),
  maxLTVRatio: ratio(0.97),
  maxCLTVRatio: ratio(0.97),
  reservesPolicy: { kind: "AUSDetermined" },
};

/** Sum subordinate lien amounts using decimal.js for money math. */
const sumSubordinate = (liens?: ReadonlyArray<{ amount: Money }>): Money => {
  if (!liens || liens.length === 0) return money(0);
  const total = liens.reduce((sum, lien) => sum.plus(new Decimal(lien.amount)), new Decimal(0));
  return money(total.toNumber());
};

/** Minimum representative FICO across included borrowers. */
const minFico = (borrowers: ReadonlyArray<{ fico: number }>): number => {
  if (borrowers.length === 0) return 0;
  return borrowers.reduce((min, borrower) => Math.min(min, borrower.fico), borrowers[0]?.fico ?? 0);
};

/**
 * Strips any key whose value is `undefined` from the inputs record.
 * This is the single engine boundary adapter that ensures the graph
 * executor never receives undefined-valued entries.
 */
const stripUndefinedInputs = (raw: Record<string, unknown>): Record<string, unknown> => {
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

/**
 * Core engine evaluation entry point.
 *
 * This function is the single authoritative location where rule-derived
 * inputs are assembled and passed to the graph. The graph builder
 * (`buildMortgageGraph`) only constructs the structural graph (nodes
 * and edges) without injecting any default values from product rules.
 */
export const evaluate = (
  transaction: Transaction,
  variant: TransactionVariant,
  product: ProductDefinition,
): EvaluationResult => {
  const graph = buildMortgageGraph();
  const effective = buildEffectiveData(transaction, variant);
  const scenario = transaction.scenario;

  const amortizationType =
    scenario.rateNote.productKind === ProgramKind.InterestOnly ||
    (scenario.rateNote.interestOnlyMonths ?? 0) > 0
      ? AmortizationType.InterestOnly
      : scenario.rateNote.productKind === ProgramKind.ARM
        ? AmortizationType.ARM
        : AmortizationType.FullyAmortizing;

  const programKindForVariant =
    scenario.rateNote.productKind === ProgramKind.ARM ? ProgramKind.ARM : ProgramKind.Fixed;

  const rules: Partial<ProgramRules> = {
    ...DEFAULT_RULES,
    ...getEffectiveConstraints(product, transaction, amortizationType),
  };

  const resolvedVariant = resolveVariant(
    product,
    scenario.rateNote.amortizationMonths ?? 360,
    scenario.occupancy,
    amortizationType,
    programKindForVariant,
    scenario.rateNote.arm?.initialFixedMonths,
  );

  /*
   * Assemble the flat inputs record. Rule-derived values are mixed in
   * alongside scenario data; source tagging is handled by the graph
   * executor (provided vs defaulted vs derived vs estimated).
   *
   * Keys whose resolved value is `undefined` are stripped by the
   * boundary adapter below so the graph never sees them.
   */
  const rawInputs: Record<string, unknown> = {
    // --- Scenario data ---
    baseLoanAmount: scenario.requestedLoanAmount,
    financedUpfrontFees: transaction.financedUpfrontFees ?? false,
    propertyValue: scenario.appraisedValue ?? scenario.purchasePrice,
    purchasePrice: scenario.purchasePrice,
    downPayment: scenario.downPayment,
    fico: minFico(effective.borrowers),
    ficoScores: effective.borrowers.flatMap((b) => b.ficoScores ?? []),
    noteRatePct: scenario.rateNote.noteRatePct,
    amortizationMonths: scenario.rateNote.amortizationMonths ?? months(360),
    interestOnlyMonths:
      scenario.rateNote.interestOnlyMonths ??
      resolvedVariant.amortization.interestOnlyMonths ??
      months(0),
    amortizationType: resolvedVariant.amortization.type,
    borrowers: effective.borrowers,
    liabilities: effective.liabilities,
    assets: effective.assets,
    propertyTax: scenario.monthlyHousing.propertyTax,
    insurance: scenario.monthlyHousing.insurance,
    hoa: scenario.monthlyHousing.hoa,
    mi: scenario.monthlyHousing.mi,
    floodInsurance: scenario.monthlyHousing.floodInsurance,
    loanPurpose: scenario.loanPurpose,
    occupancy: scenario.occupancy,
    propertyType: scenario.propertyType,
    units: scenario.units ?? 1,
    stateCode: scenario.location?.stateCode,
    closingCosts: scenario.closingCosts.estimatedTotal,
    includedBorrowerIds: effective.includedBorrowerIds,
    payoffLiabilityIds: effective.payoffLiabilityIds,
    subordinateLiens: sumSubordinate(scenario.subordinateFinancing),
    cashOut: scenario.cashOut,
    buydown: scenario.buydown,
    miSelection: scenario.miSelection,
    subjectPropertyRental: scenario.subjectPropertyRental,
    ausFindings: transaction.ausFindings,
    loanType: product.loanType,
    vaServiceContext: scenario.vaServiceContext,

    // --- Rule-derived constraints (single authoritative path) ---
    reservesPolicy: rules.reservesPolicy,
    incomePolicies: rules.incomePolicies,
    borrowerBlendPolicy: transaction.borrowerBlendPolicy,
    qualifyingPaymentPolicy: resolvedVariant.amortization.qualifyingPaymentPolicy,
    maxLTVRatio: rules.maxLTVRatio,
    maxCLTVRatio: rules.maxCLTVRatio,
    maxDTIRatio: rules.maxDTIRatio,
    minFico: rules.minFico,
    minLoanAmount: rules.minLoanAmount,
    maxLoanAmount: rules.maxLoanAmount,
    minLoanAmountRule: rules.minLoanAmountRule,
    maxLtvByOccupancy: rules.maxLtvByOccupancy,
    maxLtvByPurpose: rules.maxLtvByPurpose,
    allowedOccupancies: rules.allowedOccupancies,
    allowedPurposes: rules.allowedPurposes,
    // Pass through only when rules explicitly define allowed property types.
    // Do NOT fabricate a constraint from the scenario's own propertyType.
    allowedPropertyTypes: rules.allowedPropertyTypes,
    unitsAllowed: rules.unitsAllowed ?? [1, 2, 3, 4],
    borrowerRestrictions: rules.borrowerRestrictions,
    stateIneligibility: rules.propertyRestrictions?.stateIneligibility ?? [],
    cashOutConstraints: rules.cashOutConstraints,
    buydownRules: rules.buydownRules,
    miRules: rules.miRules,
    ausRules: rules.ausRules,
    appraisalRules: rules.appraisalRules,
    reservesIneligibleTypes: rules.assetEligibilityOverrides?.reservesIneligibleTypes ?? [],
  };

  const inputs = stripUndefinedInputs(rawInputs);
  return evaluateGraph(graph, inputs);
};
