import TransactionMatch from "../models/TransactionMatch";
import mongoose from "mongoose";

export const getTransactionMatch = async (req, res, next) => {
  try {
    const transactionMatch = await TransactionMatch.find();
    res.status(200).json(transactionMatch);
  } catch (error) {
    next(error);
  }
};

export const getTransactionMatchById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isObjectOrHexString(id)) {
      const error = new Error("Invalid transaction ID.");
      error.statusCode = 400;
      throw error;
    }

    const transactionMatched = await TransactionMatch.findById(id);
    if (!transactionMatched) {
      const error = new Error("Transaction-Match ID number not found.");
      error.statusCode = 404;
      throw error;
    }
  } catch (error) {
    next(error);
  }
};
