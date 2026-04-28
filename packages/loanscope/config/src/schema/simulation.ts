import { z } from "zod";
import { moneySchema } from "./primitives";

/** Rejects NaN, Infinity, and -Infinity for simulation-specific integer fields. */
const finitePositiveInt = z.coerce
  .number()
  .refine((v) => Number.isFinite(v), {
    message: "Value must be a finite number (no NaN or Infinity)",
  })
  .pipe(z.number().int().positive());

const finiteNonNegativeInt = z.coerce
  .number()
  .refine((v) => Number.isFinite(v), {
    message: "Value must be a finite number (no NaN or Infinity)",
  })
  .pipe(z.number().int().min(0));

export const simulationObjectiveSchema = z.union([
  z.literal("MaximizeEligible"),
  z.literal("MinimizeCash"),
  z.literal("MinimizeActions"),
  z.literal("MaximizeWorstMargin"),
]);

export const simulationLimitsSchema = z.object({
  maxStates: finitePositiveInt,
  maxDepth: finitePositiveInt,
  timeoutMs: finitePositiveInt.optional(),
});

export const simulationPlanSchema = z.object({
  borrowerSets: z.array(z.array(z.string().min(1)).min(1)).default([]),
  payoffCandidates: z.array(z.string().min(1)).default([]),
  maxPayoffCount: finiteNonNegativeInt,
  maxLoanPaydown: moneySchema.optional(),
  maxDownPaymentAdjust: moneySchema.optional(),
  objectives: z.array(simulationObjectiveSchema).min(1),
  limits: simulationLimitsSchema,
});

export type SimulationPlanSchema = z.infer<typeof simulationPlanSchema>;
