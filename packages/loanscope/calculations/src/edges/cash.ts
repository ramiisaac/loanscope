import type { EdgeDefinition } from "@loanscope/graph";
import {
  allocateAssets,
  computeFundsToClose,
  computePayoffsRequired,
  computeTotalCashRequired,
} from "@loanscope/math";
import { Asset, AssetType, Liability } from "@loanscope/domain";
import { toArray, toMoney } from "../coercions";

export const cashEdges: EdgeDefinition[] = [
  {
    id: "calculate-funds-to-close",
    kind: "transform",
    inputs: ["downPayment", "closingCosts"],
    outputs: ["fundsToClose"],
    confidence: "derived",
    compute: (inputs) => ({
      fundsToClose: computeFundsToClose(toMoney(inputs.downPayment, "downPayment"), {
        estimatedTotal: toMoney(inputs.closingCosts, "closingCosts"),
      }),
    }),
  },
  {
    id: "calculate-payoffs-required",
    kind: "transform",
    inputs: ["liabilities", "payoffLiabilityIds"],
    outputs: ["payoffsRequired"],
    confidence: "derived",
    compute: (inputs) => ({
      payoffsRequired: computePayoffsRequired(
        toArray<Liability>(inputs.liabilities, "liabilities"),
        toArray<string>(inputs.payoffLiabilityIds, "payoffLiabilityIds"),
      ),
    }),
  },
  {
    id: "calculate-total-cash-required",
    kind: "transform",
    inputs: ["fundsToClose", "payoffsRequired"],
    outputs: ["totalCashRequired"],
    confidence: "derived",
    compute: (inputs) => ({
      totalCashRequired: computeTotalCashRequired(
        toMoney(inputs.fundsToClose, "fundsToClose"),
        toMoney(inputs.payoffsRequired, "payoffsRequired"),
      ),
    }),
  },
  {
    id: "allocate-assets",
    kind: "transform",
    inputs: [
      "assets",
      "totalCashRequired",
      "reservesIneligibleTypes",
      "payoffsRequired",
      "fundsToClose",
    ],
    outputs: ["assetAllocation"],
    confidence: "derived",
    compute: (inputs) => ({
      assetAllocation: allocateAssets({
        assets: toArray<Asset>(inputs.assets, "assets"),
        requiredClose: toMoney(inputs.fundsToClose, "fundsToClose"),
        requiredPayoffs: toMoney(inputs.payoffsRequired, "payoffsRequired"),
        reservesIneligibleTypes: toArray<AssetType>(
          inputs.reservesIneligibleTypes ?? [],
          "reservesIneligibleTypes",
        ),
      }),
    }),
  },
];
