import mongoose from "mongoose";

const transactionMatchSchema = new mongoose.Schema(
  {
    buyTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    sellTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    quantity: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
  },
  { timestamps: true }
);

const TransactionMatch = mongoose.model(
  "TransactionMatch",
  transactionMatchSchema
);

export default TransactionMatch;