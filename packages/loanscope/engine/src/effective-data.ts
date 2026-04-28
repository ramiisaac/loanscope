import type {
  Asset,
  Borrower,
  Liability,
  Transaction,
  TransactionVariant,
} from "@loanscope/domain";

export interface EffectiveData {
  borrowers: Borrower[];
  assets: Asset[];
  liabilities: Liability[];
  payoffLiabilityIds: string[];
  includedBorrowerIds: string[];
}

/**
 * Validates that every ID in `includedBorrowerIds` matches an actual
 * borrower on the transaction. Throws if any ID is unrecognized.
 */
const validateBorrowerIds = (
  includedIds: readonly string[],
  knownBorrowers: readonly Borrower[],
): void => {
  if (includedIds.length === 0) {
    throw new Error("TransactionVariant.includedBorrowerIds must not be empty");
  }
  const knownSet = new Set(knownBorrowers.map((b) => b.id));
  const unknown: string[] = [];
  for (const id of includedIds) {
    if (!knownSet.has(id)) {
      unknown.push(id);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`includedBorrowerIds references unknown borrower(s): ${unknown.join(", ")}`);
  }
};

/**
 * Validates that includeAssetIds and excludeAssetIds do not overlap.
 * If both are specified and share IDs, the conflict is ambiguous and
 * must be rejected rather than silently resolved.
 */
const validateAssetPrecedence = (
  includeIds: readonly string[] | undefined,
  excludeIds: readonly string[] | undefined,
): void => {
  if (!includeIds || !excludeIds) return;
  const includeSet = new Set(includeIds);
  const conflicts: string[] = [];
  for (const id of excludeIds) {
    if (includeSet.has(id)) {
      conflicts.push(id);
    }
  }
  if (conflicts.length > 0) {
    throw new Error(
      `Asset IDs appear in both includeAssetIds and excludeAssetIds: ${conflicts.join(", ")}`,
    );
  }
};

/**
 * Filters assets using Set-backed lookups (O(1) per check) instead of
 * linear array scans. When `includeAssetIds` is provided it acts as an
 * explicit allowlist; otherwise ownership-based filtering applies.
 * `excludeAssetIds` is always honored as a denylist.
 */
const filterAssets = (
  allAssets: readonly Asset[],
  borrowerSet: ReadonlySet<string>,
  includeAssetIds: readonly string[] | undefined,
  excludeAssetIds: readonly string[] | undefined,
): Asset[] => {
  const excludeSet = new Set(excludeAssetIds ?? []);
  const includeSet = includeAssetIds ? new Set(includeAssetIds) : null;

  const result: Asset[] = [];
  for (const asset of allAssets) {
    if (excludeSet.has(asset.id)) continue;
    if (includeSet) {
      if (includeSet.has(asset.id)) {
        result.push(asset);
      }
    } else {
      // Ownership-based inclusion: at least one owner must be an included borrower
      for (const ownerId of asset.ownerBorrowerIds) {
        if (borrowerSet.has(ownerId)) {
          result.push(asset);
          break;
        }
      }
    }
  }
  return result;
};

/**
 * Filters liabilities using Set-backed lookups. When `includeLiabilityIds`
 * is provided it acts as an explicit allowlist; otherwise borrower-ownership
 * filtering applies.
 */
const filterLiabilities = (
  allLiabilities: readonly Liability[],
  borrowerSet: ReadonlySet<string>,
  includeLiabilityIds: readonly string[] | undefined,
): Liability[] => {
  const includeSet = includeLiabilityIds ? new Set(includeLiabilityIds) : null;

  const result: Liability[] = [];
  for (const liability of allLiabilities) {
    if (includeSet) {
      if (includeSet.has(liability.id)) {
        result.push(liability);
      }
    } else {
      for (const borrowerId of liability.borrowerIds) {
        if (borrowerSet.has(borrowerId)) {
          result.push(liability);
          break;
        }
      }
    }
  }
  return result;
};

/**
 * Builds a deterministic, deduplicated list of liability IDs that should
 * be paid off at close. Combines variant-forced payoffs with liabilities
 * flagged `payoffAtClose`. The result is sorted lexicographically to
 * guarantee determinism regardless of input ordering.
 */
const buildPayoffLiabilityIds = (
  forcePayoffIds: readonly string[] | undefined,
  liabilities: readonly Liability[],
): string[] => {
  const idSet = new Set<string>();
  if (forcePayoffIds) {
    for (const id of forcePayoffIds) {
      idSet.add(id);
    }
  }
  for (const liability of liabilities) {
    if (liability.payoffAtClose) {
      idSet.add(liability.id);
    }
  }
  return Array.from(idSet).sort();
};

/**
 * Single application-layer adapter for applying a TransactionVariant to
 * raw transaction data — filtering borrowers, assets, and liabilities.
 *
 * All downstream consumers should use this function rather than
 * performing their own variant-aware filtering.
 */
export const buildEffectiveData = (
  transaction: Transaction,
  variant: TransactionVariant,
): EffectiveData => {
  const includedBorrowerIds = variant.includedBorrowerIds;

  // Validate borrower IDs before any filtering
  validateBorrowerIds(includedBorrowerIds, transaction.borrowers);

  // Validate asset include/exclude precedence before filtering
  validateAssetPrecedence(variant.includeAssetIds, variant.excludeAssetIds);

  // Set-backed borrower lookup for O(1) membership checks
  const borrowerSet: ReadonlySet<string> = new Set(includedBorrowerIds);
  const borrowers = transaction.borrowers.filter((b) => borrowerSet.has(b.id));

  const assets = filterAssets(
    transaction.assets ?? [],
    borrowerSet,
    variant.includeAssetIds,
    variant.excludeAssetIds,
  );

  const liabilities = filterLiabilities(
    transaction.liabilities ?? [],
    borrowerSet,
    variant.includeLiabilityIds,
  );

  const payoffLiabilityIds = buildPayoffLiabilityIds(variant.forcePayoffLiabilityIds, liabilities);

  return {
    borrowers,
    assets,
    liabilities,
    payoffLiabilityIds,
    includedBorrowerIds,
  };
};
