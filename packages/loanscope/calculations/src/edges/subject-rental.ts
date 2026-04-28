import type { EdgeDefinition } from "@loanscope/graph";
import { calculateSubjectRentalIncome } from "@loanscope/math";
import { money, ratio } from "@loanscope/domain";
import type { Money, Ratio } from "@loanscope/domain";
import { toMoney } from "../coercions";

const readUnits = (value: unknown): number => {
  if (value === undefined || value === null) return 1;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected units to be a finite number, got ${typeof value}`);
  }
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    throw new Error(`units must be an integer in [1, 4], got ${value}`);
  }
  return value;
};

interface SubjectPropertyRentalShape {
  readonly grossMonthlyRent: Money;
  readonly vacancyFactor?: Ratio;
}

const readSubjectPropertyRental = (value: unknown): SubjectPropertyRentalShape | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected subjectPropertyRental to be an object, got ${typeof value}`);
  }
  const obj = value as Record<string, unknown>;
  const gross = obj["grossMonthlyRent"];
  if (typeof gross !== "number" || !Number.isFinite(gross) || gross < 0) {
    throw new Error("subjectPropertyRental.grossMonthlyRent must be a non-negative finite number");
  }
  const vacancyRaw = obj["vacancyFactor"];
  if (vacancyRaw === undefined) {
    return { grossMonthlyRent: money(gross) };
  }
  if (
    typeof vacancyRaw !== "number" ||
    !Number.isFinite(vacancyRaw) ||
    vacancyRaw < 0 ||
    vacancyRaw > 1
  ) {
    throw new Error("subjectPropertyRental.vacancyFactor must be a finite number in [0, 1]");
  }
  return {
    grossMonthlyRent: money(gross),
    vacancyFactor: ratio(vacancyRaw),
  };
};

export const subjectRentalEdges: EdgeDefinition[] = [
  {
    id: "calculate-subject-rental-income",
    kind: "transform",
    inputs: ["subjectPropertyRental", "units"],
    outputs: ["subjectRentalIncome"],
    confidence: "derived",
    compute: (inputs) => {
      const rental = readSubjectPropertyRental(inputs.subjectPropertyRental);
      if (rental === null) {
        return { subjectRentalIncome: money(0) };
      }
      const units = readUnits(inputs.units);
      const income = calculateSubjectRentalIncome(
        toMoney(rental.grossMonthlyRent, "subjectPropertyRental.grossMonthlyRent"),
        units,
        rental.vacancyFactor,
      );
      return { subjectRentalIncome: income };
    },
  },
];
