import Decimal from "decimal.js";
import Transaction from "../models/Transaction.js";
import Asset from "../models/Asset.js";
import { getCryptoPrices } from "./cryptoPriceService.js";

export const calculateHoldings = async () => {
  const transactions = await Transaction.find();

  const holdings = {};

  for (const transaction of transactions) {
    const assetId = transaction.assetId.toString();
    const quantity = new Decimal(transaction.quantity.toString());

    if (!holdings[assetId]) {
      holdings[assetId] = new Decimal(0);
    }
    if (transaction.type === "BUY") {
      holdings[assetId] = holdings[assetId].plus(quantity);
    } else if (transaction.type === "SELL") {
      holdings[assetId] = holdings[assetId].minus(quantity);
    }
  }
  return Object.entries(holdings).map(([assetId, quantity]) => ({
    assetId,
    quantity: quantity.toString(),
  }));
};

export const calculatePortfolioValue = async () => {
  const holdings = await calculateHoldings();

  const assets = await Asset.find();

  const symbols = assets.map((asset) => asset.symbol);

  const prices = await getCryptoPrices(symbols);

  const portfolio = holdings.map((holding) => {
    const asset = assets.find(
      (asset) => asset._id.toString() === holding.assetId
    );

    const symbol = asset?.symbol;
    const currentPrice = prices[symbol];

    if (currentPrice == null) {
      return {
        symbol,
        quantity: holding.quantity,
        currentPriceEUR: null,
        marketValueEUR: null,
      };
    }

    const marketValue = new Decimal(holding.quantity)
      .times(currentPrice);

    return {
      symbol,
      quantity: holding.quantity,
      currentPriceEUR: currentPrice.toString(),
      marketValueEUR: marketValue.toString(),
    };
  });

  return portfolio;
};