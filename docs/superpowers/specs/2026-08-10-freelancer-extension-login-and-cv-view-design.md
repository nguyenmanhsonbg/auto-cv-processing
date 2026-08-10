# Freelancer Extension Login and CV View

## Goal

Allow freelancer accounts to sign in to the browser extension with their referral identifier as both username and default password. After sign-in, freelancers must see only a dedicated `CV của tôi` workspace that lists CV referrals belonging to the signed-in freelancer.

## Backend design

- Extend the existing `/api/auth/login` contract so the login field accepts either an existing user email or a freelancer identifier such as `FL000001`.
- Resolve identifier login through the freelancer profile, then verify the existing bcrypt password. Existing email/password login remains unchanged.
- Continue enforcing active freelancer status through the existing authentication check.
- Preserve the current JWT and refresh-token lifecycle.
- Keep freelancer authorization limited to `/api/freelancers/me/*` and `/api/auth/me`.

## Extension design

- Update the auth form to present a neutral `Mã giới thiệu hoặc email` login field, so HR/Admin email login remains understandable while freelancers can use their identifier.
- Branch the authenticated shell by role. Freelancer users render no HR tabs and receive one tab labeled `CV của tôi`.
- Add a standalone `FreelancerCvPanel` component. It owns its loading, filtering, pagination, note editing, CV preview/download, and notification behavior.
- Use existing self-service endpoints:
  - `GET /api/freelancers/me/summary`
  - `GET /api/freelancers/me/applications`
  - `PATCH /api/freelancers/me/applications/:referralId/evaluation`
  - `GET /api/freelancers/me/applications/:referralId/cv`
- The panel displays freelancer identity, total/processing/passed/pass-rate metrics, search, status/JD/date controls, application cards, current process status, assignee, referral date, editable freelancer note, and pagination.
- The current backend application endpoint does not expose a JD filter or date filter. The first implementation will use the returned page data for local presentation filters and retain server pagination; adding server-side filter parameters is out of scope for this change.

## Error handling and security

- Invalid credentials use the existing auth error path.
- Inactive freelancer accounts cannot authenticate.
- No password, JWT, refresh token, or raw CV content is logged.
- CV access remains authorized by the backend route scoped to the current freelancer.

## Verification

- Run `pnpm typecheck` after each code change.
- Check the relevant hot-reload log files after each code change.
- Exercise the auth and freelancer API routes with curl.
- Exercise the extension UI in the browser at port 4000.
- Do not create or modify `*.spec.ts` or `*.test.ts` files, per repository instructions.
