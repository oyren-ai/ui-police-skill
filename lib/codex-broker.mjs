import { randomBytes } from 'node:crypto';
import { Worker } from 'node:worker_threads';

const FAILURES = {
  1: 'Codex judge broker refused a model tool call',
  2: 'Codex judge broker refused an unsafe or oversized request',
  3: 'Codex judge upstream request failed',
  4: 'Codex judge broker refused an invalid event stream',
  5: 'Codex judge broker deadline expired',
};

// The optional loopback transport is a trusted-code test dependency, never a
// CLI option, environment setting, page value or model-controlled destination.
export function createCodexBroker(auth, { model, timeoutMs }, { upstream } = {}) {
  const key = auth?.OPENAI_API_KEY;
  const token = key || auth?.tokens?.access_token;
  if (typeof token !== 'string' || !token.trim() || token.length > 65536) throw new Error('No usable Codex login or OPENAI_API_KEY');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) throw new Error('Codex judge timeout must be a positive bounded duration');
  const kind = key ? 'api' : 'chatgpt';
  const target = new URL(upstream || (kind === 'api' ? 'https://api.openai.com/v1/responses' : 'https://chatgpt.com/backend-api/codex/responses'));
  if (upstream && (!['http:', 'https:'].includes(target.protocol) || target.hostname !== '127.0.0.1' || target.port === '3200' || target.username || target.password || target.hash)) {
    throw new Error('Broker fixture transport must be an explicit loopback endpoint outside port3200');
  }
  const capability = `uipj_${randomBytes(32).toString('hex')}`;
  const state = new Int32Array(new SharedArrayBuffer(16));
  const worker = new Worker(new URL('./codex-broker-worker.mjs', import.meta.url), { workerData: {
    state: state.buffer, token, kind, accountId: auth?.tokens?.account_id,
    model, capability, upstream: target.href, deadline: Date.now() + timeoutMs + 5000,
  } });
  worker.on('error', () => { Atomics.store(state, 0, -1); Atomics.notify(state, 0); });
  worker.unref();
  Atomics.wait(state, 0, 0, 5000);
  if (Atomics.load(state, 0) !== 1) {
    void worker.terminate();
    throw new Error('Could not start private Codex judge broker');
  }
  let closed = false;
  return {
    url: `http://127.0.0.1:${Atomics.load(state, 1)}/v1`, capability,
    assertHealthy() {
      const failure = Atomics.load(state, 2);
      if (failure) {
        const status = Atomics.load(state, 3);
        throw new Error(`${FAILURES[failure] || 'Codex judge broker failed'}${status ? ` (HTTP ${status})` : ''}`);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      Atomics.store(state, 0, 2); Atomics.notify(state, 0);
      Atomics.wait(state, 0, 2, 5000);
      void worker.terminate();
    },
  };
}
