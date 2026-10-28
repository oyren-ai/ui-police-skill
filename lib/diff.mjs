// Unified-diff parser for `ui-police lint --diff`. Zero dependencies.
// Returns one entry per changed file: { path, isNew, isDeleted, added: Map<newLineNo, text>, context: Map<newLineNo, text> }.
// Only the new-file side is tracked; removed lines are ignored because the linter judges what the PR ships.

export function parseUnifiedDiff(text) {
  const files = [];
  let cur = null;
  let newLine = 0;
  let inHunk = false;
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    if (raw.startsWith('diff --git ')) {
      cur = { path: null, isNew: false, isDeleted: false, added: new Map(), context: new Map() };
      files.push(cur);
      inHunk = false;
      const m = raw.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (m) cur.path = m[2];
      continue;
    }
    if (!cur) continue;
    if (!inHunk) {
      if (raw.startsWith('new file mode')) cur.isNew = true;
      else if (raw.startsWith('deleted file mode')) cur.isDeleted = true;
      else if (raw.startsWith('+++ ')) {
        const p = raw.slice(4).trim();
        if (p !== '/dev/null') cur.path = p.replace(/^b\//, '');
      } else if (raw.startsWith('rename to ')) cur.path = raw.slice('rename to '.length).trim();
    }
    if (raw.startsWith('@@')) {
      const m = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (!m) continue;
      newLine = Number(m[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (raw.startsWith('+')) {
      cur.added.set(newLine, raw.slice(1));
      newLine += 1;
    } else if (raw.startsWith('-')) {
      // removed line: new-file numbering does not advance
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file"
    } else if (raw.startsWith(' ') || raw === '') {
      cur.context.set(newLine, raw.slice(1));
      newLine += 1;
    } else {
      // Anything else ends the hunk (e.g. a new "diff --git" is handled above).
      inHunk = false;
    }
  }
  return files.filter((f) => f.path && !f.isDeleted);
}
