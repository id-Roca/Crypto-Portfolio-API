import express from "express";
import {
  getHoldings,
  getPortfolioValue,
  runFIFO
} from "../controllers/portfolioController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const routes = express.Router();

routes.use(requireAuth)

routes.get("/holdings", getHoldings);
routes.get("/value", getPortfolioValue);
routes.post("/fifo", runFIFO);

export default routes;
