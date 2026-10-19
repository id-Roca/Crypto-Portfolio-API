import { beforeEach, test, expect, jest } from '@jest/globals';
import { integration, Asset, Transaction, TransactionMatch, missingId, transactionBody } from '../helpers/integration.js';
const ctx = integration();
let asset;
beforeEach(async () => { await ctx.login(); asset = await Asset.create({ symbol: 'BTC', name: 'Bitcoin' }); });
async function seedMatches() {
  const buy = await Transaction.create(transactionBody(asset.id));
  const sell = await Transaction.create(transactionBody(asset.id, { type: 'SELL', quantity: '1', date: '2024-06-01T00:00:00Z' }));
  await ctx.agent.post('/api/portfolio/fifo').expect(200);
  expect(await TransactionMatch.countDocuments()).toBe(1);
  return { buy, sell };
}
test('create, read, list, patch and delete preserve decimal values', async () => {
  const body = transactionBody(asset.id, { quantity: '0.123456789123456789', priceEUR: '0.1' });
  const created = await ctx.agent.post('/api/transactions').send(body).expect(201);
  const id = created.body._id;
  expect(created.body).toMatchObject({ assetId: asset.id, type: 'BUY', quantity: { $numberDecimal: body.quantity }, priceEUR: { $numberDecimal: '0.1' }, feeEUR: { $numberDecimal: '2' } });
  expect((await Transaction.findById(id)).quantity.toString()).toBe(body.quantity);
  await ctx.agent.get(`/api/transactions/${id}`).expect(200, created.body);
  await ctx.agent.get('/api/transactions').expect(200, [created.body]);
  const updated = await ctx.agent.patch(`/api/transactions/${id}`).send({ quantity: '0.2' }).expect(200);
  expect(updated.body.quantity).toEqual({ $numberDecimal: '0.2' });
  expect(updated.body.priceEUR).toEqual({ $numberDecimal: '0.1' });
  expect((await Transaction.findById(id)).quantity.toString()).toBe('0.2');
  const deleted = await ctx.agent.delete(`/api/transactions/${id}`).expect(204);
  expect(deleted.text).toBe(''); expect(await Transaction.findById(id)).toBeNull();
});
test('omitted fee defaults to zero', async () => {
  const body = transactionBody(asset.id); delete body.feeEUR;
  const res = await ctx.agent.post('/api/transactions').send(body).expect(201);
  expect(res.body.feeEUR).toEqual({ $numberDecimal: '0' });
});
test('filters type, tradeId and UTC day and sorts dates', async () => {
  const tradeId = 'a'.repeat(24);
  const rows = await Transaction.create([
    transactionBody(asset.id, { date: '2024-01-02T00:00:00Z', type: 'SELL', tradeId }),
    transactionBody(asset.id, { date: '2024-01-01T23:59:59.999Z', tradeId }),
    transactionBody(asset.id, { date: '2024-01-01T00:00:00Z' }),
  ]);
  const filtered = await ctx.agent.get(`/api/transactions?type=BUY&tradeId=${tradeId}&date=2024-01-01`).expect(200);
  expect(filtered.body.map(t => t._id)).toEqual([rows[1].id]);
  const sorted = await ctx.agent.get('/api/transactions?sort=date&order=desc').expect(200);
  expect(sorted.body.map(t => t._id)).toEqual(rows.map(t => t.id));
  const defaults = await ctx.agent.get('/api/transactions?sort=invalid&type=invalid').expect(200);
  expect(defaults.body.map(t => t._id)).toEqual([...rows].reverse().map(t => t.id));
});
test.each([{ quantity: '0' }, { quantity: 'NaN' }, { priceEUR: '-1' }, { type: 'TRANSFER' }, { assetId: 'bad' }, { date: 'invalid' }])('invalid create %j does not write', async (overrides) => {
  const res = await ctx.agent.post('/api/transactions').send(transactionBody(asset.id, overrides)).expect(400);
  expect(res.body.message).toBe('Validation failed.');
  expect(await Transaction.countDocuments()).toBe(0);
});
test.each(['get', 'patch', 'delete'])('%s invalid ID returns 400', async (method) => {
  await ctx.agent[method]('/api/transactions/bad').send({ quantity: '1' }).expect(400, { success: false, message: 'Invalid ID.' });
});
test.each([['get', 'Transaction ID number not found.'], ['patch', 'Transaction not found.'], ['delete', 'Transaction not found.']])('%s missing transaction preserves matches', async (method, message) => {
  await seedMatches();
  await ctx.agent[method](`/api/transactions/${missingId}`).send({ quantity: '1' }).expect(404, { success: false, message });
  expect(await TransactionMatch.countDocuments()).toBe(1);
});
test.each(['post', 'patch', 'delete'])('%s invalidates persisted FIFO matches', async (method) => {
  const { sell } = await seedMatches();
  const path = method === 'post' ? '/api/transactions' : `/api/transactions/${sell.id}`;
  await ctx.agent[method](path).send(method === 'post' ? transactionBody(asset.id) : { quantity: '0.5' }).expect({ post: 201, patch: 200, delete: 204 }[method]);
  expect(await TransactionMatch.countDocuments()).toBe(0);
});
test('invalid patch preserves transaction and FIFO matches', async () => {
  const { sell } = await seedMatches();
  for (const body of [{}, { quantity: '-1' }, { extra: true }]) await ctx.agent.patch(`/api/transactions/${sell.id}`).send(body).expect(400);
  expect((await Transaction.findById(sell.id)).quantity.toString()).toBe('1');
  expect(await TransactionMatch.countDocuments()).toBe(1);
});
test.each(['post', 'patch', 'delete'])('%s rolls back mutation when invalidation fails', async (method) => {
  const { sell } = await seedMatches();
  // Inject only the failing dependency; writes and transaction rollback use real MongoDB.
  jest.spyOn(TransactionMatch, 'deleteMany').mockRejectedValueOnce(new Error('injected invalidation failure'));
  const path = method === 'post' ? '/api/transactions' : `/api/transactions/${sell.id}`;
  await ctx.agent[method](path).send(method === 'post' ? transactionBody(asset.id) : { quantity: '0.5' }).expect(500, { success: false, message: 'Internal server error.' });
  expect(await Transaction.countDocuments()).toBe(2);
  expect((await Transaction.findById(sell.id)).quantity.toString()).toBe('1');
  expect(await TransactionMatch.countDocuments()).toBe(1);
});
