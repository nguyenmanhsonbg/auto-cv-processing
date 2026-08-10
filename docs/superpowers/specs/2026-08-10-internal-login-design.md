# Internal Login Design

## Goal

Implement the Vietnamese login experience shown in the supplied screenshots and add first-time password delivery for active internal personnel. `INTERNAL` accounts must have the same effective application permissions as `FREELANCER` accounts.

## Scope

- Replace the current English password-login presentation with the Vietnamese Extension login layout.
- Keep Google login available where it already exists.
- Fix the login payload mismatch: the backend contract uses `login`, while the current form submits `email`.
- Add an internal-personnel password request screen reachable from “Là nhân sự nội bộ”.
- Only an active record in `internals` with a valid `@viettel.com.vn` email may receive a first password.
- Generate a random password, store only its bcrypt hash, and send the clear-text password once by SMTP.
- Add an `INTERNAL` user role and make its authorization behavior equivalent to `FREELANCER`.

## Architecture

`InternalEntity` will gain an optional one-to-one account link to `UserEntity`. The existing authentication pipeline remains the source of JWT and refresh tokens. The internal-password endpoint will locate the active internal record by normalized email, create or update its linked `INTERNAL` user account, generate a random password, and delegate delivery to the existing SMTP mail service.

The JWT guard will treat `INTERNAL` like `FREELANCER` for route restrictions. The frontend workspace will use the same restricted landing behavior and will not expose admin, HR, interviewer, or recruitment navigation to an internal account.

## User flows

### Standard login

1. User enters username/email and password.
2. Frontend submits `{ login, password }` to `/api/auth/login`.
3. On success, tokens are stored and the user is redirected to the appropriate restricted workspace.
4. On failure, both input borders become invalid and the message “Thông tin đăng nhập không hợp lệ. Vui lòng kiểm tra lại.” is shown below the password field.

### First-time internal password

1. User selects “Là nhân sự nội bộ”.
2. The login form changes to “Lấy mật khẩu Extension”.
3. User enters an internal email.
4. Backend validates the email format and looks up an active `InternalEntity`; inactive or unknown emails are rejected.
5. Backend generates a cryptographically random password, stores its bcrypt hash on the linked `INTERNAL` user, and sends the password through the configured SMTP service.
6. Frontend shows a success message instructing the user to check email, without exposing the password in the API response.
7. “Hủy” returns to the login form.

## Authorization

- `INTERNAL` is a separate role in shared types and database enum metadata.
- `INTERNAL` is allowed wherever `FREELANCER` is allowed by the JWT guard.
- `INTERNAL` is denied access to the interviewer/admin/HR workspace and management APIs.
- Internal account lookup is based on the linked internal record, not merely on an arbitrary email domain.

## Error handling and security

- Normalize email by trimming and lowercasing before lookup.
- Require the existing internal-email rule (`@viettel.com.vn`).
- Never return the generated password or password hash.
- Revoke existing refresh tokens for the internal user before issuing a new password, preventing the old session from remaining active.
- Apply throttling to the password-request endpoint.
- Return a generic failure message for unknown/inactive internal emails to avoid unnecessary account enumeration.
- If SMTP is unavailable, do not persist the new password; return an error that the email could not be sent.

## UI details

- Vietnamese labels and copy matching the supplied screenshots.
- Username field label: “Tên đăng nhập”; internal field label: “Gmail nội bộ nhân sự”.
- Password visibility toggle, required markers, remember-password checkbox, “Quên mật khẩu”, and internal-mode link.
- Preserve the existing design system components and responsive layout rather than adding a separate UI framework.

## Verification

- Run the repository-required `pnpm typecheck` after each code change.
- Check backend and frontend hot-reload logs after each change.
- Exercise standard login, invalid login, internal password request, and internal restricted access using API calls and the browser.
- Do not run build, lint, or create/modify unit-test files, per repository instructions.
