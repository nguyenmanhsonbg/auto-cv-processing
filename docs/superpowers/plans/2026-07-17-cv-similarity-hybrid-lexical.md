# CV Similarity Hybrid Lexical Implementation Plan

> **For agentic workers:** This plan is being executed inline in the current workspace. Do not commit, push, merge, or reset existing user changes.

**Goal:** Improve the existing local CV similarity check with character n-grams and section-aware weighting without introducing AI or embedding calls.

**Architecture:** Keep `CvSimilarityService` as a pure TypeScript scorer. Normalize and redact the extracted text first, split it into known CV sections using local heading heuristics, calculate word n-gram and character n-gram TF-IDF cosine scores globally and per section, then combine them as `55% word + 25% char + 20% section`. The existing `0.95` duplicate gate remains unchanged.

**Tech Stack:** NestJS, TypeScript, Jest, Unicode regular expressions, in-memory TF-IDF/cosine calculation.

## Global Constraints

- Similarity checking must not call Gemini, embedding APIs, or any other AI service.
- Similarity scope remains one candidate and one job posting at a time.
- `score >= 0.95` rejects the re-upload; `score < 0.95` accepts and replaces the current CV.
- Existing personal-information redaction must run before feature extraction and preview generation.
- Do not commit, push, merge, or remove unrelated user changes.

---

### Task 1: Add failing scorer tests

**Files:**
- Modify: `apps/backend/src/cv-parsing/cv-similarity.service.spec.ts`

**Interfaces:**
- `buildCharFeatures(normalizedText: string): string[]` exposes the deterministic character feature generator for unit testing.
- `compare(oldText: string, newText: string, identity?: CvSimilarityIdentity): CvSimilarityResult` remains the public comparison entry point.

- [x] **Step 1: Add a failing character n-gram test**

Assert that `buildCharFeatures('reactjs')` contains the expected 3-character windows and that the comparison still scores highly when punctuation changes `ReactJS` to `React.js`.

- [x] **Step 2: Add a failing section-boundary test**

Compare two CVs whose words are identical but assigned to different `Education` and `Skills` sections. Assert the score is below `0.95`; this proves section placement affects the final score instead of only the flattened corpus.

- [x] **Step 3: Add a failing method-version test**

Assert the result method version is `TFIDF_WORD_CHAR_SECTION_V2`.

- [x] **Step 4: Run the focused test and verify it fails for the missing behavior**

Run:

```text
pnpm --filter @interview-assistant/backend run test -- cv-similarity.service.spec.ts --runInBand
```

Expected: the new character, section, and method-version assertions fail while the existing tests continue to identify the current behavior.

### Task 2: Implement the hybrid local scorer

**Files:**
- Modify: `apps/backend/src/cv-parsing/cv-similarity.service.ts`

**Interfaces:**
- Keep `normalizeForSimilarity`, `buildFeatures`, and `compare` compatible with their current callers.
- Add `buildCharFeatures` for character n-gram generation.
- Keep `CvSimilarityResult` compatible with existing persistence and controller code; only change the method-version value.

- [x] **Step 1: Replace the method version**

Set `CV_SIMILARITY_METHOD_VERSION` to `TFIDF_WORD_CHAR_SECTION_V2`.

- [x] **Step 2: Add section normalization and heading detection**

Split normalized source text on line boundaries into canonical sections: `summary`, `experience`, `projects`, `skills`, `education`, `certifications`, and `other`. Recognize common English/Vietnamese heading variants locally. If no headings are found, use one `other` section containing the complete normalized text.

- [x] **Step 3: Add character features**

Generate normalized character n-grams of lengths 3 through 5, collapsing repeated whitespace first. Keep word n-grams at the existing unigram/bigram behavior.

- [x] **Step 4: Generalize TF-IDF cosine calculation**

Use the existing two-document TF-IDF calculation for any feature list. Compute global word and char scores, then compute a section score by matching canonical sections and combining the same two lexical scorers per section. Missing content in a section contributes zero for that section's configured weight.

- [x] **Step 5: Combine scores and preserve the gate**

Calculate the final score as `0.55 * globalWordScore + 0.25 * globalCharScore + 0.20 * weightedSectionScore`, clamp to `[0, 1]`, and keep duplicate detection as `score >= 0.95`.

- [x] **Step 6: Run the focused test and verify it passes**

Run the command from Task 1 and expect all tests to pass.

### Task 3: Verify integration compatibility

**Files:**
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.ts` only if the method-version example needs updating.
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.spec.ts` only if a hard-coded method-version expectation is part of the response contract.

- [x] **Step 1: Update public method-version examples and fixtures**

Change stale `TFIDF_WORD_NGRAM_V1` examples or mock results to `TFIDF_WORD_CHAR_SECTION_V2` where they represent the active scorer. Leave generic persistence tests unchanged if they intentionally test arbitrary method-version storage.

- [x] **Step 2: Run similarity and public-apply tests**

Run:

```text
pnpm --filter @interview-assistant/backend run test -- cv-similarity.service.spec.ts public-job-postings.controller.spec.ts applications.service.spec.ts candidate-identity-matching.spec.ts cv-documents.service.spec.ts --runInBand
```

Expected: all focused suites pass, including first application, duplicate rejection, successful update, and CV cleanup behavior.

- [x] **Step 3: Run backend and frontend typechecks**

Run:

```text
pnpm --filter @interview-assistant/backend run typecheck
pnpm --filter @interview-assistant/frontend run typecheck
```

Expected: both commands exit successfully.

- [x] **Step 4: Check the diff without committing**

Run:

```text
git diff --check
git status --short
```

Confirm only the intended scorer/tests/docs changes are added on top of the user's existing work.

## Self-review

- The plan covers character features, section-aware comparison, weighted final scoring, unchanged threshold behavior, no-AI constraint, integration metadata, and verification.
- No embedding, Gemini, database-vector, or global-corpus work is included.
- Existing preview redaction remains upstream of both global and section feature extraction.
