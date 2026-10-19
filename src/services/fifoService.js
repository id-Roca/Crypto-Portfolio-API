import Decimal from "decimal.js";
import Transaction from "../models/Transaction.js";
import TransactionMatch from "../models/TransactionMatch.js";
import mongoose from "mongoose";

export const calculateAcquisitionCost = (transaction) => {
  if (transaction.type !== "BUY") {
    throw new Error("Acquisition cost requires a BUY transaction.");
  }

  const quantity = new Decimal(transaction.quantity.toString());
  const price = new Decimal(transaction.priceEUR.toString());
  const fee = new Decimal(transaction.feeEUR?.toString() ?? "0");

  return quantity.times(price).plus(fee);
};

export const calculateFIFO = async () => {
  const transactions = await Transaction.find().sort({
    date: 1,
    _id: 1,
  });

  const buyLots = new Map();
  const matches = [];
  const realizedProfits = [];

  for (const transaction of transactions) {
    const quantity = new Decimal(transaction.quantity.toString());
    const price = new Decimal(transaction.priceEUR.toString());
    const fee = new Decimal(transaction.feeEUR?.toString() ?? "0");

    if (!quantity.isFinite() || !price.isFinite() || !fee.isFinite()) {
      throw new Error(
        `Invalid transaction ${transaction._id}: quantity, price and fee must be finite numbers.`,
      );
    }

    if (quantity.lte(0)) {
      throw new Error(
        `Invalid transaction ${transaction._id}: quantity must be greater than zero.`,
      );
    }

    if (price.lt(0)) {
      throw new Error(
        `Invalid transaction ${transaction._id}: price cannot be negative.`,
      );
    }

    if (fee.lt(0)) {
      throw new Error(
        `Invalid transaction ${transaction._id}: fee cannot be negative.`,
      );
    }
    const assetId = transaction.assetId.toString();

    if (!buyLots.has(assetId)) {
      buyLots.set(assetId, []);
    }

    if (transaction.type === "BUY") {
      buyLots.get(assetId).push({
        transactionId: transaction._id,
        date: transaction.date,
        remainingQuantity: new Decimal(transaction.quantity.toString()),
        originalQuantity: new Decimal(transaction.quantity.toString()),
        acquisitionCost: calculateAcquisitionCost(transaction),
      });
    }

    if (transaction.type === "SELL") {
      const sellQuantity = new Decimal(transaction.quantity.toString());
      const sellPrice = new Decimal(transaction.priceEUR.toString());
      const sellFee = new Decimal(transaction.feeEUR?.toString() ?? "0");

      let quantityToSell = sellQuantity;
      let totalAcquisitionCost = new Decimal(0);
      let shortTermProfitLoss = new Decimal(0);
      let longTermProfitLoss = new Decimal(0);

      const lots = buyLots.get(assetId);

      for (const lot of lots) {
        if (quantityToSell.isZero()) break;

        const matchedQuantity = Decimal.min(
          quantityToSell,
          lot.remainingQuantity,
        );

        if (matchedQuantity.isZero()) continue;

        const anniversary = new Date(lot.date);
        anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);

        const holdingPeriod =
          transaction.date >= anniversary ? "LONG_TERM" : "SHORT_TERM";

        const matchedCost = lot.acquisitionCost
          .times(matchedQuantity)
          .dividedBy(lot.originalQuantity);

        const allocatedSellFee = sellFee
          .times(matchedQuantity)
          .dividedBy(sellQuantity);

        const matchedProceeds = matchedQuantity
          .times(sellPrice)
          .minus(allocatedSellFee);

        const matchedProfitLoss = matchedProceeds.minus(matchedCost);

        matches.push({
          buyTransactionId: lot.transactionId,
          sellTransactionId: transaction._id,
          quantity: matchedQuantity.toString(),
          holdingPeriod,
          profitLossEUR: matchedProfitLoss.toString(),
        });

        if (holdingPeriod === "LONG_TERM") {
          longTermProfitLoss = longTermProfitLoss.plus(matchedProfitLoss);
        } else {
          shortTermProfitLoss = shortTermProfitLoss.plus(matchedProfitLoss);
        }

        totalAcquisitionCost = totalAcquisitionCost.plus(matchedCost);
        lot.remainingQuantity = lot.remainingQuantity.minus(matchedQuantity);
        quantityToSell = quantityToSell.minus(matchedQuantity);
      }

      if (quantityToSell.greaterThan(0)) {
        throw new Error(
          "Not enough purchased cryptocurrency to cover this sale.",
        );
      }

      const netSaleProceeds = sellQuantity.times(sellPrice).minus(sellFee);

      realizedProfits.push({
        sellTransactionId: transaction._id.toString(),
        assetId,
        quantity: sellQuantity.toString(),
        proceedsEUR: netSaleProceeds.toString(),
        acquisitionCostEUR: totalAcquisitionCost.toString(),
        profitLossEUR: netSaleProceeds.minus(totalAcquisitionCost).toString(),
        shortTermProfitLossEUR: shortTermProfitLoss.toString(),
        longTermProfitLossEUR: longTermProfitLoss.toString(),
      });
    }
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await TransactionMatch.deleteMany({}, { session });

      if (matches.length > 0) {
        await TransactionMatch.insertMany(
          matches.map(({ buyTransactionId, sellTransactionId, quantity }) => ({
            buyTransactionId,
            sellTransactionId,
            quantity,
          })),
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }
  return { matches, realizedProfits };
};
