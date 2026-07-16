# Facebook Gemini Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate Facebook recruitment content through the existing Gemini-backed `AiService`, with the current deterministic template as a safe fallback.

**Architecture:** Add a focused public method to `AiService` that resolves the `vcs_facebook_recruitment_content_generator` prompt and calls the existing Gemini model rotation. Make `FacebookPublishingService` depend on `AiService`, try AI first for preview and publish-plan content, and return template content only when AI is unavailable or fails. Keep the API response mode truthful.

**Tech Stack:** NestJS, TypeScript, Jest, TypeORM-backed prompt cache, Gemini `generateContent` HTTP API.

## Global Constraints

- Never hardcode or commit the Gemini API key; use `apps/backend/.env` only.
- Preserve existing template generation as the fallback path.
- Do not change Facebook publishing/browser automation behavior.
- Add tests before production implementation and run the focused backend tests plus typecheck.

---

### Task 1: Define the AI content contract with failing tests

**Files:**
- Modify: `apps/backend/src/ai/ai.service.spec.ts`
- Modify: `apps/backend/src/facebook-publishing/facebook-publishing.service.spec.ts`

**Interfaces:**
- Add `AiService.generateFacebookRecruitmentContent(input: Record<string, unknown>): Promise<string>`.
- Make `FacebookPublishingService.generateExtensionPreviewContent(...)` return `{ content: string; mode: 'AI' | 'TEMPLATE' }`.

- [ ] **Step 1: Write tests**

Add a test that stubs the Gemini fallback and asserts the Facebook prompt key and JD payload are used. Add a publishing-service test asserting AI content is returned with mode `AI`, and a fallback test asserting template content is returned with mode `TEMPLATE` when AI rejects.

- [ ] **Step 2: Run focused tests and verify RED**

Run `pnpm --filter @interview-assistant/backend test -- --runInBand src/ai/ai.service.spec.ts src/facebook-publishing/facebook-publishing.service.spec.ts` and confirm the new expectations fail because the method and mode contract do not exist.

### Task 2: Implement Gemini-backed Facebook generation

**Files:**
- Modify: `apps/backend/src/ai/ai.service.ts`
- Modify: `apps/backend/src/facebook-publishing/facebook-publishing.service.ts`
- Modify: `apps/backend/src/facebook-publishing/content/facebook-post-content.service.ts`
- Modify: `apps/backend/src/facebook-publishing/facebook-publishing.module.ts`

**Interfaces:**
- `AiService.generateFacebookRecruitmentContent(input)` serializes the supplied snapshot into `JD_INPUT`, resolves the named prompt, and calls `callGeminiWithFallback`.
- `FacebookPublishingService.generateExtensionPreviewContent(input)` returns AI content with template fallback.
- `prepareExtensionPublishPlan(...)` keeps its existing string return shape and uses AI content before the template.

- [ ] **Step 1: Implement the minimal AI method**

Use the existing prompt cache and Gemini rotation. Reject empty Gemini output so the caller can use the template fallback.

- [ ] **Step 2: Inject `AiService` into Facebook publishing**

Add the dependency through the existing global `AiModule` export and use it only for Facebook content generation.

- [ ] **Step 3: Add AI-first fallback behavior**

For both preview and publish-plan generation, call the AI method first. Catch generation failures, log a warning, and use the current `FacebookPostContentService` output.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the focused backend tests again and confirm all pass.

### Task 3: Wire API response mode and environment configuration

**Files:**
- Modify: `apps/backend/src/extension-integration/extension-facebook.controller.ts`
- Modify: `apps/backend/src/extension-integration/dto/generate-facebook-preview-content.dto.ts`
- Modify: `apps/extension/src/api-client.ts`
- Modify: `apps/extension/src/side-panel.tsx`
- Modify: `apps/backend/.env.example`
- Modify: `apps/backend/.env` (local secret, never commit)

- [ ] **Step 1: Return the actual mode**

Pass the requested snapshot to the service and return the service's `{ content, mode }` result instead of echoing the request mode.

- [ ] **Step 2: Update extension state**

Set the draft source from the backend mode rather than always labeling generated template content as `AI`.

- [ ] **Step 3: Add `GEMINI_API_KEY` to environment configuration**

Add the variable to `.env.example`; place the user-provided key only in the local backend `.env` without printing it or including it in any patch.

- [ ] **Step 4: Verify build and type safety**

Run `pnpm --filter @interview-assistant/backend typecheck`, `pnpm --filter @interview-assistant/extension typecheck`, and the backend tests.

### Task 4: Review the diff and secret handling

**Files:**
- Inspect: `apps/backend/.env`, `git diff`, `git status`

- [ ] **Step 1: Confirm no secret is tracked**

Verify `.env` remains ignored and the API key is absent from `git diff` and source files.

- [ ] **Step 2: Confirm the final flow**

Verify the code path is extension → preview/publish endpoint → FacebookPublishingService → AiService → Gemini, with template fallback.
