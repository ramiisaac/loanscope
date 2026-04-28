import type { EdgeDefinition } from "@loanscope/graph";
import {
  calculateRequiredReserves,
  resolveReserveFloor,
  resolveReserveMonths,
} from "@loanscope/math";
import { LoanPurpose, Occupancy } from "@loanscope/domain";
import { toMoney, toNonNegativeMonths, toReservesPolicy, toString } from "../coercions";

export const reservesEdges: EdgeDefinition[] = [
  {
    id: "resolve-required-reserve-months",
    kind: "transform",
    inputs: ["reservesPolicy", "loanAmount", "occupancy", "loanPurpose", "ausFindings"],
    outputs: ["requiredReserveMonths"],
    confidence: "derived",
    compute: (inputs) => {
      const policy = toReservesPolicy(inputs.reservesPolicy, "reservesPolicy");
      const loanAmount = toMoney(inputs.loanAmount, "loanAmount");
      const occupancy = toString(inputs.occupancy, "occupancy") as Occupancy;
      const purpose = toString(inputs.loanPurpose, "loanPurpose") as LoanPurpose;

      const resolved = resolveReserveMonths(policy, loanAmount, occupancy, purpose);

      if (resolved !== "AUS") {
        return { requiredReserveMonths: resolved };
      }

      const ausFindings = inputs.ausFindings;
      if (ausFindings === undefined) {
        return {};
      }
      if (typeof ausFindings !== "object" || ausFindings === null) {
        throw new Error(`Expected ausFindings to be object, got ${typeof ausFindings}`);
      }

      const reservesMonths = Reflect.get(ausFindings, "reservesMonths");
      if (reservesMonths === undefined) {
        return {};
      }

      const ausMonths = toNonNegativeMonths(reservesMonths, "ausFindings.reservesMonths");

      // Layer the Tiered policy's `additionalToAus` floor over the AUS
      // finding when applicable. For non-Tiered policies and tiers without
      // `additionalToAus`, `resolveReserveFloor` returns 0 so the AUS
      // finding passes through unchanged.
      const floor = resolveReserveFloor(policy, loanAmount, occupancy, purpose);
      const effective = Number(ausMonths) >= Number(floor) ? ausMonths : floor;

      return { requiredReserveMonths: effective };
    },
  },
  {
    id: "calculate-required-reserves-dollars",
    kind: "transform",
    inputs: ["requiredReserveMonths", "pitiMonthly"],
    outputs: ["requiredReservesDollars"],
    confidence: "derived",
    compute: (inputs) => ({
      requiredReservesDollars: calculateRequiredReserves(
        toMoney(inputs.pitiMonthly, "pitiMonthly"),
        toNonNegativeMonths(inputs.requiredReserveMonths, "requiredReserveMonths"),
      ),
    }),
  },
];
