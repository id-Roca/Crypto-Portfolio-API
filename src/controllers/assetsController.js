import Asset from "../models/Asset.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";

export const getAsset = async (req, res, next) => {
  try {
    const { symbol, name, sort, order } = req.query;
    const filter = {};

    if (symbol) {
      filter.symbol = symbol.toUpperCase();
    }
    if (name) {
      filter.name = name;
    }

    const allowedSortFields = ["name", "symbol"];

    const sortField = allowedSortFields.includes(sort) ? sort : "symbol";
    const sortOrder = order === "desc" ? -1 : 1;

    const assets = await Asset.find(filter).sort({
      // computed property name:
      [sortField]: sortOrder,
    });
    res.status(200).json(assets);
  } catch (error) {
    next(error);
  }
};

export const getAssetById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isObjectIdOrHexString(id)) {
      const error = new Error("Invalid asset ID.");
      error.statusCode = 400;
      throw error;
    }
    const assets = await Asset.findById(id);
    if (!assets) {
      const error = new Error("Asset ID number not found");
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json(assets);
  } catch (error) {
    next(error);
  }
};

export const createAsset = async (req, res, next) => {
  try {
    const { symbol, name } = req.body;
    const newAsset = await Asset.create({
      symbol,
      name,
    });
    res.status(201).json(newAsset);
  } catch (error) {
    next(error);
  }
};

export const updateAsset = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isObjectIdOrHexString(id)) {
      const error = new Error("Invalid asset ID.");
      error.statusCode = 400;
      throw error;
    }

    const { symbol, name } = req.body;

    const updatedAsset = await Asset.findByIdAndUpdate(
      id,
      { symbol, name },
      { new: true, runValidators: true },
    );

    if (!updatedAsset) {
      const error = new Error("Asset not found.");
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json(updatedAsset);
  } catch (error) {
    next(error);
  }
};

export const deleteAsset = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isObjectIdOrHexString(id)) {
      const error = new Error("Invalid asset ID.");
      error.statusCode = 400;
      throw error;
    }

    const assetExists = await Asset.exists({ _id: id });

    if (!assetExists) {
      const error = new Error("Asset not found.");
      error.statusCode = 404;
      throw error;
    }

    const hasTransactions = await Transaction.exists({ assetId: id });

    if (hasTransactions) {
      const error = new Error(
        "Cannot delete asset while transactions reference it.",
      );
      error.statusCode = 409;
      throw error;
    }

    const deletedAsset = await Asset.findByIdAndDelete(id);

    if (!deletedAsset) {
      const error = new Error("Asset not found.");
      error.statusCode = 404;
      throw error;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
