import { CliValidationError } from "./cli-error";
/**
 * Derives a deterministic, URL/file-safe kebab-case slug from a human label.
 *
 * Normalizes Unicode, strips combining marks, lowercases, collapses runs of
 * non-alphanumeric characters into single hyphens, and trims leading/trailing
 * hyphens. Falls back to `fallback` (default `"item"`) when the input has no
 * usable alphanumeric characters.
 */
export const slugify = (label: string, fallback = "item"): string => {
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : fallback;
};

/**
 * Returns a short, sortable UTC timestamp suffix in `yyyymmddHHMMSS` form.
 *
 * Used to make auto-derived ids collision-resistant within a single second
 * without introducing a runtime UUID dependency. Callers must still handle
 * the duplicate-id error path, since two ids built in the same second from
 * the same label will still collide.
 */
export const timestampSuffix = (now: Date = new Date()): string => {
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return (
    `${now.getUTCFullYear()}` +
    `${pad(now.getUTCMonth() + 1)}` +
    `${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}` +
    `${pad(now.getUTCMinutes())}` +
    `${pad(now.getUTCSeconds())}`
  );
};

/**
 * Builds a record id from an explicit override or by deriving one from the
 * given human label.
 *
 * - When `explicitId` is provided, returns it trimmed; throws
 *   `CliValidationError` if the trimmed value is empty.
 * - Otherwise returns `${slugify(label, fallback)}-${timestampSuffix(now)}`.
 *
 * The same shape is used for saved scenarios, comparisons, simulations, and
 * audit sessions, so this helper centralizes the convention.
 */
export const buildId = (
  explicitId: string | undefined,
  label: string,
  options: { now?: Date; fallback?: string } = {},
): string => {
  if (explicitId !== undefined) {
    const trimmed = explicitId.trim();
    if (trimmed.length === 0) {
      throw new CliValidationError("Invalid id: value must not be empty.");
    }
    return trimmed;
  }
  const { now = new Date(), fallback = "item" } = options;
  return `${slugify(label, fallback)}-${timestampSuffix(now)}`;
};
