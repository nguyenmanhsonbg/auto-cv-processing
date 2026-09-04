# Automatic Interview Invitation Email

## Goal

Send one professional interview invitation email to a candidate when AMIS/HR transitions the application into an interview recruitment round, while preserving the existing AMIS synchronization behavior.

## Existing architecture

- `ExtensionIntegrationService.updateAmisApplicationStage` receives the current AMIS round and transition metadata from the extension.
- `AmisRecruitmentRoundEntity` stores the synced AMIS round name, stable AMIS round ID, sort order and round type. The existing interview-round convention uses round type `3`.
- `CandidateStageNotificationService` already provides a database-backed delivery record, unique key, retry status and access to `MailService`.
- `MailService` already sends through Nodemailer using `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS` and `MAIL_FROM` from the backend environment.
- `SchedulerService` runs every minute and already processes due candidate-stage notifications.
- The legacy `/webhooks/amis` path updates the old application stage only and is not used as the new invitation trigger because it has no persisted previous/current AMIS round metadata.

## Functional behavior

1. A notification is created only for a transition from a non-interview round to an interview round.
2. Repeated synchronization at the same interview round does not create or send another invitation.
3. A later transition from interview round 1 to interview round 2 creates a separate invitation for the second stable AMIS round ID.
4. A missing or invalid candidate email results in a skipped notification and a warning/log entry; it must not fail AMIS synchronization.
5. SMTP/provider failure marks the delivery failed and uses the existing retry mechanism without rolling back the stage update.
6. The temporary interview schedule is the next Monday-Friday working day after the transition timestamp, at 09:30 Asia/Ho_Chi_Minh, for 60 minutes. Friday transitions move to Monday. The policy is isolated behind a schedule service and configurable through `INTERVIEW_DEFAULT_HOUR`, `INTERVIEW_DEFAULT_MINUTE`, `INTERVIEW_DURATION_MINUTES` and `INTERVIEW_TIMEZONE`.
7. The invitation contains a subject, preheader, plain-text body and email-compatible responsive HTML. It includes candidate, job, interview round, start/end time and timezone. Real meeting, location, recruiter or contact data is shown only when already available; no synthetic values are generated.
8. Dynamic values are escaped before HTML rendering. Logs contain application/candidate/round identifiers, recipient, scheduled time, outcome and error, but never credentials or tokens.

## Data and idempotency

Reuse `amis_candidate_stage_notifications` and its unique `(application_id, amis_recruitment_id, amis_recruitment_round_id)` constraint. Add nullable schedule/invitation fields needed by the new template, preserving existing rows and delivery status values. The stable AMIS round ID, not a timestamp, is the idempotency key.

## Non-goals

- No HR scheduling UI.
- No candidate-selected slots, interviewer availability, calendar provider integration, rescheduling, cancellation, reminders, SMS or Zalo.
- No new AMIS API or rewrite of AMIS round discovery.
- No changes to the existing Telegram upcoming-interview notification or the session-creation workflow.

## Verification

Run typecheck, inspect backend runtime logs, run the existing relevant tests without modifying test files because the repository policy prohibits test-file changes, and run API/browser smoke checks. The required behavioral cases remain documented here for manual/API verification; adding or changing `*.spec.ts`/`*.test.ts` is intentionally deferred to the repository test owner.
