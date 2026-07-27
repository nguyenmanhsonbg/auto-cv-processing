# Freelancer Workspace CV and Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a logged-in freelancer to use `/candidates/freelancers` to view only applications referred by their own identifier, open the current sanitized CV in a new tab, and create or update the freelancer-owned general evaluation text.

**Architecture:** Keep the existing HR/Admin freelancer management APIs and page unchanged for management. Add a least-privilege freelancer API under `/freelancers/me/*`, including a referral-scoped CV stream endpoint that verifies ownership before delegating sanitized-file access to `CvDocumentsService`. Add a role-aware landing route that renders the existing HR list for HR/Admin and a dedicated minimal freelancer workspace for `FREELANCER` users.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, React, React Router, TypeScript, existing `apiClient`, shadcn/ui components, Vite hot reload.

## Global Constraints

- Use `pnpm` only.
- Do not create or modify `*.spec.ts` or `*.test.ts` files; verify behavior with API calls and browser tests instead.
- Do not run builds or lint commands; run typecheck after every code change.
- Do not launch or restart the apps; backend `:3002` and frontend `:4000` already run with hot reload.
- Freelancer CV access must be limited to the active freelancer account's own `application_referrals` rows.
- Only sanitized clean CV files may be streamed; original/quarantined CV files remain inaccessible.
- The freelancer may edit only `application_referrals.evaluation`, with the existing 2,000-character limit and nullable clearing behavior.
- Keep the minimal application columns: STT, candidate name, JD, process status, HR reception status, and general evaluation, with a CV action integrated into the candidate cell.

---

### Task 1: Add referral-scoped freelancer CV access to the backend

**Files:**
- Modify: `apps/backend/src/freelancers/freelancers.module.ts`
- Modify: `apps/backend/src/freelancers/freelancers.service.ts`
- Modify: `apps/backend/src/freelancers/freelancers.controller.ts`

**Interfaces:**
- Consume `CvDocumentsService.getCleanCvFileForAccess(input: CleanCvFileAccessInput)` from the existing CV module.
- Produce `FreelancersService.getMyApplicationCv(userId: string, referralId: string, accessMode: 'inline' | 'attachment')` returning `CleanCvFileAccessResult`.
- Produce `GET /api/freelancers/me/applications/:referralId/cv?disposition=inline` for `FREELANCER` only, returning the sanitized CV binary stream.

- [ ] **Step 1: Wire `CvDocumentsModule` into `FreelancersModule`**

Import `CvDocumentsModule` and add it to the module imports so `CvDocumentsService` can be injected without changing the existing HR CV controller.

- [ ] **Step 2: Add ownership resolution in `FreelancersService`**

Inject `CvDocumentsService`, then implement `getMyApplicationCv` with this sequence:

```ts
const freelancer = await this.resolveActiveByUserIdOrThrow(userId);
const referral = await this.referralsRepo.findOne({
  where: { id: referralId, freelancerId: freelancer.id },
  relations: { application: true },
});
if (!referral) {
  throw new BadRequestException({
    code: 'FREELANCER_APPLICATION_NOT_FOUND',
    message: 'Freelancer application referral not found.',
  });
}
if (!referral.application.currentCvDocumentId) {
  throw new BadRequestException({
    code: 'CURRENT_CV_NOT_AVAILABLE',
    message: 'Current CV is not available for this application.',
  });
}
return this.cvDocumentsService.getCleanCvFileForAccess({
  applicationId: referral.applicationId,
  cvDocumentId: referral.application.currentCvDocumentId,
  actorId: userId,
  actorRole: UserRole.FREELANCER,
  accessMode,
});
```

Normalize `referralId` with the same `requireText` helper used by existing methods. Do not accept an application ID directly; the referral ID is the authorization boundary.

- [ ] **Step 3: Add the binary controller endpoint**

Add `@Get('me/applications/:referralId/cv')` before the parameterized HR routes, protect it with `@Roles(UserRole.FREELANCER)`, parse the UUID, normalize the disposition to `inline` or `attachment`, call the service, and copy the existing CV controller's response headers and stream/error handling. Set `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

- [ ] **Step 4: Run backend typecheck and inspect runtime logs**

Run:

```text
pnpm --filter @interview-assistant/backend typecheck
```

Inspect `apps/backend/dev.log` and confirm hot reload has no compile/runtime error before moving on.

---

### Task 2: Extend the frontend freelancer API client

**Files:**
- Modify: `apps/frontend/src/lib/freelancer-api.ts`

**Interfaces:**
- Consume `GET /freelancers/me/summary`, `GET /freelancers/me/applications`, and `PATCH /freelancers/me/applications/:referralId/evaluation` already present in the backend.
- Produce `getMyFreelancer()`, `listMyFreelancerApplications(params)`, `updateMyFreelancerApplicationEvaluation(referralId, evaluation)`, and `downloadMyFreelancerCv(referralId)`.

- [ ] **Step 1: Add the authenticated freelancer record mapper**

Reuse the existing `ApiFreelancerRecord` and application mapper, exposing `getMyFreelancer()` that unwraps `/freelancers/me/summary` and `listMyFreelancerApplications()` that maps the paginated `/freelancers/me/applications` response to `FreelancerRecord` and `FreelancerApplicationRecord`.

- [ ] **Step 2: Add evaluation mutation**

Implement:

```ts
export function updateMyFreelancerApplicationEvaluation(
  referralId: string,
  evaluation: string | null,
) {
  return apiClient
    .patch<ApiEnvelope<ApiFreelancerApplicationRecord> | ApiFreelancerApplicationRecord>(
      `/freelancers/me/applications/${encodeURIComponent(referralId)}/evaluation`,
      { evaluation },
    )
    .then((response) => mapFreelancerApplicationRecord(unwrapEnvelope(response)));
}
```

- [ ] **Step 3: Add blob download for the new-tab preview**

Implement `downloadMyFreelancerCv(referralId)` using `apiClient.downloadBlob` with `/freelancers/me/applications/:referralId/cv?disposition=inline`. The workspace will create an object URL from the returned blob, open it with `window.open('', '_blank')` before awaiting the request to avoid popup blocking, then assign the object URL to the new tab.

- [ ] **Step 4: Run frontend typecheck and inspect runtime logs**

Run:

```text
pnpm --filter @interview-assistant/frontend typecheck
```

Inspect `apps/frontend/dev.log` for a clean HMR update.

---

### Task 3: Add role-aware routing and freelancer-only navigation

**Files:**
- Create: `apps/frontend/src/components/recruitment/FreelancerRouteGuard.tsx`
- Create: `apps/frontend/src/pages/interviewer/candidates/FreelancerLandingPage.tsx`
- Modify: `apps/frontend/src/app/routes.tsx`
- Modify: `apps/frontend/src/app/layouts/InterviewerLayout.tsx`

**Interfaces:**
- `FreelancerRouteGuard` allows only ADMIN, HR, or FREELANCER and renders an `Outlet`; otherwise it renders the existing access-denied state.
- `FreelancerLandingPage` selects `FreelancerListPage` for ADMIN/HR and `FreelancerWorkspacePage` for FREELANCER.

- [ ] **Step 1: Implement `FreelancerRouteGuard`**

Follow `HrRouteGuard`'s token/user loading pattern, but allow `UserRole.ADMIN`, `UserRole.HR`, and `UserRole.FREELANCER`. Keep the route under the authenticated `InterviewerLayout`.

- [ ] **Step 2: Add role-aware landing component**

Create a small component using `useAuthContext()`:

```tsx
return user?.role === UserRole.FREELANCER
  ? <FreelancerWorkspacePage />
  : <FreelancerListPage />;
```

Do not expose the HR `:freelancerId` detail route to freelancers.

- [ ] **Step 3: Update routes**

Replace the current `HrRouteGuard` wrapper around `candidates/freelancers` with `FreelancerRouteGuard`, render `FreelancerLandingPage` at the index, and wrap `:freelancerId` in the existing `HrRouteGuard` so HR/Admin management detail remains protected.

- [ ] **Step 4: Restrict sidebar for freelancers**

In `InterviewerLayout`, show the Freelancer link for `FREELANCER` users and keep it for ADMIN/HR. For `FREELANCER`, hide Dashboard, Candidates, Sessions, Questions, Recruitment, and Settings sections so the only navigable workspace is `/candidates/freelancers`. Keep the existing nav order for HR/Admin: Dashboard, Candidates, Freelancers, Sessions, Questions.

- [ ] **Step 5: Run frontend typecheck and inspect runtime logs**

Run the frontend typecheck and inspect `apps/frontend/dev.log` before building the workspace UI.

---

### Task 4: Build the minimal freelancer workspace

**Files:**
- Create: `apps/frontend/src/pages/interviewer/candidates/FreelancerWorkspacePage.tsx`

**Interfaces:**
- Consume the four functions from `freelancer-api.ts` and the existing `getApplicationStatusClassName`, `getApplicationStatusLabel`, `Badge`, `Button`, `Textarea`, `Table`, `DataTablePagination`, and toast patterns.
- Produce a page with the columns STT, candidate name, JD, process status, HR reception status, and editable general evaluation, plus a “Xem CV” action in the candidate cell.

- [ ] **Step 1: Load own summary and paginated applications**

Load `/freelancers/me/summary` and `/freelancers/me/applications` on mount and whenever page, limit, or search changes. Reuse the existing stale-request counter pattern from `FreelancerDetailPage` so changing search or page cannot overwrite newer data. Search by candidate or JD with the existing 300 ms debounce.

- [ ] **Step 2: Render the minimal table**

Show freelancer name, identifier, and application count at the top. Render the agreed six columns. Keep candidate contact details hidden. In each candidate cell render the candidate name and a small `Xem CV` button.

- [ ] **Step 3: Implement new-tab CV preview**

On click:

```ts
const previewWindow = window.open('', '_blank');
if (!previewWindow) {
  toast({ title: 'Không thể mở tab mới', description: 'Vui lòng cho phép popup cho trang này.', variant: 'destructive' });
  return;
}
try {
  const blob = await downloadMyFreelancerCv(referralId);
  const objectUrl = URL.createObjectURL(blob);
  previewWindow.location.href = objectUrl;
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
} catch (error) {
  previewWindow.close();
  toast({ title: 'Không thể mở CV', description: getInternalSafeErrorMessage(error), variant: 'destructive' });
}
```

Disable only the clicked row's CV button while loading. The backend's clean-file eligibility remains authoritative.

- [ ] **Step 4: Implement evaluation editing and saving**

Keep a draft map keyed by `referralId`, initialized from `application.evaluation`. Render a compact textarea in the evaluation cell and a save button. On save, send the draft (trim to null when empty), replace that row with the response from `updateMyFreelancerApplicationEvaluation`, and show a success/error toast. Disable the button while saving that row; do not allow a freelancer to edit any other application field.

- [ ] **Step 5: Handle empty/loading/error/pagination states**

Show explicit loading and empty states. If a page becomes empty after a deletion-like pagination boundary change, move back one page using the existing detail-page behavior. Preserve the draft text during list reloads unless the saved response updates that row.

- [ ] **Step 6: Run frontend typecheck and inspect runtime logs**

Run the frontend typecheck and inspect `apps/frontend/dev.log` after the page is added.

---

### Task 5: Verify authorization and end-to-end behavior

**Files:**
- No test files may be created or modified under repository rules.

- [ ] **Step 1: Verify the API contract as an authenticated freelancer**

Using the existing logged-in freelancer session or the API client, verify:

```text
GET  /api/freelancers/me/summary                 -> 200
GET  /api/freelancers/me/applications            -> 200, only own referrals
PATCH /api/freelancers/me/applications/:id/evaluation -> 200, value persists
GET  /api/freelancers/me/applications/:id/cv?disposition=inline -> 200 binary for own sanitized CV
```

Also verify a different referral ID returns a non-success response and that the HR-only route `/api/freelancers` remains forbidden to the freelancer.

- [ ] **Step 2: Verify the browser workspace**

Open `http://localhost:4000/candidates/freelancers` as a freelancer and confirm the only visible sidebar item is Freelancer, the minimal table loads, the evaluation can be saved and remains after refresh, and “Xem CV” opens a second tab containing the PDF.

- [ ] **Step 3: Verify HR/Admin regression**

Open the same URL as HR/Admin and confirm the existing freelancer management list and detail route still work, including the HR view of the saved evaluation. Confirm the nav order remains Dashboard → Candidates → Freelancers → Sessions → Questions.

- [ ] **Step 4: Run final validation commands**

Run:

```text
pnpm typecheck
```

Inspect `apps/backend/dev.log` and `apps/frontend/dev.log`, then record API and browser outcomes before reporting completion.

