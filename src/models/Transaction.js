import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
    },
    type: {
      type: String,
      enum: ["BUY", "SELL"],
      required: true,
    },
    quantity: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    priceEUR: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    feeEUR: {
      type: mongoose.Schema.Types.Decimal128,
      default: "0",
    },
    tradeId: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  { timestamps: true },
);

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;
