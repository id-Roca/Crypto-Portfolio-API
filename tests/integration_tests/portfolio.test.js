import { beforeEach, test, expect, jest } from '@jest/globals';
import { integration, Asset, Transaction, TransactionMatch, mongoose, transactionBody } from '../helpers/integration.js';
const ctx = integration();
let asset;
beforeEach(async () => { await ctx.login(); asset = await Asset.create({ symbol: 'BTC', name: 'Bitcoin' }); });
const prices = data => fetch.mockResolvedValue({ ok: true, json: async () => data });
async function history() {
  // Insert out of date order: FIFO must ask MongoDB for chronological ordering.
  const sell = await Transaction.create(transactionBody(asset.id, { type: 'SELL', quantity: '1.5', priceEUR: '300', feeEUR: '3', date: '2024-06-01T00:00:00Z' }));
  const recent = await Transaction.create(transactionBody(asset.id, { quantity: '1', priceEUR: '200', date: '2024-01-01T00:00:00Z' }));
  const old = await Transaction.create(transactionBody(asset.id, { quantity: '1', priceEUR: '100', date: '2023-01-01T00:00:00Z' }));
  return { sell, recent, old };
}
test('empty portfolio returns empty holdings, valuation and FIFO', async () => {
  prices({});
  await ctx.agent.get('/api/portfolio/holdings').expect(200, []);
  await ctx.agent.get('/api/portfolio/value').expect(200, []);
  await ctx.agent.post('/api/portfolio/fifo').expect(200, { success: true, message: 'FIFO calculation completed successfully.', data: { matches: [], realizedProfits: [] } });
  expect(await TransactionMatch.countDocuments()).toBe(0);
});
test('holdings and value retain exact decimal balances across assets', async () => {
  const eth = await Asset.create({ symbol: 'ETH', name: 'Ethereum' });
  await Transaction.create([
    transactionBody(asset.id, { quantity: '0.1' }), transactionBody(asset.id, { quantity: '0.2' }),
    transactionBody(asset.id, { type: 'SELL', quantity: '0.1' }), transactionBody(eth.id, { quantity: '2' }),
  ]);
  prices({ bitcoin: { eur: 0.2 }, ethereum: { eur: 100 } });
  const holdings = await ctx.agent.get('/api/portfolio/holdings').expect(200);
  expect(holdings.body).toHaveLength(2);
  expect(holdings.body).toEqual(expect.arrayContaining([{ assetId: asset.id, quantity: '0.2' }, { assetId: eth.id, quantity: '2' }]));
  const value = await ctx.agent.get('/api/portfolio/value').expect(200);
  expect(value.body).toHaveLength(2);
  expect(value.body).toEqual(expect.arrayContaining([
    { symbol: 'BTC', quantity: '0.2', currentPriceEUR: '0.2', marketValueEUR: '0.04' },
    { symbol: 'ETH', quantity: '2', currentPriceEUR: '100', marketValueEUR: '200' },
  ]));
});
test('missing individual prices produce null valuations', async () => {
  await Transaction.create(transactionBody(asset.id)); prices({});
  await ctx.agent.get('/api/portfolio/value').expect(200, [{ symbol: 'BTC', quantity: '2', currentPriceEUR: null, marketValueEUR: null }]);
});
test('FIFO sorts chronologically, allocates fees, splits holding periods and replaces persisted matches', async () => {
  const { sell, old, recent } = await history();
  const expected = {
    matches: [
      { buyTransactionId: old.id, sellTransactionId: sell.id, quantity: '1', holdingPeriod: 'LONG_TERM', profitLossEUR: '196' },
      { buyTransactionId: recent.id, sellTransactionId: sell.id, quantity: '0.5', holdingPeriod: 'SHORT_TERM', profitLossEUR: '48' },
    ],
    realizedProfits: [{ sellTransactionId: sell.id, assetId: asset.id, quantity: '1.5', proceedsEUR: '447', acquisitionCostEUR: '203', profitLossEUR: '244', shortTermProfitLossEUR: '48', longTermProfitLossEUR: '196' }],
  };
  for (let run = 0; run < 2; run++) {
    const res = await ctx.agent.post('/api/portfolio/fifo').expect(200);
    expect(res.body).toEqual({ success: true, message: 'FIFO calculation completed successfully.', data: expected });
    const persisted = await TransactionMatch.find().sort({ quantity: -1 });
    expect(persisted.map(m => ({ buy: m.buyTransactionId.toString(), sell: m.sellTransactionId.toString(), quantity: m.quantity.toString() }))).toEqual([
      { buy: old.id, sell: sell.id, quantity: '1' }, { buy: recent.id, sell: sell.id, quantity: '0.5' },
    ]);
  }
});
test('FIFO uses _id as deterministic tie breaker', async () => {
  const date = '2024-01-01T00:00:00Z';
  const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
  await Transaction.create([
    { ...transactionBody(asset.id, { date, type: 'SELL', quantity: '1', priceEUR: '300', feeEUR: '0' }), _id: id(3) },
    { ...transactionBody(asset.id, { date, quantity: '1', priceEUR: '200', feeEUR: '0' }), _id: id(2) },
    { ...transactionBody(asset.id, { date, quantity: '1', priceEUR: '100', feeEUR: '0' }), _id: id(1) },
  ]);
  const res = await ctx.agent.post('/api/portfolio/fifo').expect(200);
  expect(res.body.data.matches).toEqual([{ buyTransactionId: id(1).toString(), sellTransactionId: id(3).toString(), quantity: '1', holdingPeriod: 'SHORT_TERM', profitLossEUR: '200' }]);
});
test('overselling returns current generic 500 and leaves prior matches intact', async () => {
  await history(); await ctx.agent.post('/api/portfolio/fifo').expect(200);
  const before = await TransactionMatch.find().lean();
  await Transaction.create(transactionBody(asset.id, { type: 'SELL', quantity: '10', date: '2025-01-01T00:00:00Z' }));
  await ctx.agent.post('/api/portfolio/fifo').expect(500, { success: false, message: 'Internal server error.' });
  expect(await TransactionMatch.find().lean()).toEqual(before);
});
test('failed match insertion rolls back deletion of old matches', async () => {
  await history(); await ctx.agent.post('/api/portfolio/fifo').expect(200);
  const before = await TransactionMatch.find().lean();
  jest.spyOn(TransactionMatch, 'insertMany').mockRejectedValueOnce(new Error('injected insert failure'));
  await ctx.agent.post('/api/portfolio/fifo').expect(500, { success: false, message: 'Internal server error.' });
  expect(await TransactionMatch.find().lean()).toEqual(before);
});
test.each([[429, 429, 'Cryptocurrency price provider rate limit exceeded.'], [500, 502, 'Cryptocurrency price provider is currently unavailable.']])('provider HTTP %s surfaces as %s', async (status, expected, message) => {
  fetch.mockResolvedValue({ ok: false, status });
  await ctx.agent.get('/api/portfolio/value').expect(expected, { success: false, message });
});
test('unavailable provider surfaces as 503', async () => {
  await ctx.agent.get('/api/portfolio/value').expect(503, { success: false, message: 'Unable to reach cryptocurrency price provider.' });
});
test('malformed provider response surfaces as 502', async () => {
  prices(null);
  await ctx.agent.get('/api/portfolio/value').expect(502, { success: false, message: 'Invalid cryptocurrency price data.' });
});
test.each(['/holdings', '/value'])('database read failure on %s is masked', async (path) => {
  jest.spyOn(Transaction, 'find').mockRejectedValueOnce(new Error('private database details'));
  await ctx.agent.get(`/api/portfolio${path}`).expect(500, { success: false, message: 'Internal server error.' });
});
