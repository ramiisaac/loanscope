import type { EdgeDefinition } from "@loanscope/graph";
import { calculateHousingMonthly, calculatePitiMonthly } from "@loanscope/math";
import { toMoney } from "../coercions";

export const housingEdges: EdgeDefinition[] = [
  {
    id: "calculate-housing-monthly",
    kind: "transform",
    inputs: ["propertyTax", "insurance", "hoa", "mi", "floodInsurance", "monthlyGovernmentFee"],
    outputs: ["housingMonthly"],
    confidence: "derived",
    compute: (inputs) => ({
      housingMonthly: calculateHousingMonthly({
        propertyTax: toMoney(inputs.propertyTax, "propertyTax"),
        insurance: toMoney(inputs.insurance, "insurance"),
        hoa: toMoney(inputs.hoa, "hoa"),
        mi: toMoney(inputs.mi, "mi"),
        floodInsurance: toMoney(inputs.floodInsurance, "floodInsurance"),
        governmentFee: toMoney(inputs.monthlyGovernmentFee, "monthlyGovernmentFee"),
      }),
    }),
  },
  {
    id: "calculate-piti-monthly",
    kind: "transform",
    inputs: ["principalAndInterest", "housingMonthly"],
    outputs: ["pitiMonthly"],
    confidence: "derived",
    compute: (inputs) => ({
      pitiMonthly: calculatePitiMonthly(
        toMoney(inputs.principalAndInterest, "principalAndInterest"),
        toMoney(inputs.housingMonthly, "housingMonthly"),
      ),
    }),
  },
];
