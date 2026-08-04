# AMIS Fetch Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the extension's AMIS instrumentation from interfering with non-AMIS requests such as Sentry while preserving all existing AMIS capture features.

**Architecture:** Remove the duplicate MAIN-world page hook declaration. Consolidate fetch interception so one wrapper delegates every request to the native fetch and only clones/inspects responses for the three supported AMIS API families. Non-AMIS requests return immediately without body inspection or response cloning.

**Tech Stack:** Chrome Extension Manifest V3, TypeScript, Vite, existing extension test/build scripts.

## Global Constraints

- Preserve SaveRecruitment capture, candidate stage capture, recruitment rounds capture, and job status capture.
- Do not alter request URL, headers, body, response, or timing for non-AMIS requests.
- Verify with the extension's available test and build commands.

### Task 1: Remove duplicate page-hook registration

**Files:**
- Modify: `apps/extension/public/manifest.json:30-56`

- [ ] Remove the second `assets/amis-page-hook.js` content-script entry while retaining the source-column and bridge entries.
- [ ] Validate the manifest remains valid JSON.

### Task 2: Consolidate fetch interception

**Files:**
- Modify: `apps/extension/src/amis-page-hook.ts:174-290`

- [ ] Preserve the existing response parsing and postMessage behavior for candidate stages, recruitment rounds, and job status.
- [ ] Replace the three independently nested `window.fetch` wrappers with one wrapper that calls the captured native fetch exactly once.
- [ ] Return non-matching responses without cloning or reading them.
- [ ] Keep request-body reading limited to the candidate update-round endpoint, and only after the request has been identified as matching.

### Task 3: Verify behavior

**Files:**
- Inspect: extension package scripts and existing tests.

- [ ] Run targeted tests covering the extension page hook or related mappers, if available.
- [ ] Run the extension build/typecheck command.
- [ ] Inspect the final diff and confirm no unrelated user changes were overwritten.

