import type { ProgramRules } from "@loanscope/domain";
import { setIfDefined } from "./merge-primitives";

/**
 * Normalize a `Partial<ProgramRules>` into a fully-typed `ProgramRules`
 * by asserting that the two strictly-required fields (`allowedPurposes`,
 * `allowedOccupancies`) are present and then copying every optional
 * field through only when defined.
 *
 * `context` is threaded into the error message so catalog authors can
 * locate the offending product / variant / tier when validation fails.
 * Throws a plain `Error` (not `CliValidationError`) because this is a
 * catalog-integrity invariant, not a user-facing CLI check.
 *
 * Canonical implementation. Previously duplicated (with minor cosmetic
 * differences) in `@loanscope/engine#tier-resolver` and
 * `@loanscope/products#resolver`. Both now import from here.
 */
export const toProgramRules = (rules: Partial<ProgramRules>, context: string): ProgramRules => {
  if (!rules.allowedPurposes || !rules.allowedOccupancies) {
    throw new Error(`Program rules missing required fields for ${context}`);
  }
  const normalized: ProgramRules = {
    allowedPurposes: rules.allowedPurposes,
    allowedOccupancies: rules.allowedOccupancies,
  };

  setIfDefined(rules.allowedPropertyTypes, (value) => {
    normalized.allowedPropertyTypes = value;
  });
  setIfDefined(rules.unitsAllowed, (value) => {
    normalized.unitsAllowed = value;
  });
  setIfDefined(rules.allowedTerms, (value) => {
    normalized.allowedTerms = value;
  });
  setIfDefined(rules.minLoanAmount, (value) => {
    normalized.minLoanAmount = value;
  });
  setIfDefined(rules.minLoanAmountRule, (value) => {
    normalized.minLoanAmountRule = value;
  });
  setIfDefined(rules.maxLoanAmount, (value) => {
    normalized.maxLoanAmount = value;
  });
  setIfDefined(rules.minFico, (value) => {
    normalized.minFico = value;
  });
  setIfDefined(rules.maxDTIRatio, (value) => {
    normalized.maxDTIRatio = value;
  });
  setIfDefined(rules.maxLTVRatio, (value) => {
    normalized.maxLTVRatio = value;
  });
  setIfDefined(rules.maxCLTVRatio, (value) => {
    normalized.maxCLTVRatio = value;
  });
  setIfDefined(rules.maxLtvByOccupancy, (value) => {
    normalized.maxLtvByOccupancy = value;
  });
  setIfDefined(rules.maxLtvByPurpose, (value) => {
    normalized.maxLtvByPurpose = value;
  });
  setIfDefined(rules.reservesPolicy, (value) => {
    normalized.reservesPolicy = value;
  });
  setIfDefined(rules.borrowerRestrictions, (value) => {
    normalized.borrowerRestrictions = value;
  });
  setIfDefined(rules.appraisalRules, (value) => {
    normalized.appraisalRules = value;
  });
  setIfDefined(rules.cashOutConstraints, (value) => {
    normalized.cashOutConstraints = value;
  });
  setIfDefined(rules.propertyRestrictions, (value) => {
    normalized.propertyRestrictions = value;
  });
  setIfDefined(rules.ausRules, (value) => {
    normalized.ausRules = value;
  });
  setIfDefined(rules.assetEligibilityOverrides, (value) => {
    normalized.assetEligibilityOverrides = value;
  });
  setIfDefined(rules.buydownRules, (value) => {
    normalized.buydownRules = value;
  });
  setIfDefined(rules.miRules, (value) => {
    normalized.miRules = value;
  });
  setIfDefined(rules.incomePolicies, (value) => {
    normalized.incomePolicies = value;
  });
  setIfDefined(rules.notes, (value) => {
    normalized.notes = value;
  });

  return normalized;
};
