import fs from 'node:fs';
import path from 'node:path';

export function assertSafeOutputDir(dir) {
  if (!dir || typeof dir !== 'string') throw new Error('missing output directory');
  let st;
  try {
    st = fs.lstatSync(dir);
  } catch (e) {
    throw new Error(`invalid output directory ${dir}: ${e.message}`);
  }
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw new Error(`refusing symlink or non-directory output path: ${dir}`);
  }
  return fs.realpathSync(dir);
}

export function resolveSafeOutputFile(dir, fileName) {
  const realDir = assertSafeOutputDir(dir);
  if (typeof fileName !== 'string' || !fileName || path.basename(fileName) !== fileName || fileName === '.' || fileName === '..') {
    throw new Error(`invalid output file name: ${fileName}`);
  }
  const target = path.join(realDir, fileName);
  if (path.dirname(target) !== realDir || fs.realpathSync(path.dirname(target)) !== realDir) {
    throw new Error(`output path escapes directory: ${target}`);
  }
  try {
    const st = fs.lstatSync(target);
    if (st.isSymbolicLink() || !st.isFile()) {
      throw new Error(`refusing symlink or non-regular file: ${target}`);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return { realDir, target };
}

export function readSafeOutputFile(dir, fileName) {
  const { target } = resolveSafeOutputFile(dir, fileName);
  const st = fs.lstatSync(target);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new Error(`refusing symlink or non-regular file: ${target}`);
  }
  return fs.readFileSync(target, 'utf8');
}

function stageSafeOutputFile(dir, fileName, stageFn) {
  const { realDir, target } = resolveSafeOutputFile(dir, fileName);
  const tmpFile = path.join(realDir, `.tmp-${fileName}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    stageFn(tmpFile);
    resolveSafeOutputFile(realDir, fileName);
    fs.renameSync(tmpFile, target);
  } finally {
    try { fs.rmSync(tmpFile, { force: true }); } catch {}
  }
  return target;
}

export function writeSafeOutputFile(dir, fileName, content) {
  return stageSafeOutputFile(dir, fileName, (tmpFile) => {
    let fd = null;
    try {
      fd = fs.openSync(tmpFile, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
      fs.writeFileSync(fd, String(content), 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = null;
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch {}
      }
    }
  });
}

export function writeSafeReferenceFile(canonicalDir, filename, writeFn) {
  if (!/^[a-zA-Z0-9._-]+$/.test(String(filename || '')) || filename === '.' || filename === '..') {
    throw new Error(`invalid reference filename: ${filename}`);
  }
  stageSafeOutputFile(canonicalDir, filename, writeFn);
}
