# CV List Filters Implementation Plan

**Goal:** Add question, AMIS sync, AI evaluation, source, and sort filters to the extension candidate list.

**Architecture:** Keep filter state in `side-panel.tsx`, extend the existing dropdown component and visible-application selector, and reset pagination whenever a filter changes. Use the existing application status helpers and session-local AI upload state.

**Tech Stack:** React, TypeScript, existing extension CSS.

## Global Constraints

- Match the approved two-row filter layout and labels from the provided references.
- Combine all selected filters with AND semantics.
- Do not create sub-agents.

### Task 1: Add filter state, options, and filtering

**Files:**
- Modify: `apps/extension/src/side-panel.tsx`
- Modify: `apps/extension/src/styles.css`

- [ ] Add question and AI evaluation filter types/options and state.
- [ ] Render five dropdowns in the approved two-row order.
- [ ] Apply question, AMIS sync, AI evaluation, and source filters before sorting.
- [ ] Reset pagination and close the dropdown when any filter changes.
- [ ] Verify extension typecheck and build.
