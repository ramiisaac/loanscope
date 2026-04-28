import type { EdgeDefinition } from "@loanscope/graph";
import { calculateDTI, deriveMonthlyLiabilities } from "@loanscope/math";
import Decimal from "decimal.js";
import { money } from "@loanscope/domain";
import { Liability } from "@loanscope/domain";
import { toArray, toMoney } from "../coercions";

export const dtiEdges: EdgeDefinition[] = [
  {
    id: "derive-monthly-liabilities",
    kind: "transform",
    inputs: ["liabilities", "includedBorrowerIds", "payoffLiabilityIds"],
    outputs: ["monthlyLiabilities"],
    confidence: "derived",
    compute: (inputs) => ({
      monthlyLiabilities: deriveMonthlyLiabilities(
        toArray<Liability>(inputs.liabilities, "liabilities"),
        toArray<string>(inputs.includedBorrowerIds, "includedBorrowerIds"),
        toArray<string>(inputs.payoffLiabilityIds, "payoffLiabilityIds"),
      ),
    }),
  },
  {
    id: "calculate-dti",
    kind: "transform",
    inputs: [
      "qualifyingIncomeMonthly",
      "monthlyLiabilities",
      "qualifyingPayment",
      "housingMonthly",
    ],
    outputs: ["dti"],
    confidence: "derived",
    compute: (inputs) => ({
      dti: calculateDTI(
        money(
          new Decimal(toMoney(inputs.monthlyLiabilities, "monthlyLiabilities"))
            .plus(toMoney(inputs.qualifyingPayment, "qualifyingPayment"))
            .plus(toMoney(inputs.housingMonthly, "housingMonthly"))
            .toNumber(),
        ),
        toMoney(inputs.qualifyingIncomeMonthly, "qualifyingIncomeMonthly"),
      ),
    }),
  },
];
