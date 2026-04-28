import type { EdgeDefinition } from "@loanscope/graph";
import { calculateCLTV, calculateLTV, downPaymentFromLTV } from "@loanscope/math";
import { toMoney } from "../coercions";

export const ltvEdges: EdgeDefinition[] = [
  {
    id: "calculate-ltv",
    kind: "transform",
    inputs: ["loanAmount", "propertyValue"],
    outputs: ["ltv"],
    confidence: "derived",
    compute: (inputs) => ({
      ltv: calculateLTV(
        toMoney(inputs.loanAmount, "loanAmount"),
        toMoney(inputs.propertyValue, "propertyValue"),
      ),
    }),
  },
  {
    id: "calculate-cltv",
    kind: "transform",
    inputs: ["loanAmount", "subordinateLiens", "propertyValue"],
    outputs: ["cltv"],
    confidence: "derived",
    compute: (inputs) => ({
      cltv: calculateCLTV(
        toMoney(inputs.loanAmount, "loanAmount"),
        [toMoney(inputs.subordinateLiens, "subordinateLiens")],
        toMoney(inputs.propertyValue, "propertyValue"),
      ),
    }),
  },
  {
    id: "derive-down-payment",
    kind: "transform",
    inputs: ["purchasePrice", "loanAmount"],
    outputs: ["downPayment"],
    confidence: "derived",
    compute: (inputs) => ({
      downPayment: downPaymentFromLTV(
        toMoney(inputs.purchasePrice, "purchasePrice"),
        calculateLTV(
          toMoney(inputs.loanAmount, "loanAmount"),
          toMoney(inputs.purchasePrice, "purchasePrice"),
        ),
      ),
    }),
  },
];
