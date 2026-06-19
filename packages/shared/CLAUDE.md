# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Purpose

`@interview-assistant/shared` is a pure TypeScript types package — no runtime dependencies, no logic. It is the single source of truth for all shared interfaces, enums, and constants used by both the NestJS backend and the React frontend.

## Commands

```bash
# Build (must run after any type change)
pnpm build          # tsc -p tsconfig.json

# Watch mode during development
pnpm dev            # tsc --watch

# Clean build artifacts
pnpm clean          # rm -rf dist
```

After modifying any file here, consumers (backend/frontend) need a rebuild. From the monorepo root:
```bash
pnpm --filter @interview-assistant/shared build
```

## Architecture

All types live in `src/types/` and are re-exported from `src/index.ts`. Each file owns a domain:

| File | Domain |
|------|--------|
| `user.ts` | `UserRole` enum, `User` interface |
| `candidate.ts` | Candidate profiles, VCS signals, parsed resume data, `CandidateLevel` |
| `question.ts` | Question bank — `QuestionCategory`, `QuestionType`, subcategory constants, `ArchitectureAnswer` |
| `session.ts` | `InterviewSession`, `SessionQuestion`, `SessionStatus` lifecycle |
| `evaluation.ts` | `Evaluation`, `HrEvaluation`, `TechnicalRating`, ratings (1–4), `OverallResult`, AI suggestions |
| `submission.ts` | `CodeSubmission`, `TestCaseResult`, `SubmissionStatus` |
| `websocket-events.ts` | `WebSocketEvents` enum — all Socket.io event names |

## Key Domain Concepts

**Rating scale (1–4)** maps to BM04 Excel template cells:
- 1 = Không đạt
- 2 = Hiểu/Biết khái niệm
- 3 = Đã triển khai thực tế
- 4 = Có khả năng giải quyết

**Question subcategories** in `question.ts` (`SUBCATEGORIES` constant) are the canonical list used to generate BM04 template sections. Adding a subcategory here affects both question creation UI and evaluation form.

**`VcsSignals`** in `candidate.ts` encodes VCS-specific screening logic (university prestige, company type classification, technical depth signals). The `companyType` field uses the enum `PRODUCT | OUTSOURCE | STARTUP | ENTERPRISE`.

**`WebSocketEvents`** enum is the contract between the backend Socket.io gateway and frontend socket hooks. Both sides import from this package — never hardcode event strings elsewhere.

## Output

Compiled output goes to `dist/`. Each source file produces `.js`, `.js.map`, `.d.ts`, and `.d.ts.map`. The package is consumed via `dist/index.js` and `dist/index.d.ts` (configured in `package.json` `main` and `types` fields).
