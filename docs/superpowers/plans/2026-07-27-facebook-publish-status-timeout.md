# Facebook Publish Status And Timeout Implementation Plan

**Goal:** Simplify Facebook publish progress UI to three customer-facing statuses, hide inter-group delay details, reduce the delay to 10–20 seconds, and fail an individual group after 90 seconds without stopping the remaining groups.

**Architecture:** Keep the existing technical progress states and API contracts for orchestration compatibility. Add a per-target execution deadline in the extension orchestrator, map technical states to the three requested labels in both UIs, and render the result panel only after a publish run has started.

**Tech Stack:** TypeScript, React, Vite extension side panel, NestJS-compatible API payloads, Chrome extension automation.

## Global Constraints

- Do not change Facebook auth, group discovery, AI group filtering, image upload, multi-extension management, or non-Facebook channels unless required by the publish contract.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Do not run application builds, lint, or Git commands.
- Run `pnpm typecheck`, inspect runtime logs, and run API/frontend smoke checks after code changes.
- Do not open a new Chrome window; direct browser testing may use only the existing Chrome window or a tab inside it.

## Tasks

### Task 1: Update Facebook orchestration timing

**Files:**
- Modify: `apps/extension/src/facebook-publish-orchestrator.ts`

- Keep delay execution internal but use the plan delay range supplied by the publish plan, with the plan source updated to 10,000–20,000 ms.
- Keep emitting technical `DELAYING` progress if existing consumers require it, but do not include a customer-visible countdown in either UI.
- Add a per-target 90,000 ms deadline around the complete target publish/report cycle.
- On timeout, clean up target automation resources, create one `FAILED` result with a stable `FB_TARGET_TIMEOUT` marker, report it once, and continue the outer target loop.
- Prevent late completion from a timed-out target from mutating the active target or adding a duplicate result.

### Task 2: Align extension status rendering and visibility

**Files:**
- Modify: `apps/extension/src/side-panel.tsx`
- Modify: `apps/extension/src/types.ts` only if the timeout contract requires a type addition.
- Modify: `apps/extension/src/facebook-publish-store.ts` only if payload validation requires the same addition.

- Render the Facebook result panel only when a publish run has a progress object or is actively starting.
- Remove the visible delay paragraph and countdown.
- Map `POSTING`, `REPORTING`, `DELAYING`, `PENDING`, login/checking states to `Đang đăng` while a run is active.
- Map `SUCCESS` to `Đã đăng` and `FAILED`, timeout, and skipped/unpublished targets to `Đăng lỗi`.
- Keep the result panel after completion for review and reset it only when a new run starts.
- Map the Facebook channel header to `Đang đăng` while active, `Đã đăng` when all targets succeed, and `Đăng lỗi` when the completed run contains any failure.

### Task 3: Align localhost frontend rendering

**Files:**
- Modify: `apps/frontend/src/components/recruitment/FacebookPublishResultsPanel.tsx`
- Modify: `apps/frontend/src/lib/recruitment-api.ts` only if the timeout payload needs a type addition.
- Modify: `apps/frontend/src/lib/facebook-extension-bridge.ts` only if progress validation needs the same addition.

- Apply exactly the same three-label mapping and channel-header rules as the extension.
- Remove the visible inter-group delay paragraph.
- Preserve the existing expand/collapse control and scrollable group list.
- Do not display a result card when no Facebook publish progress exists.

### Task 4: Verify without browser-side destructive actions

- Run `pnpm typecheck`.
- Inspect `apps/backend/dev.log` and `apps/frontend/dev.log` for reload errors.
- Smoke test `http://localhost:3002/api/docs` and `http://localhost:4000/recruitment/job-postings`.
- If a manual browser check is needed, use only the already-open Chrome window and do not submit an unrelated Facebook post.
- Verify no waiting/countdown text appears, the result panel is hidden before start, timeout produces `Đăng lỗi`, and later groups continue.
