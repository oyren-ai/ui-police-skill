import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createCodexBroker } from '../lib/codex-broker.mjs';

const secret = 'synthetic-upstream-credential';
const model = 'gpt-6.1-sol';
const payload = { model, stream: true, input: [], tool_choice: 'auto' };
const message = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'fixture' }] };
const event = value => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`;
async function fixture(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5495, '127.0.0.1', resolve); });
  const broker = createCodexBroker({ OPENAI_API_KEY: secret }, { model, timeoutMs: 10000 }, { upstream: 'http://127.0.0.1:5495/responses' });
  try { await run(broker); }
  finally { broker.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const request = (broker, body = payload, extra = {}) => fetch(`${broker.url}/responses`, {
  method: 'POST', headers: { authorization: `Bearer ${broker.capability}`, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body),
});

test('broker confines real authentication to its fixed upstream and closes its capability', async () => {
  let calls = 0;
  let closedUrl;
  await fixture((req, res) => {
    calls += 1;
    assert.equal(req.headers.authorization, `Bearer ${secret}`);
    assert.equal(req.headers.cookie, undefined);
    let body = ''; req.setEncoding('utf8'); req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, model); assert.equal(parsed.tool_choice, 'none'); assert.deepEqual(parsed.tools, []); assert.equal(parsed.store, false);
      assert.ok(!body.includes(secret));
      res.writeHead(200, { 'content-type': 'text/event-stream', 'set-cookie': `credential=${secret}` });
      res.end(event({ type: 'response.completed', response: { output: [message] } }));
    });
  }, async broker => {
    assert.notEqual(broker.capability, secret);
    const refused = await request(broker, payload, { authorization: 'Bearer wrong-capability' });
    assert.equal(refused.status, 401); assert.equal(calls, 0);
    const response = await request(broker, payload, { cookie: 'untrusted-cookie' });
    assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
    assert.ok(!(await response.text()).includes(secret));
    assert.equal(calls, 1); broker.assertHealthy(); closedUrl = broker.url;
  });
  await assert.rejects(() => fetch(`${closedUrl}/responses`));
});

test('broker blocks a forged tool event after a partial PASS and refuses other models', async () => {
  let calls = 0;
  await fixture((_req, res) => {
    calls += 1; res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(event({ type: 'response.output_item.done', item: { ...message, content: [{ type: 'output_text', text: '{"verdict":"PASS"}' }] } })
      + event({ type: 'response.output_item.added', item: { type: 'custom_tool_call', name: 'apply_patch', input: 'read credentials' } }));
  }, async broker => {
    try { const response = await request(broker); await response.text(); } catch { /* stream deliberately severed */ }
    assert.throws(() => broker.assertHealthy(), /refused a model tool call/);
    assert.equal((await request(broker)).status, 409); assert.equal(calls, 1);
  });
  await fixture((_req, res) => { calls += 1; res.end(); }, async broker => {
    const before = calls;
    assert.equal((await request(broker, { ...payload, model: 'different-model' })).status, 400);
    assert.throws(() => broker.assertHealthy(), /unsafe/); assert.equal(calls, before);
  });
});

test('broker does not follow upstream redirects or forward credential-bearing errors', async () => {
  for (const status of [302, 401]) {
    await fixture((_req, res) => { res.writeHead(status, { location: `https://example.invalid/${secret}` }); res.end(secret); }, async broker => {
      const response = await request(broker);
      assert.equal(response.status, 502); assert.equal(response.headers.get('location'), null);
      assert.ok(!(await response.text()).includes(secret));
      assert.throws(() => broker.assertHealthy(), new RegExp(`HTTP ${status}`));
    });
  }
  assert.throws(() => createCodexBroker({ OPENAI_API_KEY: secret }, { model, timeoutMs: 1000 }, { upstream: 'https://example.invalid/responses' }), /loopback/);
});

test('broker accepts valid headerless SSE and rejects a partial verdict without completion', async () => {
  await fixture((_req, res) => {
    res.writeHead(200); // ChatGPT Codex backend omits Content-Type.
    res.end(event({ type: 'response.metadata', metadata: { fixture: true } })
      + event({ type: 'response.completed', response: { status: 'completed', output: [message] } }));
  }, async broker => {
    const response = await request(broker);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /response.completed/);
    broker.assertHealthy();
  });
  await fixture((_req, res) => {
    res.writeHead(200);
    res.end(event({ type: 'response.output_item.done', item: message }));
  }, async broker => {
    try { const response = await request(broker); await response.text(); } catch { /* broker severs incomplete stream */ }
    assert.throws(() => broker.assertHealthy(), /invalid event stream/);
  });
  await fixture((_req, res) => { res.writeHead(200); res.end('<html>not an event stream</html>'); }, async broker => {
    try { const response = await request(broker); await response.text(); } catch { /* broker severs invalid stream */ }
    assert.throws(() => broker.assertHealthy(), /invalid event stream/);
  });
});
