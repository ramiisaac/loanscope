import type { ProgramRules } from "@loanscope/domain";
import { mergeOptional, mergeRecord, setIfDefined } from "./merge-primitives";

/**
 * Layer `override` onto `base` field-by-field with override-wins semantics.
 * Optional fields are copied through only when defined, preserving the
 * "never set" signal for downstream consumers that distinguish undefined
 * from an explicitly-empty value.
 *
 * `maxLtvByOccupancy` and `maxLtvByPurpose` are merged key-by-key via
 * `mergeRecord` so a partial override can refine a single occupancy or
 * purpose without clobbering siblings. Nested-object rules (borrower,
 * appraisal, cash-out, property, AUS, asset-eligibility, buydown, MI)
 * are merged shallowly via `mergeOptional` — the override object's
 * fields win, but undefined fields fall through to the base.
 *
 * Canonical implementation. Previously duplicated in
 * `@loanscope/engine#tier-resolver` (exported) and
 * `@loanscope/products#resolver` (file-private); both now import from
 * here.
 */
export const mergeRules = (base: ProgramRules, override: Partial<ProgramRules>): ProgramRules => {
  const merged: ProgramRules = {
    allowedPurposes: override.allowedPurposes ?? base.allowedPurposes,
    allowedOccupancies: override.allowedOccupancies ?? base.allowedOccupancies,
  };

  const allowedPropertyTypes = override.allowedPropertyTypes ?? base.allowedPropertyTypes;
  const unitsAllowed = override.unitsAllowed ?? base.unitsAllowed;
  const allowedTerms = override.allowedTerms ?? base.allowedTerms;
  const minLoanAmount = override.minLoanAmount ?? base.minLoanAmount;
  const minLoanAmountRule = override.minLoanAmountRule ?? base.minLoanAmountRule;
  const maxLoanAmount = override.maxLoanAmount ?? base.maxLoanAmount;
  const minFico = override.minFico ?? base.minFico;
  const maxDTIRatio = override.maxDTIRatio ?? base.maxDTIRatio;
  const maxLTVRatio = override.maxLTVRatio ?? base.maxLTVRatio;
  const maxCLTVRatio = override.maxCLTVRatio ?? base.maxCLTVRatio;
  const maxLtvByOccupancy = mergeRecord(base.maxLtvByOccupancy, override.maxLtvByOccupancy);
  const maxLtvByPurpose = mergeRecord(base.maxLtvByPurpose, override.maxLtvByPurpose);
  const reservesPolicy = override.reservesPolicy ?? base.reservesPolicy;
  const borrowerRestrictions = mergeOptional(
    base.borrowerRestrictions,
    override.borrowerRestrictions,
  );
  const appraisalRules = mergeOptional(base.appraisalRules, override.appraisalRules);
  const cashOutConstraints = mergeOptional(base.cashOutConstraints, override.cashOutConstraints);
  const propertyRestrictions = mergeOptional(
    base.propertyRestrictions,
    override.propertyRestrictions,
  );
  const ausRules = mergeOptional(base.ausRules, override.ausRules);
  const assetEligibilityOverrides = mergeOptional(
    base.assetEligibilityOverrides,
    override.assetEligibilityOverrides,
  );
  const buydownRules = mergeOptional(base.buydownRules, override.buydownRules);
  const miRules = mergeOptional(base.miRules, override.miRules);
  const incomePolicies = override.incomePolicies ?? base.incomePolicies;
  const notes = override.notes ?? base.notes;

  setIfDefined(allowedPropertyTypes, (value) => {
    merged.allowedPropertyTypes = value;
  });
  setIfDefined(unitsAllowed, (value) => {
    merged.unitsAllowed = value;
  });
  setIfDefined(allowedTerms, (value) => {
    merged.allowedTerms = value;
  });
  setIfDefined(minLoanAmount, (value) => {
    merged.minLoanAmount = value;
  });
  setIfDefined(minLoanAmountRule, (value) => {
    merged.minLoanAmountRule = value;
  });
  setIfDefined(maxLoanAmount, (value) => {
    merged.maxLoanAmount = value;
  });
  setIfDefined(minFico, (value) => {
    merged.minFico = value;
  });
  setIfDefined(maxDTIRatio, (value) => {
    merged.maxDTIRatio = value;
  });
  setIfDefined(maxLTVRatio, (value) => {
    merged.maxLTVRatio = value;
  });
  setIfDefined(maxCLTVRatio, (value) => {
    merged.maxCLTVRatio = value;
  });
  setIfDefined(maxLtvByOccupancy, (value) => {
    merged.maxLtvByOccupancy = value;
  });
  setIfDefined(maxLtvByPurpose, (value) => {
    merged.maxLtvByPurpose = value;
  });
  setIfDefined(reservesPolicy, (value) => {
    merged.reservesPolicy = value;
  });
  setIfDefined(borrowerRestrictions, (value) => {
    merged.borrowerRestrictions = value;
  });
  setIfDefined(appraisalRules, (value) => {
    merged.appraisalRules = value;
  });
  setIfDefined(cashOutConstraints, (value) => {
    merged.cashOutConstraints = value;
  });
  setIfDefined(propertyRestrictions, (value) => {
    merged.propertyRestrictions = value;
  });
  setIfDefined(ausRules, (value) => {
    merged.ausRules = value;
  });
  setIfDefined(assetEligibilityOverrides, (value) => {
    merged.assetEligibilityOverrides = value;
  });
  setIfDefined(buydownRules, (value) => {
    merged.buydownRules = value;
  });
  setIfDefined(miRules, (value) => {
    merged.miRules = value;
  });
  setIfDefined(incomePolicies, (value) => {
    merged.incomePolicies = value;
  });
  setIfDefined(notes, (value) => {
    merged.notes = value;
  });

  return merged;
};
