import type { EdgeDefinition } from "@loanscope/graph";
import { calculatePMTFixed, calculateQualifyingPayment } from "@loanscope/math";
import { AmortizationType, ProgramKind, RateNote } from "@loanscope/domain";
import { toMoney, toRatePct, toMonths, toQualifyingPaymentPolicy, toString } from "../coercions";

export const paymentEdges: EdgeDefinition[] = [
  {
    id: "calculate-principal-and-interest",
    kind: "transform",
    inputs: ["loanAmount", "noteRatePct", "amortizationMonths"],
    outputs: ["principalAndInterest"],
    confidence: "derived",
    compute: (inputs) => ({
      principalAndInterest: calculatePMTFixed(
        toMoney(inputs.loanAmount, "loanAmount"),
        toRatePct(inputs.noteRatePct, "noteRatePct"),
        toMonths(inputs.amortizationMonths, "amortizationMonths"),
      ),
    }),
  },
  {
    id: "calculate-qualifying-payment",
    kind: "transform",
    inputs: [
      "loanAmount",
      "noteRatePct",
      "amortizationMonths",
      "qualifyingPaymentPolicy",
      "interestOnlyMonths",
      "amortizationType",
    ],
    outputs: ["qualifyingPayment"],
    confidence: "derived",
    compute: (inputs) => {
      const amortizationType = toString(
        inputs.amortizationType,
        "amortizationType",
      ) as AmortizationType;
      const rateNote: RateNote = {
        noteRatePct: toRatePct(inputs.noteRatePct, "noteRatePct"),
        amortizationMonths: toMonths(inputs.amortizationMonths, "amortizationMonths"),
        productKind:
          amortizationType === AmortizationType.InterestOnly
            ? ProgramKind.InterestOnly
            : amortizationType === AmortizationType.ARM
              ? ProgramKind.ARM
              : ProgramKind.Fixed,
      };
      if (inputs.interestOnlyMonths) {
        rateNote.interestOnlyMonths = toMonths(inputs.interestOnlyMonths, "interestOnlyMonths");
      }
      return {
        qualifyingPayment: calculateQualifyingPayment(
          toMoney(inputs.loanAmount, "loanAmount"),
          rateNote,
          toQualifyingPaymentPolicy(inputs.qualifyingPaymentPolicy, "qualifyingPaymentPolicy"),
        ),
      };
    },
  },
];
