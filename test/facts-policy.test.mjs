import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFacts, applyPolicy } from '../lib/facts-policy.mjs';

test('screen-reader-only clipped text is not a hard failure', () => {
  const r = classifyFacts({ hard: [{ kind: 'clipped-text', detail: 'span.sr-only "Toggle Sidebar"', box: { w: 1, h: 1 } }, { kind: 'clipped-text', detail: 'td.px-3 "Oct 9"', box: { w: 80, h: 20 } }], soft: [] });
  assert.deepEqual(r.hard.map((h) => h.detail), ['td.px-3 "Oct 9"']);
});

test('tiny targets are soft facts: form controls split out, others counted without the controls', () => {
  const ex = (sel) => ({ sel, w: 16, h: 16 });
  const r = classifyFacts({ hard: [{ kind: 'tiny-tap-target', count: 4, examples: [ex('button.a'), ex('button.b'), ex('button.c'), ex('button.peer[checkbox]')] }], soft: [] });
  assert.equal(r.hard.length, 0);
  assert.deepEqual(r.soft.map((s) => s.kind), ['small-form-control', 'tiny-tap-target']);
  assert.match(r.soft[1].detail, /^3 interactive/);
});

test('other hard kinds pass through; applyPolicy keeps raw measurements and is idempotent', () => {
  const f = applyPolicy({ hard: [{ kind: 'horizontal-overflow', detail: 'x' }], soft: [{ kind: 'many-radii', detail: 'y' }] });
  assert.equal(f.hard.length, 1);
  assert.equal(f.rawHard.length, 1);
  const g = applyPolicy(f);
  assert.deepEqual(g.hard, f.hard);
  assert.deepEqual(g.soft, f.soft);
});

test('classifyFacts and applyPolicy tolerate non-array hard/soft from reference captures', () => {
  assert.deepEqual(classifyFacts({ hard: 1, soft: null }), { hard: [], soft: [] });
  assert.deepEqual(classifyFacts(null), { hard: [], soft: [] });
  const applied = applyPolicy({ hard: 1, soft: 0, stats: { sizes: 5 } });
  assert.deepEqual(applied.hard, []);
  assert.deepEqual(applied.soft, []);
  assert.deepEqual(applied.rawHard, []);
  assert.deepEqual(applied.rawSoft, []);
});
