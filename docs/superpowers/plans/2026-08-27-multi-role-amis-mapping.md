# Multi-role AMIS Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one Extension account carry both `INTERNAL` and `COMMITTEE` permissions while preserving AMIS identity and JD-board authorization.

**Architecture:** Add a normalized `user_role_memberships` table and keep `users.role` as the backward-compatible primary role. Put the full role set in auth responses/JWT, make the guard and role-sensitive services consume that set, and retain the existing AMIS UserID/email/phone/JD-membership checks.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Passport JWT, React/TypeScript Extension, pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-08-27-multi-role-amis-mapping-design.md`

## Global Constraints

- Use pnpm only.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Do not build, launch, or lint the applications.
- Run `pnpm typecheck` and inspect runtime logs after every source-code change.
- Keep `BadRequestException` for missing entities and preserve unrelated API behavior.
- Do not log passwords, cookies, bearer tokens, AMIS tokens, or candidate PII beyond existing safe fields.
- Run API and browser/extension smoke checks after source changes; run the available SonarQube scanner before the final report.
- Use stable role membership data and normalized email/phone matching; do not infer committee access from an internal profile alone.

### Task 1: Add normalized role memberships and shared role payload

**Files:**
- Create: `apps/backend/src/auth/entities/user-role-membership.entity.ts`
- Create: `apps/backend/src/migrations/1786500000000-CreateUserRoleMemberships.ts`
- Modify: `apps/backend/src/auth/entities/user.entity.ts`
- Modify: `packages/shared/src/types/user.ts`
- Modify: `apps/extension/src/types/types.ts`

**Interfaces:**
- Membership entity stores `userId` and `role`, with a unique `(user_id, role)` constraint.
- `User` and `ExtensionUser` expose `roles: UserRole[]` while retaining `role`.
- User entity exposes a TypeORM relation and a small role-set helper suitable for auth serialization.

- [ ] Add the role-membership entity and composite uniqueness.
- [ ] Add the migration with a backfill from each existing `users.role` and a reversible down migration.
- [ ] Register the relation on `UserEntity` without changing existing table names or legacy role column.
- [ ] Update shared and Extension types with the additive `roles` field.
- [ ] Run `pnpm typecheck` and inspect `apps/backend/dev.log` and `apps/frontend/dev.log`.

### Task 2: Make auth issue and consume all roles

**Files:**
- Modify: `apps/backend/src/auth/auth.module.ts`
- Modify: `apps/backend/src/auth/auth.service.ts`
- Modify: `apps/backend/src/auth/strategies/jwt.strategy.ts`
- Modify: `apps/backend/src/auth/guards/roles.guard.ts`
- Modify: `apps/backend/src/auth/dto/login.dto.ts`
- Modify: `apps/backend/src/auth/auth.controller.ts`
- Modify: `apps/backend/src/auth/guards/jwt-auth.guard.ts`

**Interfaces:**
- Auth user payload: `{ id, email, name, role, roles, mustChangePassword? }`.
- JWT payload includes `roles` and retains `role` fallback.
- Role guard checks `roles.includes(requiredRole)` and falls back to `[role]` for old JWTs.
- Create/update user APIs accept additive `roles?: UserRole[]` and keep legacy `role` compatible.

- [ ] Register the membership repository in the Auth module.
- [ ] Add a single role-loading/synchronization helper that backfills a missing legacy membership and returns a de-duplicated role list.
- [ ] Include the role list in login, refresh, Google login, handoff exchange, `/auth/me`, and JWT validation.
- [ ] Update role guard and JWT-auth role-specific logic to use the role set.
- [ ] Update create/update user flows to validate and persist role memberships without allowing an empty role set.
- [ ] Run `pnpm typecheck` and inspect both runtime logs.

### Task 3: Update role-sensitive business behavior

**Files:**
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.service.ts`
- Modify: `apps/backend/src/candidate-evaluations/interview-committees.service.ts`
- Modify: `apps/backend/src/extension-integration/amis-recruitment-board-members.service.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.service.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.controller.ts`
- Modify: other backend files identified by role-equality search only when the equality controls authorization or role-specific behavior.

**Interfaces:**
- A shared `hasUserRole(user, role)` helper is used for request actors and loaded entities.
- Committee evaluation checks recognize a dual-role actor as committee.
- Committee user selection finds users whose membership contains `COMMITTEE`, not only users whose legacy role column equals it.
- AMIS identity sync and board access remain restricted to committee capability plus exact identity and JD membership.

- [ ] Replace direct committee/internal capability comparisons with the role-set helper.
- [ ] Preserve role labels and legacy `role` output where clients still consume them.
- [ ] Ensure HR-only actions remain HR-only even when the same user also has committee capability unless the endpoint explicitly permits both.
- [ ] Recheck AMIS mapping conflict and exact-current-user checks for dual-role actors.
- [ ] Run `pnpm typecheck` and inspect both runtime logs.

### Task 4: Update Extension role handling

**Files:**
- Modify: `apps/extension/src/app/side-panel.tsx`
- Modify: `apps/extension/src/features/auth/LoginForm.tsx`
- Modify: `apps/extension/src/lib/api-client.ts`
- Modify: any Extension role consumer found by the role-equality search when needed for dual-role behavior.

**Interfaces:**
- Extension role helpers expose `hasExtensionRole(user, role)` and preserve the existing primary-role display.
- A dual-role user can access internal features and committee evaluation features, but committee candidates remain filtered by AMIS identity/JD membership.

- [ ] Replace committee/internal single-role UI branching with capability checks.
- [ ] Keep AMIS identity synchronization and committee-only candidate visibility gated by `COMMITTEE` capability.
- [ ] Keep the existing CV-only committee presentation when the account has only `COMMITTEE`; do not alter unrelated tabs for single-role users.
- [ ] Run `pnpm typecheck` and inspect frontend/backend runtime logs.

### Task 5: Reset only the requested AMIS mapping

**Files:**
- No source files.

- [ ] Query exactly one `users` row by `anantest@viettel.com.vn` and capture only the selected account's role/mapping identifiers.
- [ ] If any AMIS identity field is populated, clear only the six AMIS identity columns for that row inside a transaction.
- [ ] Verify the internal profile row, phone, `user_id`, role memberships, and other AMIS-mapped users are unchanged.
- [ ] Report that the account is ready for a fresh AMIS mapping test.

### Task 6: Verify end-to-end behavior

**Files:**
- No source files.

- [ ] Run the full `pnpm typecheck` command.
- [ ] Inspect backend/frontend runtime logs for reload errors.
- [ ] Smoke-test Swagger/API availability and authentication/role payload behavior against the already running backend.
- [ ] Smoke-test the frontend/Extension route and role-dependent UI against the already running frontend; if the browser connector is unavailable, report that limitation with the API evidence.
- [ ] Run the configured SonarQube scanner if available and check its result without changing scanner configuration.
- [ ] Recheck each criterion in the spec, including the scoped AMIS reset.
