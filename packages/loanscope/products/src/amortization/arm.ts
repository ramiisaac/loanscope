import {
  AmortizationBehavior,
  AmortizationType,
  QualifyingPaymentPolicy,
  ratePct,
} from "@loanscope/domain";

/**
 * Create ARM amortization behavior with qualifying payment policy that
 * accounts for the fixed-period length. Shorter fixed periods use a higher
 * qualifying-rate add-on (2 pp) while longer fixed periods (10-year) use a
 * lower add-on (1 pp) per common investor guidelines.
 */
export const createARMAmortization = (fixedPeriodMonths: 60 | 84 | 120): AmortizationBehavior => {
  const addPctPoints = fixedPeriodMonths >= 120 ? ratePct(1) : ratePct(2);

  const policy: QualifyingPaymentPolicy = {
    kind: "ARMQualifyMaxNotePlus",
    addPctPoints,
  };
  return {
    type: AmortizationType.ARM,
    qualifyingPaymentPolicy: policy,
  };
};
