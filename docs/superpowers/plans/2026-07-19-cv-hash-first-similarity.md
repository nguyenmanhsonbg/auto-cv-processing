# CV Hash-First Similarity Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure public CV reapply checks exact file identity before content similarity, while making text comparison resilient to PDF extraction differences.

**Architecture:** The public apply controller will calculate the quarantined upload's SHA-256 before creating or replacing a CV. Reapply checks will compare that hash with the previous CV's `originalFileHash`; only different files will go through the lexical similarity scorer. The upload service will keep its hash check enabled as a second defensive check. Similarity normalization will canonicalize PDF extraction artifacts and compare the already-normalized text exactly before falling back to the existing hybrid scorer.

**Tech Stack:** NestJS, TypeScript, TypeORM, Jest, Node.js `crypto`/`fs`.

## Global Constraints

- Similarity scope remains one candidate and one job posting.
- Exact original-file hash matches are always rejected before scan/sanitize/parse.
- Content similarity remains rejected at `score >= 0.95`.
- The CV uploaded for comparison is parsed once before the gate; Gemini is not called before the gate passes.
- The original-file hash check must remain enabled in `CvDocumentsService` for defense in depth.
- Do not compare a new upload with `cleanFileHash`; sanitization creates a different server-side PDF.
- Do not modify unrelated user changes, launch services, build applications, or run lint.

---

### Task 1: Add exact-file identity to the preflight data flow

**Files:**
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.ts`
- Modify: `apps/backend/src/cv-documents/cv-documents.service.ts` only if a small reusable file-hash method is required
- Test with existing public-apply and CV-document test suites; do not add a new `*.spec.ts` file because the repository rules prohibit creating or modifying test files.

**Interfaces:**
- `UploadedResumeText` gains `originalFileHash: string`.
- The public reapply similarity check receives the incoming original-file hash.
- The previous current clean document's `originalFileHash` is treated as the hash of the candidate's original upload because sanitization copies that value to the clean document.

- [x] **Step 1: Trace the existing upload hash implementation**

Reuse the same SHA-256 algorithm used by `CvDocumentsService.createOriginalCv` instead of hashing normalized text or the sanitized PDF.

- [x] **Step 2: Calculate the quarantine file hash during preflight**

Hash `file.path` after Multer has written it and return the hash together with `rawText` and `normalizedText` from `extractAndValidateUploadedCvText`.

- [x] **Step 3: Compare original-file hashes before similarity**

For a reapply, compare the incoming hash with `parsedProfile.cvDocument.originalFileHash`. If they match, record a similarity diagnostic with score `1`, decision `DUPLICATE_FOUND`, and method version `EXACT_ORIGINAL_FILE_HASH_V1`, then throw `DUPLICATE_CV_CONTENT` before calling the lexical scorer or upload service.

- [x] **Step 4: Keep the upload-layer hash check enabled**

Remove `skipExistingOriginalHashCheck: isPublicReapply` from the public apply call or set it to `false`. This protects against concurrent reapply requests and stale preflight state.

- [x] **Step 5: Verify the existing focused suites**

Run the backend public-apply and CV-document suites. The expected behavior is that duplicate reapply requests do not call `uploadOriginalCv`, sanitization, or Gemini parsing.

### Task 2: Improve canonical text normalization and exact normalized-text short-circuit

**Files:**
- Modify: `apps/backend/src/cv-parsing/cv-similarity.service.ts`
- Use existing `apps/backend/src/cv-parsing/cv-similarity.service.spec.ts` only for verification; do not change repository test files.

**Interfaces:**
- `normalizeForSimilarity(text, identity)` remains compatible with existing callers.
- `compare(oldText, newText, identity)` returns the existing `CvSimilarityResult` shape.
- The method version changes so persisted results identify the new behavior.

- [x] **Step 1: Add canonicalization for PDF extraction artifacts**

Before tokenization, normalize Unicode, remove soft hyphens and line-break hyphenation, normalize whitespace, and separate common PDF-joined label/value boundaries without changing technology spellings such as `Node.js`, `C++`, `C#`, and `.NET`.

- [x] **Step 2: Normalize the header and identity data consistently**

Apply the same canonicalization path to both the previous raw text and the new preflight text. Keep email, phone, URL, and supplied candidate identity redaction before feature generation.

- [x] **Step 3: Add an exact normalized-text short-circuit**

After canonical normalization, if the two normalized texts are equal, return score `1` and `isDuplicate: true` without running TF-IDF. Preserve hashes and return zero feature diagnostics only where the existing result contract permits it.

- [x] **Step 4: Preserve hybrid fallback scoring**

For non-identical normalized text, keep word n-grams, character n-grams, and section-aware scoring. Adjust only the canonicalization and method version; do not lower the duplicate threshold.

- [x] **Step 5: Verify the similarity scorer against current fixtures**

Run the existing similarity suite and a one-off local comparison using the two extracted-text shapes from the reported CV: joined PDF tokens such as `OpenLayersto`/`Rechartsto` and spaced tokens such as `OpenLayers to`/`Recharts to`. Confirm exact content returns `1` and genuine content changes remain below the threshold.

### Task 3: Make the public apply result and audit records distinguish hash and similarity decisions

**Files:**
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.ts`
- Modify: `apps/backend/src/applications/applications.service.ts` only if the persisted method version or diagnostic fields require it
- Modify: `apps/frontend/src/lib/api-errors.ts` and `apps/frontend/src/pages/public/PublicJobApplyPage.tsx` only if the existing diagnostic renderer cannot display the exact-hash method

**Interfaces:**
- Public similarity details keep `score`, `threshold`, `decision`, hashes, method version, and bounded previews.
- Exact hash rejection uses the same safe public duplicate error code and includes `methodVersion: EXACT_ORIGINAL_FILE_HASH_V1`.

- [x] **Step 1: Return a consistent duplicate response**

Use `DUPLICATE_CV_CONTENT` for both exact-file and content-similarity rejection so the frontend does not treat an exact reapply as an internal upload failure.

- [x] **Step 2: Preserve the previous current CV on every rejected branch**

Ensure quarantine cleanup runs before the request exits and no original/clean CV document is created for an exact hash or similarity rejection.

- [x] **Step 3: Keep audit scope and metadata correct**

Record the application, candidate, job posting, previous parsed profile/document, decision, score, threshold, and method version. Do not expose raw PII in the public error preview.

- [x] **Step 4: Verify the end-to-end public apply behavior**

Exercise first apply, same-PDF reapply, different-PDF same-content reapply, and genuinely changed CV reapply through the running API and browser flow. Confirm only the last case replaces the current CV.

## Verification

- [x] Run `pnpm --filter @interview-assistant/backend typecheck`.
- [x] Check `apps/backend/dev.log` for reload/runtime errors.
- [x] Run the existing backend focused tests for CV similarity, public apply, applications, and CV documents.
- [x] Run `pnpm --filter @interview-assistant/frontend typecheck` if frontend files changed.
- [x] Check `apps/frontend/dev.log` if frontend files changed.
- [x] Run the API and browser smoke checks required by `AGENTS.md` without launching new services.
