# Extension Folder Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize the extension source tree into app, component, feature, integration, store, library, and type folders without changing behavior.

**Architecture:** Move by domain and update imports in place. Keep `components` purely presentational, place Freelancer/Internal shared logic under `features/referrals`, and retain Vite entrypoint semantics through updated input paths.

**Tech Stack:** TypeScript, React, Vite, Chrome Extension Manifest V3.

## Global Constraints

- Use pnpm only.
- Never create or modify `*.spec.ts` / `*.test.ts` files.
- Never run build, lint, or dev-server commands.
- Run `pnpm typecheck` after every migration batch.
- Never run git commands.

### Task 1: Create target folders and move app/infrastructure files

**Files:**
- Move entrypoints to `apps/extension/src/app/`.
- Move API/config helpers to `apps/extension/src/lib/`.
- Move shared types to `apps/extension/src/types/`.
- Move persistent stores to `apps/extension/src/stores/`.

- [ ] Create the target directories.
- [ ] Move `side-panel.tsx`, `popup.tsx`, `background.ts`, and `styles.css` into `app/`.
- [ ] Move `api-client.ts`, `config.ts`, `mock-amis.ts`, and `chrome.d.ts` into `lib/`.
- [ ] Move `types.ts` into `types/`.
- [ ] Move the `*-store.ts`, preference, and relay persistence files into `stores/`.
- [ ] Update imports in moved files and Vite input paths.
- [ ] Run `pnpm typecheck`.

### Task 2: Move domain features

**Files:**
- Move referral files to `features/referrals/`.
- Move `freelancer-cv-panel.tsx` to `features/freelancer/`.
- Move Facebook files to `features/facebook/`.
- Move AI match preview files to `features/recruitment/`.

- [ ] Move `referral-management.tsx` and `referral-management-utils.ts` together.
- [ ] Move `freelancer-cv-panel.tsx` into the freelancer feature folder.
- [ ] Move Facebook orchestration, status, account, group, content, image, and post files together.
- [ ] Move AI match preview files together.
- [ ] Update all import paths, preserving the shared referral boundary between Freelancer and Internal.
- [ ] Run `pnpm typecheck`.

### Task 3: Move AMIS integration files and normalize imports

**Files:**
- Move AMIS bridge, extractor, hook, mapper, capture, and page files to `integrations/amis/`.
- Modify `apps/extension/vite.config.ts`.
- Modify `apps/extension/public/manifest.json` only if generated entrypoint paths require it.

- [ ] Move only AMIS integration modules; do not mix them with generic stores or feature UI.
- [ ] Update imports in background, content scripts, and feature modules.
- [ ] Update Vite rollup input paths for moved content scripts and bridge entries.
- [ ] Verify manifest script references still point to files emitted by the unchanged entry names.
- [ ] Run `pnpm typecheck`.

### Task 4: Final structural verification

- [ ] Run `pnpm typecheck` and require all packages to pass.
- [ ] Use `rg --files apps/extension/src` to confirm no duplicate old-path source files remain.
- [ ] Confirm no `*.spec.ts` or `*.test.ts` file was modified.
- [ ] Inspect runtime logs and report that browser UI verification is unavailable if the extension dev server is not running.
