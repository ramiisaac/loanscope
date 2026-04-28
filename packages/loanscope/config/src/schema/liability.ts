import { z } from "zod";
import { liabilityTypeSchema, moneySchema } from "./primitives";

export const liabilitySchema = z.object({
  id: z.string().min(1),
  type: liabilityTypeSchema,
  borrowerIds: z.array(z.string().min(1)).min(1),
  monthlyPayment: moneySchema,
  unpaidBalance: moneySchema.optional(),
  includeInDTI: z.boolean().optional(),
  payoffAtClose: z.boolean().optional(),
  payoffAmount: moneySchema.optional(),
  accountLast4: z.string().optional(),
  notes: z.string().optional(),
});

export type LiabilitySchema = z.infer<typeof liabilitySchema>;
