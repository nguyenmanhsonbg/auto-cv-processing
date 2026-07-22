# CV Clean-to-Clean Similarity Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public reapply similarity compare the previous clean CV text with a newly sanitized clean CV text, while retaining hash-first duplicate detection.

**Architecture:** The public controller keeps the fast original SHA-256 check first. For a non-identical reapply, `CvDocumentsService` creates a temporary sanitized PDF from quarantine, parses it, and removes it before returning the text; the controller then runs the existing content gate against the previous clean parsed text. Similarity normalization is hardened for PDF Unicode/control-character artifacts. The real upload pipeline is unchanged after the gate passes, so duplicate content never creates a new database CV version.

**Tech Stack:** NestJS, TypeScript, TypeORM, `pdf-parse`, Ghostscript sanitizer service, Jest-compatible production classes, pnpm.

## Global Constraints

- Use pnpm only.
- Never create or modify `*.spec.ts` or `*.test.ts` files; use a temporary non-test probe for the PDF regression.
- Never run build, lint, or git commands.
- Run typecheck and inspect runtime logs after every source change.
- Run an API smoke test and an in-app browser smoke test after implementation.
- Preserve existing hash-first behavior and the 95% content threshold.
- Temporary sanitized files must be deleted in `finally` blocks.

---

### Task 1: Add temporary clean-text extraction

**Files:**
- Modify: `apps/backend/src/cv-sanitization/cv-sanitization.service.ts`
- Modify: `apps/backend/src/cv-documents/cv-documents.service.ts`

**Interfaces:**
- `CvSanitizationService.sanitizeFileForSimilarity(input): Promise<string>` returns an absolute temporary safe-PDF path and never leaves an output file after its caller finishes.
- `CvDocumentsService.extractSanitizedCvTextForSimilarity(input): Promise<string>` accepts `{ filePath: string; sourceMimeType: string; originalFileHash: string }` and returns `rawText` extracted from the temporary clean PDF.

- [x] **Step 1: Confirm the failing regression before changing production code**

Run the existing one-off probe against the supplied PDFs and the local sanitizer. Expected evidence: original-to-original is about 98.91%, sanitized-to-sanitized is about 98.78%, and sanitized-old/original-new is `0.896347`, matching the database duplicate-check record.

- [x] **Step 2: Add the sanitizer temporary-artifact method**

Add a public method that creates a path with the existing safe-output builder, calls `cleanCvSanitizer.sanitize` with `toCvQuarantineStorageKey(input.filePath)` and `toCvSafeStorageKey(outputFilePath)`, validates the returned PDF with `validateCleanPdfArtifact`, and deletes the output on failure. Return the output path only after a successful sanitize.

- [x] **Step 3: Add the document-service parse wrapper**

Call the sanitizer method, parse the returned safe PDF using the existing `fileParserService.parseFile`, require a non-empty `rawText`, and always call `deleteCvSafeFile` in `finally`. Convert sanitizer failure to the existing `ServiceUnavailableException`/`UnprocessableEntityException` behavior instead of silently falling back to original text.

- [x] **Step 4: Run backend typecheck and inspect `apps/backend/dev.log`**

Run `pnpm typecheck`. Expected: no TypeScript errors and no new runtime error after hot reload.

### Task 2: Harden PDF text canonicalization

**Files:**
- Modify: `apps/backend/src/cv-parsing/cv-similarity.service.ts`

**Interfaces:**
- Preserve `CvSimilarityService.compare`, `normalizeForSimilarity`, and the existing result shape.
- Keep `CV_SIMILARITY_THRESHOLD = 0.95` and `CV_SIMILARITY_METHOD_VERSION` unchanged unless the implementation requires a new version string for observability.

- [x] **Step 1: Add regression input to the temporary probe**

Run the service against text containing `ﬁ`, `ﬂ`, an embedded `\u001c`, and a hyphenated line break. Expected before the change: those artifacts remain visible in the normalized token stream or lower the score.

- [x] **Step 2: Normalize extracted text with NFKC and control-character cleanup**

Update `canonicalizeExtractedText` to use `normalize('NFKC')`, remove embedded C0/control characters while preserving line breaks and tabs, keep the existing soft-character removal, repair hyphenation across line breaks, then normalize spaces/newlines. Ensure the output still flows through the existing contact/identity removal and tokenizer.

- [x] **Step 3: Run the temporary probe and backend typecheck**

Run the PDF regression probe and `pnpm typecheck`. Expected: ligatures/control artifacts no longer create spurious tokens, and all existing similarity behavior remains type-safe.

### Task 3: Move the reapply content gate to clean-to-clean input

**Files:**
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.ts`

**Interfaces:**
- `checkPublicReapplyCvSimilarity` receives the uploaded file path, MIME type, original hash, candidate identity, and application result; it no longer uses the pre-sanitize upload text for the content comparison.
- The method continues to return `PublicCvSimilarityDetails` for a passed check and throws `DUPLICATE_CV_CONTENT` or `DUPLICATE_CV_FILE` for rejected checks.

- [x] **Step 1: Keep exact hash lookup as the first reapply gate**

Before temporary sanitization, call `findOriginalCvByHash(applicationId, uploadedOriginalFileHash)`. If a matching ORIGINAL row exists, build the exact-file result and throw `DUPLICATE_CV_FILE`; do not invoke the sanitizer or create a new CV document.

- [x] **Step 2: Sanitize and parse the new PDF for similarity**

After the hash miss, call `cvDocumentsService.extractSanitizedCvTextForSimilarity` with the Multer quarantine path, `application/pdf`, and original hash. Compare the previous parsed profile's clean raw text with this new clean raw text using `cvSimilarityService.compare`.

- [x] **Step 3: Remove the pre-upload mixed-stage call**

In `apply`, stop passing `uploadedRawText` into the reapply content gate. Keep the initial parse only for resume validation and original hash calculation. Call the gate at the same point before `uploadOriginalCv`, so duplicate content still prevents persistent upload changes.

- [x] **Step 4: Preserve audit metadata and UI result details**

Record the clean-to-clean score, hashes, method version, and previews through the existing `recordCvContentSimilarityCheck` call. Keep the frontend-compatible `DUPLICATE_CV_CONTENT`/`DUPLICATE_CV_FILE` codes and the current exact-hash display override.

- [x] **Step 5: Run backend typecheck and inspect runtime logs**

Run `pnpm typecheck` and inspect `apps/backend/dev.log`. Expected: no type errors, sanitizer calls only on non-identical reapply content checks, and no unhandled cleanup errors.

### Task 4: Verify the full behavior

**Files:**
- No test files are modified.
- Temporary probe only: `apps/backend/tmp-cv-similarity-probe.ts`, removed after verification.

**Interfaces:**
- No public API shape changes.

- [x] **Step 1: Run the exact supplied-PDF regression**

Expected: `LeQuangTin_cv_2.pdf` versus `SoftwareEngineer_LeQuangTin.pdf` uses clean-to-clean text and scores about 98.8%, so the content gate returns `DUPLICATE_CV_CONTENT` rather than incorrectly passing at 71–89%.

- [x] **Step 2: Verify hash-first behavior**

Submit the same original PDF twice. Expected: the second attempt reports `DUPLICATE_CV_FILE` with `EXACT_ORIGINAL_FILE_HASH_V1`, and no sanitizer preflight is needed.

- [x] **Step 3: Verify a materially different CV still passes**

Use the existing low-overlap text fixture through the service/probe. Expected: score remains below 0.95 and `isDuplicate` is false.

- [x] **Step 4: Run backend and frontend typechecks**

Run `pnpm typecheck`. Expected: pass for all workspaces.

- [x] **Step 5: Run API smoke test**

Request `http://localhost:3002/api/docs` and expect HTTP 200 with the Swagger document.

- [x] **Step 6: Run browser smoke test**

Open `http://localhost:4000/` in the in-app browser and verify the existing app shell renders without a console/runtime error.

- [x] **Step 7: Remove temporary probe and inspect logs**

Delete only `apps/backend/tmp-cv-similarity-probe.ts` and diagnostic output created for this task. Re-check `apps/backend/dev.log` and `apps/frontend/dev.log` for errors.
