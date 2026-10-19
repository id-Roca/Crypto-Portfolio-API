import { jest, beforeEach, test, expect } from '@jest/globals';
const findTransactions = jest.fn();
const findAssets = jest.fn();
const prices = jest.fn();
jest.unstable_mockModule('../../src/models/Transaction.js', () => ({ default: { find: findTransactions } }));
jest.unstable_mockModule('../../src/models/Asset.js', () => ({ default: { find: findAssets } }));
jest.unstable_mockModule('../../src/services/cryptoPriceService.js', () => ({ getCryptoPrices: prices }));
const { calculateHoldings, calculatePortfolioValue } = await import('../../src/services/portfolioService.js');
const tx = (type, quantity, assetId = 'a') => ({ type, quantity, assetId });
beforeEach(() => {
  findTransactions.mockResolvedValue([]);
  findAssets.mockResolvedValue([{ _id: 'a', symbol: 'BTC' }, { _id: 'b', symbol: 'ETH' }]);
  prices.mockResolvedValue({ BTC: 0.2, ETH: 100 });
});
test('empty holdings and valuation', async () => {
  expect(await calculateHoldings()).toEqual([]);
  expect(await calculatePortfolioValue()).toEqual([]);
});
test('sums buys and subtracts sells independently per asset', async () => {
  findTransactions.mockResolvedValue([tx('BUY', '2'), tx('SELL', '0.5'), tx('BUY', '3', 'b')]);
  expect(await calculateHoldings()).toEqual([{ assetId: 'a', quantity: '1.5' }, { assetId: 'b', quantity: '3' }]);
});
test('preserves exact fractional balances and valuation', async () => {
  findTransactions.mockResolvedValue([tx('BUY', '0.1'), tx('BUY', '0.2'), tx('SELL', '0.1')]);
  expect(await calculatePortfolioValue()).toEqual([{ symbol: 'BTC', quantity: '0.2', currentPriceEUR: '0.2', marketValueEUR: '0.04' }]);
  expect(prices).toHaveBeenCalledWith(['BTC', 'ETH']);
});
test('retains fully sold balances as zero', async () => {
  findTransactions.mockResolvedValue([tx('BUY', '1'), tx('SELL', '1')]);
  expect(await calculateHoldings()).toEqual([{ assetId: 'a', quantity: '0' }]);
});
test('current contract exposes negative holdings for oversold histories', async () => {
  findTransactions.mockResolvedValue([tx('SELL', '1')]);
  expect(await calculateHoldings()).toEqual([{ assetId: 'a', quantity: '-1' }]);
});
test('returns null valuation when price is missing', async () => {
  findTransactions.mockResolvedValue([tx('BUY', '2')]);
  prices.mockResolvedValue({ BTC: null });
  expect(await calculatePortfolioValue()).toEqual([{ symbol: 'BTC', quantity: '2', currentPriceEUR: null, marketValueEUR: null }]);
});
test('orphaned assets have no symbol or valuation', async () => {
  findTransactions.mockResolvedValue([tx('BUY', '2', 'missing')]);
  expect(await calculatePortfolioValue()).toEqual([{ symbol: undefined, quantity: '2', currentPriceEUR: null, marketValueEUR: null }]);
});
test.each(['transactions', 'assets', 'prices'])('propagates %s failures', async (source) => {
  const error = new Error('dependency failure');
  ({ transactions: findTransactions, assets: findAssets, prices })[source].mockRejectedValue(error);
  await expect(calculatePortfolioValue()).rejects.toBe(error);
});
