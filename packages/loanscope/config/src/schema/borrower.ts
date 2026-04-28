import { z } from "zod";
import { incomeSchema } from "./income";
import { ficoSchema } from "./primitives";

export const borrowerSchema = z.object({
  id: z.string().min(1),
  fico: ficoSchema,
  incomes: z.array(incomeSchema).default([]),
  ficoScores: z.array(ficoSchema).optional(),
  displayName: z.string().optional(),
  isFirstTimeHomebuyer: z.boolean().optional(),
  isSelfEmployed: z.boolean().optional(),
  isNonOccupantCoBorrower: z.boolean().optional(),
});

export type BorrowerSchema = z.infer<typeof borrowerSchema>;
