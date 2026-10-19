import express from "express";
import {
  getTransaction,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "../controllers/transactionsController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import {
  transactionSchema,
  updateTransactionSchema,
} from "../validators/transactionSchema.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const routes = express.Router();

routes.use(requireAuth);

routes.get("/", getTransaction);

routes.get("/:id", validateObjectId, getTransactionById);

routes.post("/", validate(transactionSchema), createTransaction);

routes.patch(
  "/:id",
  validateObjectId,
  validate(updateTransactionSchema),
  updateTransaction,
);

routes.delete("/:id", validateObjectId, deleteTransaction);

export default routes;
