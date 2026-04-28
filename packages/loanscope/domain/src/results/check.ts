import { ActionKind, CheckStatus } from "../enums";
import { Money, Ratio } from "../primitives";

export interface CheckMargin {
  kind: "Money" | "Ratio" | "Months";
  deltaToPass: number;
  actionHint?: ActionKind;
}

export interface UnderwritingCheck {
  key: string;
  status: CheckStatus;
  actual?: string;
  limit?: string;
  message?: string;
  margin?: CheckMargin;
}

export interface CheckResult {
  status: CheckStatus;
  actual?: string;
  limit?: string;
  message?: string;
  margin?: CheckMargin;
}

export interface CheckValue<T> {
  value: T;
  status: CheckStatus;
  margin?: CheckMargin;
}

export interface RatioCheckInput {
  actual: Ratio;
  limit: Ratio;
  key: string;
  message?: string;
}

export interface MoneyCheckInput {
  actual: Money;
  min?: Money;
  max?: Money;
  key: string;
  message?: string;
}
