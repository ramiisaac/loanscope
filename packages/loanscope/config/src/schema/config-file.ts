import { z } from "zod";
import { transactionSchema } from "./transaction";
import { quickQuoteSchema } from "./quick-quote";
import { simulationPlanSchema } from "./simulation";

export const configFileSchema = z
  .object({
    transaction: transactionSchema.optional(),
    quickQuote: quickQuoteSchema.optional(),
    simulation: simulationPlanSchema.optional(),
  })
  .refine((value) => Boolean(value.transaction) || Boolean(value.quickQuote), {
    message: "Config must include transaction or quickQuote",
  });

export type ConfigFileSchema = z.infer<typeof configFileSchema>;
