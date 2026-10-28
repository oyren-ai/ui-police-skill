import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lint.mjs';
import { validatedOrigin, parseArgs as lookArgs, isAllowedRequestUrl, loadStorageState, resolveReferenceDir } from '../look.mjs';
import { rules } from '../lib/rules.mjs';
import { parseArgs as judgeArgs } from '../judge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uip-portable-'));

test('origin policy admits loopback and configured HTTPS origins only', () => {
  assert.equal(validatedOrigin('http://localhost:3000/page'), 'http://localhost:3000');
  assert.equal(validatedOrigin('http://127.0.0.1:3000/page'), 'http://127.0.0.1:3000');
  assert.equal(validatedOrigin('https://preview.example/page', ['https://preview.example']), 'https://preview.example');
  for (const url of ['https://other.example', 'http://preview.example', 'https://preview.example:8443', 'file:///tmp/x', 'https://user:pass@preview.example']) {
    assert.throws(() => validatedOrigin(url, ['https://preview.example']));
  }
});

test('look uses project config, storage state, and named references', () => {
  const dir = temp();
  fs.writeFileSync(path.join(dir, 'ui-police.config.json'), JSON.stringify({ allowedOrigins: ['https://preview.example'], references: { home: 'reference/home' } }));
  const cfg = loadConfig(dir);
  assert.deepEqual(cfg.allowedOrigins, ['https://preview.example']);
  assert.equal(cfg.references.home, 'reference/home');
  const state = path.join(dir, 'auth.json');
  fs.writeFileSync(state, '{\"cookies\":[],\"origins\":[]}', { mode: 0o600 });
  const o = lookArgs(['https://preview.example/page', '--out', path.join(dir, 'out'), '--storage-state', state], cfg);
  assert.equal(o.storageState, state);
  assert.throws(() => lookArgs(['https://preview.example', '--auth', 'dev'], cfg), /unknown option/);
});

test('lint rule IDs remain stable', () => {
  assert.deepEqual(rules.map((r) => r.id), [
    'raw-control', 'literal-color', 'palette-class', 'arbitrary-value', 'inline-style', 'important', 'new-css-file',
    'shadow', 'mixed-radius', 'icon-library', 'inline-svg', 'nested-scroll', 'fixed-size',
    'type-scale', 'duplicate-primitive', 'custom-pattern', 'icon-button-label', 'touch-target',
  ]);
});

test('judge accepts every documented provider', () => {
  for (const name of ['claude', 'codex', 'agy', 'self']) assert.equal(judgeArgs(['/tmp/report', '--with', name]).with, name);
});

test('package and plugin metadata are local and readable', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json')));
  const market = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/marketplace.json')));
  assert.equal(pkg.bin['ui-police'], './bin/ui-police.mjs');
  assert.ok(pkg.dependencies['playwright-core']);
  assert.ok(Number(pkg.engines.node.match(/\d+/)[0]) >= 20);
  assert.equal(plugin.name, 'ui-police');
  assert.ok(market.plugins.some((item) => item.name === 'ui-police'));
});

test('installer supports three clients and is idempotent in a temporary home', () => {
  const home = temp();
  const env = { ...process.env, HOME: home, UI_POLICE_INSTALL_ALL: '1' };
  for (let run = 0; run < 2; run += 1) {
    const result = spawnSync('bash', [path.join(root, 'install.sh')], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, run === 0 ? /installed/i : /up to date/i);
  }
  for (const dir of ['.claude/skills', '.codex/skills', '.gemini/config/skills']) {
    const skill = path.join(home, dir, 'ui-police/SKILL.md');
    assert.ok(fs.existsSync(skill), skill);
    assert.match(fs.readFileSync(skill, 'utf8'), /npx ui-police/);
  }
});

test('origin guard blocks cross origin requests and redirects', () => {
  assert.equal(isAllowedRequestUrl('https://preview.example/page', 'https://preview.example', { isNavigation: true }), false);
  assert.equal(isAllowedRequestUrl('http://localhost:3000/page', 'http://localhost:3000', { isNavigation: true }), true);
  assert.equal(isAllowedRequestUrl('http://127.0.0.1:3000/page', 'http://localhost:3000', { isNavigation: true }), false);
});

test('storage state rejects symlinks and readable permissions', () => {
  const dir = temp();
  const state = path.join(dir, 'state.json');
  fs.writeFileSync(state, '{"cookies":[],"origins":[]}', { mode: 0o600 });
  assert.deepEqual(loadStorageState(state), { cookies: [], origins: [] });
  fs.chmodSync(state, 0o644);
  assert.throws(() => loadStorageState(state), /0600/);
  fs.chmodSync(state, 0o600);
  const link = path.join(dir, 'link.json');
  fs.symlinkSync(state, link);
  assert.throws(() => loadStorageState(link), /symlink/);
});

test('reference names cannot escape or use a symlink', () => {
  const dir = temp();
  assert.throws(() => resolveReferenceDir('../outside', dir), /invalid reference name/);
  fs.symlinkSync(temp(), path.join(dir, 'linked'));
  assert.throws(() => resolveReferenceDir('linked', dir), /symlink/);
});

test('installer refuses a linked client directory', () => {
  const home = temp();
  fs.symlinkSync(temp(), path.join(home, '.claude'));
  const result = spawnSync('bash', [path.join(root, 'install.sh')], { cwd: root, env: { ...process.env, HOME: home, UI_POLICE_INSTALL_ALL: '1' }, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /refusing symlink/);
});

test('browser sandbox override is explicit and loopback only', () => {
  assert.equal(lookArgs(['http://localhost:3000', '--no-browser-sandbox']).browserSandbox, false);
  assert.throws(() => lookArgs(['https://preview.example', '--no-browser-sandbox'], { allowedOrigins: ['https://preview.example'], references: {} }), /loopback/);
});

test('piped installer waits for its final call before writing', () => {
  const home = temp();
  const script = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
  const env = { ...process.env, HOME: home, UI_POLICE_INSTALL_ALL: '1', UI_POLICE_SOURCE_DIR: root };
  const incomplete = script.split('\n').slice(0, -2).join('\n') + '\n';
  const partial = spawnSync('bash', ['-s'], { input: incomplete, env, encoding: 'utf8' });
  assert.equal(partial.status, 0, partial.stderr);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
  const complete = spawnSync('bash', ['-s'], { input: script, env, encoding: 'utf8' });
  assert.equal(complete.status, 0, complete.stderr);
  for (const dir of ['.claude/skills', '.codex/skills', '.gemini/config/skills']) {
    assert.ok(fs.existsSync(path.join(home, dir, 'ui-police/SKILL.md')));
  }
});
