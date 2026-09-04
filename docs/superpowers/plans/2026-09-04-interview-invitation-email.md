# Automatic Interview Invitation Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one scheduled, idempotent and professional invitation email when an AMIS application enters an interview round.

**Architecture:** Reuse the existing `AmisRecruitmentRoundEntity`, `CandidateStageNotificationService`, notification table and `MailService`. Add a focused schedule policy service and invitation-specific persisted schedule fields; keep AMIS synchronization responsible only for transition detection and enqueueing.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, Nodemailer, EJS, node-cron, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-04-interview-invitation-email.md`

## Global Constraints

- Preserve the current AMIS round discovery and synchronization contract.
- Use existing SMTP environment variables; do not copy credentials into source, logs or templates.
- Use stable `applicationId + amisRecruitmentId + amisRecruitmentRoundId` idempotency.
- Use `Asia/Ho_Chi_Minh`, next Monday-Friday working day, 09:30 start and 60-minute duration by default.
- Do not invent meeting links, locations, recruiters, interviewers or contact details.
- Do not modify the legacy `/webhooks/amis` stage mapper or session/Telegram behavior.
- Do not create or modify test files because repository `AGENTS.md` prohibits test-file changes; run existing tests and report this limitation.

---

### Task 1: Add isolated interview schedule policy

**Files:**
- Create: `apps/backend/src/notification/interview-schedule.service.ts`
- Modify: `apps/backend/src/notification/notification.module.ts`
- Modify: `apps/backend/.env.example`

**Interfaces:**
- Produces `InterviewScheduleService.buildSchedule(transitionedAt: Date): InterviewSchedule` with `startsAt`, `endsAt`, `timezone`, `durationMinutes`.
- Reads `INTERVIEW_DEFAULT_HOUR`, `INTERVIEW_DEFAULT_MINUTE`, `INTERVIEW_DURATION_MINUTES`, `INTERVIEW_TIMEZONE` using the existing `ConfigService` convention.

- [ ] **Step 1: Define schedule output and date policy.**

  Use a small typed service. Convert the transition instant into the configured timezone with `Intl.DateTimeFormat` parts, choose the following local calendar date, skip Saturday/Sunday, set configured local hour/minute, and convert the local wall-clock time back to a UTC `Date`. Return the end instant by adding the configured duration in minutes.

- [ ] **Step 2: Register the service and defaults.**

  Add the provider to `NotificationModule` and append the four empty/default environment entries to `.env.example`. Do not add a new dependency.

- [ ] **Step 3: Validate the production code statically.**

  Run `pnpm typecheck`. Expected: no new errors from the schedule service or module registration. Inspect `apps/backend/dev.log` for a clean hot-reload.

### Task 2: Persist invitation schedule fields without changing the idempotency key

**Files:**
- Modify: `apps/backend/src/notification/entities/amis-candidate-stage-notification.entity.ts`
- Create: `apps/backend/src/migrations/1786800000000-AddInterviewInvitationSchedule.ts`

**Interfaces:**
- The existing notification entity gains nullable `interviewScheduledAt`, `interviewEndsAt`, `interviewTimezone` and `interviewDurationMinutes` fields.
- Existing `status`, retry fields and the unique `(applicationId, amisRecruitmentId, amisRecruitmentRoundId)` constraint remain unchanged.

- [ ] **Step 1: Add nullable TypeORM columns.**

  Map start/end to `timestamptz`, timezone to `varchar`, and duration to `integer`, all nullable so existing notification rows remain readable.

- [ ] **Step 2: Add an additive migration.**

  Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for the four snake_case columns. In `down`, drop only these four columns with `DROP COLUMN IF EXISTS`; do not drop the notification table or unique constraint.

- [ ] **Step 3: Validate the entity/migration types.**

  Run `pnpm typecheck` and inspect backend runtime logs. Do not run migration commands unless explicitly requested; local development uses the configured TypeORM synchronization policy.

### Task 3: Detect interview entry and enqueue an invitation

**Files:**
- Modify: `apps/backend/src/notification/candidate-stage-notification.service.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.service.ts`

**Interfaces:**
- `CandidateStageNotificationService.enqueueForInterviewTransition(input)` accepts application/recruitment/candidate/round IDs and names plus `transitionedAt`, schedule and optional real interview metadata.
- `enqueueForInterviewTransition` computes and persists the temporary schedule; the existing generic `enqueueForStageTransition` path remains for non-interview status updates and cannot create an invitation.

- [ ] **Step 1: Resolve previous/current round types using persisted AMIS round metadata.**

  In `updateAmisApplicationStage`, retain the old `rawPayload.recruitmentRoundId` before overwriting it. Resolve the previous round from `AmisRecruitmentRoundEntity`; resolve the current round from the already loaded `recruitmentRound`/round metadata. Treat the transition as eligible only when the previous round is absent or non-interview and the current round type is `AMIS_INTERVIEW_ROUND_TYPE`.

- [ ] **Step 2: Keep stage persistence independent from mail delivery.**

  Save the updated AMIS source first. Then call the invitation enqueue method only inside the existing `dto.isTransitionEvent === true` branch. Catch/log enqueue errors at the notification boundary so the successful AMIS update response is preserved.

- [ ] **Step 3: Make enqueue idempotent.**

  Query by the existing application/recruitment/round tuple before insert, keep the unique constraint as the race-safe backstop, compute the schedule once from `changedAt` or the current transition time, and persist `PENDING` only when the candidate email passes the existing validation. Persist `SKIPPED_NO_EMAIL` with a clear error when it does not.

- [ ] **Step 4: Validate the transition path.**

  Run `pnpm typecheck`, inspect backend logs, and use the existing backend API smoke path to verify a non-transition update does not enqueue and a transition update returns the same AMIS update contract.

### Task 4: Render and send the professional invitation email

**Files:**
- Modify: `apps/backend/src/notification/candidate-stage-notification.service.ts`
- Create: `apps/backend/src/notification/templates/interview-invitation-email.ejs`

**Interfaces:**
- The existing `processNotification` sends the invitation through `MailService.sendMail(to, subject, html, text)` and updates `SENT`/`FAILED` using the existing retry fields.

- [ ] **Step 1: Build the subject and preheader from configured brand and real job data.**

  Use `[VCS] Thư mời phỏng vấn – <Job Title>` when no separate company-name configuration exists, centralize the fallback in one helper, and use the persisted round/schedule values.

- [ ] **Step 2: Add a dedicated invitation template without changing the generic stage template.**

  Render escaped candidate name, job title, round name, local date/time, end time, timezone and a scan-friendly interview information card. Add a hidden preheader, mobile-safe table/container structure, Arial/Helvetica fallbacks and plain-text parity. Keep existing generic stage notifications on their current template; render optional real fields only when present.

- [ ] **Step 3: Keep retry and error semantics explicit.**

  On `MailService` false/throw, update `FAILED`, `lastError`, retry timestamp and attempt count; on success update `SENT` and `sentAt`. Include application, candidate, round and schedule context in logs without credentials/tokens.

- [ ] **Step 4: Validate email source and template safety.**

  Run `pnpm typecheck`, inspect logs, and manually exercise one notification with a candidate/job/round containing HTML-sensitive characters through the existing API/test data path. Confirm the template contains both text and HTML arguments and no raw dynamic value is interpolated without escaping.

### Task 5: Verify end-to-end behavior and regression boundaries

**Files:**
- No test-file changes permitted by repository policy.

- [ ] **Step 1: Run existing relevant tests.**

  Run the existing backend test command filtered to notification/extension-integration tests without creating or modifying `*.spec.ts`/`*.test.ts`. Record any pre-existing failures separately.

- [ ] **Step 2: Run required static/runtime checks.**

  Run `pnpm typecheck`; inspect `apps/backend/dev.log`; run an authenticated API smoke check against `http://localhost:3002` and a browser/extension smoke check against the running application without launching a new server or building the apps.

- [ ] **Step 3: Verify the acceptance matrix manually/API-level.**

  Check: non-interview transition sends none; non-interview → interview sends one; duplicate same-round sync sends none; interview 1 → interview 2 creates one new record; missing email skips without AMIS failure; SMTP failure becomes retryable; Monday-Thursday schedule next workday at 09:30; Friday schedule Monday at 09:30; HTML/text include all interview fields.

- [ ] **Step 4: Report limitations precisely.**

  Report changed files, final flow, commands and outputs, SMTP configuration requirement, and the repository restriction that prevented adding the requested automated test files.
