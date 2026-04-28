import { Money } from "../primitives";

export interface AssetUsage {
  assetId: string;
  category: "Close" | "Payoff";
  used: Money;
  haircutApplied: Money;
}

export interface AssetAllocationResult {
  fundsToCloseRequired: Money;
  payoffsRequired: Money;
  totalRequired: Money;
  used: AssetUsage[];
  remainingReservesDollars: Money;
  shortfall?: Money;
}
