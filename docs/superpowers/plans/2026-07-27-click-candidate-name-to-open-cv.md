# Click Candidate Name to Open CV Implementation Plan

**Goal:** Make the candidate name open the CV directly and remove the redundant “Xem CV” button.

**Architecture:** Reuse the existing `handleViewCv` callback and per-row loading state in the freelancer workspace. Only the candidate-name cell markup changes; API behavior and error handling remain unchanged.

**Tech Stack:** React, TypeScript, existing shadcn/ui `Button` component.

## Global Constraints

- Modify only `apps/frontend/src/pages/interviewer/candidates/FreelancerWorkspacePage.tsx`.
- Do not create sub-agents.
- Preserve the existing CV preview, loading, popup-blocked, and error behavior.

### Task 1: Make candidate names open CVs

**Files:**
- Modify: `apps/frontend/src/pages/interviewer/candidates/FreelancerWorkspacePage.tsx`

**Interfaces:**
- Consumes: existing `handleViewCv(referralId: string)` and `viewingCvReferralIds` state.
- Produces: clickable candidate name with the same CV-opening behavior as the removed button.

- [ ] Replace the candidate-name `<span>` with an outline-style button that calls `handleViewCv(application.referralId)`.
- [ ] Keep the button disabled while the row is saving or its CV is loading.
- [ ] Render the existing spinner while the CV is loading and remove the separate “Xem CV” button.
- [ ] Run the frontend typecheck and build to verify the change.
