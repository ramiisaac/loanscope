// Canonical program-rules resolver primitives.
//
// This package exists as a lower-level dependency of both
// `@loanscope/engine` and `@loanscope/products` so that rule
// normalization, merging, and variant resolution are defined in exactly
// one place. Prior to this extraction the three primitives lived in
// both packages as byte-for-byte (modulo cosmetic) duplicates, which
// caused drift risk any time a new `ProgramRules` field was added.
//
// Dependency direction: this package depends only on `@loanscope/domain`
// for type shapes; neither `engine` nor `products` imports back.
export { toProgramRules } from "./to-program-rules";
export { mergeRules } from "./merge-rules";
export { resolveVariant } from "./resolve-variant";
export { findApplicableTier } from "./find-applicable-tier";
export { mergeOptional, mergeRecord, setIfDefined } from "./merge-primitives";
