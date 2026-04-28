import type { Transaction, TransactionVariant } from "@loanscope/domain";
import { money } from "@loanscope/domain";
import type { Action, SimState } from "./types";
import { applyAction } from "./actions";

const setIfDefined = <T>(value: T | undefined, setter: (value: T) => void): void => {
  if (value !== undefined) {
    setter(value);
  }
};

/** Creates initial simulation state with zero cash used. */
export const createInitialState = (
  transaction: Transaction,
  variant: TransactionVariant,
): SimState => {
  const variantOverrides: Partial<TransactionVariant> = {
    id: variant.id,
    label: variant.label,
    includedBorrowerIds: variant.includedBorrowerIds,
  };

  setIfDefined(variant.includeAssetIds, (value) => {
    variantOverrides.includeAssetIds = value;
  });
  setIfDefined(variant.includeLiabilityIds, (value) => {
    variantOverrides.includeLiabilityIds = value;
  });
  setIfDefined(variant.forcePayoffLiabilityIds, (value) => {
    variantOverrides.forcePayoffLiabilityIds = value;
  });
  setIfDefined(variant.excludeAssetIds, (value) => {
    variantOverrides.excludeAssetIds = value;
  });
  setIfDefined(variant.actionNotes, (value) => {
    variantOverrides.actionNotes = value;
  });

  return {
    baseTransaction: transaction,
    variantOverrides,
    scenarioOverrides: {},
    syntheticAssets: [],
    actions: [],
    totalCashUsed: money(0),
    eligibleCount: 0,
  };
};

/** Sequentially applies actions, accumulating cost in totalCashUsed. */
export const applyActionsToState = (state: SimState, actions: Action[]): SimState => {
  return actions.reduce((current, action) => applyAction(current, action), state);
};

/** Deterministic key for state deduplication. */
export const stateKey = (state: SimState): string => {
  const scenario = {
    ...state.scenarioOverrides,
  };
  const variant = {
    ...state.variantOverrides,
  };
  const assets = state.syntheticAssets ?? [];
  const key = {
    scenario,
    variant,
    assets: assets.map((asset) => ({ id: asset.id, amount: asset.amount })),
    actions: state.actions,
  };
  return JSON.stringify(key);
};

/** Merges overrides/synthetic assets into a full Transaction for evaluation. */
export const stateToEffectiveTransaction = (state: SimState): Transaction => {
  const base = state.baseTransaction;
  const variant = base.variants[0];
  if (!variant) {
    throw new Error("Base transaction requires at least one variant");
  }

  const mergedVariant: TransactionVariant = {
    id: state.variantOverrides.id ?? variant.id,
    label: state.variantOverrides.label ?? variant.label,
    includedBorrowerIds: state.variantOverrides.includedBorrowerIds ?? variant.includedBorrowerIds,
  };

  const includeAssetIds = state.variantOverrides.includeAssetIds ?? variant.includeAssetIds;
  setIfDefined(includeAssetIds, (v) => {
    mergedVariant.includeAssetIds = v;
  });

  const includeLiabilityIds =
    state.variantOverrides.includeLiabilityIds ?? variant.includeLiabilityIds;
  setIfDefined(includeLiabilityIds, (v) => {
    mergedVariant.includeLiabilityIds = v;
  });

  const forcePayoffLiabilityIds =
    state.variantOverrides.forcePayoffLiabilityIds ?? variant.forcePayoffLiabilityIds;
  setIfDefined(forcePayoffLiabilityIds, (v) => {
    mergedVariant.forcePayoffLiabilityIds = v;
  });

  const excludeAssetIds = state.variantOverrides.excludeAssetIds ?? variant.excludeAssetIds;
  setIfDefined(excludeAssetIds, (v) => {
    mergedVariant.excludeAssetIds = v;
  });

  const actionNotes = state.variantOverrides.actionNotes ?? variant.actionNotes;
  setIfDefined(actionNotes, (v) => {
    mergedVariant.actionNotes = v;
  });

  const syntheticAssets = state.syntheticAssets ?? [];
  const assets = base.assets ? [...base.assets, ...syntheticAssets] : [...syntheticAssets];

  return {
    ...base,
    scenario: {
      ...base.scenario,
      ...state.scenarioOverrides,
    },
    variants: [mergedVariant],
    assets,
  };
};
