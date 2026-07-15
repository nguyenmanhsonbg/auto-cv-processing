# VCS Signal Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize AI profile output into the shared `VcsSignals` shape so the candidate and recruitment UIs can render VCS-specific screening signals.

**Architecture:** Add a focused pure mapper in the AI module. It prefers explicit `vcsSignals` returned by the prompt and falls back to the existing `evaluation.generalCriteria` and `evaluation.roleSpecificCriteria` fields. `AiService.enrichParsedProfile()` attaches the normalized object to the returned profile without changing the Gemini request flow.

**Tech Stack:** NestJS, TypeScript, Jest, YAML prompt seed, `@interview-assistant/shared` types.

## Global Constraints

- Do not infer protected attributes or invent candidate evidence.
- Preserve existing profile fields and existing prompt response compatibility.
- Return empty, evidence-bearing signal sections rather than throwing when optional AI fields are absent.
- Production code must be introduced only after a failing test demonstrates the required behavior.

---

### Task 1: Add the pure VCS signal mapper

**Files:**
- Create: `apps/backend/src/ai/vcs-signals.mapper.ts`
- Test: `apps/backend/src/ai/vcs-signals.mapper.spec.ts`

**Interfaces:**
- Consumes: `unknown` AI response containing optional `vcsSignals`, `evaluation`, and profile fields.
- Produces: `normalizeVcsSignals(input: unknown): VcsSignals`.

- [ ] **Step 1: Write the failing tests**

Cover explicit `vcsSignals`, legacy evaluation fallback, and absent optional data. Assert the exact `VcsSignals` sections and that no exception is thrown for malformed optional input.

- [ ] **Step 2: Run the mapper test and verify it fails**

Run: `pnpm --filter @interview-assistant/backend exec jest src/ai/vcs-signals.mapper.spec.ts --runInBand`

Expected: FAIL because `vcs-signals.mapper.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal mapper**

Use small helpers for records, strings, arrays, scores, evidence, and item lists. Map:

```ts
evaluation.generalCriteria.education -> university
evaluation.generalCriteria.workHistory -> companyType
evaluation.roleSpecificCriteria.advancedSkills -> advancedSkills
evaluation.roleSpecificCriteria.technicalChallenges -> technicalChallenges
evaluation.generalCriteria.seniority -> seniorRoles
```

Prefer `input.vcsSignals` section-by-section when present. Only copy evidence supplied by the AI; use an empty evidence string and empty items for missing sections.

- [ ] **Step 4: Run the mapper test and verify it passes**

Run: `pnpm --filter @interview-assistant/backend exec jest src/ai/vcs-signals.mapper.spec.ts --runInBand`

Expected: PASS.

### Task 2: Attach normalized signals in `AiService`

**Files:**
- Modify: `apps/backend/src/ai/ai.service.ts:1,293-315`
- Test: `apps/backend/src/ai/ai.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeVcsSignals()` from Task 1.
- Produces: `enrichParsedProfile()` results with `vcsSignals` attached.

- [ ] **Step 1: Add a failing service test**

Mock the AI response with legacy `evaluation` fields, call `enrichParsedProfile()`, and assert `result.vcsSignals` contains the five UI sections.

- [ ] **Step 2: Run the focused service test and verify it fails**

Run: `pnpm --filter @interview-assistant/backend exec jest src/ai/ai.service.spec.ts --runInBand`

Expected: FAIL because `enrichParsedProfile()` currently returns the raw extracted JSON without `vcsSignals`.

- [ ] **Step 3: Add the mapper call**

Import `normalizeVcsSignals`, parse the AI response once, then return the parsed profile with `vcsSignals: normalizeVcsSignals(parsed)`. Keep all existing response properties intact.

- [ ] **Step 4: Run the focused service test and verify it passes**

Run: `pnpm --filter @interview-assistant/backend exec jest src/ai/ai.service.spec.ts --runInBand`

Expected: PASS.

### Task 3: Update the prompt contract

**Files:**
- Modify: `apps/backend/src/assets/seed/ai-prompts.yaml:28-59`

- [ ] **Step 1: Extend the `enrich_profile` JSON schema**

Add a top-level `vcsSignals` object matching the shared shape, including evidence strings and item arrays for advanced skills, technical challenges, and senior roles.

- [ ] **Step 2: Add evidence rules**

Require the model to use only CV/JD evidence, leave `ok` false when evidence is missing, keep academic projects separate from professional experience, and never infer protected attributes.

- [ ] **Step 3: Verify YAML parses**

Run the backend test/typecheck commands from Task 4; prompt loading must not throw.

### Task 4: Regression verification

**Files:**
- No additional files.

- [ ] **Step 1: Run all backend tests**

Run: `pnpm --filter @interview-assistant/backend test -- --runInBand`

Expected: PASS.

- [ ] **Step 2: Run backend typecheck**

Run: `pnpm --filter @interview-assistant/backend typecheck`

Expected: PASS.

- [ ] **Step 3: Review the final diff**

Confirm the only behavior change is VCS signal normalization and prompt output support; do not commit unrelated generated or temporary files.
