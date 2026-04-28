import type { Money, Months, RatePct } from "@loanscope/domain";
import type { QualifyingPaymentPolicy, RateNote } from "@loanscope/domain";
import { assertNever, ratePct } from "@loanscope/domain";
import { calculatePMTFixed, calculateInterestOnlyPayment } from "./payment";

/**
 * Determines the qualifying rate for ARM products based on the policy.
 * Throws on unrecognized policy kind instead of silently falling back.
 */
export const calculateARMQualifyingRate = (
  noteRatePct: RatePct,
  fullyIndexedRatePct: RatePct,
  policy: QualifyingPaymentPolicy,
): RatePct => {
  switch (policy.kind) {
    case "ARMQualifyMaxNotePlus": {
      const notePlus = ratePct(Number(noteRatePct) + Number(policy.addPctPoints));
      return ratePct(Math.max(notePlus, fullyIndexedRatePct));
    }
    case "ARMQualifyFullyIndexedOrNote":
      return ratePct(Math.max(noteRatePct, fullyIndexedRatePct));
    case "NotePayment":
    case "IOUsesFullyAmortizing":
      throw new Error(`Policy kind '${policy.kind}' is not an ARM qualifying-rate policy`);
    default:
      return assertNever(
        policy,
        `Unknown qualifying payment policy kind: ${(policy as { kind: string }).kind}`,
      );
  }
};

/**
 * Calculates the qualifying monthly payment for underwriting.
 * Throws on unrecognized or malformed policy kinds -- no silent fallback to money(0).
 */
export const calculateQualifyingPayment = (
  principal: Money,
  rateNote: RateNote,
  policy: QualifyingPaymentPolicy,
): Money => {
  const amortMonths = (rateNote.amortizationMonths ?? 360) as Months;
  switch (policy.kind) {
    case "NotePayment":
      if (rateNote.productKind === "InterestOnly" && (rateNote.interestOnlyMonths ?? 0) > 0) {
        return calculateInterestOnlyPayment(principal, rateNote.noteRatePct);
      }
      return calculatePMTFixed(principal, rateNote.noteRatePct, amortMonths);

    case "IOUsesFullyAmortizing":
      return calculatePMTFixed(principal, rateNote.noteRatePct, policy.amortMonths);

    case "ARMQualifyMaxNotePlus": {
      const fullyIndexed = rateNote.arm?.fullyIndexedRatePct ?? rateNote.noteRatePct;
      const rate = calculateARMQualifyingRate(rateNote.noteRatePct, fullyIndexed, policy);
      return calculatePMTFixed(principal, rate, amortMonths);
    }

    case "ARMQualifyFullyIndexedOrNote": {
      const fullyIndexed = rateNote.arm?.fullyIndexedRatePct ?? rateNote.noteRatePct;
      const rate = calculateARMQualifyingRate(rateNote.noteRatePct, fullyIndexed, policy);
      return calculatePMTFixed(principal, rate, amortMonths);
    }

    default:
      return assertNever(
        policy,
        `Unknown qualifying payment policy kind: ${(policy as { kind: string }).kind}`,
      );
  }
};
