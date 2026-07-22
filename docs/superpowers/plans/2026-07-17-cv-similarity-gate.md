# CV Reapply Similarity Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject a re-uploaded CV when its text similarity with the candidate's previous CV for the same job posting is at least `0.95`, before any malware upload persistence, sanitization, or Gemini call.

**Architecture:** Reuse the public apply endpoint's existing local `FileParserService` extraction as a deterministic preflight. After the existing candidate/application lookup, compare the new extracted text with the current parsed profile for the same application using a pure TypeScript TF-IDF word n-gram (`1..2`) service and cosine similarity. If the score is below `0.95`, continue the existing upload → scan → sanitize → Gemini path; if it is at least `0.95`, record the result and reject while the old CV remains current.

**Tech Stack:** NestJS, TypeScript, TypeORM, PostgreSQL, Jest, existing `pdf-parse`-based `FileParserService`; no Python, no new ML dependency, no pgvector.

## Global Constraints

- Similarity scope is exactly one `candidateId` plus one `jobPostingId`.
- CVs submitted to different job postings must never be compared.
- The only similarity threshold is `0.95`: `>= 0.95` rejects; `< 0.95` accepts and updates the current CV.
- There is no similarity review state.
- A rejected reapply must not call Gemini and must not create a new `CvDocumentEntity`.
- A new candidate identity means no comparison with the old candidate's CVs.
- The existing application reuse and CV version history remain in place.
- TF-IDF is fit in memory on exactly the old and new normalized CV texts for each comparison.
- The implementation must preserve existing first-apply and non-public/manual upload behavior except for scoping the legacy parsed-profile duplicate query to the same application.

---

## File Map

### Create

- `apps/backend/src/cv-parsing/cv-similarity.service.ts` — pure normalization, tokenization, n-gram, TF-IDF, and cosine calculation.
- `apps/backend/src/cv-parsing/cv-similarity.service.spec.ts` — deterministic unit tests for the scorer.
- `apps/backend/src/cv-parsing/cv-parsing.service.spec.ts` — scoped exact-hash duplicate-check tests.
- `apps/backend/src/cv-documents/cv-documents.service.spec.ts` — clean-CV text fallback tests.
- `apps/backend/src/job-postings/public-job-postings.controller.spec.ts` — public apply gate tests proving rejected reapply does not reach CV upload or Gemini.

### Modify

- `apps/backend/src/cv-parsing/cv-parsing.module.ts` — register and export `CvSimilarityService`.
- `apps/backend/src/job-postings/public-job-postings.controller.ts` — return normalized local text from resume preflight, run the same-job reapply gate before `uploadOriginalCv`, and map `DUPLICATE_CV_CONTENT`.
- `apps/backend/src/applications/applications.service.ts` — add an auditable similarity-check recording method and scope the previous-profile lookup data used by the public gate.
- `apps/backend/src/recruitment-common/enums/recruitment.enum.ts` — add `CV_CONTENT_SIMILARITY` to `DuplicateCheckType`.
- `apps/backend/src/cv-parsing/cv-parsing.service.ts` — scope the existing exact parsed-profile duplicate lookup to the current application so another job cannot trigger it.
- `apps/backend/src/cv-documents/cv-documents.service.ts` — add a local-text fallback for an old clean CV when its stored parsed profile lacks `parsedData.rawText`.
- `apps/backend/src/cv-documents/cv-documents.module.ts` — import `FileParserModule` if needed by the fallback.

### No database migration

`duplicate_checks.check_type` is a `varchar`, `duplicate_checks.score` already exists, and old raw text is already stored in `parsed_profiles.parsed_data`. Adding the enum value does not require a schema migration.

---

## Task 1: Add the pure TypeScript similarity scorer

**Files:**

- Create: `apps/backend/src/cv-parsing/cv-similarity.service.ts`
- Create: `apps/backend/src/cv-parsing/cv-similarity.service.spec.ts`
- Modify: `apps/backend/src/cv-parsing/cv-parsing.module.ts`

**Interfaces:**

```ts
export interface CvSimilarityIdentity {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CvSimilarityResult {
  score: number;
  isDuplicate: boolean;
  threshold: number;
  methodVersion: 'TFIDF_WORD_NGRAM_V1';
  oldNormalizedTextHash: string;
  newNormalizedTextHash: string;
  featureCount: number;
  sharedFeatureCount: number;
}

export class CvSimilarityService {
  normalizeForSimilarity(text: string, identity?: CvSimilarityIdentity): string;

  buildFeatures(normalizedText: string): string[];

  compare(
    oldText: string,
    newText: string,
    identity?: CvSimilarityIdentity,
  ): CvSimilarityResult;
}
```

- [ ] **Step 1: Write the failing scorer tests.**

Cover these exact cases:

```ts
it('returns 1 for text equal after normalization', () => {
  const result = service.compare(
    'Name\nPython   SQL',
    'name Python SQL',
    { name: 'Name' },
  );

  expect(result.score).toBeCloseTo(1, 6);
  expect(result.isDuplicate).toBe(true);
});

it('removes identity values before vectorization', () => {
  const result = service.compare(
    'Alice alice@example.com Python SQL',
    'Alice alice@example.com Python SQL',
    { name: 'Alice', email: 'alice@example.com' },
  );

  expect(result.score).toBeCloseTo(1, 6);
});

it('returns a lower score when the experience content changes', () => {
  const result = service.compare(
    'built ETL pipelines with Python and SQL',
    'managed recruitment operations with Greenhouse and Excel',
  );

  expect(result.score).toBeLessThan(0.95);
  expect(result.isDuplicate).toBe(false);
});

it('includes unigrams and bigrams in the feature space', () => {
  const features = service.buildFeatures('built ETL pipelines');

  expect(features).toEqual(expect.arrayContaining([
    'built',
    'etl',
    'pipelines',
    'built etl',
    'etl pipelines',
  ]));
});

it('rejects empty comparison text instead of producing a misleading score', () => {
  expect(() => service.compare('', 'Python SQL')).toThrow('CV text is empty');
});
```

- [ ] **Step 2: Run only the new test file and verify it fails.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- cv-similarity.service.spec.ts --runInBand
```

Expected: FAIL because `CvSimilarityService` and its methods do not exist yet.

- [ ] **Step 3: Implement normalization and feature construction.**

Use these rules:

```ts
const SIMILARITY_THRESHOLD = 0.95;
const METHOD_VERSION = 'TFIDF_WORD_NGRAM_V1' as const;

// Normalization order:
// 1. Unicode NFC
// 2. lowercase
// 3. remove email, URL, and phone patterns
// 4. remove supplied name/email/phone values
// 5. tokenize letters/numbers and common technology symbols
// 6. collapse whitespace
// 7. emit word n-grams for n = 1 and n = 2
```

Do not create a manually selected technology-keyword list. All remaining tokens and phrases become features. Use a smoothed IDF so terms present in both of the two documents retain a non-zero weight:

```ts
idf = Math.log((documentCount + 1) / (documentFrequency + 1)) + 1;
tf = termCount / totalFeatureCount;
weight = tf * idf;
```

Use the standard cosine formula and return `0` for orthogonal vectors. Round only the persisted score, not the decision calculation.

- [ ] **Step 4: Register and export the scorer.**

Update `CvParsingModule`:

```ts
providers: [CvParsingService, GeminiCvParserService, CvSimilarityService],
exports: [CvParsingService, CvSimilarityService],
```

- [ ] **Step 5: Run the scorer tests and commit.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- cv-similarity.service.spec.ts --runInBand
```

Expected: PASS.

Commit:

```text
git add apps/backend/src/cv-parsing/cv-similarity.service.ts apps/backend/src/cv-parsing/cv-similarity.service.spec.ts apps/backend/src/cv-parsing/cv-parsing.module.ts
git commit -m "feat: add in-memory CV text similarity scorer"
```

---

## Task 2: Make deterministic CV text available before upload

**Files:**

- Modify: `apps/backend/src/job-postings/public-job-postings.controller.ts`
- Modify: `apps/backend/src/cv-documents/cv-documents.service.ts`
- Modify: `apps/backend/src/cv-documents/cv-documents.module.ts`

**Interfaces:**

```ts
interface UploadedResumeText {
  rawText: string;
  normalizedText: string;
}

private async extractAndValidateUploadedCvText(
  file: Express.Multer.File,
  identity: CvSimilarityIdentity,
): Promise<UploadedResumeText>;

async extractCleanCvText(cvDocument: CvDocumentEntity): Promise<string>;
```

- [ ] **Step 1: Write the failing fallback tests.**

Add a `CvDocumentsService` test that mocks `FileParserService.parseFile`, gives it a clean safe CV document, and verifies that `extractCleanCvText()` returns its `rawText`. Add a controller test that verifies the existing CV validation still rejects empty/non-CV text.

- [ ] **Step 2: Run the focused tests and verify the new methods are missing.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- cv-documents.service.spec.ts public-job-postings.controller.spec.ts --runInBand
```

Expected: FAIL because the fallback method and controller test fixture do not exist yet.

- [ ] **Step 3: Refactor `assertUploadedFileLooksLikeResume`.**

Replace the current `void` method with `extractAndValidateUploadedCvText`. Preserve `validateResumeSignals` exactly; return the parsed raw text and the similarity-normalized text after validation succeeds.

The public apply method should change from:

```ts
await this.assertUploadedFileLooksLikeResume(file);
```

to:

```ts
const uploadedResumeText = await this.extractAndValidateUploadedCvText(
  file,
  candidate,
);
```

This continues using `FileParserService` only. It must not call `CvParsingService` or Gemini.

- [ ] **Step 4: Add the old clean-CV text fallback.**

Inject `FileParserService` into `CvDocumentsService`, import `FileParserModule` into `CvDocumentsModule`, and implement:

```ts
async extractCleanCvText(cvDocument: CvDocumentEntity): Promise<string> {
  const filePath = resolveCvSafeStorageKey(cvDocument.storagePath);
  const parsed = await this.fileParserService.parseFile(filePath);
  const rawText = typeof parsed.rawText === 'string' ? parsed.rawText : '';
  if (!rawText.trim()) throw new UnprocessableEntityException('Current CV text is empty');
  return rawText;
}
```

Use this only if the current parsed profile has no usable `parsedData.rawText`.

- [ ] **Step 5: Run focused tests and commit.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- cv-documents.service.spec.ts public-job-postings.controller.spec.ts --runInBand
```

Expected: PASS for the new extraction/fallback tests.

Commit:

```text
git add apps/backend/src/job-postings/public-job-postings.controller.ts apps/backend/src/cv-documents/cv-documents.service.ts apps/backend/src/cv-documents/cv-documents.module.ts
git commit -m "refactor: expose deterministic CV text before AI parsing"
```

---

## Task 3: Persist similarity decisions and scope duplicate types

**Files:**

- Modify: `apps/backend/src/recruitment-common/enums/recruitment.enum.ts`
- Modify: `apps/backend/src/applications/applications.service.ts`
- Modify: `apps/backend/src/applications/applications.service.spec.ts`

**Interfaces:**

```ts
export interface RecordCvContentSimilarityInput {
  applicationId: string;
  candidateId: string;
  jobPostingId: string;
  previousParsedProfileId: string;
  previousCvDocumentId: string;
  oldNormalizedTextHash: string;
  newNormalizedTextHash: string;
  score: number;
  threshold: number;
  methodVersion: string;
  decision: 'DUPLICATE_FOUND' | 'PASSED';
}

async recordCvContentSimilarityCheck(
  input: RecordCvContentSimilarityInput,
): Promise<void>;
```

- [ ] **Step 1: Write failing persistence tests.**

Add tests proving the method saves a `DuplicateCheckEntity` with:

```ts
expect.objectContaining({
  applicationId,
  checkType: DuplicateCheckType.CV_CONTENT_SIMILARITY,
  status: DuplicateCheckStatus.DUPLICATE_FOUND,
  matchedEntityType: 'CV_DOCUMENT',
  matchedEntityId: previousCvDocumentId,
  score: '0.950000',
});
```

Also verify the details contain `candidateId`, `jobPostingId`, both text hashes, threshold, method version, and decision.

- [ ] **Step 2: Run the focused application tests and verify failure.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- applications.service.spec.ts --runInBand
```

Expected: FAIL because the enum value and recording method do not exist.

- [ ] **Step 3: Add the duplicate-check type.**

Add this value to `DuplicateCheckType`:

```ts
CV_CONTENT_SIMILARITY = 'CV_CONTENT_SIMILARITY',
```

No migration is required because the column is varchar.

- [ ] **Step 4: Implement the recording method.**

Use the existing application transaction/audit patterns. Save `score` with six decimal places and use `matchedEntityId` for the previous clean CV document. Record an audit action such as `CV_CONTENT_SIMILARITY_CHECKED` with the same metadata. For a rejected score, record a workflow event without changing `application.status`, because the old CV remains current.

- [ ] **Step 5: Run tests and commit.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- applications.service.spec.ts --runInBand
```

Expected: PASS.

Commit:

```text
git add apps/backend/src/recruitment-common/enums/recruitment.enum.ts apps/backend/src/applications/applications.service.ts apps/backend/src/applications/applications.service.spec.ts
git commit -m "feat: persist CV content similarity decisions"
```

---

## Task 4: Insert the pre-Gemini gate into public apply

**Files:**

- Modify: `apps/backend/src/job-postings/public-job-postings.controller.ts`
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.spec.ts`

**Interfaces:**

```ts
const PUBLIC_CV_SIMILARITY_REJECTION_THRESHOLD = 0.95;

private async checkPublicReapplyCvSimilarity(input: {
  application: CreateApplicationResult;
  candidate: { name: string; email: string; phone: string };
  uploadedNormalizedText: string;
}): Promise<void>;
```

- [ ] **Step 1: Write failing controller-flow tests.**

Add three tests:

```ts
it('rejects same candidate and same job at or above 0.95 before CV upload', async () => {
  similarityService.compare.mockReturnValue({
    score: 0.95,
    isDuplicate: true,
    threshold: 0.95,
    methodVersion: 'TFIDF_WORD_NGRAM_V1',
    oldNormalizedTextHash: 'old',
    newNormalizedTextHash: 'new',
    featureCount: 10,
    sharedFeatureCount: 10,
  });

  await expect(controller.apply(/* existing candidate + same job */)).rejects.toMatchObject({
    response: expect.objectContaining({ code: 'DUPLICATE_CV_CONTENT' }),
  });
  expect(cvDocumentsService.uploadOriginalCv).not.toHaveBeenCalled();
  expect(cvParsingService.parseCleanCvDocument).not.toHaveBeenCalled();
});

it('continues normal upload and AI parsing below 0.95', async () => {
  similarityService.compare.mockReturnValue({
    score: 0.949999,
    isDuplicate: false,
    threshold: 0.95,
    methodVersion: 'TFIDF_WORD_NGRAM_V1',
    oldNormalizedTextHash: 'old-hash',
    newNormalizedTextHash: 'new-hash',
    featureCount: 12,
    sharedFeatureCount: 8,
  });

  await controller.apply(/* existing candidate + same job */);

  expect(cvDocumentsService.uploadOriginalCv).toHaveBeenCalled();
  expect(cvDocumentsService.sanitizeOriginalCvAfterScanPass).toHaveBeenCalled();
  expect(cvParsingService.parseCleanCvDocument).toHaveBeenCalled();
});

it('does not compare a first application or an application for another job', async () => {
  await controller.apply(/* first application */);
  expect(similarityService.compare).not.toHaveBeenCalled();
});
```

Use fixtures that distinguish `same candidate + same job`, `same candidate + different job`, and `different candidate + same job`.

- [ ] **Step 2: Run the controller tests and verify failure.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- public-job-postings.controller.spec.ts --runInBand
```

Expected: FAIL because the gate is not wired into `apply`.

- [ ] **Step 3: Inject the scorer and add the gate after identity resolution.**

Inject `CvSimilarityService` into `PublicJobPostingsController`. Place the gate after `createFromApply()` and `assertPublicReapplyBelongsToSameCandidate()`, but before `handedToCvUploadService = true` and before `uploadOriginalCv()`.

The gate should:

1. Return immediately when `isPublicReapply` is false.
2. Call `applicationsService.findParsedProfileByApplicationId(applicationResult.application.id)` to get the current old parsed profile.
3. Read `parsedData.rawText`; if missing, call `cvDocumentsService.extractCleanCvText(parsedProfile.cvDocument)`.
4. Call `cvSimilarityService.compare(oldText, uploadedNormalizedText, candidate)`.
5. Persist `CV_CONTENT_SIMILARITY` with `DUPLICATE_FOUND` or `PASSED`.
6. For `score >= 0.95`, throw:

```ts
throw new ConflictException({
  code: 'DUPLICATE_CV_CONTENT',
  message: 'This CV is too similar to a previous CV submitted for this job posting.',
});
```

Because `handedToCvUploadService` is still false, the existing catch block deletes the Multer quarantine file. No CV document, clean artifact, or parsed profile is created by the rejected request.

- [ ] **Step 4: Add the public error mapping.**

Add `DUPLICATE_CV_CONTENT` to `PublicApplyErrorCode` and map it to HTTP 409 before the generic duplicate mapping in `toPublicApplyError`.

- [ ] **Step 5: Run controller tests and commit.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- public-job-postings.controller.spec.ts --runInBand
```

Expected: PASS, including the assertion that rejected reapply never calls `uploadOriginalCv` or `parseCleanCvDocument`.

Commit:

```text
git add apps/backend/src/job-postings/public-job-postings.controller.ts apps/backend/src/job-postings/public-job-postings.controller.spec.ts
git commit -m "feat: block overly similar public CV reapplications before AI"
```

---

## Task 5: Scope the legacy exact-profile duplicate check to one application

**Files:**

- Modify: `apps/backend/src/cv-parsing/cv-parsing.service.ts`
- Modify: `apps/backend/src/cv-parsing/cv-parsing.service.spec.ts`

- [ ] **Step 1: Write the failing scope test.**

Add a test that creates a previous parsed profile for another application/job with the same `normalizedTextHash` and verifies the current application's profile check does not match it. Add a second previous profile under the same application and verify it can match.

- [ ] **Step 2: Run the focused parsing tests and verify failure.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- cv-parsing.service.spec.ts --runInBand
```

Expected: FAIL because `recordProfileDuplicateCheck` currently searches all parsed profiles globally.

- [ ] **Step 3: Scope the query.**

In `recordProfileDuplicateCheck`, add the current application scope to the query:

```ts
.where('parsedProfile.applicationId = :applicationId', {
  applicationId: parsedProfile.applicationId,
})
```

Keep the existing self-exclusion by `parsedProfile.id != :parsedProfileId`.

The public preflight gate remains the authoritative rejection decision; this post-AI exact-hash check is only defense-in-depth for accepted/internal flows.

- [ ] **Step 4: Run tests and commit.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- cv-parsing.service.spec.ts --runInBand
```

Expected: PASS.

Commit:

```text
git add apps/backend/src/cv-parsing/cv-parsing.service.ts apps/backend/src/cv-parsing/cv-parsing.service.spec.ts
git commit -m "fix: scope parsed profile duplicate checks to application"
```

---

## Task 6: Full verification and boundary tests

**Files:**

- Modify: `apps/backend/src/cv-parsing/cv-similarity.service.spec.ts`
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.spec.ts`
- Modify: `apps/backend/src/applications/applications.service.spec.ts`

- [ ] **Step 1: Add boundary tests for the exact threshold.**

Verify:

```text
0.950000 → rejected
0.949999 → accepted
```

Do not use a rounded score for the decision; round only persisted display metadata.

- [ ] **Step 2: Add tests for idempotency and cleanup.**

Verify an idempotent replay of the same request still returns the existing behavior and does not run the similarity gate twice for the same idempotency key. Verify a rejected similarity request leaves the old current CV unchanged and leaves no new `CvDocumentEntity`.

- [ ] **Step 3: Run the backend test suite.**

Run:

```text
pnpm --filter @interview-assistant/backend test -- --runInBand
```

Expected: all backend tests PASS.

- [ ] **Step 4: Run typecheck.**

Run:

```text
pnpm --filter @interview-assistant/backend typecheck
```

Expected: exit code `0` with no TypeScript errors.

- [ ] **Step 5: Run backend build.**

Run:

```text
pnpm --filter @interview-assistant/backend build
```

Expected: exit code `0`; the production bundle contains the new scorer and controller gate.

- [ ] **Step 6: Inspect the final diff and commit verification changes.**

Run:

```text
git diff --check
git status --short
```

Expected: no whitespace errors and only the planned files changed.

Commit:

```text
git add apps/backend/src/cv-parsing apps/backend/src/job-postings/public-job-postings.controller.ts apps/backend/src/job-postings/public-job-postings.controller.spec.ts apps/backend/src/applications apps/backend/src/recruitment-common/enums/recruitment.enum.ts apps/backend/src/cv-documents
git commit -m "test: verify CV reapply similarity gate"
```

---

## Acceptance checklist

- [ ] A first application has no previous CV comparison and follows the existing scan/sanitize/Gemini flow.
- [ ] A same-candidate reapply to the same job compares exactly two CV texts.
- [ ] A same-candidate application to another job does not compare CVs.
- [ ] A different candidate does not compare CVs.
- [ ] A score of `0.95` rejects before `uploadOriginalCv` and before Gemini.
- [ ] A score below `0.95` continues upload, sanitization, CV replacement, and Gemini parsing.
- [ ] A rejected upload keeps the old current CV and creates no new CV document.
- [ ] Similarity metadata is auditable in `duplicate_checks`.
- [ ] The legacy exact-hash check cannot compare CVs from another job posting.
