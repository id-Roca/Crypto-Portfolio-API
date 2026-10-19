import { jest, test, expect, beforeEach } from '@jest/globals';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../../src/middleware/requireAuth.js';
import { validate } from '../../src/middleware/validate.js';
import { validateObjectId } from '../../src/middleware/validateObjectId.js';
import { errorHandler, notFound } from '../../src/middleware/errorHandler.js';
import { login, logout } from '../../src/controllers/authController.js';
import { assetSchema } from '../../src/validators/assetSchema.js';
let res, next;
beforeEach(() => {
  res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), clearCookie: jest.fn() };
  next = jest.fn();
});
test.each([undefined, {}, { isAuthenticated: false }])('denies unauthenticated session %j', (session) => {
  requireAuth({ session }, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Authentication required. Please log in.' });
  expect(next).not.toHaveBeenCalled();
});
test('allows authenticated session', () => {
  requireAuth({ session: { isAuthenticated: true } }, res, next);
  expect(next).toHaveBeenCalledWith(); expect(res.status).not.toHaveBeenCalled();
});
test('validation replaces input with normalized data', () => {
  const req = { body: { symbol: ' btc ', name: ' Bitcoin ' } };
  validate(assetSchema)(req, res, next);
  expect(req.body).toEqual({ symbol: 'BTC', name: 'Bitcoin' }); expect(next).toHaveBeenCalledWith();
});
test('validation exposes field-specific errors and stops processing', () => {
  validate(assetSchema)({ body: { symbol: '', name: 'Bitcoin' } }, res, next);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Validation failed.', errors: [{ field: 'symbol', message: 'Symbol is required.' }] });
  expect(next).not.toHaveBeenCalled();
});
test.each(['bad', 'a'.repeat(23), 'g'.repeat(24)])('rejects malformed ID %s', (id) => {
  validateObjectId({ params: { id } }, res, next);
  expect(res.status).toHaveBeenCalledWith(400); expect(next).not.toHaveBeenCalled();
});
test('accepts valid object ID', () => {
  validateObjectId({ params: { id: 'a'.repeat(24) } }, res, next); expect(next).toHaveBeenCalledWith();
});
test('hides internal error details', () => {
  errorHandler(new Error('sensitive database detail'), {}, res, next);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal server error.' });
});
test('preserves explicit error status/message', () => {
  errorHandler(Object.assign(new Error('Unavailable'), { statusCode: 503 }), {}, res, next);
  expect(res.status).toHaveBeenCalledWith(503); expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Unavailable' });
});
test('unknown route returns 404', () => {
  notFound({}, res); expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Route not found' });
});
test('login rejects non-string credentials defensively', async () => {
  await login({ body: { username: {}, password: 'x' } }, res, next);
  expect(res.status).toHaveBeenCalledWith(400); expect(next).not.toHaveBeenCalled();
});
test.each(['regenerate', 'save'])('forwards session %s errors', async (stage) => {
  jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
  const failure = new Error(stage);
  const session = { regenerate: jest.fn(cb => cb(stage === 'regenerate' ? failure : null)), save: jest.fn(cb => cb(stage === 'save' ? failure : null)) };
  await login({ body: { username: process.env.ADMIN_USERNAME, password: 'test' }, session }, res, next);
  expect(next).toHaveBeenCalledWith(failure); expect(res.json).not.toHaveBeenCalled();
  if (stage === 'regenerate') expect(session.save).not.toHaveBeenCalled();
});
test('forwards bcrypt failure without disclosing details', async () => {
  const failure = new Error('hash error');
  jest.spyOn(bcrypt, 'compare').mockRejectedValue(failure);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await login({ body: { username: 'test-admin', password: 'test' } }, res, next);
  expect(next).toHaveBeenCalledWith(failure); expect(res.json).not.toHaveBeenCalled();
});
test('logout forwards destroy failure without clearing the cookie', () => {
  const failure = new Error('session store unavailable');
  logout({ session: { destroy: cb => cb(failure) } }, res, next);
  expect(next).toHaveBeenCalledWith(failure); expect(res.clearCookie).not.toHaveBeenCalled();
});
test('logout destroys session and clears cookie', () => {
  const destroy = jest.fn(cb => cb());
  logout({ session: { destroy } }, res, next);
  expect(destroy).toHaveBeenCalledTimes(1); expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
  expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Logged out successfully.' });
});
