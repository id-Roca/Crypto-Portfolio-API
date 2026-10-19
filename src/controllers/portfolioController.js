import {
  calculateHoldings,
  calculatePortfolioValue,
} from "../services/portfolioService.js";
import { calculateFIFO } from "../services/fifoService.js";


export const getHoldings = async (req, res, next) => {
  try {
    const holdings = await calculateHoldings();
    res.status(200).json(holdings);
  } catch (error) {
    next(error);
  }
};

export const getPortfolioValue = async (req, res, next) => {
  try {
    const value = await calculatePortfolioValue();
    res.status(200).json(value);
  } catch (error) {
    next(error);
  }
};

export const runFIFO = async (req, res, next) => {
  try {
    const result = await calculateFIFO();

    res.status(200).json({
      success: true,
      message: "FIFO calculation completed successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
