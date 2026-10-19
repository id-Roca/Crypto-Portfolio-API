import { beforeAll, beforeEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import MongoStore from 'connect-mongo';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loginLimiter } from '../../src/middleware/rateLimiters.js';
import Asset from '../../src/models/Asset.js';
import Transaction from '../../src/models/Transaction.js';
import TransactionMatch from '../../src/models/TransactionMatch.js';

export { Asset, Transaction, TransactionMatch, mongoose, request };
export const missingId = 'f'.repeat(24);
export const credentials = { username: 'test-admin', password: 'test-password-only' };
export const transactionBody = (assetId, overrides = {}) => ({
  assetId: assetId.toString(), type: 'BUY', quantity: '2', priceEUR: '100', feeEUR: '2', date: '2024-01-01T00:00:00.000Z', ...overrides,
});

export function integration() {
  const ctx = {};
  let replica;
  beforeAll(async () => {
    // Random loopback port, disposable files, no environment URI or credentials.
    replica = await MongoMemoryReplSet.create({ binary: { version: '7.0.24' }, replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' } });
    const uri = replica.getUri('crypto_test_integration');
    await mongoose.connect(uri);
    await Promise.all([Asset.init(), Transaction.init(), TransactionMatch.init()]);
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(credentials.password, 4);
    ctx.app = createApp({
      sessionSecret: 'isolated-test-session-secret',
      sessionStore: MongoStore.create({ clientPromise: Promise.resolve(mongoose.connection.getClient()), autoRemove: 'disabled' }),
    });
  }, 120000);
  beforeEach(async () => {
    loginLimiter.resetKey('::/56');
    loginLimiter.resetKey('127.0.0.1');
    // Only known collections on the explicitly created disposable connection.
    if (!mongoose.connection.name.startsWith('crypto_test_')) throw new Error('Unsafe test database');
    await Promise.all([Asset.deleteMany({}), Transaction.deleteMany({}), TransactionMatch.deleteMany({}), mongoose.connection.collection('sessions').deleteMany({})]);
    ctx.agent = request.agent(ctx.app);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await replica?.stop();
  });
  ctx.login = async () => { await ctx.agent.post('/api/auth/login').send(credentials).expect(200); return ctx.agent; };
  return ctx;
}
