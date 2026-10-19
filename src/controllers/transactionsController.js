import Transaction from "../models/Transaction.js";
import TransactionMatch from "../models/TransactionMatch.js";
import mongoose from "mongoose";

const mutateAndInvalidateMatches = async (mutate) => {
  const session = await mongoose.startSession();

  try {
    return await session.withTransaction(async () => {
      const result = await mutate(session);
      await TransactionMatch.deleteMany({}, { session });
      return result;
    });
  } finally {
    await session.endSession();
  }
};

export const getTransaction = async (req, res, next) => {
  try {
    const { type, date, tradeId, sort, order } = req.query;
    const filter = {};

    if (["SELL", "BUY"].includes(type)) {
      filter.type = type;
    }

    if (tradeId) {
      filter.tradeId = tradeId;
    }

    if (date) {
      const startDate = new Date(`${date}T00:00:00.000Z`);
      const endDate = new Date(startDate);

      endDate.setUTCDate(endDate.getUTCDate() + 1);

      filter.date = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    const allowedSortFields = ["type", "date", "tradeId"];

    const sortField = allowedSortFields.includes(sort) ? sort : "date";
    const sortOrder = order === "desc" ? -1 : 1;

    const transactions = await Transaction.find(filter).sort({
      [sortField]: sortOrder,
    });
    res.status(200).json(transactions);
  } catch (error) {
    next(error);
  }
};

export const getTransactionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isObjectIdOrHexString(id)) {
      const error = new Error("Invalid transaction ID.");
      error.statusCode = 400;
      throw error;
    }

    const transaction = await Transaction.findById(id);

    if (!transaction) {
      const error = new Error("Transaction ID number not found.");
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json(transaction);
  } catch (error) {
    next(error);
  }
};

export const createTransaction = async (req, res, next) => {
  try {
    const { assetId, type, quantity, date, priceEUR, feeEUR, tradeId } =
      req.body;
    const newTransaction = await mutateAndInvalidateMatches(async (session) => {
      const [createdTransaction] = await Transaction.create(
        [{ assetId, type, quantity, date, priceEUR, feeEUR, tradeId }],
        { session },
      );
      return createdTransaction;
    });

    res.status(201).json(newTransaction);
  } catch (error) {
    next(error);
  }
};

export const updateTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isObjectIdOrHexString(id)) {
      const error = new Error("Invalid transaction ID.");
      error.statusCode = 400;
      throw error;
    }

    const { assetId, type, quantity, date, priceEUR, feeEUR, tradeId } =
      req.body;

    const updates = {
      assetId,
      type,
      quantity,
      date,
      priceEUR,
      feeEUR,
      tradeId,
    };

    const updatedTransaction = await mutateAndInvalidateMatches(async (session) => {
      const transaction = await Transaction.findByIdAndUpdate(
        id,
        updates,
        { new: true, runValidators: true, session },
      );

      if (!transaction) {
        const error = new Error("Transaction not found.");
        error.statusCode = 404;
        throw error;
      }

      return transaction;
    });

    res.status(200).json(updatedTransaction);
  } catch (error) {
    next(error);
  }
};

export const deleteTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      const error = new Error("Invalid transaction ID.");
      error.statusCode = 400;
      throw error;
    }

    await mutateAndInvalidateMatches(async (session) => {
      const deletedTransaction = await Transaction.findByIdAndDelete(id, { session });
      if (!deletedTransaction) {
        const error = new Error("Transaction not found.");
        error.statusCode = 404;
        throw error;
      }
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
