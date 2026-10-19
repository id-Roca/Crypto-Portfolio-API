import { beforeEach, test, expect } from '@jest/globals';
import { integration, Asset, Transaction, missingId, transactionBody } from '../helpers/integration.js';
const ctx = integration();
beforeEach(() => ctx.login());
test('create, list, read, patch and delete persist real model changes', async () => {
  const created = await ctx.agent.post('/api/assets').send({ symbol: ' btc ', name: ' Bitcoin ' }).expect(201);
  expect(created.body).toMatchObject({ symbol: 'BTC', name: 'Bitcoin' });
  const id = created.body._id;
  expect((await Asset.findById(id)).symbol).toBe('BTC');
  await ctx.agent.get('/api/assets').expect(200, [created.body]);
  await ctx.agent.get(`/api/assets/${id}`).expect(200, created.body);
  const updated = await ctx.agent.patch(`/api/assets/${id}`).send({ name: 'Updated' }).expect(200);
  expect(updated.body).toMatchObject({ _id: id, symbol: 'BTC', name: 'Updated' });
  expect((await Asset.findById(id)).name).toBe('Updated');
  const deleted = await ctx.agent.delete(`/api/assets/${id}`).expect(204);
  expect(deleted.text).toBe(''); expect(await Asset.findById(id)).toBeNull();
});
test('supports filtering and sort defaults', async () => {
  await Asset.create([{ symbol: 'ETH', name: 'Ethereum' }, { symbol: 'BTC', name: 'Bitcoin' }]);
  const list = await ctx.agent.get('/api/assets?sort=invalid').expect(200);
  expect(list.body.map(a => a.symbol)).toEqual(['BTC', 'ETH']);
  const desc = await ctx.agent.get('/api/assets?sort=name&order=desc').expect(200);
  expect(desc.body.map(a => a.name)).toEqual(['Ethereum', 'Bitcoin']);
  const filtered = await ctx.agent.get('/api/assets?symbol=btc&name=Bitcoin').expect(200);
  expect(filtered.body).toHaveLength(1); expect(filtered.body[0].symbol).toBe('BTC');
});
test.each([{}, { symbol: '', name: 'Bitcoin' }, { symbol: 'BTC', name: 1 }])('rejects invalid create %j without writing', async (body) => {
  const res = await ctx.agent.post('/api/assets').send(body).expect(400);
  expect(res.body).toMatchObject({ success: false, message: 'Validation failed.', errors: expect.any(Array) });
  expect(await Asset.countDocuments()).toBe(0);
});
test('rejects empty and invalid patches without changing the asset', async () => {
  const asset = await Asset.create({ symbol: 'BTC', name: 'Bitcoin' });
  for (const body of [{}, { name: '' }, { unknown: true }]) await ctx.agent.patch(`/api/assets/${asset.id}`).send(body).expect(400);
  expect((await Asset.findById(asset.id)).name).toBe('Bitcoin');
});
test.each(['get', 'patch', 'delete'])('%s rejects invalid ID', async (method) => {
  await ctx.agent[method]('/api/assets/invalid').send({ name: 'Updated' }).expect(400, { success: false, message: 'Invalid ID.' });
});
test.each([['get', 'Asset ID number not found'], ['patch', 'Asset not found.'], ['delete', 'Asset not found.']])('%s missing asset returns 404', async (method, message) => {
  await ctx.agent[method](`/api/assets/${missingId}`).send({ name: 'Updated' }).expect(404, { success: false, message });
});
test('cannot delete an asset referenced by transactions', async () => {
  const asset = await Asset.create({ symbol: 'BTC', name: 'Bitcoin' });
  await Transaction.create(transactionBody(asset.id));
  await ctx.agent.delete(`/api/assets/${asset.id}`).expect(409, { success: false, message: 'Cannot delete asset while transactions reference it.' });
  expect(await Asset.countDocuments()).toBe(1); expect(await Transaction.countDocuments()).toBe(1);
});
