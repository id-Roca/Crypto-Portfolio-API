import mongoose from "mongoose";

const assetSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
});

const Asset = mongoose.model("Asset", assetSchema);

export default Asset;
