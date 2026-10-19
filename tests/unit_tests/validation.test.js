import { test, expect } from '@jest/globals';
import { assetSchema, updateAssetSchema } from '../../src/validators/assetSchema.js';
import { transactionSchema, updateTransactionSchema } from '../../src/validators/transactionSchema.js';
import { loginSchema } from '../../src/validators/authSchema.js';
const valid = { assetId: 'a'.repeat(24), type: 'BUY', quantity: '0.00000001', priceEUR: '0', date: '2025-01-01T00:00:00Z' };
test('normalizes asset strings and strips unknown fields', () => {
  expect(assetSchema.parse({ symbol: ' btc ', name: ' Bitcoin ', extra: true })).toEqual({ symbol: 'BTC', name: 'Bitcoin' });
});
test.each([{}, { symbol: '', name: 'X' }, { symbol: '  ', name: 'X' }, { symbol: 'X', name: '' }, { symbol: 1, name: 'X' }, { symbol: 'x'.repeat(21), name: 'X' }, { symbol: 'X', name: 'x'.repeat(101) }])('rejects invalid asset %j', (data) => {
  expect(assetSchema.safeParse(data).success).toBe(false);
});
test.each([updateAssetSchema, updateTransactionSchema])('partial schema rejects empty or unknown-only patches', (schema) => {
  expect(schema.safeParse({}).success).toBe(false);
  expect(schema.safeParse({ unknown: 'x' }).success).toBe(false);
});
test('partial schemas accept a single valid field', () => {
  expect(updateAssetSchema.parse({ symbol: 'eth' })).toEqual({ symbol: 'ETH' });
  expect(updateTransactionSchema.parse({ quantity: '2' })).toEqual({ quantity: '2' });
});
test.each(['BUY', 'SELL'])('accepts valid %s with optional fee/tradeId and offset date', (type) => {
  expect(transactionSchema.parse({ ...valid, type, feeEUR: '0', tradeId: 'b'.repeat(24), date: '2025-01-01T01:00:00+01:00' })).toMatchObject({ type, feeEUR: '0' });
  expect(transactionSchema.parse(valid)).toEqual(valid);
});
test.each([
  ['assetId', 'bad'], ['tradeId', 'bad'], ['type', 'buy'], ['type', 'TRANSFER'],
  ['quantity', '0'], ['quantity', '-1'], ['quantity', 1], ['quantity', 'NaN'], ['quantity', 'Infinity'], ['quantity', 'bad'],
  ['priceEUR', '-1'], ['priceEUR', 'NaN'], ['priceEUR', 'Infinity'], ['priceEUR', 'bad'], ['priceEUR', 10],
  ['feeEUR', '-1'], ['feeEUR', 'NaN'], ['feeEUR', 'Infinity'], ['feeEUR', 'bad'],
  ['date', '2025-02-30T00:00:00Z'], ['date', '2025-01-01'], ['date', 'yesterday'],
])('rejects transaction %s=%s', (field, value) => {
  expect(transactionSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
});
test.each(['assetId', 'type', 'quantity', 'date', 'priceEUR'])('requires %s on creation', (field) => {
  const data = { ...valid }; delete data[field];
  expect(transactionSchema.safeParse(data).success).toBe(false);
});
test('accepts valid login', () => expect(loginSchema.parse({ username: 'admin', password: 'secret' })).toEqual({ username: 'admin', password: 'secret' }));
test.each([{}, { username: '', password: 'x' }, { username: 'x', password: '' }, { username: 1, password: 'x' }, { username: 'x', password: null }])('rejects invalid login %j', (data) => {
  expect(loginSchema.safeParse(data).success).toBe(false);
});
