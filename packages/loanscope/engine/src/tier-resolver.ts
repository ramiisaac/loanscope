import { AmortizationType, LoanPurpose, Occupancy, ProgramKind } from "@loanscope/domain";
import type { Money, ProductDefinition, ProgramRules, Transaction } from "@loanscope/domain";
import {
  findApplicableTier,
  mergeRules,
  resolveVariant,
  setIfDefined,
  toProgramRules,
} from "@loanscope/program-rules";
/**
 * `ProgramRules` flavored for the post-resolution view used by the
 * evaluator. Currently structurally identical to `ProgramRules`; kept
 * as a distinct name so future additions (e.g. effective tier metadata)
 * can be expressed without rippling through every consumer.
 */
export type ResolvedRules = ProgramRules;

// Re-export the canonical resolver primitives for downstream consumers
// that historically imported them from `@loanscope/engine`. The single
// source of truth lives in `@loanscope/program-rules`; these re-exports
// preserve the existing public surface so no consumer has to update
// imports simultaneously.
export { findApplicableTier, mergeRules, resolveVariant } from "@loanscope/program-rules";

/**
 * Compute the effective `ResolvedRules` for a product under the supplied
 * transaction. Walks the base constraints, variant (selected by term +
 * amortization + program kind + ARM fixed period), occupancy overrides,
 * and tier overrides, then merges them via the canonical `mergeRules`.
 */
export const getEffectiveConstraints = (
  product: ProductDefinition,
  transaction: Transaction,
  amortizationType: AmortizationType,
): ResolvedRules => {
  const scenario = transaction.scenario;
  if (!product.baseConstraints) {
    throw new Error(`Product ${product.id} missing baseConstraints`);
  }
  const base = toProgramRules(product.baseConstraints, `product ${product.id}`);
  const term = scenario.rateNote.amortizationMonths ?? 360;
  const variant = resolveVariant(
    product,
    term,
    scenario.occupancy,
    amortizationType,
    scenario.rateNote.productKind === ProgramKind.ARM ? ProgramKind.ARM : ProgramKind.Fixed,
    scenario.rateNote.arm?.initialFixedMonths,
  );
  const occ = variant.constraints[scenario.occupancy];
  const tier = findApplicableTier(product.tiers, scenario.requestedLoanAmount);

  const override: Partial<ProgramRules> = {};
  setIfDefined(occ.maxLTVRatio ?? base.maxLTVRatio, (value) => {
    override.maxLTVRatio = value;
  });
  setIfDefined(occ.maxCLTVRatio ?? base.maxCLTVRatio, (value) => {
    override.maxCLTVRatio = value;
  });
  setIfDefined(occ.minFico ?? base.minFico, (value) => {
    override.minFico = value;
  });
  setIfDefined(occ.maxDTIRatio ?? base.maxDTIRatio, (value) => {
    override.maxDTIRatio = value;
  });
  setIfDefined(occ.reservesPolicy ?? base.reservesPolicy, (value) => {
    override.reservesPolicy = value;
  });
  setIfDefined(tier?.range.min ?? base.minLoanAmount, (value) => {
    override.minLoanAmount = value;
  });
  setIfDefined(tier?.range.max ?? base.maxLoanAmount, (value) => {
    override.maxLoanAmount = value;
  });

  return mergeRules(base, override);
};

/**
 * Resolve the rules that apply at a given loan-amount tier, ignoring
 * variant/occupancy refinements. Used by ancillary commands that only
 * need the tier-bounded loan-amount range without a full transaction.
 */
export const resolveTier = (
  product: ProductDefinition,
  loanAmount: Money,
  occupancy: Occupancy,
  purpose: LoanPurpose,
): ResolvedRules => {
  void occupancy;
  void purpose;
  if (!product.baseConstraints) {
    throw new Error(`Product ${product.id} missing baseConstraints`);
  }
  const base = toProgramRules(product.baseConstraints, `product ${product.id}`);
  const tier = findApplicableTier(product.tiers, loanAmount);
  const override: Partial<ProgramRules> = {};
  setIfDefined(tier?.range.min ?? base.minLoanAmount, (value) => {
    override.minLoanAmount = value;
  });
  setIfDefined(tier?.range.max ?? base.maxLoanAmount, (value) => {
    override.maxLoanAmount = value;
  });
  return mergeRules(base, override);
};
