# Extension Question Editor Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline question-set editing in the extension with a redirect to the frontend `/questions` page.

**Architecture:** Add a build-time frontend base URL beside the existing backend API configuration. The extension question panel keeps the read/select flow but opens the frontend route in a new active tab; all inline editor state, JSX, CSS, and PATCH client code are removed.

**Tech Stack:** React, TypeScript, Chrome Tabs API, Vite environment configuration.

## Global Constraints

- Frontend redirect route is `/questions`.
- Local default frontend base URL is `http://localhost:4000`.
- Use `chrome.tabs.create` with `active: true`.
- Do not change backend APIs or question-set persistence.
- Do not create or modify `*.spec.ts` / `*.test.ts` files.
- Use `pnpm typecheck`; do not build or lint.

---

### Task 1: Remove inline editor and open the frontend route

**Files:**
- Modify: `apps/extension/src/config.ts` to add `FRONTEND_BASE_URL`.
- Modify: `apps/extension/src/side-panel.tsx` to replace the inline editor action with a tab redirect and remove direct-edit state/handlers/rendering.
- Modify: `apps/extension/src/api-client.ts` to remove the unused question-set PATCH helper.
- Modify: `apps/extension/src/types.ts` to remove the unused PATCH request type.
- Modify: `apps/extension/src/styles.css` to remove inline editor-only styles and update the action copy if needed.

**Interfaces:**
- Consumes: `selectedJobDescription`, `jobDescriptionQuestionContext`, `FRONTEND_BASE_URL`, and the existing Chrome Tabs API declaration.
- Produces: A question panel action that opens `${FRONTEND_BASE_URL}/questions` in an active tab without editing or PATCHing from the extension.

- [ ] **Step 1: Add the configurable frontend URL.**

  Add this beside `BE_API_BASE_URL` in `apps/extension/src/config.ts`:

  ```ts
  export const FRONTEND_BASE_URL =
    (import.meta.env.VITE_FE_BASE_URL as string | undefined)?.replace(/\/+$/, '')
    ?? 'http://localhost:4000';
  ```

- [ ] **Step 2: Replace the editor handler with a tab-opening handler.**

  Import `FRONTEND_BASE_URL`, then implement:

  ```ts
  function openFrontendQuestionEditor() {
    if (!jobDescriptionQuestionContext?.questions.length) return;
    if (!chrome.tabs?.create) {
      setCareerQuestionState('ERROR');
      setCareerQuestionMessage('Không thể mở trang FE chỉnh sửa bộ câu hỏi.');
      return;
    }

    void chrome.tabs.create({
      url: `${FRONTEND_BASE_URL}/questions`,
      active: true,
    }).then(() => {
      setCareerQuestionState('READY');
      setCareerQuestionMessage('Đã mở trang FE để chỉnh sửa bộ câu hỏi.');
    }).catch(() => {
      setCareerQuestionState('ERROR');
      setCareerQuestionMessage('Không thể mở trang FE chỉnh sửa bộ câu hỏi.');
    });
  }
  ```

- [ ] **Step 3: Remove direct-edit behavior.**

  Remove `CareerQuestionEditState`, the four inline editor state variables, `openCareerQuestionEditor`, `closeCareerQuestionEditor`, `saveCareerQuestionEdits`, and their reset calls. Change the panel button to call `openFrontendQuestionEditor`, remain disabled only when no question set exists, and label it `Chỉnh sửa trên FE`.

- [ ] **Step 4: Remove the inline editor branch and unused PATCH code.**

  Keep the read-only question list branch in `renderCareerQuestionPanel`, remove the textarea form branch, remove the `updateJobDescriptionQuestionSetItem` import/function, and remove `UpdateJobDescriptionQuestionSetItemRequest` from `apps/extension/src/types.ts`.

- [ ] **Step 5: Remove obsolete inline editor CSS.**

  Delete the `.career-question-editor`, `.career-question-editor-field`, `.career-question-editor-label`, `.career-question-editor-input`, `.career-question-editor-input:focus`, and `.career-question-editor-actions` rules. Keep the shared `.question-edit-button` style for the redirect action.

- [ ] **Step 6: Verify the change.**

  Run `pnpm typecheck`, inspect `apps/backend/dev.log` and `apps/frontend/dev.log`, run a backend API smoke request, and open `http://localhost:4000/questions` in the browser. Confirm the source contains no direct question-set PATCH call and the redirect target is exactly `/questions`.
