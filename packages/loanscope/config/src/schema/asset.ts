import { z } from "zod";
import { assetTypeSchema, moneySchema, ratioSchema } from "./primitives";

export const assetSchema = z.object({
  id: z.string().min(1),
  type: assetTypeSchema,
  ownerBorrowerIds: z.array(z.string().min(1)).min(1),
  amount: moneySchema,
  liquidityRank: z.coerce.number().int().optional(),
  canUseForClose: z.boolean().optional(),
  canUseForReserves: z.boolean().optional(),
  haircutRatio: ratioSchema.optional(),
  accountLast4: z.string().optional(),
  notes: z.string().optional(),
});

export type AssetSchema = z.infer<typeof assetSchema>;
