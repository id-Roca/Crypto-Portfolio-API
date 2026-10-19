import { z } from "zod";
import Decimal from "decimal.js";

const positiveDecimal = z
  .string()
  .refine(
    (value) => {
      try {
        return new Decimal(value).isFinite() &&
          new Decimal(value).greaterThan(0);
      } catch {
        return false;
      }
    },
    { message: "Must be a positive decimal number." },
  );

const nonNegativeDecimal = z
  .string()
  .refine(
    (value) => {
      try {
        return new Decimal(value).isFinite() &&
          new Decimal(value).greaterThanOrEqualTo(0);
      } catch {
        return false;
      }
    },
    { message: "Must be zero or greater." },
  );

export const transactionSchema = z.object({
  assetId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid asset ID."),

  type: z.enum(["BUY", "SELL"]),

  quantity: positiveDecimal,

  date: z.iso.datetime({ offset: true }),

  priceEUR: nonNegativeDecimal,

  feeEUR: nonNegativeDecimal.optional(),

  tradeId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/, "Invalid trade ID.")
    .optional(),
});

export const updateTransactionSchema = transactionSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });