# VCS Portal Traffic Source Design

## Goal

When the VCS Portal apply webhook includes `payload.traffic_source`, store the exact application recruitment channel derived from that value instead of always storing `VCS_PORTAL`.

## Requirements

- Keep `payload.source = "vcs_portal"` as the webhook source system validation.
- Treat `payload.traffic_source` as the recruitment channel for the application.
- Map known values to `RecruitmentChannel`: `facebook`, `topcv`, `itviec`, `vietnamworks`, `linkedin`, `vcs_portal`, `manual`, and `other`.
- If `traffic_source` is absent, keep the existing fallback `VCS_PORTAL`.
- If `traffic_source` is present but not recognized, fallback to `OTHER`.
- Store the normalized traffic source and resolved channel in raw payload metadata for audit.
- Return the traffic source and resolved channel in webhook response metadata.

## Design

`VcsPortalApplyWebhookService` will normalize `traffic_source` during payload parsing. The normalized payload will carry both the raw normalized text and the resolved `RecruitmentChannel`.

The webhook handler will pass the resolved channel into `ApplicationsService.createFromWebhook`, which already persists the value to `applications.sourceChannel` and `application_sources.channel`. No database schema change is needed.

## Verification

Because repository instructions prohibit creating or modifying unit test files, verification will use:

- `pnpm typecheck`
- backend hot-reload log inspection
- API smoke test against the webhook route
- browser smoke test against the already-running frontend
