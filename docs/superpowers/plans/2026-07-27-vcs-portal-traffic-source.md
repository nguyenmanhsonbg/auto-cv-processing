# VCS Portal Traffic Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the recruitment source from VCS Portal apply webhook `payload.traffic_source`.

**Architecture:** Normalize `traffic_source` inside `VcsPortalApplyWebhookService`, map it to the existing `RecruitmentChannel` enum, and pass the result into the existing application creation path. Store trace fields in raw payload and response metadata.

**Tech Stack:** NestJS, TypeScript, TypeORM, existing `RecruitmentChannel` enum.

## Global Constraints

- Use pnpm only.
- Never create or modify `*.spec.ts` or `*.test.ts` files.
- Never run build, lint, or git commands.
- Run `pnpm typecheck` after code changes.
- Check `apps/backend/dev.log` after backend changes.
- Test with API and browser smoke checks after code changes.

---

### Task 1: Normalize Webhook Traffic Source

**Files:**
- Modify: `apps/backend/src/vcs-portal-webhooks/vcs-portal-apply-webhook.service.ts`

**Interfaces:**
- Consumes: `payload.traffic_source` from webhook JSON.
- Produces: `trafficSource: string | null` and `sourceChannel: RecruitmentChannel`.

- [ ] **Step 1: Add normalized fields**

Extend `NormalizedVcsPortalApplyPayload`:

```ts
trafficSource: string | null;
sourceChannel: RecruitmentChannel;
```

- [ ] **Step 2: Add mapper**

Add a private method:

```ts
private resolveTrafficSourceChannel(value: unknown) {
  const normalized = this.optionalText(value)?.toLowerCase().replace(/[\s-]+/g, '_') ?? null;
  if (!normalized) return { trafficSource: null, sourceChannel: RecruitmentChannel.VCS_PORTAL };

  const channelByTrafficSource: Record<string, RecruitmentChannel> = {
    vcs_portal: RecruitmentChannel.VCS_PORTAL,
    facebook: RecruitmentChannel.FACEBOOK,
    topcv: RecruitmentChannel.TOPCV,
    itviec: RecruitmentChannel.ITVIEC,
    it_viec: RecruitmentChannel.ITVIEC,
    vietnamworks: RecruitmentChannel.VIETNAMWORKS,
    vietnam_works: RecruitmentChannel.VIETNAMWORKS,
    linkedin: RecruitmentChannel.LINKEDIN,
    linked_in: RecruitmentChannel.LINKEDIN,
    manual: RecruitmentChannel.MANUAL,
    other: RecruitmentChannel.OTHER,
  };

  return {
    trafficSource: normalized,
    sourceChannel: channelByTrafficSource[normalized] ?? RecruitmentChannel.OTHER,
  };
}
```

- [ ] **Step 3: Use resolved channel**

Call the mapper from `normalizePayload`, include the fields in the returned normalized payload, and pass `payload.sourceChannel` to `createFromWebhook`.

- [ ] **Step 4: Preserve audit trace**

Add `trafficSource` and `sourceChannel` to `toApplicationRawPayload` and webhook response `meta`.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm typecheck
Get-Content apps/backend/dev.log -Tail 20
```

Then perform API and browser smoke checks against the already-running services.
