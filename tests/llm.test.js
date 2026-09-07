import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiConfig, requestChat, parseVehicleData } from '../src/lib/llm.js';
const config = { url: 'https://api.deepseek.com', key: 'test-only', model: 'deepseek-v4-flash' };
for (const path of ['', '/', '/v1', '/v1/', '/chat/completions', '/v1/chat/completions/']) {
  test(`DeepSeek URL ${path || '(root)'} reaches chat endpoint exactly once`, () => {
    const result = normalizeApiConfig({ ...config, url: ` https://api.deepseek.com${path} ` });
    assert.equal(result.url, `https://api.deepseek.com${path.startsWith('/v1') ? '/v1' : ''}/chat/completions`);
  });
}
test('trim pasted credentials and optional Bearer prefix', () => {
  assert.equal(normalizeApiConfig({ ...config, key: ' Bearer test-only ', model: ' deepseek-v4-flash ' }).key, 'test-only');
  assert.throws(() => normalizeApiConfig({ ...config, key: '' }), /密钥/);
  assert.throws(() => normalizeApiConfig({ ...config, model: '' }), /模型/);
});
test('DeepSeek request and Unicode JSON response', async () => {
  const text = await requestChat(config, '返回 JSON', { fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer test-only');
    const body = JSON.parse(init.body);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.temperature, undefined);
    assert.equal(body.stream, false);
    return Response.json({ choices: [{ message: { content: '{"motor":"后驱电机"}' } }] });
  } });
  assert.equal(parseVehicleData(text).motor, '后驱电机');
});
for (const [status, hint] of [[401, '认证'], [402, '余额'], [404, '模型'], [429, '频繁'], [503, '繁忙']]) {
  test(`HTTP ${status} retains specific error and does not retry permanent errors`, async () => {
    let count = 0;
    await assert.rejects(requestChat(config, 'JSON', { fetchImpl: async () => {
      count++;
      return Response.json({ error: { message: 'upstream diagnostic' } }, { status });
    } }), error => error.message.includes(`${status}`) && error.message.includes(hint) && error.message.includes('upstream diagnostic'));
    assert.equal(count, 1);
  });
}
test('network and timeout errors are distinguishable', async () => {
  await assert.rejects(requestChat(config, 'JSON', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /网络.*CORS/);
  await assert.rejects(requestChat(config, 'JSON', { timeoutMs: 5, fetchImpl: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))) }), /超时/);
});
test('successful HTTP with empty, HTML or malformed vehicle data is diagnosed', async () => {
  await assert.rejects(requestChat(config, 'JSON', { fetchImpl: async () => Response.json({ choices: [{ message: { content: '' } }] }) }), /空内容/);
  await assert.rejects(requestChat(config, 'JSON', { fetchImpl: async () => new Response('<html>wrong endpoint</html>') }), /不是 JSON/);
  assert.throws(() => parseVehicleData('not json'), /有效 JSON/);
  assert.throws(() => parseVehicleData('[]'), /缺少/);
  assert.throws(() => parseVehicleData('{"unrelated":1}'), /缺少/);
});
test('markdown-wrapped JSON is accepted and unexpected fields cannot overwrite form', () => {
  const data = parseVehicleData('```JSON\n{"length": 4800,"motor":"电机","brand":"注入字段"}\n```');
  assert.equal(data.length, '4800');
  assert.equal(data.brand, undefined);
});
test('upstream diagnostic cannot echo secret', async () => {
  await assert.rejects(requestChat(config, 'JSON', { fetchImpl: async () => Response.json({ error: { message: 'bad key test-only' } }, { status: 401 }) }), error => !error.message.includes('test-only'));
});
