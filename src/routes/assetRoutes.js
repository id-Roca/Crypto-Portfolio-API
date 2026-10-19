import express from "express";
import {
  getAsset,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
} from "../controllers/assetsController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { assetSchema, updateAssetSchema } from "../validators/assetSchema.js";

const routes = express.Router();

routes.use(requireAuth);

routes.get("/", getAsset);
routes.get("/:id", validateObjectId, getAssetById);

routes.post("/", validate(assetSchema), createAsset);

routes.patch(
  "/:id",
  validateObjectId,
  validate(updateAssetSchema),
  updateAsset,
);

routes.delete("/:id", validateObjectId, deleteAsset);

export default routes;
