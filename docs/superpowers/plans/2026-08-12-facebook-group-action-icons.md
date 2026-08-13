# Facebook Group Action Icons Implementation Plan

> **For agentic workers:** Execute this single task inline; do not create or modify unit-test files.

**Goal:** Replace the Facebook group action icons with the supplied 14px SVG styling while preserving existing button behavior and accessibility.

**Architecture:** Update the shared SVG icon components used by the group action buttons. Use `currentColor` for stroke color so existing CSS states, including danger and loading states, continue to work.

**Tech Stack:** React, TypeScript, inline SVG, pnpm typecheck.

## Global Constraints

- Use pnpm only.
- Never create or modify `*.spec.ts` / `*.test.ts` files.
- Never run build, lint, or dev-server commands.
- Run `pnpm typecheck` and inspect the relevant hot-reload log after the change.

---

### Task 1: Update shared action icons

**Files:**
- Modify: `apps/extension/src/components/svg/side-panel-icons.tsx`
- Verify: `apps/extension/src/app/side-panel.tsx` continues using `RefreshIcon`, `EditIcon`, and `TrashIcon` without logic changes.

- [ ] Replace the shared refresh, edit, and trash SVG paths with the supplied 14px viewBox geometry, using `currentColor` instead of a hardcoded stroke color.
- [ ] Preserve existing `className`, `aria-hidden`, button labels, disabled states, and click handlers.
- [ ] Run `pnpm typecheck`.
- [ ] Inspect `apps/frontend/dev.log` if present and the extension runtime log available in the workspace for reload errors.
- [ ] Run a lightweight API request and browser smoke check against the already-running app as required by the repository instructions.
