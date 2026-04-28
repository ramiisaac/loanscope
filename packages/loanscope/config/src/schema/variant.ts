import { z } from "zod";

export const variantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  includedBorrowerIds: z.array(z.string().min(1)).min(1),
  includeAssetIds: z.array(z.string().min(1)).optional(),
  includeLiabilityIds: z.array(z.string().min(1)).optional(),
  forcePayoffLiabilityIds: z.array(z.string().min(1)).optional(),
  excludeAssetIds: z.array(z.string().min(1)).optional(),
  actionNotes: z.string().optional(),
});

export type VariantSchema = z.infer<typeof variantSchema>;
