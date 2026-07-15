# AI Screening Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Recruitment Phase 1 AI screening flow from enriched JD/profile inputs through AI screening, final recommendation, HR review, and post-approval interview AI.

**Architecture:** Keep orchestration inside `AiService` because prompt resolution and provider calls already live there. Add typed DTO-style interfaces for screening inputs/outputs, expose two public methods, and update prompt/docs seed text so the runtime and documentation describe the same flow.

**Tech Stack:** NestJS, TypeScript, Jest, ts-jest, YAML prompt seed.

## Global Constraints

- `enrich_job_description` remains external and maintained in a separate YAML file.
- `enrich_profile` receives JD runtime bindings: `JD_TARGET_ROLE`, `JD_MIN_YEARS`, `JD_MUST_HAVE_SKILLS`, `JD_ADVANCED_SKILLS`, `JD_TECH_CHALLENGES`.
- Recruitment Phase 1 flow is `enrich_job_description -> enrich_profile -> detect_profile_anomalies optional -> generate_survey_questions/form answers optional -> ai_screening -> final_screening_recommendation -> HR review`.
- Interview flow after HR approval is `suggest_questions` or `suggest_questions_from_survey -> suggest_next_question -> evaluate_session -> evaluation_summary`.
- AI outputs remain advisory; HR owns final decisions.

---

### Task 1: AI Screening Orchestration Methods

**Files:**
- Modify: `apps/backend/src/ai/ai.service.ts`
- Test: `apps/backend/src/ai/ai.service.spec.ts`
- Create: `apps/backend/jest.config.js`

**Interfaces:**
- Produces: `runRecruitmentPhase1AiScreening(input)` and `runFinalScreeningRecommendation(input)`
- Consumes: existing `getSystemPrompt`, `callClaude`, and `extractJson` internals.

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails because methods are missing**
- [x] **Step 3: Implement public methods and local interfaces**
- [x] **Step 4: Run test to verify it passes**

### Task 2: Prompt And Documentation Flow Alignment

**Files:**
- Modify: `apps/backend/src/assets/seed/ai-prompts.yaml`
- Modify: `apps/backend/CLAUDE.md`
- Modify: `docs/recruitment-phase1/11_ai_screening_specification.md`

**Interfaces:**
- Consumes: prompt keys and orchestration methods from Task 1.
- Produces: aligned flow text and prompt guidance.

- [x] **Step 1: Update seed prompt text to name the external JD prerequisite and exact Phase 1/interview flows**
- [x] **Step 2: Update backend context docs to include new prompt keys and cache behavior**
- [x] **Step 3: Update AI screening spec flow text**
- [x] **Step 4: Run YAML parse/typecheck verification**
