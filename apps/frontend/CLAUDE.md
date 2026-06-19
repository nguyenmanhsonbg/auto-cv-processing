# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context

This is the React frontend for the VCS Interview Assistant — a monorepo app that automates interview evaluation workflows. The root-level `CLAUDE.md` covers the full monorepo; this file adds frontend-specific details.

## Commands

```bash
pnpm dev          # Dev server on port 4000
pnpm build        # tsc -b && vite build
pnpm start        # Preview production build on port 3003
pnpm lint         # ESLint on .ts/.tsx files
pnpm typecheck    # Type-check without emitting
```

## Architecture

### Routing & Layouts

Routes are defined in `src/app/routes.tsx`. Two layout branches:
- **InterviewerLayout** (`src/app/layouts/InterviewerLayout.tsx`) — sidebar nav, wraps all `/interviewer/*` pages, guards with `AuthProvider`
- **CandidateLayout** (`src/app/layouts/CandidateLayout.tsx`) — minimal header, used for `/session/:token` candidate-facing pages

Authentication is in `src/lib/auth-context.tsx`: token stored in `localStorage`, validated via `/auth/me` on mount, user injected via context.

### API & WebSocket Clients

- **`src/lib/api-client.ts`** — singleton HTTP client. Automatically injects Bearer token. Call `apiClient.setToken(token)` after login. Methods: `get`, `post`, `put`, `patch`, `delete`, `upload`, `downloadBlob`.
- **`src/lib/socket.ts`** — singleton socket.io-client. Manual connect/disconnect. Use `getSocket()`, `joinSession(sessionId)`, `disconnectSocket()`. Socket events are typed via `@interview-assistant/shared`.

Vite proxies `/api` and `/socket.io` to `http://127.0.0.1:3002` in dev.

### State Management

No Redux/Zustand — React hooks only. Standard fetch pattern:
```typescript
const fetchData = useCallback(async () => {
  try {
    const data = await apiClient.get<T>('/endpoint');
    setState(data);
  } catch (err) {
    // handle error
  } finally {
    setLoading(false);
  }
}, [deps]);

useEffect(() => { fetchData(); }, [fetchData]);
```

### Component Structure

- **`src/components/ui/`** — shadcn/ui primitives (Button, Card, Dialog, etc.). Don't modify these manually; use the shadcn CLI to add new ones.
- **`src/components/interview/`** — domain components for interview flow: `QuestionTree`, `ArchitectureEditor`/`Viewer`, `AnswerReview`, `CandidateMirror`, `CategoryRatings`, `ControlPanel`.
- **`src/pages/`** — page components organized by role: `auth/`, `candidate/`, `interviewer/`.
- **`src/lib/utils.ts`** — exports `cn()` for merging Tailwind classes (wraps `clsx` + `tailwind-merge`).

### Forms

React Hook Form + Zod everywhere. Pattern: define a `z.object(...)` schema, pass `zodResolver(schema)` to `useForm`.

## Key Conventions

- Import alias `@/` maps to `./src/`
- Shared types/events come from `@interview-assistant/shared` — rebuild shared after type changes: `pnpm --filter @interview-assistant/shared build`
- Tailwind colors are CSS variables (`--primary`, `--destructive`, etc.) defined in `src/app/globals.css`
- Toast notifications via `useToast()` from `src/components/ui/use-toast.ts`
- No test runner configured — rely on TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`)
