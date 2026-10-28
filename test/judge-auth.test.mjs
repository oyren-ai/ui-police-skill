import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runModel, stageCodexAuth } from '../judge.mjs';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uip-auth-test-'));
const jwt = (payload) => `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`;
const access = jwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
const login = JSON.stringify({ auth_mode: 'chatgpt', tokens: { id_token: jwt({ email: 'fixture@example.invalid' }), access_token: access, refresh_token: 'fixture-refresh', account_id: 'fixture-account' }, last_refresh: '2020-01-01T00:00:00Z' });

test('auth staging stays bound to the checked directory if its path is replaced', () => {
  const root = temp();
  const home = path.join(root, 'home');
  const moved = path.join(root, 'moved');
  const other = path.join(root, 'other');
  const stage = path.join(root, 'stage');
  for (const dir of [home, other, stage]) fs.mkdirSync(dir, { mode: 0o700 });
  fs.writeFileSync(path.join(home, 'auth.json'), login, { mode: 0o600 });
  const replacement = JSON.parse(login);
  replacement.tokens.access_token = jwt({ exp: Math.floor(Date.now() / 1000) + 3600, sub: 'replacement' });
  fs.writeFileSync(path.join(other, 'auth.json'), JSON.stringify(replacement), { mode: 0o600 });
  const realpath = fs.realpathSync;
  let swapped = false;
  fs.realpathSync = (...args) => {
    const resolved = realpath(...args);
    if (resolved === home && !swapped) {
      swapped = true;
      fs.renameSync(home, moved);
      fs.symlinkSync(other, home);
    }
    return resolved;
  };
  try {
    assert.equal(stageCodexAuth(stage, { CODEX_HOME: home }), true);
    assert.equal(swapped, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(stage, 'auth.json'), 'utf8')).tokens.access_token, access);
  } finally {
    fs.realpathSync = realpath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('login snapshots cannot renew a session and must outlive the complete judge timeout', () => {
  const root = temp();
  const home = path.join(root, 'home');
  const stage = path.join(root, 'stage');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(stage, { mode: 0o700 });
  const source = path.join(home, 'auth.json');
  const now = Date.now();
  const seconds = Math.floor(now / 1000);
  const auth = JSON.parse(login);
  try {
    for (const token of ['opaque', 'a.invalid.c', jwt({}), jwt({ exp: '4102444800' }), jwt({ exp: null }), jwt({ exp: seconds - 1 }), jwt({ exp: seconds + 70 })]) {
      fs.writeFileSync(source, JSON.stringify({ ...auth, tokens: { ...auth.tokens, access_token: token } }), { mode: 0o600 });
      assert.throws(() => stageCodexAuth(stage, { CODEX_HOME: home }, { timeoutSec: 30, now }), /codex login/i);
      assert.deepEqual(fs.readdirSync(stage), []);
    }
    fs.writeFileSync(source, login);
    assert.equal(stageCodexAuth(stage, { CODEX_HOME: home }, { timeoutSec: 30, now }), true);
    const staged = JSON.parse(fs.readFileSync(path.join(stage, 'auth.json'), 'utf8'));
    assert.equal(staged.tokens.access_token, access);
    assert.equal(staged.tokens.refresh_token, '', 'the isolated child must never hold a rotating renewal credential');
    assert.equal(staged.last_refresh, new Date(now).toISOString());
    assert.equal(fs.readFileSync(source, 'utf8'), login, 'original login bytes stay unchanged');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex auth staging rejects non-string and blank credentials before creating a staged file', () => {
  const root = temp();
  const home = path.join(root, 'codex-home');
  const stage = path.join(root, 'stage');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(stage, { mode: 0o700 });
  const source = path.join(home, 'auth.json');
  try {
    for (const value of [1, true, [], {}, '', ' \t\n']) {
      for (const auth of [{ OPENAI_API_KEY: value }, { tokens: { access_token: value } }]) {
        fs.writeFileSync(source, JSON.stringify(auth), { mode: 0o600 });
        assert.throws(() => stageCodexAuth(stage, { CODEX_HOME: home }), /invalid credentials/);
        assert.deepEqual(fs.readdirSync(stage), []);
      }
    }
    fs.writeFileSync(source, JSON.stringify({ OPENAI_API_KEY: 'fixture-api' }));
    assert.equal(stageCodexAuth(stage, { CODEX_HOME: home }), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex auth staging uses a private copy, skips explicit API keys and missing logins, and rejects unsafe caches', () => {
  const root = temp();
  const home = path.join(root, 'codex-home');
  const stage = path.join(root, 'stage');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(stage, { mode: 0o700 });
  const source = path.join(home, 'auth.json');
  const env = { CODEX_HOME: home };
  try {
    assert.equal(stageCodexAuth(stage, env), false);
    fs.writeFileSync(source, login, { mode: 0o600 });
    assert.equal(stageCodexAuth(stage, { ...env, OPENAI_API_KEY: 'fixture-api' }), false);
    assert.deepEqual(fs.readdirSync(stage), []);
    assert.equal(stageCodexAuth(stage, env), true);
    const staged = JSON.parse(fs.readFileSync(path.join(stage, 'auth.json'), 'utf8'));
    assert.equal(staged.tokens.access_token, access);
    assert.equal(staged.tokens.refresh_token, '');
    assert.equal(fs.statSync(path.join(stage, 'auth.json')).mode & 0o777, 0o600);
    fs.rmSync(path.join(stage, 'auth.json'));
    fs.chmodSync(source, 0o640);
    assert.throws(() => stageCodexAuth(stage, env), /private|permission/i);
    fs.chmodSync(source, 0o600);
    fs.linkSync(source, path.join(home, 'linked'));
    assert.throws(() => stageCodexAuth(stage, env), /regular|link/i);
    fs.rmSync(path.join(home, 'linked'));
    fs.renameSync(source, path.join(home, 'real-auth'));
    fs.symlinkSync(path.join(home, 'real-auth'), source);
    assert.throws(() => stageCodexAuth(stage, env), /symlink|safe|regular/i);
    fs.rmSync(source);
    fs.writeFileSync(source, '{bad fixture-secret', { mode: 0o600 });
    assert.throws(() => stageCodexAuth(stage, env), (e) => /invalid/i.test(e.message) && !e.message.includes('fixture-secret'));
    fs.writeFileSync(source, 'x'.repeat(65537));
    assert.throws(() => stageCodexAuth(stage, env), /size|large/i);
    assert.deepEqual(fs.readdirSync(stage), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex judge mounts only an ephemeral broker capability and removes it when execution fails', () => {
  const root = temp();
  const home = path.join(root, 'codex-home');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.writeFileSync(path.join(home, 'auth.json'), login, { mode: 0o600 });
  fs.writeFileSync(path.join(home, 'config.toml'), 'private configuration');
  const saved = { CODEX_HOME: process.env.CODEX_HOME, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  process.env.CODEX_HOME = home;
  delete process.env.OPENAI_API_KEY;
  let sandbox;
  let authFile;
  try {
    const fakeSpawn = (cmd, args, options) => {
      sandbox = options.cwd;
      assert.equal(cmd, '/usr/bin/bwrap');
      const mount = args.indexOf('/tmp/auth.json') - 1;
      authFile = args[mount];
      assert.equal(fs.existsSync(path.join(sandbox, 'auth.json')), false);
      assert.ok(!authFile.startsWith(sandbox + path.sep));
      const childAuth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      assert.ok(!JSON.stringify(childAuth).includes(access), 'the actual access token must stay outside the agent namespace');
      assert.ok(childAuth.OPENAI_API_KEY, 'the child receives only the ephemeral broker capability');
      assert.equal(childAuth.tokens, undefined);
      assert.equal(options.env.OPENAI_API_KEY, undefined);
      assert.equal(args[mount - 1], '--ro-bind');
      assert.equal(args[mount + 1], '/tmp/auth.json');
      assert.equal(options.env.CODEX_HOME, '/tmp');
      assert.equal(fs.existsSync(path.join(sandbox, 'config.toml')), false);
      assert.ok(!args.includes(home));
      assert.ok(args.includes('--ignore-user-config'));
      assert.ok(args.includes('shell_tool'));
      assert.ok(args.includes('multi_agent'));
      assert.ok(!JSON.stringify({ args, env: options.env, input: options.input }).includes(access));
      throw new Error('fixture execution failure');
    };
    assert.throws(() => runModel({ with: 'codex', timeout: 10 }, '', 'prompt', { outDir: root, variants: [], refs: null }, fakeSpawn), /fixture execution failure/);
    assert.ok(sandbox, 'the authenticated judge must have been started');
    assert.equal(fs.existsSync(sandbox), false);
    assert.equal(fs.existsSync(path.dirname(authFile)), false);
    assert.equal(fs.readFileSync(path.join(home, 'auth.json'), 'utf8'), login);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an unusable login fails closed with an actionable diagnostic and preserves OS error codes', () => {
  const root = temp();
  const home = path.join(root, 'codex-home');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.writeFileSync(path.join(home, 'auth.json'), login, { mode: 0o640 });
  const saved = { CODEX_HOME: process.env.CODEX_HOME, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  process.env.CODEX_HOME = home;
  delete process.env.OPENAI_API_KEY;
  let spawned = false;
  try {
    assert.throws(
      () => runModel({ with: 'codex', timeout: 10 }, '', 'prompt', { outDir: root, variants: [] }, () => { spawned = true; }),
      /existing Codex login.*unusable.*private.*OPENAI_API_KEY/i,
    );
    assert.equal(spawned, false);
    if (process.getuid?.() !== 0) {
      fs.chmodSync(home, 0o000);
      assert.throws(() => stageCodexAuth(root, { CODEX_HOME: home }), /EACCES/);
    }
  } finally {
    fs.chmodSync(home, 0o700);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
