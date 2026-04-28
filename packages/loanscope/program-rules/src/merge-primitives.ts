// Shared merge primitives used by `merge-rules` and `to-program-rules`.
//
// These helpers implement the "override wins when defined; otherwise fall
// back to base" semantics that are applied field-by-field when flattening
// a product's inheritance chain or when layering variant/tier overrides
// on top of a program's base constraints.
//
// Centralizing them here keeps the behavior consistent across the three
// canonical resolver primitives and removes the byte-for-byte duplicates
// that previously lived in `@loanscope/engine` and `@loanscope/products`.

/**
 * Merge two optional `Record<string, T>` maps. Entries from `override`
 * take precedence. When both arguments are `undefined` the result is
 * also `undefined` so callers can preserve the "field was never set"
 * signal rather than collapsing to an empty object.
 */
export const mergeRecord = <T>(
  base: Record<string, T> | undefined,
  override: Record<string, T> | undefined,
): Record<string, T> | undefined => {
  if (!base && !override) return undefined;
  return { ...(base ?? {}), ...(override ?? {}) };
};

/**
 * Merge two optional object values with override-wins field semantics.
 * When only one side is defined, it is returned as-is so callers avoid
 * the cost of a spread and preserve reference identity where it is
 * observable (e.g. in equality-based memoization).
 */
export const mergeOptional = <T extends object>(
  base: T | undefined,
  override: T | undefined,
): T | undefined => {
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
};

/**
 * Invoke `setter(value)` only when `value` is defined. Used by the
 * normalizer and merger to skip copying fields that were never set on
 * the source, preserving optional-field semantics instead of coercing
 * `undefined` onto the target object.
 */
export const setIfDefined = <T>(value: T | undefined, setter: (value: T) => void): void => {
  if (value !== undefined) {
    setter(value);
  }
};
