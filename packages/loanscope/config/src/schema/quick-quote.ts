import { z } from "zod";
import {
  armFixedPeriodSchema,
  loanPurposeSchema,
  occupancySchema,
  propertyTypeSchema,
  moneySchema,
  ratePctSchema,
  unitsSchema,
  loanTypeSchema,
  ficoSchema,
  programKindSchema,
} from "./primitives";
import { LoanPurpose } from "@loanscope/domain";
import { ProgramKind } from "@loanscope/domain";

export const quickQuoteSchema = z
  .object({
    loanAmount: moneySchema,
    loanPurpose: loanPurposeSchema,
    occupancy: occupancySchema,
    propertyType: propertyTypeSchema,
    fico: ficoSchema,
    purchasePrice: moneySchema.optional(),
    appraisedValue: moneySchema.optional(),
    monthlyIncome: moneySchema.optional(),
    monthlyDebts: moneySchema.optional(),
    annualTaxes: moneySchema.optional(),
    annualInsurance: moneySchema.optional(),
    monthlyHoa: moneySchema.optional(),
    closingCosts: moneySchema.optional(),
    totalLiquidAssets: moneySchema.optional(),
    totalRetirementAssets: moneySchema.optional(),
    noteRatePct: ratePctSchema.optional(),
    amortizationMonths: z.coerce.number().int().positive().optional(),
    programKind: programKindSchema.optional(),
    armInitialFixedMonths: armFixedPeriodSchema.optional(),
    loanType: loanTypeSchema.optional(),
    units: unitsSchema.optional(),
    stateCode: z.string().optional(),
    isFirstTimeHomebuyer: z.boolean().optional(),
    isSelfEmployed: z.boolean().optional(),
    numberOfBorrowers: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .superRefine((data, ctx) => {
    // Purchase transactions require purchasePrice
    if (data.loanPurpose === LoanPurpose.Purchase && data.purchasePrice === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["purchasePrice"],
        message: "Purchase price is required for purchase transactions",
      });
    }

    // Loan amount must not exceed purchase price for purchase transactions
    if (
      data.loanPurpose === LoanPurpose.Purchase &&
      data.purchasePrice !== undefined &&
      Number(data.loanAmount) > Number(data.purchasePrice)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["loanAmount"],
        message: "Loan amount must not exceed purchase price for purchase transactions",
      });
    }

    if (data.programKind === ProgramKind.ARM && data.armInitialFixedMonths === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["armInitialFixedMonths"],
        message: "ARM fixed period is required when programKind is ARM",
      });
    }

    if (
      data.armInitialFixedMonths !== undefined &&
      data.programKind !== undefined &&
      data.programKind !== ProgramKind.ARM
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["armInitialFixedMonths"],
        message: "ARM fixed period can only be set when programKind is ARM",
      });
    }
  });

export type QuickQuoteSchema = z.infer<typeof quickQuoteSchema>;
