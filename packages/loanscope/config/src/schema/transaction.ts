import { z } from "zod";
import { borrowerSchema } from "./borrower";
import { assetSchema } from "./asset";
import { liabilitySchema } from "./liability";
import { borrowerBlendPolicySchema, scenarioSchema } from "./scenario";
import { variantSchema } from "./variant";
import { ausEngineSchema, ausFindingSchema, productSourceSelectionSchema } from "./primitives";

export const ausFindingsSchema = z.object({
  engine: ausEngineSchema.optional(),
  finding: ausFindingSchema.optional(),
  reservesMonths: z.coerce.number().int().optional(),
  notes: z.string().optional(),
});

/** Reserve tier boundary for overlap validation. */
export const reserveTierSchema = z.object({
  minMonths: z.coerce.number().int().min(0),
  maxMonths: z.coerce.number().int().min(0),
  label: z.string().optional(),
});

export const transactionSchema = z
  .object({
    id: z.string().min(1),
    scenario: scenarioSchema,
    borrowers: z.array(borrowerSchema).min(1),
    variants: z.array(variantSchema).min(1),
    assets: z.array(assetSchema).optional(),
    liabilities: z.array(liabilitySchema).optional(),
    ausFindings: ausFindingsSchema.optional(),
    borrowerBlendPolicy: borrowerBlendPolicySchema.optional(),
    financedUpfrontFees: z.boolean().optional(),
    productSource: productSourceSelectionSchema.optional(),
    reserveTiers: z.array(reserveTierSchema).optional(),
    knownLenderIds: z.array(z.string().min(1)).optional(),
    knownPresetIds: z.array(z.string().min(1)).optional(),
  })
  .superRefine((data, ctx) => {
    // Validate variant borrower references exist
    const borrowerIds = new Set(data.borrowers.map((b) => b.id));
    for (const variant of data.variants) {
      for (const bid of variant.includedBorrowerIds) {
        if (!borrowerIds.has(bid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["variants", variant.id, "includedBorrowerIds"],
            message: `Variant "${variant.id}" references unknown borrower ID "${bid}"`,
          });
        }
      }
    }

    // Validate lender reference in productSource against knownLenderIds
    if (data.productSource && data.knownLenderIds) {
      const knownLenders = new Set(data.knownLenderIds);
      if (data.productSource.kind === "preset" && !knownLenders.has(data.productSource.lenderId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["productSource", "lenderId"],
          message: `Lender ID "${data.productSource.lenderId}" is not in knownLenderIds`,
        });
      }
      if (
        data.productSource.kind === "custom" &&
        data.productSource.lenderId !== undefined &&
        !knownLenders.has(data.productSource.lenderId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["productSource", "lenderId"],
          message: `Lender ID "${data.productSource.lenderId}" is not in knownLenderIds`,
        });
      }
    }

    // Validate preset reference in productSource against knownPresetIds
    if (data.productSource && data.knownPresetIds) {
      const knownPresets = new Set(data.knownPresetIds);
      if (data.productSource.kind === "preset" && !knownPresets.has(data.productSource.presetId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["productSource", "presetId"],
          message: `Preset ID "${data.productSource.presetId}" is not in knownPresetIds`,
        });
      }
    }

    // Validate reserve-tier overlap: tiers must not have overlapping ranges
    if (data.reserveTiers && data.reserveTiers.length > 1) {
      const sorted = [...data.reserveTiers].sort((a, b) => a.minMonths - b.minMonths);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (prev !== undefined && curr !== undefined && curr.minMonths <= prev.maxMonths) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reserveTiers"],
            message: `Reserve tiers overlap: tier ending at ${prev.maxMonths} months overlaps with tier starting at ${curr.minMonths} months`,
          });
        }
      }
    }

    // Validate each reserve tier has minMonths <= maxMonths
    if (data.reserveTiers) {
      for (let i = 0; i < data.reserveTiers.length; i++) {
        const tier = data.reserveTiers[i];
        if (tier !== undefined && tier.minMonths > tier.maxMonths) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reserveTiers", i],
            message: `Reserve tier minMonths (${tier.minMonths}) must not exceed maxMonths (${tier.maxMonths})`,
          });
        }
      }
    }
  });

export type TransactionSchema = z.infer<typeof transactionSchema>;
