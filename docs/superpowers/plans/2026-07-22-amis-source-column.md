# AMIS Extension Source Column Implementation Plan

**Goal:** Always show an Extension-owned `Nguồn` column on AMIS recruitment detail pages, independently of AMIS's native `Nguồn ứng viên` column setting.

**Architecture:** The AMIS content bridge detects `/recruit/job/detail/<id>` routes, observes the DevExtreme candidate grid, and reconciles an idempotent custom header/cell layer. The background service worker loads the existing VCS application records for the AMIS recruitment and replies with source values; the backend contract and existing CV sync flows remain unchanged.

**Tech Stack:** TypeScript, Chrome MV3 content scripts/runtime messaging, AMIS DevExtreme DOM, existing NestJS API client.

## Global Constraints

- Use `pnpm` only.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Do not run app builds; use `pnpm typecheck`.
- Do not launch frontend/backend servers; verify existing runtime logs.
- Do not modify AMIS internal framework state or native column settings.
- The custom column must show `--` when no source record matches; never default an unknown candidate to `VCS Portal`.

## Files

- Create: `apps/extension/src/amis-source-column.ts` for route detection, source-map types, grid discovery, and DOM reconciliation.
- Modify: `apps/extension/src/amis-bridge.ts` to install the renderer and expose runtime messages for source-map updates/requests.
- Modify: `apps/extension/src/background.ts` to load the existing AMIS application source records and respond to the bridge without changing persistence.
- Modify: `apps/extension/src/side-panel.tsx` only if an existing application refresh needs to notify the active AMIS tab; prefer bridge/background request flow to avoid unrelated UI changes.

## Implementation Steps

### Task 1: Add the isolated source-column renderer

- Match only AMIS recruitment detail routes and derive the numeric recruitment ID from `/recruit/job/detail/<id>`.
- Find `.candidate-grid dx-data-grid.candidate-datagrid` and its DevExtreme header/data tables.
- Render a `Nguồn` header and cell marked with `data-vcs-source-column="true"` in both scrollable and fixed grid fragments when present.
- Match rows by normalized email, normalized phone, then normalized candidate name; use `aria-rowindex` only for DOM pairing, never as the data identity.
- Reconcile on initial render, `MutationObserver`, route changes, and a debounced refresh; remove only Extension-owned nodes when leaving the route.
- Keep AMIS's native source column untouched.

### Task 2: Connect the renderer to source data

- Add runtime message contracts for a bridge request containing the current AMIS recruitment ID and a response containing source assignments.
- Reuse `getAmisApplicationsForRecruitment()` and the existing authenticated extension instance; map each application to display source and matching identity fields.
- Send the response to the requesting tab only, so multiple AMIS tabs do not receive another recruitment's data.
- Refresh the source map when the AMIS recruitment route changes and when the grid is first discovered.

### Task 3: Verify and harden

- Run `pnpm typecheck` and inspect `apps/backend/dev.log` plus `apps/frontend/dev.log` as required.
- Run a backend API smoke request against `http://127.0.0.1:3002/api/docs-json`.
- Use the current Chrome tab only after the user reloads the newly built extension: verify REACTJS and Tester Onsite, native source column hidden, source column visible, sorting/filtering/route navigation, and unmatched rows showing `--`.
- Do not click AMIS save or change candidate data during the UI check.
