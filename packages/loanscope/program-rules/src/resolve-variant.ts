import type {
  AmortizationType,
  ArmFixedPeriod,
  Occupancy,
  ProductDefinition,
  ProductVariant,
  ProgramKind,
} from "@loanscope/domain";

/**
 * Resolve the single `ProductVariant` that matches the requested term,
 * amortization type, and (optionally) program kind and ARM fixed period.
 * The resolver is total: exactly-one match is required. Zero matches
 * and more-than-one matches both throw so ambiguous catalog shapes
 * surface at runtime instead of producing silently-wrong evaluations.
 *
 * Occupancy is validated last so the thrown error can cite the
 * specific missing occupancy constraint rather than failing the
 * variant-shape check generically.
 *
 * Canonical implementation. Previously exported (with cosmetic
 * differences) from both `@loanscope/engine` and `@loanscope/products`;
 * both packages now re-export from here.
 */
export const resolveVariant = (
  product: ProductDefinition,
  term: number,
  occupancy: Occupancy,
  amortizationType: AmortizationType,
  programKind?: ProgramKind,
  armFixedPeriod?: ArmFixedPeriod,
): ProductVariant => {
  let candidates = product.variants.filter(
    (v) => v.terms.some((allowed) => allowed === term) && v.amortization.type === amortizationType,
  );
  if (programKind) {
    candidates = candidates.filter((variant) => variant.programKind === programKind);
  }
  if (armFixedPeriod) {
    candidates = candidates.filter(
      (variant) => variant.armDetails?.initialFixedMonths === armFixedPeriod,
    );
  }
  if (candidates.length === 0) {
    throw new Error(`No variant for ${product.id} term ${term} amortization ${amortizationType}`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous variants for ${product.id} term ${term} amortization ${amortizationType}`,
    );
  }
  const variant = candidates[0];
  if (!variant?.constraints[occupancy]) {
    throw new Error(`No occupancy constraints for ${product.id} ${occupancy}`);
  }
  return variant;
};
