# CV Stage HR Reminders Implementation Plan

**Goal:** Track AMIS candidate stage dwell time and send at most two grouped reminder emails to the responsible HR.

**Architecture:** Extend the existing AMIS stage-sync path to persist a durable candidate-stage reminder record. A backend scheduler scans due records every minute, groups them by mapped HR and reminder phase, waits within a one-minute batching window, sends one SMTP digest per group, and records delivery timestamps idempotently.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, `node-cron`, existing `MailService`/Nodemailer, existing browser-extension AMIS stage events.

## Global Constraints

- Use the existing `MailService` and `MAIL_*` environment variables.
- First reminder threshold is 2 minutes from the received stage-transition event; second threshold is 4 minutes from the same event.
- Batch due records by HR and reminder phase in a one-minute window; never send one email per candidate.
- No candidate email notifications in this task.
- No stage exclusions.
- A stage change closes the old reminder cycle and starts a new one.
- Do not change unrelated Facebook, JD, question-set, or extension posting flows.
- Do not create or modify test files; use typecheck, API smoke tests, browser tests, and controlled database/API verification.

---

### Task 1: Persist AMIS-HR mappings and candidate-stage reminder state

**Files:**
- Create: `apps/backend/src/extension-integration/entities/amis-hr-mapping.entity.ts`
- Create: `apps/backend/src/extension-integration/entities/amis-application-stage-reminder.entity.ts`
- Modify: `apps/backend/src/extension-integration/entities/index.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.module.ts`
- Create: `apps/backend/src/migrations/1785000000000-CreateAmisHrStageReminderTables.ts`

**Interfaces:**
- `AmisHrMappingEntity`: unique AMIS personnel/account ID, name, linked internal HR user, email snapshot, active flag, timestamps.
- `AmisApplicationStageReminderEntity`: application, AMIS recruitment/candidate IDs, stage ID/name, `stageEnteredAt`, HR mapping/email snapshot, first/second sent timestamps, error metadata, timestamps.
- Unique reminder cycle key: application + AMIS stage ID + stage entry timestamp.

- [ ] Add indexes for due scans and unique AMIS account mapping.
- [ ] Register both entities in TypeORM auto-load and the extension integration module.
- [ ] Add a production migration using the repo's TypeORM migration style; development synchronization remains controlled by the existing environment.

### Task 2: Capture stage entry and responsible HR

**Files:**
- Modify: `apps/backend/src/extension-integration/dto/update-amis-application-stage.dto.ts`
- Modify: `apps/extension/src/api-client.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.controller.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.service.ts`
- Modify: `apps/backend/src/extension-integration/dto/sync-amis-applications.dto.ts`
- Modify: `apps/extension/src/types.ts` only if the existing stage payload needs a transport field.

**Interfaces:**
- Stage update persists the existing `pageUrl` as the AMIS candidate link without changing the current stage-sync response contract.
- Existing AMIS source fields `attractivePersonnelId`/`attractivePersonnelName` identify the responsible AMIS account/personnel.
- Mapping resolution order: active AMIS mapping by personnel ID; candidate assignee if the internal application already has an explicit assignee; otherwise the job posting creator. Never use the candidate email.

- [ ] Pass the existing stage page URL through the backend so reminder emails can link to the candidate screen.
- [ ] On AMIS application sync, upsert the AMIS personnel name/ID association to the authenticated internal HR only when the source has a personnel ID and the current actor is the corresponding AMIS account context; do not overwrite an active mapping with a different HR silently.
- [ ] On stage update, load the existing AMIS application source and compare the stored stage ID before creating/resetting a reminder cycle.
- [ ] Ignore duplicate same-stage events so `stageEnteredAt` is not reset.
- [ ] On a new stage, close the previous cycle and create one new reminder record with `stageEnteredAt` set to the event receipt time.
- [ ] Preserve current AMIS application synchronization and response behavior.

### Task 3: Implement grouped reminder delivery

**Files:**
- Create: `apps/backend/src/notification/cv-stage-reminder.service.ts`
- Modify: `apps/backend/src/notification/notification.module.ts`
- Modify: `apps/backend/src/notification/scheduler.service.ts`
- Modify: `apps/backend/src/notification/mail.service.ts` only if a reusable digest helper is required.

**Interfaces:**
- `CvStageReminderService.processDueReminders(now?: Date): Promise<void>` scans due stage records and sends grouped digests.
- `CvStageReminderService.recordStageTransition(...)` owns creation/reset of a reminder cycle.

- [ ] Read thresholds from config with defaults `2` and `4` minutes and batch window default `1` minute.
- [ ] Scan once per minute; only first reminders at elapsed >= 2 minutes and second reminders at elapsed >= 4 minutes are eligible.
- [ ] Group records by HR email and reminder phase across all JDs.
- [ ] Send one email for each HR/phase group containing candidate name, JD title, stage, elapsed wait, stage-entry time, and AMIS link.
- [ ] Mark each item sent only after a successful SMTP send; persist failure metadata and keep retries observable.
- [ ] Ensure the same record cannot be delivered twice for the same phase during repeated scheduler runs.
- [ ] Do not send a second reminder for a stage that has already changed.
- [ ] If mapping is missing or SMTP is disabled, skip safely and log a clear operational reason without crashing the scheduler.
- [ ] Keep existing interview scheduler behavior unchanged.

### Task 4: Configuration and verification

**Files:**
- Modify: `apps/backend/.env.example` only; never modify or commit the real `.env` secret values.

- [ ] Add documented config keys for first threshold, second threshold, batch window, and scheduler interval.
- [ ] Run `pnpm typecheck` and inspect backend/frontend logs after each code change.
- [ ] API-test existing AMIS sync and stage-update endpoints with controlled payloads; verify duplicate events do not reset the timestamp and new stages reset it.
- [ ] Verify the database contains one reminder cycle per candidate-stage and per-phase delivery timestamps.
- [ ] Verify a multi-JD, multi-candidate batch for one HR produces one digest email with all due rows.
- [ ] Verify a different HR receives a separate digest.
- [ ] Verify first and second reminders are sent at 2/4-minute thresholds and never a third time.
- [ ] Verify stage changes prevent old-cycle delivery.
- [ ] Browser-test the existing AMIS page and Extension stage transition flow using the already-open Chrome only if direct browser interaction is needed.
- [ ] Run API smoke test against `http://localhost:3002` and browser smoke test against `http://localhost:4000`.
