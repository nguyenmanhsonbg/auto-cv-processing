# Persistent Interview Evaluation Design

## Goal

Keep one interview-evaluation document per candidate application from the first interview through the end of recruitment. AMIS stage transitions update the active interview context and Extension label without discarding HRBP or HĐCM data from earlier stages.

## Current gap

The repository already enforces one `InterviewEvaluationCase` per application, but each evaluation round owns separate form data and the frontend renders only `currentRound`. AMIS stage events update the application stage but do not advance the evaluation document. Completed rounds are also locked, which conflicts with the requirement that authorized HR and assigned HĐCM reviewers can edit the document later.

## Design

1. Preserve the one-case-per-application invariant.
2. Treat evaluation rounds as internal stage snapshots/history of the same document, not separate user-facing forms.
3. Persist the AMIS round id, name, type, and sort order on every evaluation snapshot so the source of the active label is AMIS, not ECC/ACC/OFFER constants.
4. When an AMIS transition enters a `roundType = 3` interview round and an evaluation case already exists, create or activate the matching snapshot while copying the previous HRBP, HĐCM, aggregate, committee, and reviewer data. The previous snapshot remains available in the same case history.
5. When an AMIS transition enters a non-interview stage, keep the existing case visible in Extension and retain the latest interview context until the next interview transition.
6. Allow authorized reviewers/managers to save edits on existing snapshots after submission/completion. Keep optimistic version checks and audit entries; editing a submitted snapshot moves the relevant reviewer back to draft so the new content can be re-submitted.
7. Keep the current evaluation page as one document view with a stage-history selector. Selecting a history item loads that snapshot; the current AMIS interview snapshot is selected by default.
8. Keep access rules unchanged in principle: HR/Admin manage; HĐCM can view HRBP data and edit only when they are assigned reviewer and remain a member of the assigned committee.

## Event flow

AMIS `updateRound` -> page hook maps candidate and target round -> bridge/background relay -> side panel updates the visible application immediately -> side panel persists the AMIS application stage and synchronizes evaluation context when the target is an interview -> CandidateCard keeps the persistent case visible and uses the synchronized interview snapshot name -> frontend page reads the same case/history.

## Compatibility

- Existing legacy `roundKey` values remain readable for old cases.
- New snapshots use AMIS round ids as identity and keep `roundKey` only as a legacy/API compatibility field.
- Existing evaluation records are backfilled with nullable AMIS metadata; no unrelated recruitment data is changed.

## Verification

- Inline RED/GREEN assertions for stage snapshot identity, data carry-forward, non-interview visibility, and edit-after-completion behavior.
- `pnpm typecheck` for all packages.
- Read-only API smoke tests for HR and HĐCM access.
- Browser/extension smoke test for AMIS transition to interview and card label.
- SonarQube scan; report environment authentication failures honestly if the token is unavailable.
