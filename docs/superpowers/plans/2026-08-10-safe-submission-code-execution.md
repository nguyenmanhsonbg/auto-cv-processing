# Safe Submission Code Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Remove the unsafe in-process `node:vm` execution path while preserving JavaScript/TypeScript submission execution for interview test cases.

**Architecture:** Run each candidate submission in a separate Node child process. The backend sends a generated wrapper through stdin, while the child runs with Node's permission model, disabled string code generation, a heap limit, a timeout, minimal environment variables, hidden process/module globals, and a bounded console output. The backend continues to own test-case iteration and result persistence.

**Tech Stack:** NestJS, TypeScript, Node.js 22+, `child_process.spawn`, pnpm, SonarQube TypeScript analyzer.

## Global Constraints

- Use pnpm only.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Do not run build or lint commands.
- Do not launch the already-running backend or frontend applications.
- Run `pnpm typecheck` after every code change and inspect the applicable runtime logs.
- Do not use Git commands.
- Keep the existing submission API, statuses, console output format, and `INPUT` contract.
- Do not change SonarQube Quality Gate thresholds or exclude source files to hide the issue.

---

### Task 1: Add the isolated submission runner

**Files:**
- Create: `apps/backend/src/submissions/sandbox-runner.ts`

**Interfaces:**
- Consumes: candidate `code`, one test-case `input`, and the existing 5-second timeout.
- Produces: `Promise<string>` containing the trimmed captured console output, or rejects with a runtime/timeout/security error.

- [ ] **Step 1: Implement the wrapper source without `node:vm`**

Create `runInSandbox(code, input, timeoutMs)` that starts `process.execPath` with `--permission`, `--disallow-code-generation-from-strings`, `--disable-proto=throw`, `--max-old-space-size=64`, and `--input-type=commonjs`. Pass only `NODE_ENV=sandbox` in the child environment and send the wrapper source through stdin.

The wrapper must define `INPUT`, capture `console.log/error/warn` using the existing space-joined string behavior, cap captured output at 64 KiB, and hide `process`, `require`, `module`, `exports`, `__filename`, `__dirname`, `fetch`, `WebSocket`, and `Buffer` from candidate code before evaluating the candidate source as the child script.

- [ ] **Step 2: Handle process lifecycle and limits**

Reject on spawn failure, non-zero exit, malformed result, stdin failure, output overflow, and timeout. Kill the child on timeout or output overflow. Resolve only when the child emits the expected result payload.

### Task 2: Replace the vulnerable execution path

**Files:**
- Modify: `apps/backend/src/submissions/submissions.service.ts:1-72`

**Interfaces:**
- Consumes: `runInSandbox` from Task 1.
- Produces: The existing `runCode()` behavior with the same test-case result/status persistence and WebSocket event.

- [ ] **Step 1: Remove the `node:vm` import and local wrapper/VM implementation**

Import `runInSandbox` from `./sandbox-runner` and leave the caller in `runCode()` unchanged so each test case still receives `wrapCode` semantics through the runner's `INPUT` wrapper.

- [ ] **Step 2: Preserve existing result semantics**

Keep `PASSED`, `PARTIAL`, `FAILED`, runtime measurement, error capture, and `code:execution_completed` emission unchanged. Do not modify unrelated submission or session behavior.

### Task 3: Verify behavior and SonarQube result

**Files:**
- Read: `apps/backend/dev.log`
- Read: `apps/frontend/dev.log`
- Read: `sonar-project.properties`
- Read: SonarQube issue list for project `auto-cv-processing`

**Interfaces:**
- Consumes: The modified runner and existing running services.
- Produces: Evidence that the unsafe `vm.runInContext` issue is gone and normal code execution still works.

- [ ] **Step 1: Run typecheck and inspect runtime logs**

Run `pnpm typecheck`, then inspect the backend and frontend log tails. Do not run build or lint.

- [ ] **Step 2: Run local runner smoke checks**

Execute a benign submission that logs `INPUT` and a blocked submission that attempts `process.version`, `require('fs')`, and `eval('1 + 1')`. Confirm the benign case returns output and the blocked cases do not expose host capabilities.

- [ ] **Step 3: Run API/browser smoke checks**

Use the existing running backend/frontend endpoints to confirm they remain reachable. If a valid candidate session/test-case is available, submit JavaScript through `/api/sessions/access/:token/submissions` and poll its result; otherwise report the missing fixture without fabricating IDs.

- [ ] **Step 4: Re-run SonarScanner**

Run the repository's existing Docker scanner command with the user's active token. Confirm `EXECUTION SUCCESS`, refresh the issue list, and verify that rule `typescript:S1523` at `apps/backend/src/submissions/submissions.service.ts:56` is no longer open. The user will manually change the issue status to `Fixed` after reviewing the behavior.

