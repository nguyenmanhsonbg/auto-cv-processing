# Interview Evaluation Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the interview evaluation page so its rendered structure and visual tokens match the supplied HTML design while preserving the existing HR/HĐCM permissions and one-form-across-rounds workflow.

**Architecture:** Keep the existing route, API calls, autosave, round history, reviewer permissions, and shared form persistence. Replace the page's generic evaluation blocks with design-specific components: candidate information table, HRBP table, two HĐCM evaluation matrices, salary proposal table, and in-form footer. Store the two HĐCM matrices in the existing JSON form payload through typed shared fields, retaining the legacy five rating fields for backward compatibility.

**Tech Stack:** React, TypeScript, Tailwind-compatible UI primitives, CSS, pnpm monorepo.

**Spec:** `C:/Users/sagit/.codex/attachments/a4e08348-cecf-4a57-ab9d-ee5fadc9166f/pasted-text.txt`

## Global Constraints

- Use `pnpm` commands only.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Do not change unrelated AMIS, Facebook, extension, authentication, or recruitment flows.
- Preserve `InterviewEvaluationFormData` backward compatibility with existing stored records.
- HR can view HĐCM content but cannot edit it; assigned HĐCM members can edit and complete their own review.
- The evaluation remains one persistent form across all interview rounds.
- Run `pnpm typecheck` after code changes; do not run build, lint, or dev-server commands.
- Validate frontend/backend status and the rendered local page with API/browser smoke checks.

---

### Task 1: Extend the shared HĐCM matrix payload

**Files:**
- Modify: `packages/shared/src/types/candidate-interview-evaluation.ts`

**Interfaces:**
- Add a typed criterion payload containing `evidence`, `rating`, and `note`.
- Add `technicalCompetencies` and `personalGrowth` maps to `committee` while retaining existing legacy fields.

- [ ] Add `InterviewEvaluationCriterionData` with optional `evidence?: string`, `rating?: number`, and `note?: string`.
- [ ] Add `technicalCompetencies?: Record<string, InterviewEvaluationCriterionData>` and `personalGrowth?: Record<string, InterviewEvaluationCriterionData>` under `committee`.
- [ ] Keep all existing committee fields unchanged so old records remain readable.
- [ ] Run `pnpm typecheck` and confirm the shared type compiles before changing the page.

### Task 2: Rebuild the evaluation page markup around the supplied design

**Files:**
- Modify: `apps/frontend/src/pages/recruitment/applications/InterviewEvaluationPage.tsx`

**Interfaces:**
- Preserve `getInterviewEvaluation`, `saveInterviewEvaluationReview`, `submitInterviewEvaluationReview`, `aggregateInterviewEvaluation`, `completeInterviewEvaluation`, `createNextInterviewEvaluationRound`, and existing role gating.
- Render editable controls only when `canReview` is true; render read-only HĐCM cells for HR/Admin.

- [ ] Replace the current generic overview with the design's candidate-information table, including candidate name, year of birth placeholder, position, expected placement group, overall evaluation, source, HRBP, and reviewer fields.
- [ ] Keep the HRBP section's seven existing fields and map them into the design table rows.
- [ ] Implement the technical matrix with the five design criteria: `Kiến thức chuyên môn (Knowledge)`, `Kỹ năng chuyên môn (Skill)`, `Năng lực bổ sung theo đặc thù vị trí/dự án`, `Các yếu tố rủi ro`, and `Đánh giá Level/Vùng`.
- [ ] Implement the personal/growth matrix with the six design criteria: `Sự phù hợp về đặc điểm con người, phong cách làm việc`, `Tư duy phân tích & logic`, `Khả năng làm việc nhóm & cộng tác`, `Khả năng thích ứng & thúc đẩy kết quả`, `Khả năng phát triển bản thân`, and `Động lực & tiềm năng phát triển`.
- [ ] Render each matrix row with evidence input, five rating radio controls, and note input; use the typed matrix maps for updates and preserve legacy rating values when loading old data.
- [ ] Render the HĐCM explanatory text and overall comment area exactly as the design; HR/Admin sees it read-only without the old “HR/Admin…” helper copy.
- [ ] Keep the salary proposal block and the design's `Hủy`, `Lưu nháp`, and `Hoàn thành` footer actions. Keep existing manager-only aggregation/complete/next-round handlers behind the same permission gates; do not add a HR-to-HĐCM send action.
- [ ] Update navigation labels to the design hierarchy, including nested `III.1` and `III.2` links and the edit-history card.
- [ ] Run `pnpm typecheck` after the markup/data wiring is complete.

### Task 3: Match the supplied visual tokens and layout

**Files:**
- Modify: `apps/frontend/src/pages/recruitment/applications/interview-evaluation-page.css`

- [ ] Match the root shell and header tokens: white shell, 8px radius, `#0C4A6E` title/subbar, title `18px/28px`, uppercase, letter spacing `0.45px`.
- [ ] Match the desktop two-column layout and design spacing without collapsing the matrix columns; expose horizontal scrolling for the wide evaluation tables on smaller viewports.
- [ ] Match navigation/history typography, with navigation at `16px/20px` and history at `11px/16.5px`.
- [ ] Match section colors: I `#0369A1`, II `#166534`, III and matrix headers `#075985`; use description backgrounds `#F0FDF4` and `#F0F9FF` with the design borders.
- [ ] Match table widths and borders: STT `50px`, criterion `170px`, evidence `400px`, rating group `450px`, notes `250px`, `#D4D4D4` grid lines.
- [ ] Match rating controls as 16px circular radios and the legend as 24px colored squares with the exact five target colors.
- [ ] Move the footer into the shell instead of viewport-fixed positioning and match its background, button colors, 8px radius, padding, and uppercase typography.
- [ ] Remove CSS that only supports the superseded generic sections or generic full-width rating blocks.
- [ ] Run `pnpm typecheck` and inspect the running page for overflow, role-based editability, and footer placement.

### Task 4: Verify the implementation

**Files:**
- No test files added or changed.

- [ ] Run `pnpm typecheck` and record a zero exit code.
- [ ] Run API smoke checks for frontend `200`, backend Swagger `200`, and unauthenticated evaluation access `401`.
- [ ] Use the running local browser page to verify the design headings, two HĐCM matrices, footer actions, HR read-only state, and HĐCM editable state.
- [ ] Inspect frontend/backend logs for runtime errors introduced by the change.
- [ ] Attempt the repository SonarQube scan and report the exact result; do not claim a clean scan if credentials are unavailable.
