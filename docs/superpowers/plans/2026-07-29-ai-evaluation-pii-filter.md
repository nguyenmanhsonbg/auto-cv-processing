# AI Evaluation PII Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prevent candidate personal/identity data from being sent to AI evaluation prompts while preserving professional matching signals.

**Architecture:** Add a focused allowlist sanitizer for parsed candidate profiles. Apply it before anomaly detection and before the recruitment screening/final recommendation payload is constructed. Keep personal data in the database and leave `formAnswers` filtering out of scope for this change.

**Tech Stack:** NestJS, TypeScript, Jest, shared candidate profile types.

## Global Constraints

- Do not modify stored candidate identity/contact data.
- Do not pass `name`, `email`, `phone`, `birthYear`, photo, gender, address, or other identity/protected fields to AI evaluation.
- Preserve professional fields needed for matching: education, experience, skills, projects, certifications, languages, level, and evaluation evidence.
- Do not filter `formAnswers` in this change.

---

### Task 1: Add the failing sanitizer contract test

**Files:**
- Create: `apps/backend/src/ai/ai-profile-sanitizer.spec.ts`
- Create: `apps/backend/src/ai/ai-profile-sanitizer.ts`

**Interfaces:**
- Produces `sanitizeProfileForAi(profile: Record<string, unknown>): Record<string, unknown>`.

- [ ] **Step 1: Write the failing test**

Assert that identity fields are removed while professional fields and nested evaluation evidence remain.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @interview-assistant/backend exec jest src/ai/ai-profile-sanitizer.spec.ts --runInBand`

Expected: FAIL because the sanitizer module/function is not implemented.

- [ ] **Step 3: Implement the minimal allowlist sanitizer**

Copy only approved professional profile keys; preserve `parsedProfile` and `evaluation` as professional analysis payloads, but remove identity keys from `parsedProfile` recursively at its known top level.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same Jest command and expect PASS.

### Task 2: Apply sanitization to all recruitment evaluation calls

**Files:**
- Modify: `apps/backend/src/applications/applications.service.ts`
- Modify: `apps/backend/src/ai/ai.service.ts`
- Test: `apps/backend/src/ai/ai.service.spec.ts`

**Interfaces:**
- `ApplicationsService.runAiScreening` passes the sanitized profile into anomaly detection and screening.
- `AiService.runFinalScreeningRecommendation` receives the sanitized profile from callers and applies a final defensive sanitization before serialization.

- [ ] **Step 1: Add failing assertions for AI prompt payloads**

Update the service test input with `name`, `email`, `phone`, and `birthYear`, then assert the serialized prompt does not contain those values while retaining a professional field such as `skills`.

- [ ] **Step 2: Run the focused tests and verify the new assertions fail**

Run: `pnpm --filter @interview-assistant/backend exec jest src/ai/ai.service.spec.ts --runInBand`

Expected: FAIL because the current implementation serializes the complete profile.

- [ ] **Step 3: Implement minimal integration**

Sanitize the profile before `detectProfileAnomalies`, pass the sanitized profile to `runRecruitmentPhase1AiScreening`, and defensively sanitize `enrichedProfile` inside both screening prompt builders. Keep `formAnswers` unchanged.

- [ ] **Step 4: Run focused tests and verify they pass**

Run the sanitizer and AI service tests together; expect PASS.

### Task 3: Run regression verification

- [ ] **Step 1: Run backend typecheck**

Run: `pnpm --filter @interview-assistant/backend typecheck`

- [ ] **Step 2: Run relevant application and AI tests**

Run: `pnpm --filter @interview-assistant/backend exec jest src/ai src/applications --runInBand`

- [ ] **Step 3: Inspect the diff**

Confirm only AI evaluation payload construction and its tests changed; no candidate identity fields are deleted from persistence.
