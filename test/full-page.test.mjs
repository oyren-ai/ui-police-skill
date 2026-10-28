import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { settleFullPage } from '../look.mjs';

function fixture(growing = false) {
  const visited = [];
  const image = {
    loading: 'lazy',
    decoded: false,
    getAttribute: () => image.loading,
    setAttribute: (_name, value) => { image.loading = value; },
    removeAttribute: () => { image.loading = null; },
    decode: async () => {
      assert.equal(image.loading, 'eager');
      image.decoded = true;
    },
  };
  const window = { scrollX: 0, scrollY: 120, innerHeight: 800, scrollTo: ({ left = 0, top }) => { window.scrollX = left; window.scrollY = top; visited.push(top); } };
  const document = { documentElement: { get scrollHeight() { return growing ? window.scrollY + 2400 : 2400; } }, images: [image], fonts: { ready: Promise.resolve() } };
  const page = {
    evaluate: async (fn, arg) => vm.runInNewContext(`(${fn.toString()})(arg)`, { window, document, arg, setTimeout, clearTimeout }),
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
  };
  return { page, window, document, image, visited };
}

test('full-page settling visits the lazy content, decodes real media and restores the original position and loading policy', async () => {
  const f = fixture();
  await settleFullPage(f.page);
  assert.ok(f.visited.includes(1600), 'the bottom viewport must be visited');
  assert.equal(f.window.scrollY, 120);
  assert.equal(f.image.decoded, true);
  assert.equal(f.image.loading, 'lazy');
});

test('full-page settling is bounded and restores the original position on a growing document', async () => {
  const f = fixture(true);
  await assert.rejects(() => settleFullPage(f.page, 3), /too long|did not settle/i);
  assert.equal(f.window.scrollY, 120);
});

test('full-page settling accepts reaching the bottom on the final allowed scroll', async () => {
  const f = fixture();
  await settleFullPage(f.page, 3);
  assert.ok(f.visited.includes(1600));
  assert.equal(f.window.scrollY, 120);
  assert.equal(f.image.decoded, true);
  assert.equal(f.image.loading, 'lazy');
});

function fixtureWithMediaGrowth() {
  const f = fixture();
  let height = 2400;
  Object.defineProperty(f.document.documentElement, 'scrollHeight', { get: () => height });
  const decode = f.image.decode;
  f.image.decode = async () => { await decode(); height = 4000; };
  return f;
}

test('full-page settling revisits the lower content added while media decodes', async () => {
  const f = fixtureWithMediaGrowth();
  await settleFullPage(f.page, 6);
  assert.ok(f.visited.includes(3200), 'content below the previous bottom must be visited');
  assert.equal(f.window.scrollY, 120);
  assert.equal(f.image.loading, 'lazy');
});

test('full-page settling keeps the same scroll budget when media grows the page', async () => {
  const f = fixtureWithMediaGrowth();
  await assert.rejects(() => settleFullPage(f.page, 3), /too long|did not settle/i);
  assert.equal(f.window.scrollY, 120);
  assert.equal(f.image.loading, 'lazy');
});
