import Decimal from "decimal.js";
import type { Asset, AssetType, Money, Ratio } from "@loanscope/domain";
import type { AssetAllocationResult, AssetUsage } from "@loanscope/domain";
import { money, ratio } from "@loanscope/domain";

export interface AssetAllocationParams {
  assets: Asset[];
  requiredClose: Money;
  requiredPayoffs: Money;
  reservesIneligibleTypes?: AssetType[];
}

/** Clamps haircutRatio to [0, 1] so invalid values cannot inflate asset worth. */
const clampHaircut = (hr: Ratio | undefined): Ratio => {
  const raw = hr ?? 1;
  if (raw < 0) return ratio(0);
  if (raw > 1) return ratio(1);
  return ratio(raw);
};

/** Applies a clamped haircut ratio to an asset amount. */
export const applyHaircut = (amount: Money, haircutRatio: Ratio): Money => {
  const clamped = clampHaircut(haircutRatio);
  return money(new Decimal(amount).mul(clamped).toNumber());
};

export const filterReservesEligible = (assets: Asset[], ineligibleTypes: AssetType[]): Asset[] => {
  const ineligible = new Set(ineligibleTypes);
  return assets.filter((asset) => !ineligible.has(asset.type) && asset.canUseForReserves !== false);
};

/**
 * Deterministic ordering: primary sort by liquidityRank (ascending, default 1),
 * secondary sort by asset.id (lexicographic) for stable tie-breaking.
 */
const orderAssetsDeterministic = (assets: Asset[]): Asset[] => {
  return [...assets].sort((a, b) => {
    const rankA = a.liquidityRank ?? 1;
    const rankB = b.liquidityRank ?? 1;
    if (rankA !== rankB) return rankA - rankB;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
};

export const allocateAssets = (params: AssetAllocationParams): AssetAllocationResult => {
  const ordered = orderAssetsDeterministic(params.assets);
  let remainingClose = new Decimal(params.requiredClose);
  let remainingPayoffs = new Decimal(params.requiredPayoffs);
  const used: AssetUsage[] = [];

  const remainingAssets: Array<{ asset: Asset; remaining: Decimal }> = [];

  for (const asset of ordered) {
    const haircutRatio = clampHaircut(asset.haircutRatio);
    const usable = new Decimal(applyHaircut(asset.amount, haircutRatio));
    let remaining = usable;

    if (asset.canUseForClose !== false) {
      if (remainingClose.greaterThan(0)) {
        const use = Decimal.min(remaining, remainingClose);
        if (use.greaterThan(0)) {
          used.push({
            assetId: asset.id,
            category: "Close",
            used: money(use.toNumber()),
            haircutApplied: money(new Decimal(asset.amount).minus(usable).toNumber()),
          });
          remainingClose = remainingClose.minus(use);
          remaining = remaining.minus(use);
        }
      }
      if (remainingPayoffs.greaterThan(0)) {
        const use = Decimal.min(remaining, remainingPayoffs);
        if (use.greaterThan(0)) {
          used.push({
            assetId: asset.id,
            category: "Payoff",
            used: money(use.toNumber()),
            haircutApplied: money(new Decimal(asset.amount).minus(usable).toNumber()),
          });
          remainingPayoffs = remainingPayoffs.minus(use);
          remaining = remaining.minus(use);
        }
      }
    }
    remainingAssets.push({ asset, remaining });
  }

  const reservesEligible = filterReservesEligible(
    remainingAssets.map((item) => item.asset),
    params.reservesIneligibleTypes ?? [],
  );
  const remainingReserves = remainingAssets
    .filter((item) => reservesEligible.some((asset) => asset.id === item.asset.id))
    .reduce((sum, item) => sum.plus(item.remaining), new Decimal(0));

  const fundsToCloseRequired = money(params.requiredClose);
  const payoffsRequired = money(params.requiredPayoffs);
  const totalRequired = money(
    new Decimal(params.requiredClose).plus(params.requiredPayoffs).toNumber(),
  );
  const shortfall = remainingClose.plus(remainingPayoffs);

  const result: AssetAllocationResult = {
    fundsToCloseRequired,
    payoffsRequired,
    totalRequired,
    used,
    remainingReservesDollars: money(remainingReserves.toNumber()),
  };
  if (shortfall.greaterThan(0)) {
    result.shortfall = money(shortfall.toNumber());
  }
  return result;
};
