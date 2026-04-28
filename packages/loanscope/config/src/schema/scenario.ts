import { z } from "zod";
import { LoanPurpose, ProgramKind } from "@loanscope/domain";
import {
  armFixedPeriodSchema,
  buydownPayerSchema,
  buydownTypeSchema,
  loanPurposeSchema,
  miTypeSchema,
  occupancySchema,
  programKindSchema,
  propertyTypeSchema,
  moneySchema,
  monthsSchema,
  ratePctSchema,
  ratioSchema,
  unitsSchema,
} from "./primitives";

export const propertyAttributesSchema = z.object({
  acreage: z.coerce.number().optional(),
  isAgriculturalZoning: z.boolean().optional(),
  isDecliningMarket: z.boolean().optional(),
  stateCode: z.string().optional(),
});

export const subordinateLienSchema = z.object({
  id: z.string().min(1),
  lienPosition: z.union([z.literal(2), z.literal(3)]),
  amount: moneySchema,
  monthlyPayment: moneySchema.optional(),
  includeInDTI: z.boolean().optional(),
});

export const armDetailsSchema = z.object({
  indexName: z.string().optional(),
  fullyIndexedRatePct: ratePctSchema.optional(),
  marginPct: ratePctSchema.optional(),
  initialFixedMonths: armFixedPeriodSchema.optional(),
});

export const rateNoteSchema = z
  .object({
    noteRatePct: ratePctSchema,
    productKind: programKindSchema.optional(),
    amortizationMonths: z.coerce.number().int().positive().optional(),
    interestOnlyMonths: monthsSchema.optional(),
    arm: armDetailsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.productKind === ProgramKind.ARM && !data.arm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["arm"],
        message: "ARM details are required when productKind is ARM",
      });
    }

    if (data.productKind === ProgramKind.InterestOnly && data.interestOnlyMonths === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interestOnlyMonths"],
        message: "interestOnlyMonths is required when productKind is InterestOnly",
      });
    }
  });

export const monthlyHousingSchema = z.object({
  propertyTax: moneySchema.optional(),
  insurance: moneySchema.optional(),
  hoa: moneySchema.optional(),
  mi: moneySchema.optional(),
  floodInsurance: moneySchema.optional(),
});

export const closingCostsSchema = z.object({
  estimatedTotal: moneySchema,
  prepaidItems: moneySchema.optional(),
});

export const cashOutDetailsSchema = z.object({
  requestedAmount: moneySchema.optional(),
  seasoningMonths: monthsSchema.optional(),
  listedForSaleRecently: z.boolean().optional(),
});

export const vaServiceContextSchema = z.object({
  priorUse: z.boolean(),
  disabilityExempt: z.boolean(),
  reserveOrGuard: z.boolean(),
});

export const locationSchema = z.object({
  zipCode: z.string().optional(),
  countyFips: z.string().optional(),
  stateCode: z.string().optional(),
  isHighCostArea: z.boolean().optional(),
  conformingLimitOverride: moneySchema.optional(),
  highBalanceLimitOverride: moneySchema.optional(),
});

export const miSelectionSchema = z.object({
  type: miTypeSchema.optional(),
  ratePct: ratePctSchema.optional(),
  upfrontPremium: moneySchema.optional(),
  monthlyPremium: moneySchema.optional(),
});

export const buydownSelectionSchema = z.object({
  type: buydownTypeSchema.optional(),
  payer: buydownPayerSchema.optional(),
  cost: moneySchema.optional(),
});

export const subjectPropertyRentalSchema = z.object({
  grossMonthlyRent: moneySchema,
  vacancyFactor: ratioSchema.optional(),
});

/**
 * Tolerance (in currency units) for loan + downPayment = purchasePrice checks.
 * Allows for minor floating-point or rounding discrepancies.
 */
const PRICE_CONSISTENCY_TOLERANCE = 0.01;

/**
 * Zod schema for the `BorrowerBlendPolicy` discriminated union. Defined here
 * (in the scenario module, per the per-task scope rules) so it can be
 * referenced from the transaction schema where the field actually hangs.
 */
export const borrowerBlendPolicySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("LowestMid") }),
  z.object({ kind: z.literal("RepresentativeFico") }),
  z.object({
    kind: z.literal("WeightedAverage"),
    incomeWeighted: z.boolean(),
  }),
  z.object({
    kind: z.literal("PrimaryOnly"),
    primaryBorrowerId: z.string().min(1),
  }),
]);

export const scenarioSchema = z
  .object({
    loanPurpose: loanPurposeSchema,
    occupancy: occupancySchema,
    propertyType: propertyTypeSchema,
    requestedLoanAmount: moneySchema,
    rateNote: rateNoteSchema,
    purchasePrice: moneySchema.optional(),
    downPayment: moneySchema.optional(),
    monthlyHousing: monthlyHousingSchema.default({}),
    closingCosts: closingCostsSchema,
    units: unitsSchema.optional(),
    appraisedValue: moneySchema.optional(),
    subordinateFinancing: z.array(subordinateLienSchema).optional(),
    cashOut: cashOutDetailsSchema.optional(),
    vaServiceContext: vaServiceContextSchema.optional(),
    location: locationSchema.optional(),
    propertyAttributes: propertyAttributesSchema.optional(),
    miSelection: miSelectionSchema.optional(),
    buydown: buydownSelectionSchema.optional(),
    subjectPropertyRental: subjectPropertyRentalSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Cross-field: loan + downPayment should equal purchasePrice when all three are present
    if (data.purchasePrice !== undefined && data.downPayment !== undefined) {
      const expectedLoan = Number(data.purchasePrice) - Number(data.downPayment);
      const actualLoan = Number(data.requestedLoanAmount);
      if (Math.abs(expectedLoan - actualLoan) > PRICE_CONSISTENCY_TOLERANCE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requestedLoanAmount"],
          message: `Loan amount (${actualLoan}) must equal purchasePrice (${Number(data.purchasePrice)}) minus downPayment (${Number(data.downPayment)})`,
        });
      }
    }

    // Cross-field: downPayment must not exceed purchasePrice
    if (
      data.purchasePrice !== undefined &&
      data.downPayment !== undefined &&
      Number(data.downPayment) > Number(data.purchasePrice)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["downPayment"],
        message: "Down payment must not exceed purchase price",
      });
    }

    // Cross-field: purchase transactions should have a purchasePrice
    if (data.loanPurpose === LoanPurpose.Purchase && data.purchasePrice === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["purchasePrice"],
        message: "Purchase price is required for purchase transactions",
      });
    }

    // Cross-field: cashOut details required for CashOutRefi
    if (data.loanPurpose === LoanPurpose.CashOutRefi && !data.cashOut) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cashOut"],
        message: "Cash-out details are required when loan purpose is CashOutRefi",
      });
    }

    // Cross-field: cashOut should not be present for Purchase
    if (data.loanPurpose === LoanPurpose.Purchase && data.cashOut) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cashOut"],
        message: "Cash-out details are not applicable for purchase loans",
      });
    }

    // Cross-field: loan amount must not exceed purchase price (for purchase)
    if (
      data.loanPurpose === LoanPurpose.Purchase &&
      data.purchasePrice !== undefined &&
      Number(data.requestedLoanAmount) > Number(data.purchasePrice)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requestedLoanAmount"],
        message: "Loan amount must not exceed purchase price for purchase transactions",
      });
    }
  });

export type ScenarioSchema = z.infer<typeof scenarioSchema>;
