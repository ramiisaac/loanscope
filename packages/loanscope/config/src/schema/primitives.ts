import { z } from "zod";
import {
  AmortizationTerm,
  ArmFixedPeriod,
  AssetType,
  AusEngine,
  AusFinding,
  BuydownPayer,
  BuydownType,
  Channel,
  Agency,
  AmortizationType,
  CheckStatus,
  Confidence,
  IncomeType,
  LiabilityType,
  LoanPurpose,
  LoanType,
  MiType,
  Occupancy,
  ProgramKind,
  PropertyType,
} from "@loanscope/domain";
import { money, months, ratePct, ratio } from "@loanscope/domain";

/** Rejects NaN, Infinity, and -Infinity. */
const finiteNumber = z.coerce.number().refine((v) => Number.isFinite(v), {
  message: "Value must be a finite number (no NaN or Infinity)",
});

export const moneySchema = finiteNumber
  .pipe(z.number().min(0, "Money must be non-negative"))
  .transform((value) => money(value));

export const ratioSchema = finiteNumber
  .pipe(z.number().min(0, "Ratio must be >= 0").max(1, "Ratio must be <= 1"))
  .transform((value) => ratio(value));

export const ratePctSchema = finiteNumber
  .pipe(z.number().min(0, "Rate percent must be non-negative"))
  .transform((value) => ratePct(value));

export const monthsSchema = finiteNumber
  .pipe(z.number().int("Months must be an integer").positive("Months must be positive"))
  .transform((value) => months(value));

export const unitsSchema = finiteNumber.pipe(
  z
    .number()
    .int("Units must be an integer")
    .min(1, "Units minimum is 1")
    .max(4, "Units maximum is 4"),
);

/** FICO score: integer in 300..850 range. */
export const ficoSchema = finiteNumber.pipe(
  z
    .number()
    .int("FICO must be an integer")
    .min(300, "FICO minimum is 300")
    .max(850, "FICO maximum is 850"),
);

/** Non-empty lender identifier. */
export const lenderIdSchema = z
  .string()
  .min(1, "Lender ID must not be empty")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Lender ID must contain only alphanumeric characters, hyphens, and underscores",
  );

/** Non-empty preset identifier. */
export const presetIdSchema = z.string().min(1, "Preset ID must not be empty");

/** Product source kind discriminator. */
export const productSourceKindSchema = z.enum(["generic", "preset", "custom"]);

const genericSourceSchema = z.object({
  kind: z.literal("generic"),
});

const presetSourceSchema = z.object({
  kind: z.literal("preset"),
  lenderId: lenderIdSchema,
  presetId: presetIdSchema,
});

const customSourceSchema = z.object({
  kind: z.literal("custom"),
  lenderId: lenderIdSchema.optional(),
  products: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, "Custom source must include at least one product"),
});

/** Discriminated union for product source selection. */
export const productSourceSelectionSchema = z.discriminatedUnion("kind", [
  genericSourceSchema,
  presetSourceSchema,
  customSourceSchema,
]);

export type ProductSourceSelectionSchema = z.infer<typeof productSourceSelectionSchema>;

export const occupancySchema = z.nativeEnum(Occupancy);
export const loanPurposeSchema = z.nativeEnum(LoanPurpose);
export const propertyTypeSchema = z.nativeEnum(PropertyType);
export const loanTypeSchema = z.nativeEnum(LoanType);
export const programKindSchema = z.nativeEnum(ProgramKind);
export const amortizationTermSchema = z.nativeEnum(AmortizationTerm);
export const armFixedPeriodSchema = z.nativeEnum(ArmFixedPeriod);
export const assetTypeSchema = z.nativeEnum(AssetType);
export const liabilityTypeSchema = z.nativeEnum(LiabilityType);
export const incomeTypeSchema = z.nativeEnum(IncomeType);
export const miTypeSchema = z.nativeEnum(MiType);
export const buydownTypeSchema = z.nativeEnum(BuydownType);
export const buydownPayerSchema = z.nativeEnum(BuydownPayer);
export const ausEngineSchema = z.nativeEnum(AusEngine);
export const ausFindingSchema = z.nativeEnum(AusFinding);
export const channelSchema = z.nativeEnum(Channel);
export const agencySchema = z.nativeEnum(Agency);
export const amortizationTypeSchema = z.nativeEnum(AmortizationType);
export const checkStatusSchema = z.nativeEnum(CheckStatus);
export const confidenceSchema = z.nativeEnum(Confidence);
