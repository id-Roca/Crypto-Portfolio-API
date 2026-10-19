import { jest, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';

// Never read .env. Replace inherited credentials before any application imports.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/forbidden_test_fallback';
process.env.SESSION_SECRET = 'test-only-session-secret';
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD_HASH = 'not-a-real-hash';

const connect = mongoose.connect.bind(mongoose);
const createConnection = mongoose.createConnection.bind(mongoose);
function assertDisposable(uri) {
  if (typeof uri !== 'string' || !/^mongodb:\/\/127\.0\.0\.1:\d+\/crypto_test_/.test(uri)) {
    throw new Error('Tests may only connect to their disposable loopback database');
  }
}
mongoose.connect = (uri, ...args) => { assertDisposable(uri); return connect(uri, ...args); };
mongoose.createConnection = (uri, ...args) => { assertDisposable(uri); return createConnection(uri, ...args); };

beforeEach(() => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External network disabled in tests'));
});
afterEach(() => jest.restoreAllMocks());
