import { AmortizationBehavior, AmortizationType, months } from "@loanscope/domain";

export const InterestOnlyAmortization: AmortizationBehavior = {
  type: AmortizationType.InterestOnly,
  qualifyingPaymentPolicy: { kind: "IOUsesFullyAmortizing", amortMonths: months(360) },
  interestOnlyMonths: months(120),
};
