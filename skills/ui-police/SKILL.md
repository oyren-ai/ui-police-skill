---
name: ui-police
description: Check UI code and page captures before a web UI change is marked ready.
---

# UI police

Use this skill when building a web screen or reviewing a UI change. It checks code for common visual drift, then captures the page for visual review.

## Before building

Use the app's existing components and tokens. For common needs, start with these shadcn/ui components:

| Need | Start with |
| --- | --- |
| Dialog or confirmation | Dialog, AlertDialog |
| Menu or action list | DropdownMenu, ContextMenu |
| Tooltip or help | Tooltip, HoverCard |
| Form field | Input, Textarea, Select, Checkbox, Switch |
| Navigation tree | Sidebar, Collapsible |
| Data list | Table, Tabs |
| Loading or empty state | Skeleton, Spinner, EmptyState |
| Status | Badge, Alert, sonner toast |

Check the target repo's `ui-police.config.json` for allowed origins, exemptions and reference names. Keep authenticated browser state in a private file outside the repo. Pass it with `--storage-state`.

## Before review

1. Run `npx ui-police lint --git <base>` or `npx ui-police lint --diff <file>` and fix relevant findings.
2. Capture a known good page with `npx ui-police refs <name> <url>` when a reference helps. Review the captured images and keep the reference name in the project config.
3. Run `npx ui-police look <url> --ref <name> --out <dir>`, then `npx ui-police judge <dir> --with self` (or `claude`, `codex`, `agy`). Check the report at 390 and 1440 px in light and dark. Fix concrete issues and capture again.

`--with agy` gives Antigravity a manual verdict handoff. The CLI does not run Antigravity on untrusted page text because that CLI lacks a tool-free image mode. Read `prompt.md`, view the images, write `verdict.json`, then rerun the judge command.

See `npx ui-police rules` for stable rule IDs and the repository README for setup.
