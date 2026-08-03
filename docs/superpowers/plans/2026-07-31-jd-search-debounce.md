# JD Search Debounce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the job description search commit automatically 300ms after typing stops while preserving immediate Enter/button search.

**Architecture:** Keep the existing controlled `searchInput` and committed `search` states. Add one debounced effect that resets pagination and commits the trimmed input, and clear the timer before immediate form submission. No API or backend changes are needed.

**Tech Stack:** React 18, TypeScript, Jest-style frontend tests if available, Vite.

## Global Constraints

- Debounce delay is exactly 300ms.
- Search commits the trimmed input and resets page to 1.
- Enter and the Search button commit immediately.
- Existing list loading, errors, pagination, and API contract remain unchanged.

---

### Task 1: Add debounced search behavior

**Files:**
- Modify: `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.tsx:131-211`
- Test: `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.test.tsx` if the frontend test setup supports component tests; otherwise test the extracted debounce helper in a colocated utility file.

**Interfaces:**
- Consumes: `searchInput`, `setSearchInput`, `setSearch`, `setPage`, and existing `handleSearch`.
- Produces: automatic committed search after 300ms and immediate submit behavior.

- [ ] **Step 1: Write the failing test**

  Test that changing the input does not commit before 300ms, commits the latest trimmed value once after 300ms, and resets the page to 1. Add a second assertion that immediate submit commits without waiting.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `pnpm --filter @interview-assistant/frontend exec vitest run apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.test.tsx`

  Expected: FAIL because the current page only commits search on form submit.

- [ ] **Step 3: Implement the minimal behavior**

  Add a `useEffect` watching `searchInput` that schedules:

  ```ts
  const timer = window.setTimeout(() => {
    setPage(1);
    setSearch(searchInput.trim());
  }, 300);
  return () => window.clearTimeout(timer);
  ```

  Update `handleSearch` to commit immediately using the same trim-and-reset logic. Preserve the current form and button markup.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `pnpm --filter @interview-assistant/frontend exec vitest run apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.test.tsx`

  Expected: PASS with no debounce timing failures.

- [ ] **Step 5: Run frontend validation**

  Run: `pnpm --filter @interview-assistant/frontend typecheck` and `pnpm --filter @interview-assistant/frontend build`

  Expected: both commands exit with code 0.
