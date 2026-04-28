import { z } from "zod";
import { incomeTypeSchema, moneySchema, monthsSchema, ratioSchema } from "./primitives";

const asStatedPolicySchema = z.object({
  kind: z.literal("AsStated"),
});

const averagedMonthsPolicySchema = z.object({
  kind: z.literal("AveragedMonths"),
  monthsLookback: z.number().int().positive(),
  historicalAmounts: z.array(z.number().finite()),
});

const rentalGrossPolicySchema = z.object({
  kind: z.literal("RentalGross"),
  grossRent: moneySchema,
  vacancyFactor: ratioSchema.optional(),
});

const percentOfStatedPolicySchema = z.object({
  kind: z.literal("PercentOfStated"),
  factor: ratioSchema,
});

export const qualifyingIncomePolicySchema = z.discriminatedUnion("kind", [
  asStatedPolicySchema,
  averagedMonthsPolicySchema,
  rentalGrossPolicySchema,
  percentOfStatedPolicySchema,
]);

export type QualifyingIncomePolicySchema = z.infer<typeof qualifyingIncomePolicySchema>;

export const incomeSchema = z.object({
  id: z.string().min(1),
  borrowerId: z.string().min(1),
  type: incomeTypeSchema,
  monthlyAmount: moneySchema,
  qualifying: z.boolean().optional(),
  vestingMonths: monthsSchema.optional(),
  historyMonths: monthsSchema.optional(),
  notes: z.string().optional(),
  qualifyingPolicy: qualifyingIncomePolicySchema.optional(),
  historicalAmounts: z.array(z.coerce.number().finite()).optional(),
});

export type IncomeSchema = z.infer<typeof incomeSchema>;
