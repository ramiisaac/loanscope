import { AmortizationType } from "@loanscope/domain";
import { AmortizationBehavior } from "@loanscope/domain";

export const FixedAmortization: AmortizationBehavior = {
  type: AmortizationType.FullyAmortizing,
  qualifyingPaymentPolicy: { kind: "NotePayment" },
};
