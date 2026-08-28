# Multi-role AMIS Mapping Design

## Goal

Allow one Extension account to be both an internal employee and a professional committee member while preserving strict AMIS identity and JD committee-membership checks.

## Current finding

- `users.role` is a single enum, so one account cannot express both `INTERNAL` and `COMMITTEE`.
- `internals.user_id` is the link between the Extension user and the internal employee profile. It is not the AMIS identity link and must not be removed when resetting AMIS mapping.
- `anantest@viettel.com.vn` currently has an active internal profile linked to its user and phone `0984201577`; its AMIS identity columns are empty.
- The existing AMIS mapping on `hdcm.foron.en@example.com` is a different account and must remain unchanged.

## Approved behavior

An account may have a role set such as `[INTERNAL, COMMITTEE]`.

- `INTERNAL` grants internal-personnel features.
- `COMMITTEE` grants committee-evaluation capability.
- A committee role alone is not enough to view a candidate. For AMIS-backed data, the request must also carry the current AMIS UserID and the current AMIS user must be a member of the JD's recruitment board.
- AMIS identity synchronization may match the active internal profile by normalized email, normalized phone, or both. A conflicting email/phone match is rejected.
- The Extension JWT identifies the logged-in Extension account. The AMIS identity is captured from the AMIS browser session and stored on that same local account only after the identity-to-internal-profile checks pass.
- A HR AMIS session cannot use a separately logged-in committee Extension account to impersonate the HR session: the current AMIS UserID and board membership remain mandatory for committee access.

## Data model

Create a normalized `user_role_memberships` table with one row per `(user_id, role)` and a unique composite constraint. Existing `users.role` remains as the legacy/default role during migration so existing API consumers and displays do not break immediately. The migration backfills one membership from every current `users.role` value.

The user-facing auth payload adds `roles: UserRole[]`; `role` remains the primary/legacy value. Role checks use the role set, not string comparison against only the primary role.

## Auth and authorization

- Login, refresh, Google login, and evaluation handoff tokens include the complete role set.
- `GET /auth/me` returns the complete role set.
- `RolesGuard` authorizes when any required role exists in the role set and falls back to the legacy `role` for old tokens.
- User create/update APIs accept an optional role set while retaining the current single-role field for backward compatibility. At least one role is required; the legacy role is kept in sync with the first role.
- Internal-password and freelancer-specific checks use capability helpers so a dual-role user keeps the correct behavior for both profiles.
- Committee user lists and evaluation rules query committee membership rather than requiring `users.role = COMMITTEE`.

## AMIS mapping reset for this test

After the source changes are verified, query the exact local user by `anantest@viettel.com.vn`. Clear only `amis_user_id`, `amis_full_name`, `amis_email`, `amis_phone`, `amis_tenant_id`, and `amis_identity_verified_at` if any are populated. Preserve `internals.user_id`, internal email, name, phone, active state, passwords, role memberships, and all other users. Report the before/after row and abort the reset if the selected email does not identify exactly one user.

## Out of scope

- No changes to AMIS network capture formats or external AMIS APIs.
- No changes to candidate, posting, Facebook, TopCV, or unrelated recruitment flows.
- No removal of the existing `hdcm.foron.en@example.com` mapping.
- No automatic grant of `COMMITTEE` based only on an internal profile; role assignment remains explicit.

## Verification criteria

1. `anantest@viettel.com.vn` can represent both roles without changing its internal profile link.
2. A token/API request with either role is accepted by the corresponding role guard.
3. Committee evaluation still requires exact AMIS UserID and JD board membership.
4. The existing single-role users retain their previous behavior.
5. The AMIS identity reset affects only the requested account and only AMIS identity columns.
6. Typecheck, runtime logs, API smoke, browser/extension smoke, and the available SonarQube scan are checked before completion.
