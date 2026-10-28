// Classify measured page facts. The judge reapplies this policy to saved captures.

const CONTROL_ROLES = /\[(checkbox|radio|switch)\]$/;

export function classifyFacts(raw = {}) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const rawHard = Array.isArray(safe.hard) ? safe.hard : [];
  const rawSoft = Array.isArray(safe.soft) ? safe.soft : [];
  const hard = [];
  const soft = [];
  for (const h of rawHard) {
    if (!h || typeof h !== 'object') continue;
    if (h.kind === 'clipped-text' || h.kind === 'text-overflows-viewport') {
      if (/sr-only|visually-hidden/.test(h.detail) || (h.box && (h.box.w <= 1 || h.box.h <= 1))) continue; // screen-reader-only text is clipped on purpose
      hard.push(h); continue;
    }
    if (h.kind === 'tiny-tap-target') {
      // Small targets need review, while overflow and clipped text fail the capture.
      const ex = Array.isArray(h.examples) ? h.examples : [];
      const controls = ex.filter((e) => CONTROL_ROLES.test(e.sel));
      const others = ex.filter((e) => !CONTROL_ROLES.test(e.sel));
      if (controls.length) soft.push({ kind: 'small-form-control', detail: `${controls.length} checkbox/radio/switch under 24px (shadcn default 16px; the label must carry the hit area)`, examples: controls });
      const total = (h.count ?? ex.length) - controls.length;
      if (total > 0) soft.push({ ...h, detail: `${total} interactive element(s) under 24px high (Vercel: >= 24px, 44px on mobile; enlarge the hit area with padding or min-h-6)`, examples: others });
      continue;
    }
    hard.push(h);
  }
  return { hard, soft: [...soft, ...rawSoft] };
}

export function applyPolicy(facts = {}) {
  const safe = facts && typeof facts === 'object' ? facts : {};
  const rawHard = Array.isArray(safe.rawHard) ? safe.rawHard : Array.isArray(safe.hard) ? safe.hard : [];
  const rawSoft = Array.isArray(safe.rawSoft) ? safe.rawSoft : Array.isArray(safe.soft) ? safe.soft : [];
  const { hard, soft } = classifyFacts({ hard: rawHard, soft: rawSoft });
  return { ...safe, rawHard, rawSoft, hard, soft };
}
