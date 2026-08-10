# Reliability High Issues Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate all 9 currently open High-severity Reliability issues in `auto-cv-processing` and leave SonarQube issue transitions untouched until the user's single final scan.

**Architecture:** Keep the existing behavior of deterministic signatures and hash-based idempotency keys while making ordering explicit with `String.localeCompare` and replacing implementation-defined bitwise truncation with a shared, explicit 32-bit hash calculation. Backend and extension changes remain local to the existing utilities; no new runtime dependency is required.

**Tech Stack:** NestJS/TypeScript backend, Chrome extension TypeScript, Node/Web APIs, SonarQube Community Build.

## Global Constraints

- Use `pnpm` only; do not use npm or yarn.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Do not run application builds, linting, or launch/restart the already-running applications.
- Run the relevant package typecheck after each code batch and inspect the runtime logs.
- Run read-only API/browser smoke checks after implementation; do not create test records in the active database.
- Do not use Git commands.
- Do not change any SonarQube issue status; only the user's later scanner run may update issue state.

---

## Baseline and issue inventory

Read from the controlled Chrome SonarQube issue page on 2026-08-10 with filters `Reliability`, `High`, and `Open/Confirmed`: 9 issues, 1h 15min estimated effort.

| # | Sonar issue ID | Rule/message | File and line | Tracking status |
|---:|---|---|---|---|
| 1 | `ebf07124-fbb3-4b23-b6bf-cbad2a37b7ad` | Provide a compare function that depends on `String.localeCompare`, to reliably sort elements alphabetically. | `apps/backend/src/cv-parsing/cv-parsing.service.ts:642` | Code fixed - awaiting Sonar scan |
| 2 | `f2bfa1ee-4d06-4b60-a520-33d097d97fb3` | Provide a compare function that depends on `String.localeCompare`, to reliably sort elements alphabetically. | `apps/backend/src/extension-integration/utils/stable-json.util.ts:64` | Code fixed - awaiting Sonar scan |
| 3 | `e7f35e10-a44c-4381-9399-ed0f84f38227` | Provide a compare function that depends on `String.localeCompare`, to reliably sort elements alphabetically. | `apps/extension/src/background.ts:1151` | Code fixed - awaiting Sonar scan |
| 4 | `d54a201c-f2f0-4a65-95ba-79d36e5286e8` | Provide a compare function to avoid sorting elements alphabetically. | `apps/extension/src/background.ts:1165` | Code fixed - awaiting Sonar scan |
| 5 | `d4d31309-ee88-49d7-adb7-356d00532fb1` | Provide a compare function that depends on `String.localeCompare`, to reliably sort elements alphabetically. | `apps/extension/src/background.ts:1166` | Code fixed - awaiting Sonar scan |
| 6 | `d1c69fd6-9ceb-4da6-b8cf-5ee75afe3178` | Use `Math.trunc` instead of `| 0`. | `apps/extension/src/background.ts:1189` | Code fixed - awaiting Sonar scan |
| 7 | `61995f0f-8829-4914-8425-e03d971e7ef4` | Provide a compare function that depends on `String.localeCompare`, to reliably sort elements alphabetically. | `apps/extension/src/background.ts:1303` | Code fixed - awaiting Sonar scan |
| 8 | `4f6ed281-3a6f-4a18-bdb3-a44a25669e2a` | Use `Math.trunc` instead of `| 0`. | `apps/extension/src/facebook-publish-orchestrator.ts:6605` | Code fixed - awaiting Sonar scan |
| 9 | `2558395e-c251-4344-8eb6-95275e8424bb` | Use `Math.trunc` instead of `| 0`. | `apps/extension/src/side-panel.tsx:9216` | Code fixed - awaiting Sonar scan |

---

## File map

- `apps/backend/src/cv-parsing/cv-parsing.service.ts` — sorts extracted field names before reporting them.
- `apps/backend/src/extension-integration/utils/stable-json.util.ts` — recursively serializes object keys in stable order.
- `apps/extension/src/background.ts` — builds deterministic auto-sync signatures and contains the background hash helper.
- `apps/extension/src/facebook-publish-orchestrator.ts` — builds diagnostic identifiers with a local hash helper.
- `apps/extension/src/side-panel.tsx` — builds Facebook plan identifiers with a local hash helper.
- `apps/extension/src/hash-text.ts` — new shared extension hash helper with explicit 32-bit arithmetic.

## Implementation tasks

### Task 1: Make backend alphabetical ordering explicit

**Issues covered:** #1 and #2.

**Files:**

- Modify: `apps/backend/src/cv-parsing/cv-parsing.service.ts:639-643`
- Modify: `apps/backend/src/extension-integration/utils/stable-json.util.ts:62-70`

**Implementation:** Replace both parameterless sorts with explicit `localeCompare` comparators. The resulting order remains alphabetical, and stable JSON continues to use the same key ordering for equivalent inputs.

```ts
.sort((left, right) => left.localeCompare(right))
```

**Verification steps:**

- [ ] Apply only the two comparator changes.
- [ ] Run `pnpm --filter @interview-assistant/backend typecheck`.
- [ ] Inspect `apps/backend/dev.log -Tail 20` and confirm the Nest application is still running without a new error.
- [ ] Call `http://localhost:3002/api/docs` and record HTTP 200.
- [ ] Mark rows #1-#2 in this plan `Code fixed - awaiting Sonar scan`; do not modify SonarQube.

**Local verification result (2026-08-10):** Backend typecheck passed. Both flagged parameterless sorts now use `left.localeCompare(right)`. The backend recovered and returned HTTP 200 from `/api/docs`; the Nest runtime log still shows successful startup. No SonarQube status was changed.

### Task 2: Make extension ordering and hash arithmetic explicit

**Issues covered:** #3 through #9.

**Files:**

- Create: `apps/extension/src/hash-text.ts`
- Modify: `apps/extension/src/background.ts:1-20,1142-1168,1288-1305`
- Modify: `apps/extension/src/facebook-publish-orchestrator.ts:1-20,6602-6609`
- Modify: `apps/extension/src/side-panel.tsx:1-25,9213-9219`

**Implementation A — explicit ordering in `background.ts`:** Add one local comparator:

```ts
function compareText(left: string, right: string) {
  return left.localeCompare(right);
}
```

Use it for the four flagged parameterless sorts:

```ts
.sort(compareText)
```

This applies to the mapped career signature strings, `channels`, `facebookTargetIds`, and the mapped recruitment signature strings.

**Implementation B — shared hash helper:** Create `hash-text.ts` with this contract:

```ts
export function hashText(value: string): string
```

The implementation must preserve the current signed 32-bit `31 * hash + charCode` behavior without `| 0` or bitwise shifts:

```ts
const UINT32_MODULUS = 0x1_0000_0000;
const INT32_SIGN_BIT = 0x8000_0000;

export function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unsignedHash = Math.trunc(
      ((hash * 31 + value.charCodeAt(index)) % UINT32_MODULUS + UINT32_MODULUS)
      % UINT32_MODULUS,
    );
    hash = unsignedHash >= INT32_SIGN_BIT
      ? unsignedHash - UINT32_MODULUS
      : unsignedHash;
  }
  return Math.abs(hash).toString(36);
}
```

Import the helper into `background.ts`, `facebook-publish-orchestrator.ts`, and `side-panel.tsx`; remove each duplicate local `hashText` implementation. This keeps all three identifiers consistent while eliminating the three flagged `| 0` expressions.

**Verification steps:**

- [ ] Add `hash-text.ts`, then update the four background sorts and the three hash call sites.
- [ ] Run `pnpm --filter @interview-assistant/extension typecheck`.
- [ ] Run `pnpm --filter @interview-assistant/frontend typecheck` only if the shared extension file is imported by frontend code; otherwise the extension check is the required package check.
- [ ] Run `rg -n "\.sort\(\)|\| 0|hashText" apps/extension/src/background.ts apps/extension/src/facebook-publish-orchestrator.ts apps/extension/src/side-panel.tsx apps/extension/src/hash-text.ts` and confirm the flagged parameterless sorts and bitwise truncations are absent while imports/calls remain.
- [ ] Inspect `apps/frontend/dev.log -Tail 20` and `apps/backend/dev.log -Tail 20`; do not launch either app.
- [ ] Load `http://localhost:4000` in the controlled browser and confirm the authenticated page renders without a new console error.
- [ ] Mark rows #3-#9 in this plan `Code fixed - awaiting Sonar scan`; do not modify SonarQube.

**Local verification result (2026-08-10):** Extension typecheck reports only the pre-existing unused-symbol diagnostics in `side-panel.tsx` (`careerQuestionState`, `careerQuestionMessage`, and `syncPortalJobDescriptions`); no new type errors were introduced. Targeted static scan found no parameterless `.sort()` or `| 0` in the nine issue locations. The shared hash helper produced the same results as the previous algorithm for six fixed Unicode/long-string samples. Backend API and SonarQube system status returned HTTP 200. The controlled frontend reached the authenticated Dashboard; its two 401 `/api/auth/me` console entries are the existing auth bootstrap behavior, not errors from these changes.

### Task 3: Final verification before one SonarQube scan

**Files:**

- Read: all files modified in Tasks 1-2.
- Read: `apps/backend/dev.log` and `apps/frontend/dev.log`.

**Implementation:** No code change. Verify that all nine issue locations have explicit comparators or the shared hash helper, and that no SonarQube state mutation was performed.

**Verification steps:**

- [ ] Run `pnpm --filter @interview-assistant/backend typecheck`.
- [ ] Run `pnpm --filter @interview-assistant/extension typecheck`; record only the pre-existing `side-panel.tsx` unused-symbol diagnostics if they remain.
- [ ] Run `pnpm --filter @interview-assistant/frontend typecheck`.
- [ ] Run `pnpm typecheck`; report any known workspace-level diagnostics without changing unrelated code.
- [ ] Run `rg -n "\.sort\(\)|\| 0" apps/backend/src/cv-parsing/cv-parsing.service.ts apps/backend/src/extension-integration/utils/stable-json.util.ts apps/extension/src/background.ts apps/extension/src/facebook-publish-orchestrator.ts apps/extension/src/side-panel.tsx`; inspect only the targeted locations and confirm the nine patterns are remediated.
- [ ] Call `http://localhost:3002/api/docs`, `http://localhost:4000`, and `http://localhost:9002/api/system/status`; record HTTP 200 for each.
- [ ] Refresh the Reliability High issue list only after the user runs the scanner; do not click status controls or call issue-transition APIs.

**Final local verification result (2026-08-10):** All nine issue locations are remediated in source and all rows above are marked `Code fixed - awaiting Sonar scan`. No SonarQube issue status was changed. The final scanner has not been run yet.

## Tracking convention

`Code fixed - awaiting Sonar scan` is an internal plan label only. After all nine code changes and local checks pass, the user runs the scanner once. SonarQube may automatically resolve issues that no longer exist in the analysis; the assistant only reads and reports that result and never manually marks an issue Fixed, False Positive, or Won't Fix.
