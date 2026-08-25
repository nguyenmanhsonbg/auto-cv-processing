# Candidate Interview Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved round-based candidate interview evaluation flow in the existing recruitment application while preserving all unrelated candidate-card and recruitment behavior.

**Architecture:** Add a separate candidate-evaluation domain alongside the existing session-based evaluations. Store one case per application/JD, one round per reached interview stage, and one private review per assigned evaluator. Expose permission-checked APIs and a dedicated frontend evaluation route. Extend the existing candidate card only with a contextual evaluation block and confirmation dialog.

**Tech Stack:** NestJS, TypeORM, PostgreSQL JSONB, React, TypeScript, React Router, existing shared types, existing UI primitives, pnpm.

**Spec:** [2026-08-24-candidate-interview-evaluation-design.md](../specs/2026-08-24-candidate-interview-evaluation-design.md)

## Global Constraints

- Preserve the existing session-based `evaluations` module and existing card metrics.
- Do not modify unrelated recruitment flows.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Use `BadRequestException` for invalid requests and forbidden/not-owned records.
- Use immutable DTO inputs and explicit backend authorization checks.
- Follow `docs/sonarqube-code-checklist.md`; do not edit Sonar configuration or suppress findings.
- Use existing pnpm scripts only; do not run build or lint.

## Tasks

- [ ] Inspect application stages, candidate-card components, route registration, current user/role context, and TypeORM migration loading before source changes.
- [ ] Add shared evaluation-case, round, review, permission, template, and status types without changing existing evaluation types.
- [ ] Add candidate-evaluation entities, DTOs, service, controller, and module. Enforce application/JD scope, assigned-review scope, lifecycle transitions, private peer-review visibility, revision/audit history, and structured BM04 sections.
- [ ] Register the module and add the production migration without touching the existing `evaluations` tables.
- [ ] Add frontend API types and calls for summary, case/round detail, draft save, review submit, aggregate, complete, and next-round transition.
- [ ] Extend the existing candidate card with the approved evaluation block and contextual action labels. Keep current tiles, labels, AI state, and unrelated actions unchanged.
- [ ] Add the confirmation dialog and dedicated full-page evaluation view with BM04 section navigation, HRBP/HĐCM separation, autosave indicator, role-aware controls, and sticky actions.
- [ ] Verify type safety after each source change, inspect running app logs, run backend/API and frontend/browser smoke checks, run Sonar analysis where credentials are available, and report any external verification limitation explicitly.
