import type { DiffEntry } from "./diff-types";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const joinObjectPath = (base: string, key: string): string =>
  base === "" ? key : `${base}.${key}`;

const joinArrayPath = (base: string, index: number): string => `${base}[${index}]`;

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
};

const walk = (a: unknown, b: unknown, path: string, out: DiffEntry[]): void => {
  if (deepEqual(a, b)) return;

  // Array vs array: walk by index union.
  if (Array.isArray(a) && Array.isArray(b)) {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i += 1) {
      const childPath = joinArrayPath(path, i);
      if (i >= a.length) {
        out.push({ path: childPath, kind: "added", after: b[i] });
      } else if (i >= b.length) {
        out.push({ path: childPath, kind: "removed", before: a[i] });
      } else {
        walk(a[i], b[i], childPath, out);
      }
    }
    return;
  }

  // Object vs object: walk by key union.
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const childPath = joinObjectPath(path, key);
      const aHas = Object.prototype.hasOwnProperty.call(a, key);
      const bHas = Object.prototype.hasOwnProperty.call(b, key);
      if (aHas && !bHas) {
        out.push({ path: childPath, kind: "removed", before: a[key] });
      } else if (!aHas && bHas) {
        out.push({ path: childPath, kind: "added", after: b[key] });
      } else {
        walk(a[key], b[key], childPath, out);
      }
    }
    return;
  }

  // Type mismatch or primitive change at this leaf.
  out.push({ path, kind: "changed", before: a, after: b });
};

/**
 * Computes a deterministic structural diff between two JSON-compatible
 * values. Paths use dotted notation for object keys and `[i]` for array
 * indices. Results are sorted lexicographically by `path` so that the
 * report ordering is stable across invocations.
 */
export const computeDeepDiff = (a: unknown, b: unknown): ReadonlyArray<DiffEntry> => {
  const out: DiffEntry[] = [];
  walk(a, b, "", out);
  out.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  return out;
};
