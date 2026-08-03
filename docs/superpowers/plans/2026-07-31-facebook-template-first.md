# Facebook Template-First Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make deterministic Facebook template content the default, with explicit AI generation replacing it only when the user clicks “Sinh bài”.

**Architecture:** Backend preview generation accepts the requested mode and uses the deterministic content service for `TEMPLATE`, while `AI` calls Gemini and falls back to the template only on failure. The extension initializes/uses template content as the default and sends `AI` only from the explicit generate action.

**Tech Stack:** NestJS, TypeScript, Jest, React extension.

## Global Constraints

- Manual/custom Facebook content remains authoritative after the user edits or saves it.
- AI failure must not prevent publishing; template fallback remains available.
- Do not change unrelated Facebook publishing or image-upload behavior.

### Task 1: Backend mode routing

**Files:**
- Modify: `apps/backend/src/facebook-publishing/facebook-publishing.service.ts`
- Modify: `apps/backend/src/extension-integration/extension-facebook.controller.ts`
- Modify: `apps/backend/src/facebook-publishing/facebook-publishing.service.spec.ts`

- [ ] Add failing tests proving `TEMPLATE` skips AI and `AI` uses AI first.
- [ ] Pass `dto.mode` from controller into the service.
- [ ] Implement mode-aware preview generation with template default and AI fallback.
- [ ] Run the focused backend Jest tests.

### Task 2: Extension default and explicit AI action

**Files:**
- Modify: `apps/extension/src/side-panel.tsx`
- Modify: `apps/extension/src/api-client.ts`

- [ ] Make the normal/default content path request `TEMPLATE` or use the existing publish-plan template content.
- [ ] Keep the “Sinh bài” handler requesting `AI` explicitly and replacing the draft only after a successful response.
- [ ] Preserve custom draft state and source tracking.
- [ ] Run the extension typecheck/build.

### Task 3: Regression verification

- [ ] Run backend focused tests and the extension validation command.
- [ ] Inspect the diff to confirm only template-first content behavior changed.
