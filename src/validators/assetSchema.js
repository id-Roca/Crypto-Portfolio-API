import { z } from "zod";

export const assetSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Symbol is required.")
    .max(20, "Symbol is too long.")
    .transform((symbol) => symbol.toUpperCase()),

  name: z
    .string()
    .trim()
    .min(1, "Asset name is required.")
    .max(100, "Asset name is too long."),
});

export const updateAssetSchema = assetSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });
