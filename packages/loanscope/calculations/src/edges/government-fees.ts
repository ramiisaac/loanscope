import type { EdgeDefinition } from "@loanscope/graph";
import {
  calculateFhaUfmip,
  calculateFhaAnnualMipMonthly,
  calculateUsdaAnnualFeeMonthly,
  calculateUsdaUpfrontGuaranteeFee,
  calculateVaFundingFee,
  type VaServiceContext,
} from "@loanscope/math";
import { LoanPurpose, LoanType, Money, assertNever, money } from "@loanscope/domain";
import { toMoney, toMonths, toRatio, toString } from "../coercions";

const DEFAULT_VA_CONTEXT: VaServiceContext = {
  priorUse: false,
  disabilityExempt: false,
  reserveOrGuard: false,
};

const LOAN_PURPOSE_VALUES = new Set<string>(Object.values(LoanPurpose));
const LOAN_TYPE_VALUES = new Set<string>(Object.values(LoanType));

const parseLoanType = (value: unknown): LoanType => {
  const raw = toString(value, "loanType");
  if (!LOAN_TYPE_VALUES.has(raw)) {
    throw new Error(`loanType must be one of [${[...LOAN_TYPE_VALUES].join(", ")}], got '${raw}'`);
  }
  return raw as LoanType;
};

const parseLoanPurpose = (value: unknown): LoanPurpose => {
  const raw = toString(value, "loanPurpose");
  if (!LOAN_PURPOSE_VALUES.has(raw)) {
    throw new Error(
      `loanPurpose must be one of [${[...LOAN_PURPOSE_VALUES].join(", ")}], got '${raw}'`,
    );
  }
  return raw as LoanPurpose;
};

const parseVaServiceContext = (value: unknown): VaServiceContext => {
  if (value === undefined || value === null) {
    return DEFAULT_VA_CONTEXT;
  }
  if (typeof value !== "object") {
    throw new Error(`Expected vaServiceContext to be an object, got ${typeof value}`);
  }
  const obj = value as Record<string, unknown>;
  const readBool = (field: string): boolean => {
    const raw = obj[field];
    if (raw === undefined) return false;
    if (typeof raw !== "boolean") {
      throw new Error(`vaServiceContext.${field} must be boolean, got ${typeof raw}`);
    }
    return raw;
  };
  return {
    priorUse: readBool("priorUse"),
    disabilityExempt: readBool("disabilityExempt"),
    reserveOrGuard: readBool("reserveOrGuard"),
  };
};

interface GovernmentFeeOutputs {
  upfront: Money;
  monthly: Money;
}

const ZERO_FEES: GovernmentFeeOutputs = {
  upfront: money(0),
  monthly: money(0),
};

export const governmentFeesEdges: EdgeDefinition[] = [
  {
    id: "calculate-government-fees",
    kind: "transform",
    inputs: [
      "loanType",
      "baseLoanAmount",
      "baseLtv",
      "amortizationMonths",
      "loanPurpose",
      "vaServiceContext",
    ],
    outputs: ["upfrontGovernmentFee", "monthlyGovernmentFee"],
    confidence: "derived",
    compute: (inputs) => {
      const loanType = parseLoanType(inputs.loanType);
      const loanAmount = toMoney(inputs.baseLoanAmount, "baseLoanAmount");
      const ltv = toRatio(inputs.baseLtv, "baseLtv");
      const amortizationMonths = toMonths(inputs.amortizationMonths, "amortizationMonths");

      const fees: GovernmentFeeOutputs = (() => {
        switch (loanType) {
          case LoanType.FHA: {
            const fhaParams = { loanAmount, ltv, amortizationMonths };
            return {
              upfront: calculateFhaUfmip(fhaParams),
              monthly: calculateFhaAnnualMipMonthly(fhaParams),
            };
          }
          case LoanType.VA: {
            const loanPurpose = parseLoanPurpose(inputs.loanPurpose);
            const serviceContext = parseVaServiceContext(inputs.vaServiceContext);
            return {
              upfront: calculateVaFundingFee({
                loanAmount,
                ltv,
                serviceContext,
                loanPurpose,
              }),
              monthly: money(0),
            };
          }
          case LoanType.USDA: {
            const usdaParams = { loanAmount };
            return {
              upfront: calculateUsdaUpfrontGuaranteeFee(usdaParams),
              monthly: calculateUsdaAnnualFeeMonthly(usdaParams),
            };
          }
          case LoanType.Conventional:
          case LoanType.HighBalance:
          case LoanType.Jumbo:
            return ZERO_FEES;
          default:
            return assertNever(loanType);
        }
      })();

      return {
        upfrontGovernmentFee: fees.upfront,
        monthlyGovernmentFee: fees.monthly,
      };
    },
  },
];
