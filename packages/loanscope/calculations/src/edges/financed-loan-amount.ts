import type { EdgeDefinition } from "@loanscope/graph";
import Decimal from "decimal.js";
import { money, ratio } from "@loanscope/domain";
import { toMoney } from "../coercions";

const readFinancedFlag = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    throw new Error(`Expected financedUpfrontFees to be boolean, got ${typeof value}`);
  }
  return value;
};

export const financedLoanAmountEdges: EdgeDefinition[] = [
  {
    id: "calculate-base-ltv",
    kind: "transform",
    inputs: ["baseLoanAmount", "propertyValue"],
    outputs: ["baseLtv"],
    confidence: "derived",
    compute: (inputs) => {
      const base = toMoney(inputs.baseLoanAmount, "baseLoanAmount");
      const propertyValue = toMoney(inputs.propertyValue, "propertyValue");
      if (propertyValue === 0) {
        throw new Error("propertyValue must be > 0 to compute baseLtv");
      }
      return {
        baseLtv: ratio(new Decimal(base).div(propertyValue).toNumber()),
      };
    },
  },
  {
    id: "resolve-financed-loan-amount",
    kind: "transform",
    inputs: ["baseLoanAmount", "upfrontGovernmentFee", "financedUpfrontFees"],
    outputs: ["loanAmount"],
    confidence: "derived",
    compute: (inputs) => {
      const base = toMoney(inputs.baseLoanAmount, "baseLoanAmount");
      const upfront = toMoney(inputs.upfrontGovernmentFee, "upfrontGovernmentFee");
      const financed = readFinancedFlag(inputs.financedUpfrontFees);
      if (!financed) {
        return { loanAmount: base };
      }
      const total = new Decimal(base).plus(upfront).toNumber();
      return { loanAmount: money(total) };
    },
  },
];
