# Freelancer Extension Login and CV View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let freelancers sign in with their referral identifier and use a standalone `CV của tôi` extension view for their own referred CVs.

**Architecture:** Extend the existing local auth lookup to support email or freelancer identifier while retaining JWT/refresh behavior. Add a focused extension API/types layer for freelancer self-service and render a separate `FreelancerCvPanel` branch for freelancer users, leaving the HR workspace and `ReferralManagementPanel` isolated.

**Tech Stack:** NestJS, TypeORM, bcryptjs, React, TypeScript, Vite extension, existing fetch API client.

## Global Constraints

- Use pnpm only.
- Use `BadRequestException` for missing entities.
- Never create or modify `*.spec.ts` / `*.test.ts` files.
- Never run a build, lint, or dev-server command.
- Run `pnpm typecheck` after every code change, then inspect the relevant hot-reload log.
- Run an API curl test and a browser test after code changes.
- Never run git commands.

## File Map

- Modify `apps/backend/src/auth/dto/login.dto.ts` to accept a neutral login identifier instead of enforcing email format.
- Modify `apps/backend/src/auth/auth.controller.ts` and `apps/backend/src/auth/auth.service.ts` to pass and resolve the login identifier.
- Modify `apps/backend/src/auth/strategies/local.strategy.ts` to use the new field name.
- Modify `apps/extension/src/types.ts` with the freelancer summary/application response types and role union.
- Modify `apps/extension/src/api-client.ts` with freelancer self-service API functions and binary CV download support.
- Create `apps/extension/src/freelancer-cv-panel.tsx` as the standalone freelancer workspace component.
- Modify `apps/extension/src/side-panel.tsx` only for role-based shell selection, login field copy, and logout/login initialization branching.
- Modify `apps/extension/src/styles.css` with namespaced freelancer panel styles.

### Task 1: Support identifier login in backend

**Files:**
- Modify: `apps/backend/src/auth/dto/login.dto.ts`
- Modify: `apps/backend/src/auth/auth.controller.ts`
- Modify: `apps/backend/src/auth/strategies/local.strategy.ts`
- Modify: `apps/backend/src/auth/auth.service.ts`

**Interfaces:**
- `LoginDto.login: string` is the normalized email or freelancer identifier.
- `AuthService.validateUser(login: string, password: string)` resolves an email first, then an exact freelancer identifier.
- `AuthController.login()` continues returning `{ accessToken, refreshToken, user }`.

- [ ] Change the DTO field from `email`/`@IsEmail()` to `login`/`@IsString()` with trimming and a minimum length that accepts `FL000001`.
- [ ] Configure Passport local strategy with `usernameField: 'login'` and rename its validate argument.
- [ ] Update controller Swagger summary and call site to use the DTO login field.
- [ ] In `validateUser`, normalize input, look up a user by email, and if not found look up an active/inactive freelancer by identifier with its user relation; compare the password using bcrypt and call `assertUserCanAuthenticate` before returning the password-free user.
- [ ] Preserve the existing email path, refresh-token creation, JWT claims, and inactive freelancer error behavior.
- [ ] Run `pnpm typecheck` and inspect `apps/backend/dev.log`.

### Task 2: Add typed freelancer self-service API client

**Files:**
- Modify: `apps/extension/src/types.ts`
- Modify: `apps/extension/src/api-client.ts`

**Interfaces:**
- `ExtensionUser.role` includes `'FREELANCER'`.
- `FreelancerSelfSummary` contains `identifier`, `isActive`, `applicationCount`, and `user`.
- `FreelancerSelfApplication` contains referral/candidate/job posting/status/evaluation/assignees/date fields.
- `getFreelancerSummary(accessToken)` returns `FreelancerSelfSummary`.
- `listFreelancerApplications(accessToken, params)` returns `{ data, pagination }`.
- `updateFreelancerApplicationEvaluation(accessToken, referralId, evaluation)` returns the updated application.
- `getFreelancerApplicationCv(accessToken, referralId, disposition)` returns a `Blob`.

- [ ] Add the response types with nullable status/evaluation fields matching the backend serializer.
- [ ] Implement JSON calls through the existing `request`/pagination helpers, using `/freelancers/me/summary` and `/freelancers/me/applications`.
- [ ] Implement the PATCH note call with `{ evaluation }` and a binary CV request that does not parse an API envelope.
- [ ] Reuse existing refresh/401 handling and avoid logging token or CV content.
- [ ] Run `pnpm typecheck` and inspect `apps/extension/dev.log` if present.

### Task 3: Build the isolated `FreelancerCvPanel`

**Files:**
- Create: `apps/extension/src/freelancer-cv-panel.tsx`
- Modify: `apps/extension/src/styles.css`

**Interfaces:**
- Props: `{ accessToken: string; onNotify?: (kind: 'SUCCESS' | 'ERROR', title: string, message: string) => void }`.
- The component owns all freelancer-only state and does not import `ReferralManagementPanel` or HR CV state.

- [ ] Load summary and first application page on mount/access-token change; show loading and retryable error states.
- [ ] Render the freelancer identity block, referral identifier, four metrics, search/status/JD/date controls, application cards, and pagination in the visual hierarchy of the supplied reference.
- [ ] Map backend statuses to Vietnamese labels and visual states, while keeping unknown statuses readable instead of crashing.
- [ ] Keep a draft note per referral, save via PATCH, disable save for terminal/unchanged states as appropriate, and update the card from the response.
- [ ] Render CV preview/download actions using a Blob URL with cleanup; do not persist CV data.
- [ ] Implement client-side JD/date filtering over the loaded page because the current API has no server-side parameters for those controls; keep server pagination intact and show empty states.
- [ ] Add namespaced `.freelancer-cv-*` styles for cards, metrics, toolbar, filters, notes, and pagination without changing HR styles.
- [ ] Run `pnpm typecheck` and inspect the extension runtime log.

### Task 4: Integrate role-specific extension shell

**Files:**
- Modify: `apps/extension/src/side-panel.tsx`
- Modify: `apps/extension/src/styles.css` only if shell-specific freelancer overrides are needed.

**Interfaces:**
- Freelancer users enter the shell with `activeWorkspaceTab = 'freelancer-cv'` and render only `FreelancerCvPanel`.
- HR/Admin users retain the current `WORKSPACE_TABS`, initialization, and posting behavior.

- [ ] Import `FreelancerCvPanel` and add a separate freelancer render branch rather than adding freelancer logic to `ReferralManagementPanel`.
- [ ] Update the login field label/type/placeholder to `Mã giới thiệu hoặc email` and remove the current post-login rejection of `FREELANCER`.
- [ ] Branch post-login initialization: freelancer skips extension-instance registration and HR data loading, while HR/Admin keeps existing setup.
- [ ] Branch the authenticated header and nav so freelancers see only `CV của tôi`; retain logout and the existing HR nav unchanged.
- [ ] Ensure token restoration on mount follows the same role branch and sends freelancers directly to the dedicated panel.
- [ ] Run `pnpm typecheck` and inspect both runtime logs.

### Task 5: End-to-end verification

**Files:**
- No test files may be created or modified.

- [ ] Run `pnpm typecheck` and record the exit code/output.
- [ ] Inspect `tail -20 apps/backend/dev.log` and `tail -20 apps/frontend/dev.log` (or extension runtime output if available) for reload errors.
- [ ] Use curl against port 3002 to verify identifier login, `/api/auth/me`, freelancer summary, application list, and note update with a valid local freelancer fixture; verify invalid/inactive credentials fail.
- [ ] Use the in-app browser against port 4000 to verify the login form, freelancer-only navigation, summary/cards/filters, note save, and CV action without exposing HR tabs.
- [ ] Re-check the changed files for accidental test-file edits and sensitive logging.
