# Plan: AMIS account binding for interview evaluations

## Implementation steps

1. Capture the current AMIS identity from page-owned storage/global identity
   data, and return it with the board-member bridge response.
2. Persist the identity context in the evaluation handoff and access token.
3. Validate local account mapping, current AMIS recruitment and active board
   membership in Extension application listing and evaluation APIs.
4. Replace the legacy committee inbox/reviewer-only application filter with the
   dynamic AMIS interview-or-later filter, while retaining reviewer assignment
   enforcement for form editing.
5. Pass context through the Extension handoff and remove the committee-only
   legacy assignment fetch from the side panel.
6. Run `pnpm typecheck` and runtime log checks after each source patch, then run
   API and browser/extension smoke checks. Do not create or modify test files,
   run builds, lint, or launch the already-running applications.

## Acceptance checks

- Exact mapped AMIS account + board membership: committee applications and form
  are visible.
- AMIS HR + committee Extension account, or a different committee account:
  access is denied and no candidate data is returned.
- Non-board committee account: access is denied.
- Screening/pre-interview candidate: hidden from committee.
- Interview and later candidate: visible to the matching committee account.
- Handoff opens the same evaluation case with the context-bound account.
- HR/Admin existing routes and unrelated tabs continue to typecheck and reload.
