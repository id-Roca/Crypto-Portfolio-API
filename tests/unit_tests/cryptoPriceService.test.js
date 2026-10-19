import { test, expect } from '@jest/globals';
import { getCryptoPrices } from '../../src/services/cryptoPriceService.js';
const respond = (data) => fetch.mockResolvedValue({ ok: true, json: async () => data });
test('maps supported symbols and requests EUR with an abort signal', async () => {
  respond({ bitcoin: { eur: 100 }, ethereum: { eur: 20 }, solana: { eur: 3 } });
  expect(await getCryptoPrices(['BTC', 'ETH', 'SOL', 'DOGE'])).toEqual({ BTC: 100, ETH: 20, SOL: 3, DOGE: null });
  const [url, options] = fetch.mock.calls[0];
  expect(url.origin + url.pathname).toBe('https://api.coingecko.com/api/v3/simple/price');
  expect(url.searchParams.get('ids')).toBe('bitcoin,ethereum,solana');
  expect(url.searchParams.get('vs_currencies')).toBe('eur');
  expect(options.signal).toBeInstanceOf(AbortSignal);
});
test.each([null, [], 'bad', 123])('rejects malformed payload %j', async (data) => {
  respond(data);
  await expect(getCryptoPrices(['BTC'])).rejects.toMatchObject({ statusCode: 502, message: 'Invalid cryptocurrency price data.' });
});
test.each([undefined, null, 0, -1, '123', NaN, Infinity])('missing or invalid individual price %s becomes null', async (eur) => {
  respond({ bitcoin: { eur } });
  expect(await getCryptoPrices(['BTC', 'ETH'])).toEqual({ BTC: null, ETH: null });
});
test('invalid JSON becomes a provider error', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } });
  await expect(getCryptoPrices(['BTC'])).rejects.toMatchObject({ statusCode: 502, message: 'Invalid response from cryptocurrency price provider.' });
});
test.each([[429, 429, 'Cryptocurrency price provider rate limit exceeded.'], [500, 502, 'Cryptocurrency price provider is currently unavailable.'], [404, 502, 'Cryptocurrency price provider is currently unavailable.']])('maps HTTP %s to %s', async (status, statusCode, message) => {
  fetch.mockResolvedValue({ ok: false, status });
  await expect(getCryptoPrices(['BTC'])).rejects.toMatchObject({ statusCode, message });
});
test.each(['network unavailable', 'timeout'])('%s becomes 503', async (message) => {
  fetch.mockRejectedValue(new Error(message));
  await expect(getCryptoPrices(['BTC'])).rejects.toMatchObject({ statusCode: 503, message: 'Unable to reach cryptocurrency price provider.' });
});
test('empty requested symbols return an empty mapping', async () => {
  respond({}); expect(await getCryptoPrices([])).toEqual({});
});
