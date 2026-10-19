import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Mock every database-facing dependency before importing the real ESM service.
const find = jest.fn();
const sort = jest.fn();
const deleteMany = jest.fn();
const insertMany = jest.fn();
const startSession = jest.fn();
const withTransaction = jest.fn();
const endSession = jest.fn();
const session = { withTransaction, endSession };
let insideTransaction;

jest.unstable_mockModule("../../src/models/Transaction.js", () => ({
  default: { find },
}));
jest.unstable_mockModule("../../src/models/TransactionMatch.js", () => ({
  default: { deleteMany, insertMany },
}));
jest.unstable_mockModule("mongoose", () => ({
  default: { startSession },
}));

const { calculateAcquisitionCost, calculateFIFO } = await import(
  "../../src/services/fifoService.js"
);

const assetA = "aaaaaaaaaaaaaaaaaaaaaaaa";
const assetB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const id = (value) => value.toString(16).padStart(24, "0");
const trade = (number, type, overrides = {}) => ({
  _id: id(number),
  assetId: assetA,
  type,
  quantity: "1",
  priceEUR: "100",
  feeEUR: "0",
  date: new Date("2023-01-01T00:00:00.000Z"),
  ...overrides,
});
const buy = (number, overrides) => trade(number, "BUY", overrides);
const sell = (number, overrides) => trade(number, "SELL", {
  date: new Date("2023-06-01T00:00:00.000Z"),
  priceEUR: "150",
  ...overrides,
});

// Fixtures represent the result of MongoDB's sort, not a replacement FIFO algorithm.
const history = (...transactions) => sort.mockResolvedValue(transactions);

beforeEach(() => {
  jest.resetAllMocks();
  insideTransaction = false;
  find.mockReturnValue({ sort });
  sort.mockResolvedValue([]);
  startSession.mockResolvedValue(session);
  endSession.mockResolvedValue(undefined);
  withTransaction.mockImplementation(async (callback) => {
    insideTransaction = true;
    try {
      return await callback();
    } finally {
      insideTransaction = false;
    }
  });
  deleteMany.mockImplementation(async () => {
    expect(insideTransaction).toBe(true);
    return { deletedCount: 0 };
  });
  insertMany.mockImplementation(async (matches) => {
    expect(insideTransaction).toBe(true);
    return matches;
  });
});

describe("calculateAcquisitionCost", () => {
  test("includes the entire BUY fee", () => {
    expect(calculateAcquisitionCost(buy(1, {
      quantity: "2", priceEUR: "100", feeEUR: "10",
    })).toString()).toBe("210");
  });

  test("defaults an absent fee to zero", () => {
    expect(calculateAcquisitionCost(buy(1, {
      quantity: "0.25", priceEUR: "80", feeEUR: undefined,
    })).toString()).toBe("20");
  });

  test("rejects a SELL", () => {
    expect(() => calculateAcquisitionCost(sell(1)))
      .toThrow("Acquisition cost requires a BUY transaction.");
  });
});

describe("FIFO matching and financial results", () => {
  test("matches a partial SELL to one BUY", async () => {
    history(buy(1, { quantity: "2" }), sell(2, { quantity: "0.5" }));

    const result = await calculateFIFO();

    expect(result).toEqual({
      matches: [{
        buyTransactionId: id(1), sellTransactionId: id(2), quantity: "0.5",
        holdingPeriod: "SHORT_TERM", profitLossEUR: "25",
      }],
      realizedProfits: [{
        sellTransactionId: id(2), assetId: assetA, quantity: "0.5",
        proceedsEUR: "75", acquisitionCostEUR: "50", profitLossEUR: "25",
        shortTermProfitLossEUR: "25", longTermProfitLossEUR: "0",
      }],
    });
  });

  test("uses earlier BUY lots before later lots across successive sales", async () => {
    history(
      buy(1),
      buy(2, { date: new Date("2023-02-01T00:00:00Z"), priceEUR: "200" }),
      sell(3, { priceEUR: "300" }),
      sell(4, { date: new Date("2023-07-01T00:00:00Z"), priceEUR: "300" }),
    );

    const result = await calculateFIFO();

    expect(result.matches.map((match) => [
      match.buyTransactionId, match.sellTransactionId, match.quantity,
    ])).toEqual([[id(1), id(3), "1"], [id(2), id(4), "1"]]);
    expect(result.realizedProfits.map((profit) => profit.profitLossEUR))
      .toEqual(["200", "100"]);
  });

  test("spans BUY lots and preserves the remainder for the next SELL", async () => {
    history(
      buy(1), buy(2, { quantity: "2", priceEUR: "200" }),
      sell(3, { quantity: "2", priceEUR: "300" }),
      sell(4, { priceEUR: "250" }),
    );

    const result = await calculateFIFO();

    expect(result.matches.map((match) => [
      match.buyTransactionId, match.sellTransactionId, match.quantity,
    ])).toEqual([
      [id(1), id(3), "1"], [id(2), id(3), "1"], [id(2), id(4), "1"],
    ]);
    expect(result.realizedProfits.map((profit) => profit.acquisitionCostEUR))
      .toEqual(["300", "200"]);
    expect(result.realizedProfits.map((profit) => profit.profitLossEUR))
      .toEqual(["300", "50"]);
  });

  test("allocates BUY fees proportionally over partial sales", async () => {
    history(
      buy(1, { quantity: "4", feeEUR: "8" }),
      sell(2), sell(3, { quantity: "3" }),
    );

    const { realizedProfits } = await calculateFIFO();

    expect(realizedProfits.map((profit) => profit.acquisitionCostEUR))
      .toEqual(["102", "306"]);
    expect(realizedProfits.map((profit) => profit.profitLossEUR))
      .toEqual(["48", "144"]);
  });

  test("deducts SELL fees and splits them proportionally between matches", async () => {
    history(
      buy(1, { quantity: "2", feeEUR: "4" }),
      buy(2, { quantity: "4", priceEUR: "200", feeEUR: "8" }),
      sell(3, { quantity: "3", priceEUR: "300", feeEUR: "9" }),
    );

    const { matches, realizedProfits } = await calculateFIFO();

    // First match: 600 - 6 - 204 = 390; second: 300 - 3 - 202 = 95.
    expect(matches.map((match) => match.profitLossEUR)).toEqual(["390", "95"]);
    expect(realizedProfits[0]).toMatchObject({
      proceedsEUR: "891", acquisitionCostEUR: "406", profitLossEUR: "485",
      shortTermProfitLossEUR: "485", longTermProfitLossEUR: "0",
    });
  });

  test("reports a realized loss including both fees", async () => {
    history(buy(1, { feeEUR: "5" }), sell(2, { priceEUR: "80", feeEUR: "2" }));
    const { matches, realizedProfits } = await calculateFIFO();
    expect(matches[0].profitLossEUR).toBe("-27");
    expect(realizedProfits[0]).toMatchObject({
      proceedsEUR: "78", acquisitionCostEUR: "105", profitLossEUR: "-27",
    });
  });

  test("keeps fractional quantities and fees exact for ordinary decimal inputs", async () => {
    history(
      buy(1, { quantity: "0.3", priceEUR: "0.1", feeEUR: "0.003" }),
      sell(2, { quantity: "0.1", priceEUR: "0.2", feeEUR: "0.001" }),
      sell(3, { quantity: "0.2", priceEUR: "0.2", feeEUR: "0.002" }),
    );
    const { matches, realizedProfits } = await calculateFIFO();
    expect(matches.map((match) => match.quantity)).toEqual(["0.1", "0.2"]);
    expect(realizedProfits.map((profit) => profit.profitLossEUR))
      .toEqual(["0.008", "0.016"]);
    expect(realizedProfits.map((profit) => profit.acquisitionCostEUR))
      .toEqual(["0.011", "0.022"]);
  });

  test("handles a one-satoshi quantity", async () => {
    history(
      buy(1, { quantity: "0.00000003", priceEUR: "30000" }),
      sell(2, { quantity: "0.00000001", priceEUR: "40000" }),
    );
    const { realizedProfits } = await calculateFIFO();
    expect(realizedProfits[0]).toMatchObject({
      quantity: "1e-8", acquisitionCostEUR: "0.0003",
      proceedsEUR: "0.0004", profitLossEUR: "0.0001",
    });
  });

  test("keeps independent assets in separate lot pools", async () => {
    history(
      buy(1), buy(2, { assetId: assetB, priceEUR: "20" }),
      sell(3, { assetId: assetB, priceEUR: "30" }), sell(4),
    );
    const { matches, realizedProfits } = await calculateFIFO();
    expect(matches.map((match) => match.buyTransactionId)).toEqual([id(2), id(1)]);
    expect(realizedProfits.map((profit) => [profit.assetId, profit.profitLossEUR]))
      .toEqual([[assetB, "10"], [assetA, "50"]]);
  });

  test("accepts zero prices and zero fees", async () => {
    history(buy(1, { priceEUR: "0" }), sell(2, { priceEUR: "0" }));
    const { realizedProfits } = await calculateFIFO();
    expect(realizedProfits[0].profitLossEUR).toBe("0");
  });
});

describe("holding periods and deterministic ordering", () => {
  test.each([
    ["2024-01-01T11:59:59.999Z", "SHORT_TERM"],
    ["2024-01-01T12:00:00.000Z", "LONG_TERM"],
    ["2024-01-01T12:00:00.001Z", "LONG_TERM"],
  ])("classifies a sale at %s as %s", async (date, holdingPeriod) => {
    history(
      buy(1, { date: new Date("2023-01-01T12:00:00Z") }),
      sell(2, { date: new Date(date) }),
    );
    const { matches, realizedProfits } = await calculateFIFO();
    expect(matches[0].holdingPeriod).toBe(holdingPeriod);
    expect(realizedProfits[0]).toMatchObject({
      shortTermProfitLossEUR: holdingPeriod === "SHORT_TERM" ? "50" : "0",
      longTermProfitLossEUR: holdingPeriod === "LONG_TERM" ? "50" : "0",
    });
  });

  test("separates short- and long-term profit for a sale spanning both", async () => {
    history(
      buy(1),
      buy(2, { date: new Date("2023-12-01T00:00:00Z"), priceEUR: "200" }),
      sell(3, { date: new Date("2024-01-01T00:00:00Z"), quantity: "2", priceEUR: "300", feeEUR: "10" }),
    );
    const { matches, realizedProfits } = await calculateFIFO();
    expect(matches.map((match) => match.holdingPeriod))
      .toEqual(["LONG_TERM", "SHORT_TERM"]);
    expect(realizedProfits[0]).toMatchObject({
      profitLossEUR: "290", shortTermProfitLossEUR: "95", longTermProfitLossEUR: "195",
    });
  });

  test("requests date/_id ordering and consumes tied BUYs in that order", async () => {
    const date = new Date("2023-01-01T00:00:00Z");
    history(buy(1, { date }), buy(2, { date, priceEUR: "200" }), sell(3, { date }));
    const { matches } = await calculateFIFO();
    expect(find).toHaveBeenCalledWith();
    expect(sort).toHaveBeenCalledWith({ date: 1, _id: 1 });
    expect(matches).toHaveLength(1);
    expect(matches[0].buyTransactionId).toBe(id(1));
  });

  test("rejects a same-date SELL ordered before the first BUY by _id", async () => {
    const date = new Date("2023-01-01T00:00:00Z");
    history(sell(1, { date }), buy(2, { date }));
    await expect(calculateFIFO()).rejects.toThrow("Not enough purchased cryptocurrency");
    expect(sort).toHaveBeenCalledWith({ date: 1, _id: 1 });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("invalid inputs and insufficient holdings", () => {
  test.each([
    ["quantity", "0", "quantity must be greater than zero"],
    ["quantity", "-1", "quantity must be greater than zero"],
    ["priceEUR", "-1", "price cannot be negative"],
    ["feeEUR", "-1", "fee cannot be negative"],
  ])("rejects %s=%s without changing persisted matches", async (field, value, message) => {
    history(buy(1, { [field]: value }));
    await expect(calculateFIFO()).rejects.toThrow(message);
    expect(startSession).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(insertMany).not.toHaveBeenCalled();
  });

  test.each(["quantity", "priceEUR", "feeEUR"])("rejects malformed %s", async (field) => {
    history(buy(1, { [field]: "not-a-number" }));
    await expect(calculateFIFO()).rejects.toThrow();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  // Ordinary failing assertions deliberately expose missing finite-number validation.
  test.each([
    ["quantity", "NaN"], ["quantity", "Infinity"],
    ["priceEUR", "NaN"], ["priceEUR", "Infinity"],
    ["feeEUR", "NaN"], ["feeEUR", "Infinity"],
  ])("rejects nonfinite %s=%s before persistence", async (field, value) => {
    history(buy(1, { [field]: value }));
    await expect(calculateFIFO()).rejects.toThrow();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(insertMany).not.toHaveBeenCalled();
  });

  test.each([
    ["no purchases", [sell(1)]],
    ["an oversized sale", [buy(1), sell(2, { quantity: "2" })]],
    ["cumulative overselling", [buy(1), sell(2, { quantity: "0.6" }), sell(3, { quantity: "0.5" })]],
    ["only another asset available", [buy(1, { assetId: assetB }), sell(2)]],
  ])("rejects %s without persisting partial matches", async (_name, transactions) => {
    history(...transactions);
    await expect(calculateFIFO()).rejects.toThrow(
      "Not enough purchased cryptocurrency to cover this sale.",
    );
    expect(startSession).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(insertMany).not.toHaveBeenCalled();
  });
});

describe("FIFO persistence contract (mocked database)", () => {
  test("replaces matches on every recalculation using one session per run", async () => {
    history(buy(1), sell(2));
    const first = await calculateFIFO();
    const second = await calculateFIFO();

    expect(second).toEqual(first);
    expect(startSession).toHaveBeenCalledTimes(2);
    expect(withTransaction).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(insertMany).toHaveBeenCalledTimes(2);
    expect(endSession).toHaveBeenCalledTimes(2);
    for (let call = 1; call <= 2; call += 1) {
      expect(deleteMany).toHaveBeenNthCalledWith(call, {}, { session });
      expect(insertMany).toHaveBeenNthCalledWith(call, [{
        buyTransactionId: id(1), sellTransactionId: id(2), quantity: "1",
      }], { session });
      expect(deleteMany.mock.invocationCallOrder[call - 1])
        .toBeLessThan(insertMany.mock.invocationCallOrder[call - 1]);
    }
    expect(insertMany.mock.invocationCallOrder[0])
      .toBeLessThan(deleteMany.mock.invocationCallOrder[1]);
  });

  test("uses fresh history on recalculation rather than reusing prior lots", async () => {
    history(buy(1), sell(2));
    await calculateFIFO();
    history(buy(1), sell(2, { quantity: "0.5" }));
    const result = await calculateFIFO();
    expect(result.matches[0].quantity).toBe("0.5");
    expect(result.realizedProfits[0].profitLossEUR).toBe("25");
    expect(insertMany).toHaveBeenLastCalledWith([{
      buyTransactionId: id(1), sellTransactionId: id(2), quantity: "0.5",
    }], { session });
  });

  test.each([
    ["empty history", []], ["BUY-only history", [buy(1)]],
  ])("clears old matches for %s without an empty insertion", async (_name, transactions) => {
    history(...transactions);
    await expect(calculateFIFO()).resolves.toEqual({ matches: [], realizedProfits: [] });
    expect(deleteMany).toHaveBeenCalledWith({}, { session });
    expect(insertMany).not.toHaveBeenCalled();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  test("propagates a read failure without starting persistence", async () => {
    const failure = new Error("mock read failure");
    sort.mockRejectedValue(failure);
    await expect(calculateFIFO()).rejects.toBe(failure);
    expect(startSession).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  test("does not delete matches if starting a session fails", async () => {
    const failure = new Error("mock session failure");
    startSession.mockRejectedValue(failure);
    await expect(calculateFIFO()).rejects.toBe(failure);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(insertMany).not.toHaveBeenCalled();
  });

  test("propagates deletion failure and closes the session without inserting", async () => {
    history(buy(1), sell(2));
    const failure = new Error("mock deletion failure");
    deleteMany.mockRejectedValue(failure);
    await expect(calculateFIFO()).rejects.toBe(failure);
    expect(insertMany).not.toHaveBeenCalled();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  test("propagates insertion failure through the transaction and closes the session", async () => {
    history(buy(1), sell(2));
    const failure = new Error("mock insertion failure");
    insertMany.mockRejectedValue(failure);
    await expect(calculateFIFO()).rejects.toBe(failure);
    await expect(withTransaction.mock.results[0].value).rejects.toBe(failure);
    expect(deleteMany).toHaveBeenCalledWith({}, { session });
    expect(insertMany.mock.calls[0][1]).toEqual({ session });
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  test("propagates a transaction failure and closes the session", async () => {
    const failure = new Error("mock transaction failure");
    withTransaction.mockRejectedValue(failure);
    await expect(calculateFIFO()).rejects.toBe(failure);
    expect(endSession).toHaveBeenCalledTimes(1);
  });
});
