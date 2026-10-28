import http from 'node:http';
import https from 'node:https';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { workerData as data } from 'node:worker_threads';

const state = new Int32Array(data.state);
const target = new URL(data.upstream);
const pending = new Set();
const MAX_BODY = 32 * 1024 * 1024, MAX_EVENT = 1024 * 1024;
const allowedEvents = new Set([
  'response.created', 'response.in_progress', 'response.completed', 'response.failed', 'response.incomplete', 'error',
  'response.metadata',
  'response.output_item.added', 'response.output_item.done', 'response.content_part.added', 'response.content_part.done',
  'response.output_text.delta', 'response.output_text.done', 'response.output_text.annotation.added',
  'response.refusal.delta', 'response.refusal.done',
  'response.reasoning_summary_part.added', 'response.reasoning_summary_part.done',
  'response.reasoning_summary_text.delta', 'response.reasoning_summary_text.done',
  'response.reasoning_text.delta', 'response.reasoning_text.done',
]);
const safeItem = item => item && (item.type === 'reasoning' || (item.type === 'message'
  && item.role === 'assistant' && (!item.recipient || item.recipient === 'all')
  && (!item.content || (Array.isArray(item.content) && item.content.every(part => ['output_text', 'refusal'].includes(part.type))))));
let requests = 0, active = false, closing = false;
function fail(code, status = 0) {
  if (Atomics.compareExchange(state, 2, 0, code) === 0 && status) Atomics.store(state, 3, status);
}
function reply(res, status, text) {
  if (res.destroyed) return;
  res.writeHead(status, { 'content-type': 'application/json', connection: 'close' });
  res.end(JSON.stringify({ error: { message: text } }));
}
function authorized(req) {
  const actual = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${data.capability}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function safeEvent(frame, stream) {
  const lines = frame.split(/\r?\n/);
  const payload = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
  if (!payload) {
    if (lines.every(line => !line || line.startsWith(':'))) return true;
    fail(4); return false;
  }
  if (payload === '[DONE]') { if (stream.completed) return true; fail(4); return false; }
  let event;
  try { event = JSON.parse(payload); } catch { fail(4); return false; }
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') { fail(4); return false; }
  const name = frame.split(/\r?\n/).find(line => line.startsWith('event:'))?.slice(6).trim();
  if (name && name !== event.type) { fail(4); return false; }
  if (stream.completed || !allowedEvents.has(event.type) || ['error', 'response.failed', 'response.incomplete'].includes(event.type)
    || (event.item && !safeItem(event.item))
    || (event.type.startsWith('response.output_item.') && !safeItem(event.item))
    || (event.type.startsWith('response.content_part.') && !['output_text', 'refusal'].includes(event.part?.type))
    || (event.response?.output && (!Array.isArray(event.response.output) || !event.response.output.every(safeItem)))
    || (event.type === 'response.completed' && (!Array.isArray(event.response?.output) || (event.response.status && event.response.status !== 'completed')))) {
    const safeName = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : 'unrecognized';
    console.error(`Codex judge broker refused event ${safeName(event.type)} item ${safeName(event.item?.type)} part ${safeName(event.part?.type)}`);
    fail(1); return false;
  }
  if (event.type === 'response.completed') stream.completed = true;
  return true;
}
const server = http.createServer((req, res) => {
  if (!authorized(req)) { req.resume(); reply(res, 401, 'Invalid judge capability'); return; }
  if (Atomics.load(state, 2)) { req.resume(); reply(res, 409, 'Judge broker has refused this run'); return; }
  // Codex can probe a WebSocket transport before falling back to HTTP SSE.
  if (req.method === 'GET' && req.url === '/v1/responses') { req.resume(); reply(res, 400, 'Use HTTP streaming'); return; }
  if (req.method !== 'POST' || req.url !== '/v1/responses' || active || ++requests > 8
    || Date.now() >= data.deadline || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) {
    req.resume(); fail(2); reply(res, 400, 'Judge request refused'); return;
  }
  active = true;
  let bytes = 0, chunks = [], refused = false;
  req.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > MAX_BODY) { refused = true; chunks = []; fail(2); reply(res, 413, 'Judge request exceeds size limit'); }
    else if (!refused) chunks.push(chunk);
  });
  req.on('error', () => { active = false; });
  req.on('end', () => {
    if (refused) { active = false; return; }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(2); active = false; reply(res, 400, 'Invalid judge request'); return; }
    chunks = [];
    if (body.model !== data.model || body.stream !== true || (body.tools && (!Array.isArray(body.tools) || body.tools.length))) {
      fail(2); active = false; reply(res, 400, 'Judge model or tools refused'); return;
    }
    body.tools = []; body.tool_choice = 'none'; body.store = false;
    const headers = { 'content-type': 'application/json', accept: 'text/event-stream', 'accept-encoding': 'identity', authorization: `Bearer ${data.token}` };
    if (data.kind === 'chatgpt' && typeof data.accountId === 'string' && data.accountId) headers['chatgpt-account-id'] = data.accountId;
    // Keep transport metadata only; never forward child authorization, cookies,
    // arbitrary headers or a model-controlled destination.
    for (const name of ['originator', 'version', 'user-agent', 'openai-beta', 'session_id', 'conversation_id', 'x-codex-turn-state', 'x-codex-turn-metadata']) {
      const value = req.headers[name];
      if (typeof value === 'string' && value.length <= 8192) headers[name] = value;
    }
    const upstream = (target.protocol === 'https:' ? https : http).request(target, { method: 'POST', headers }, incoming => {
      // ChatGPT's Codex endpoint can send valid SSE without Content-Type. The
      // frame parser below is the authority; it also refuses non-SSE bodies.
      if (incoming.statusCode < 200 || incoming.statusCode >= 300) {
        fail(3, incoming.statusCode); incoming.resume(); reply(res, 502, 'Judge upstream request failed'); return;
      }
      // No redirects, cookies, upstream auth details or error bodies reach Codex.
      res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
      incoming.setEncoding('utf8');
      let buffer = '';
      const stream = { completed: false };
      incoming.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > MAX_EVENT) { fail(4); upstream.destroy(); res.destroy(); return; }
        let match;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          if (!safeEvent(frame, stream)) { upstream.destroy(); res.destroy(); return; }
          res.write(frame + '\n\n');
        }
      });
      incoming.on('end', () => {
        if (buffer.trim() && !safeEvent(buffer, stream)) { res.destroy(); return; }
        if (!stream.completed) { fail(4); res.destroy(); return; }
        if (buffer) res.write(buffer + '\n\n');
        res.end();
      });
      incoming.on('error', () => { fail(3); res.destroy(); });
    });
    pending.add(upstream);
    upstream.on('close', () => { pending.delete(upstream); active = false; });
    upstream.on('error', () => { if (!closing && !Atomics.load(state, 2)) fail(3); if (res.headersSent) res.destroy(); else reply(res, 502, 'Judge upstream unavailable'); });
    upstream.setTimeout(Math.max(1, data.deadline - Date.now()), () => { fail(5); upstream.destroy(); });
    upstream.end(JSON.stringify(body));
  });
});
server.on('clientError', (_error, socket) => socket.destroy());
let attempts = 0;
function listen() {
  // This pool excludes reserved service ports.
  server.listen(randomInt(40960, 57344), '127.0.0.1');
}
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && ++attempts < 16) listen();
  else { Atomics.store(state, 0, -1); Atomics.notify(state, 0); }
});
server.on('listening', () => {
  Atomics.store(state, 1, server.address().port); Atomics.store(state, 0, 1); Atomics.notify(state, 0);
});
const timer = setInterval(() => {
  if (Date.now() >= data.deadline) { fail(5); Atomics.store(state, 0, 2); }
  if (Atomics.load(state, 0) !== 2 || closing) return;
  closing = true; clearInterval(timer);
  for (const request of pending) request.destroy();
  server.closeAllConnections();
  server.close(() => { data.token = ''; data.capability = ''; Atomics.store(state, 0, 3); Atomics.notify(state, 0); });
}, 20);
listen();
