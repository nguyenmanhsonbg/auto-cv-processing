# Internal Referral Source Design

## Goal

Add an HR/Admin-managed Internal referral source alongside Freelancer. Public applicants can optionally select Freelancer, Internal, or neither; Internal uses an optional `@viettel.com.vn` email and does not create a login account.

## Confirmed behavior

- The public apply form has one mutually exclusive source selector:
  - Freelancer: show an optional freelancer code field.
  - Internal: show an optional Internal email field.
  - Neither: submit without a referral source.
- An applicant may select either source and leave its field empty. That behaves like no referral source.
- A non-empty Internal email must match the exact `@viettel.com.vn` domain, case-insensitively.
- A valid Internal email that does not exist is created automatically as an active Internal record for now.
- Internal records are managed on a separate HR/Admin screen with the same list, detail, application history, activation, and deactivation behavior as Freelancer management.
- Internal records store only the normalized email, active status, audit timestamps, optional creator, and application count. The email is immutable after creation.
- Internal users do not receive an account, identifier, password, login route, or self-service workspace in this phase.
- Existing Freelancer behavior and public freelancer-code flow remain backward compatible.

## Architecture

Reuse `application_referrals` as the single optional source row per application. Add a source type plus nullable `freelancer_id` and `internal_id` ownership columns with a database check that permits exactly one owner. Existing Freelancer rows are backfilled as `FREELANCER`.

Add an `internals` table and an `InternalsService`/controller/module for HR/Admin CRUD, status changes, and application history. Public apply resolves an active Freelancer by code or finds/creates an active Internal by normalized email inside the same application transaction. No referral row is created when neither source is supplied.

## API and UI boundaries

- Public apply accepts `freelancerCode?: string` and `internalEmail?: string`; the backend rejects both being supplied together.
- `POST /internals` creates an Internal email for HR/Admin.
- `GET /internals`, `GET /internals/:id`, `GET /internals/:id/applications`, and `PATCH /internals/:id/status` mirror Freelancer management endpoints.
- The Internal list/detail pages live under `/candidates/internals` and are visible only to HR/Admin.
- Application list/detail responses expose the existing Freelancer summary plus an Internal summary and source type so HR can distinguish the two.

## Validation and errors

- Frontend validates a non-empty selected Internal email before submit.
- DTO and service validation both enforce the exact `@viettel.com.vn` suffix.
- The API uses `INVALID_INTERNAL_EMAIL` for malformed or inactive Internal referral email input.
- The API uses a source-conflict error when both source values are supplied, even if the UI prevents that state.
- Internal deactivation preserves existing application history and prevents new referrals from resolving to that Internal.

## Migration and compatibility

Create `internals`, add `source_type` and nullable `internal_id` to `application_referrals`, make `freelancer_id` nullable, backfill existing rows as Freelancer, add foreign keys/indexes/check constraints, and preserve the unique application referral constraint. The migration is designed to be safe when the Freelancer migration has already run.

## Testing scope

- Backend unit tests cover exact Internal email validation, auto-creation/reuse, inactive rejection, and mutual-exclusion routing.
- Frontend typecheck covers the new payload/API/page wiring; the public form behavior is manually verifiable through the existing browser flow.
- Existing Freelancer tests and typechecks must remain green.

## Non-goals

- Internal authentication or login.
- Internal identifier generation.
- Editing an Internal email after creation.
- Cross-checking Internal emails against Freelancer account emails.
- Commission, payroll, or new reporting rules beyond making the source distinguishable in existing application/referral data.
