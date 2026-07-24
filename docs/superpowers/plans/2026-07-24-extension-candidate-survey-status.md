# Extension Candidate Survey Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show whether each extension candidate has submitted the survey on the candidate card using the requested Vietnamese labels and colors.

**Architecture:** Reuse the existing `getApplicationQuestionStatus` helper and `latestForm.status` data already returned by the application API. Update the card layout so the source/date metadata remains above a two-cell status row containing survey status and AMIS sync status.

**Tech Stack:** React, TypeScript, extension CSS, Vite hot reload.

## Global Constraints

- Count a survey as answered only when `latestForm.status` is `SUBMITTED`.
- Render answered survey status with `#15803D`.
- Render unanswered survey status with `#EAB308`.
- Do not change backend APIs or survey persistence.
- Do not create or modify `*.spec.ts` / `*.test.ts` files.
- Use `pnpm typecheck`; do not build or lint.

---

### Task 1: Update the extension candidate card

**Files:**
- Modify: `apps/extension/src/side-panel.tsx` in the candidate card renderer around the `pageApplications.map` block.
- Modify: `apps/extension/src/styles.css` in the extension CV card styles.

**Interfaces:**
- Consumes: `ExtensionApplication.latestForm.status` through the existing `getApplicationQuestionStatus(application)` helper.
- Produces: A card with `Nguồn` and `Ngày ứng tuyển` metadata, plus `CÂU HỎI` and `ĐỒNG BỘ AMIS` status cells.

- [ ] **Step 1: Add the survey status to the card render data.**

  Inside the `pageApplications.map` callback, derive `const questionStatus = getApplicationQuestionStatus(application)` beside `syncStatus`.

- [ ] **Step 2: Match the requested card structure.**

  Keep the source and application date in the metadata area. Replace the source tile in `.cv-candidate-details` with a survey status tile:

  ```tsx
  <div className={`cv-candidate-detail cv-candidate-detail-status ${questionStatus.tone}`}>
    <small>CÂU HỎI</small>
    <strong>{questionStatus.label}</strong>
  </div>
  <div className={`cv-candidate-detail cv-candidate-detail-status ${syncStatus.tone}`}>
    <small>ĐỒNG BỘ AMIS</small>
    <strong>{getCvCardSyncLabel(syncStatus)}</strong>
  </div>
  ```

- [ ] **Step 3: Add source metadata beside the application date.**

  Render the existing source chip in the metadata row and retain the existing calendar/date value so the card carries the same information as the reference image.

- [ ] **Step 4: Apply the exact survey colors.**

  Add extension-specific rules so `.cv-candidate-detail-status.is-success strong` uses `#15803D`, `.cv-candidate-detail-status.is-warning strong` uses `#EAB308`, and the status cell keeps the white card background and compact uppercase typography.

- [ ] **Step 5: Verify TypeScript and runtime reload.**

  Run `pnpm typecheck` from `D:\loogiX\auto-cv-processing`, then inspect `apps/frontend/dev.log` and the extension-related runtime output available from the running dev session.

- [ ] **Step 6: Verify end-to-end behavior.**

  Run a backend API smoke check against `http://localhost:3002/api/health` or the available authenticated application endpoint, then open the extension CV card in the browser and verify `CÂU HỎI` shows `ĐÃ TRẢ LỜI` for `SUBMITTED` and `CHƯA TRẢ LỜI` for non-submitted statuses.
