import { test, expect } from '@jest/globals';
import { integration, credentials, request } from '../helpers/integration.js';
const ctx = integration();
test('login persists session, rotates session ID, and logout invalidates it', async () => {
  const login = await ctx.agent.post('/api/auth/login').send(credentials).expect(200);
  expect(login.body).toEqual({ success: true, message: 'Logged in successfully' });
  const cookie = login.headers['set-cookie'][0];
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Lax');
  await ctx.agent.get('/api/assets').expect(200, []);
  const second = await ctx.agent.post('/api/auth/login').send(credentials).expect(200);
  expect(second.headers['set-cookie'][0].split(';')[0]).not.toBe(cookie.split(';')[0]);
  await request(ctx.app).get('/api/assets').set('Cookie', cookie.split(';')[0]).expect(401);
  const activeCookie = second.headers['set-cookie'][0].split(';')[0];
  const logout = await ctx.agent.post('/api/auth/logout').expect(200);
  expect(logout.body).toEqual({ success: true, message: 'Logged out successfully.' });
  expect(logout.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
  await ctx.agent.get('/api/assets').expect(401);
  await request(ctx.app).get('/api/assets').set('Cookie', activeCookie).expect(401);
});
test.each([
  ['get', '/api/assets'], ['post', '/api/assets'], ['get', '/api/transactions'], ['post', '/api/transactions'],
  ['get', '/api/portfolio/holdings'], ['get', '/api/portfolio/value'], ['post', '/api/portfolio/fifo'],
  ['patch', '/api/assets/bad'], ['delete', '/api/transactions/bad'],
])('protects %s %s before validation', async (method, path) => {
  const res = await ctx.agent[method](path).send({}).expect(401);
  expect(res.body).toEqual({ success: false, message: 'Authentication required. Please log in.' });
});
test.each([{ ...credentials, password: 'wrong' }, { ...credentials, username: 'wrong' }])('rejects invalid credentials %j', async (body) => {
  const res = await ctx.agent.post('/api/auth/login').send(body).expect(401);
  expect(res.body).toEqual({ success: false, message: 'Invalid username or password.' });
  expect(res.headers['set-cookie']).toBeUndefined();
  await ctx.agent.get('/api/assets').expect(401);
});
test('invalid body returns validation errors', async () => {
  const res = await ctx.agent.post('/api/auth/login').send({ username: '', password: 2 }).expect(400);
  expect(res.body.errors.map(e => e.field)).toEqual(['username', 'password']);
});
test('rate limits the sixth failed login; successful requests do not count', async () => {
  for (let i = 0; i < 6; i++) await ctx.agent.post('/api/auth/login').send(credentials).expect(200);
  for (let i = 0; i < 5; i++) await ctx.agent.post('/api/auth/login').send({ ...credentials, password: 'wrong' }).expect(401);
  const res = await ctx.agent.post('/api/auth/login').send(credentials).expect(429);
  expect(res.body).toEqual({ success: false, message: 'Too many login attempts. Please try again in 15 minutes.' });
  expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
});
test('logout is idempotent without authentication', async () => { await ctx.agent.post('/api/auth/logout').expect(200); });
test('root and unknown route contracts', async () => {
  await ctx.agent.get('/').expect(200, { message: 'Welcome to my Crypto Portfolio API' });
  await ctx.agent.get('/does-not-exist').expect(404, { success: false, message: 'Route not found' });
});
