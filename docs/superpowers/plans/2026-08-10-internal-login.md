# Internal Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Vietnamese Extension login UI, fix password-login payload handling, and add first-time random-password delivery for active internal personnel with `INTERNAL` permissions equivalent to `FREELANCER`.

**Architecture:** Extend the existing `UserRole`/JWT pipeline with an `INTERNAL` role and a unique link from `internals` to `users`. The auth service will validate active internal records, generate and hash passwords, send them via the existing `MailService`, and invalidate old refresh tokens. The frontend will use one login page with a normal-login state and an internal-password-request state.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, bcryptjs, Nodemailer SMTP, React, React Hook Form, Zod, shadcn/ui, Tailwind.

## Global Constraints

- Use pnpm only.
- Use `BadRequestException` for missing entities.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Do not run build or lint commands.
- Run `pnpm typecheck` after every code change and inspect the relevant hot-reload logs.
- Apps are already running; do not launch dev servers.
- Do not run git commands.

## Files and responsibilities

- Modify `packages/shared/src/types/user.ts`: add `UserRole.INTERNAL`.
- Modify `apps/backend/src/auth/entities/user.entity.ts`: allow the new enum value.
- Modify `apps/backend/src/internals/entities/internal.entity.ts`: add the unique optional linked user account.
- Modify `apps/backend/src/auth/auth.module.ts`: provide the internal entity and SMTP mail service to auth.
- Modify `apps/backend/src/auth/auth.service.ts`: validate internal accounts, generate passwords, send mail, and invalidate prior refresh tokens.
- Modify `apps/backend/src/auth/auth.controller.ts`: expose the throttled public password-request endpoint.
- Modify `apps/backend/src/auth/guards/jwt-auth.guard.ts`: apply freelancer self-service restrictions to `INTERNAL` too.
- Modify `apps/backend/src/freelancers/freelancers.controller.ts`: permit `INTERNAL` wherever freelancer self-service endpoints are permitted.
- Modify `apps/backend/src/auth/auth.service.ts`: permit `INTERNAL` through the same inactive/account checks as freelancer users.
- Add `apps/backend/src/migrations/1785200000000-AddInternalUserAccounts.ts`: add the PostgreSQL enum value and unique internal user link for production migration safety.
- Modify `apps/extension/src/types/types.ts`: add `INTERNAL` to extension user roles.
- Modify `apps/extension/src/lib/api-client.ts`: expose the internal-password request API.
- Modify `apps/extension/src/features/auth/LoginForm.tsx`: implement the supplied Vietnamese normal-login and internal-password-request states.
- Modify `apps/extension/src/app/side-panel.tsx`: connect the internal-password request and treat `INTERNAL` as a restricted freelancer-equivalent account.
- Modify `apps/extension/src/app/styles.css`: style the login states to match the supplied screenshots.

### Task 1: Add the INTERNAL role and database link

**Files:**
- Modify: `packages/shared/src/types/user.ts`
- Modify: `apps/backend/src/auth/entities/user.entity.ts`
- Modify: `apps/backend/src/internals/entities/internal.entity.ts`
- Create: `apps/backend/src/migrations/1785200000000-AddInternalUserAccounts.ts`

- [ ] Add `INTERNAL = 'INTERNAL'` to `UserRole`.
- [ ] Add nullable `userId` and a unique one-to-one `user` relation to `InternalEntity`; keep `createdById`/`createdBy` unchanged.
- [ ] Create a production migration that safely adds `INTERNAL` to the users role enum and adds `user_id` plus a unique foreign key on `internals`, with a down migration that removes only the added link and enum value when PostgreSQL permits it.
- [ ] Run `pnpm typecheck`.
- [ ] Inspect `apps/backend/dev.log` for hot-reload/database errors.

### Task 2: Implement internal first-password delivery

**Files:**
- Modify: `apps/backend/src/auth/auth.module.ts`
- Modify: `apps/backend/src/auth/auth.service.ts`
- Modify: `apps/backend/src/auth/auth.controller.ts`

- [ ] Register `InternalEntity` in the auth repository list and import/export the existing `NotificationModule` so `MailService` can be injected.
- [ ] Add a DTO containing one trimmed email field with email validation.
- [ ] Add `POST /api/auth/internal/request-password` with throttling and no JWT guard.
- [ ] Normalize the email, enforce the existing `@viettel.com.vn` rule, and find only an active internal record.
- [ ] Reuse an existing linked `INTERNAL` user or create one with the internal name/email and a temporary bcrypt hash; do not create accounts for unknown or inactive records.
- [ ] Generate a cryptographically random password with a readable safe character set, hash it with bcrypt, and send it using `MailService.sendMail`.
- [ ] Persist the new hash and link only after SMTP send succeeds; revoke all unrevoked refresh tokens for that user before saving the new credentials.
- [ ] Return a generic successful response without the password and a generic failure for unknown/inactive email addresses.
- [ ] Run `pnpm typecheck`.
- [ ] Inspect `apps/backend/dev.log` for hot-reload errors.

### Task 3: Make INTERNAL authorization equivalent to FREELANCER

**Files:**
- Modify: `apps/backend/src/auth/auth.service.ts`
- Modify: `apps/backend/src/auth/guards/jwt-auth.guard.ts`
- Modify: `apps/backend/src/freelancers/freelancers.controller.ts`
- Modify: `apps/extension/src/types/types.ts`
- Modify: `apps/extension/src/lib/api-client.ts`
- Modify: `apps/extension/src/app/side-panel.tsx`

- [ ] Apply the existing active-account checks to both `FREELANCER` and `INTERNAL` without weakening admin/HR/interviewer behavior.
- [ ] Treat both roles as restricted self-service roles in `JwtAuthGuard`.
- [ ] Add `UserRole.INTERNAL` alongside every freelancer self-service `@Roles(UserRole.FREELANCER)` declaration; keep admin/HR management routes unchanged.
- [ ] Make extension session restoration and login recognize both roles as restricted accounts.
- [ ] Ensure `INTERNAL` cannot enter admin/HR posting workflows.
- [ ] Run `pnpm typecheck`.
- [ ] Inspect `apps/backend/dev.log` and `apps/frontend/dev.log` for hot-reload errors.

### Task 4: Rebuild the extension login screen states

**Files:**
- Modify: `apps/extension/src/features/auth/LoginForm.tsx`
- Modify: `apps/extension/src/lib/api-client.ts`
- Modify: `apps/extension/src/app/side-panel.tsx`
- Modify: `apps/extension/src/app/styles.css`

- [ ] Replace the current English copy with the supplied Vietnamese Extension layout, preserving the existing extension components and state flow.
- [ ] Keep the extension's `{ login, password }` API contract and add invalid styling/message behavior.
- [ ] Add username and password icons, password visibility toggle, required markers, remember-password checkbox, “Quên mật khẩu”, and the internal-mode link.
- [ ] Add the internal-password state with email validation, “Hủy”, “Xác nhận”, loading state, success feedback, and API call to `/auth/internal/request-password`.
- [ ] Keep tokens handled through `apiClient.setTokens` and navigate to the restricted workspace after successful login.
- [ ] Run `pnpm typecheck`.
- [ ] Inspect `apps/frontend/dev.log` for hot-reload errors.

### Task 5: Verify end-to-end behavior

- [ ] Use `curl` against `http://127.0.0.1:3002/api/auth/login` with the corrected `{ login, password }` payload and confirm successful token issuance.
- [ ] Use `curl` with invalid credentials and confirm the API rejects the request without issuing tokens.
- [ ] Use a known active internal email to call the password-request endpoint and confirm the response does not contain the generated password; inspect backend logs for SMTP success/failure only.
- [ ] Use an unknown or inactive internal email and confirm it does not create a `users` account or send a password.
- [ ] Exercise the extension login screen in the browser: normal login, invalid styling/message, internal mode, cancel, validation, and success state.
- [ ] Verify an `INTERNAL` token is redirected to the freelancer-equivalent restricted workspace and cannot access management routes.
- [ ] Run final `pnpm typecheck` and inspect both runtime logs.
