import { describe, expect, it } from "vitest";
import { LoanPurpose, Occupancy, money, months } from "@loanscope/domain";
import type { ReservesPolicy } from "@loanscope/domain";
import { resolveReserveFloor, resolveReserveMonths } from "../index";

describe("resolveReserveFloor", () => {
  it("returns 0 months for the None policy", () => {
    const result = resolveReserveFloor(
      { kind: "None" },
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("returns 0 months for the FixedMonths policy regardless of the fixed value", () => {
    const result = resolveReserveFloor(
      { kind: "FixedMonths", months: months(12) },
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("returns 0 months for the AUSDetermined policy (no Tiered floor declared)", () => {
    const result = resolveReserveFloor(
      { kind: "AUSDetermined" },
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("returns 0 months for an empty Tiered policy", () => {
    const result = resolveReserveFloor(
      { kind: "Tiered", tiers: [] },
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("returns 0 months when no Tiered tier matches the (loanAmount, occupancy, purpose) triple", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(1_000_000), max: money(2_000_000) },
          occupancies: [Occupancy.Investment],
          additionalToAus: true,
          months: months(6),
        },
      ],
    };
    const result = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("returns 0 months when the matching tier omits additionalToAus", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Primary],
          months: months(6),
        },
      ],
    };
    const result = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("returns 0 months when the matching tier sets additionalToAus to false", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Primary],
          additionalToAus: false,
          months: months(6),
        },
      ],
    };
    const result = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("returns the tier's months when additionalToAus is true", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Investment],
          additionalToAus: true,
          months: months(6),
        },
      ],
    };
    const result = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(6);
  });

  it("respects per-occupancy filters when selecting the matching tier", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Primary],
          additionalToAus: true,
          months: months(2),
        },
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Secondary],
          additionalToAus: true,
          months: months(4),
        },
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Investment],
          additionalToAus: true,
          months: months(6),
        },
      ],
    };

    const sample = (occupancy: Occupancy): number =>
      Number(resolveReserveFloor(policy, money(500_000), occupancy, LoanPurpose.Purchase));

    expect(sample(Occupancy.Primary)).toBe(2);
    expect(sample(Occupancy.Secondary)).toBe(4);
    expect(sample(Occupancy.Investment)).toBe(6);
  });

  it("respects per-purpose filters when selecting the matching tier", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          purposes: [LoanPurpose.CashOutRefi],
          additionalToAus: true,
          months: months(12),
        },
      ],
    };

    const cashOut = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.CashOutRefi,
    );
    expect(Number(cashOut)).toBe(12);

    const purchase = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(purchase)).toBe(0);
  });

  it("normalizes tier ordering deterministically (matches resolveReserveMonths)", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(1_000_000), max: money(2_000_000) },
          occupancies: [Occupancy.Investment],
          additionalToAus: true,
          months: months(12),
        },
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Investment],
          additionalToAus: true,
          months: months(6),
        },
      ],
    };

    const lower = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    const upper = resolveReserveFloor(
      policy,
      money(1_500_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    expect(Number(lower)).toBe(6);
    expect(Number(upper)).toBe(12);
  });

  it("returns the first matching tier's months when multiple tiers overlap", () => {
    // Both tiers match $500k Primary Purchase. The sort order is by min
    // ascending, so the lower-min tier wins. resolveReserveFloor must
    // mirror resolveReserveMonths' lookup semantics exactly.
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          additionalToAus: true,
          months: months(3),
        },
        {
          loanAmount: { min: money(400_000), max: money(600_000) },
          additionalToAus: true,
          months: months(9),
        },
      ],
    };

    const floor = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    // The min=0 tier sorts first and matches; its months is 3.
    expect(Number(floor)).toBe(3);
  });

  it("returns 0 when the matching tier has additionalToAus and the other has it but does not match", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Investment],
          additionalToAus: true,
          months: months(6),
        },
      ],
    };
    const result = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });
});

describe("resolveReserveFloor + resolveReserveMonths in lockstep", () => {
  it("a Tiered+additionalToAus tier defers to AUS for resolveReserveMonths AND publishes a positive floor", () => {
    // Semantic: a tier with `additionalToAus: true` says "the upstream AUS
    // finding is authoritative; my months is just the floor". So
    // resolveReserveMonths returns "AUS" (consumer must consult AUS), and
    // resolveReserveFloor returns the tier's months. The reserves edge
    // then applies max(ausFinding.reservesMonths, floor) to produce the
    // effective requiredReserveMonths.
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Investment],
          additionalToAus: true,
          months: months(6),
        },
      ],
    };

    const resolved = resolveReserveMonths(
      policy,
      money(500_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    expect(resolved).toBe("AUS");

    const floor = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    expect(Number(floor)).toBe(6);
  });

  it("a Tiered policy with no matching tier returns 0 from both functions (no requirement, no floor)", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(2_000_000), max: money(3_000_000) },
          occupancies: [Occupancy.Investment],
          additionalToAus: true,
          months: months(18),
        },
      ],
    };

    const resolved = resolveReserveMonths(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    const floor = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(resolved as number)).toBe(0);
    expect(Number(floor)).toBe(0);
  });

  it("AUSDetermined policy returns AUS from months and 0 from floor (no Tiered floor declared)", () => {
    const policy: ReservesPolicy = { kind: "AUSDetermined" };
    const resolved = resolveReserveMonths(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    const floor = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(resolved).toBe("AUS");
    expect(Number(floor)).toBe(0);
  });
});
