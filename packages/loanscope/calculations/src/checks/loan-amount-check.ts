import type { EdgeDefinition } from "@loanscope/graph";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { calculateLoanAmountMargin } from "../margins";
import { toMoney } from "../coercions";
import { fail, pass } from "./build-check";

/* ---- Loan Amount ---- */

export const loanAmountCheckEdge: EdgeDefinition = {
  id: "loan-amount-check",
  kind: "check",
  inputs: ["loanAmount", "minLoanAmount", "maxLoanAmount"],
  outputs: ["loanAmountMinCheck", "loanAmountMaxCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    const actual = toMoney(inputs.loanAmount, "loanAmount");
    const min =
      inputs.minLoanAmount !== undefined
        ? toMoney(inputs.minLoanAmount, "minLoanAmount")
        : undefined;
    const max =
      inputs.maxLoanAmount !== undefined
        ? toMoney(inputs.maxLoanAmount, "maxLoanAmount")
        : undefined;
    const margin = calculateLoanAmountMargin(actual, min, max);
    const minStatus = min === undefined || actual >= min ? CheckStatus.PASS : CheckStatus.FAIL;
    const maxStatus = max === undefined || actual <= max ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      loanAmountMinCheck:
        minStatus === CheckStatus.PASS
          ? pass(
              "LoanAmountMin",
              CheckSeverity.Blocker,
              `${actual}`,
              `${min ?? ""}`,
              "Loan amount meets minimum",
              margin,
            )
          : fail(
              "LoanAmountMin",
              CheckSeverity.Blocker,
              `${actual}`,
              `${min ?? ""}`,
              "Loan amount below minimum",
              margin,
            ),
      loanAmountMaxCheck:
        maxStatus === CheckStatus.PASS
          ? pass(
              "LoanAmountMax",
              CheckSeverity.Blocker,
              `${actual}`,
              `${max ?? ""}`,
              "Loan amount within maximum",
              margin,
            )
          : fail(
              "LoanAmountMax",
              CheckSeverity.Blocker,
              `${actual}`,
              `${max ?? ""}`,
              "Loan amount exceeds maximum",
              margin,
            ),
    };
  },
};
