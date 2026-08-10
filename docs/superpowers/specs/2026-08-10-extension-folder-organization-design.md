# Extension Folder Organization

## Goal

Reduce the flat `apps/extension/src` structure by grouping entrypoints, shared UI primitives, domain features, integrations, stores, API infrastructure, and types without changing runtime behavior.

## Target boundaries

- `src/app/`: extension entrypoints and composition roots (`side-panel`, `popup`, `background`, global styles).
- `src/components/`: reusable presentational UI primitives with no business-domain ownership.
- `src/features/referrals/`: shared Freelancer/Internal referral management and referral-specific components/utilities.
- `src/features/freelancer/`: freelancer self-service UI, including `FreelancerCvPanel`.
- `src/features/recruitment/`: recruitment posting, CV, questions, and application features.
- `src/features/facebook/`: Facebook publishing, groups, accounts, drafts, and related orchestration.
- `src/integrations/amis/`: AMIS bridge, extractors, hooks, mappers, capture, and page integration.
- `src/stores/`: browser/session/local persistence modules shared by features.
- `src/lib/`: API client, configuration, mock/infrastructure helpers.
- `src/types/`: shared extension TypeScript contracts.

## Migration rules

- Move files in cohesive batches and update relative imports after each batch.
- Do not change exported function signatures or runtime behavior.
- Keep test files untouched and do not add tests.
- Keep Vite entrypoint paths working by updating input paths only if an entrypoint moves.
- Use the existing `@/` alias for imports from `src` where it improves readability.
- The generic `components/` folder must remain free of API calls and domain state.

## Verification

- Run `pnpm typecheck` after each migration batch.
- Inspect `apps/backend/dev.log` and `apps/frontend/dev.log` when available.
- Confirm Vite input files and extension manifest references still resolve without running a build.
