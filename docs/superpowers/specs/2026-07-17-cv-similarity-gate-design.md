# CV Reapply Similarity Gate Design

## Goal

Prevent a candidate from uploading a CV that is too similar to their previous CV for the same job posting, without calling Gemini for a CV that will be rejected.

## Confirmed product rules

- Similarity scope is one `candidateId` plus one `jobPostingId`.
- A candidate may apply to multiple job postings; CVs from different job postings are never compared.
- The existing application for the same candidate and job posting is reused; CV documents remain versioned and the accepted CV becomes current.
- There are exactly two similarity outcomes:
  - `similarity >= 0.95`: reject the new upload and keep the previous CV current.
  - `similarity < 0.95`: accept the new upload, replace the current CV, and parse the new CV with Gemini.
- No review state is introduced for similarity.
- If different form identity data results in a different `candidateId`, the application is treated as a new candidate and no old CV is compared.

## Current repository behavior

The public apply endpoint already extracts text locally with `FileParserService` before the application is created. It then calls `createFromApply`, uploads/scans/sanitizes the CV, and calls `CvParsingService.parseCleanCvDocument`. The latter extracts text again and calls Gemini before the existing exact `normalizedTextHash` duplicate check.

The new gate will reuse the first local text extraction and run after the existing application lookup but before `CvDocumentsService.uploadOriginalCv`. This means a rejected reapply creates no new CV document, does not run scan/sanitize, and never calls Gemini. This is consistent with the current code's pre-scan local PDF parsing and avoids the more invasive current-document rollback required by a post-sanitize gate.

## Similarity algorithm

`CvSimilarityService` is a pure TypeScript service. It will not use Python, an embedding model, pgvector, or a global corpus.

Input is the normalized text of exactly two CVs: the current old CV and the newly uploaded CV. The service will:

1. Normalize Unicode text, lowercase it, remove email addresses, phone numbers, URLs, and supplied candidate identity values, then collapse whitespace.
2. Tokenize the remaining text while preserving common technology spellings such as `C#`, `C++`, `Node.js`, and `.NET` where possible.
3. Generate word n-grams with `n = 1..2`.
4. Build a vocabulary from the two documents in memory.
5. Calculate smoothed TF-IDF weights for both documents.
6. Calculate cosine similarity and return the score plus reproducibility metadata.

The service does not manually whitelist technology keywords. It vectorizes all remaining words/phrases; the high threshold and identity redaction prevent contact details and ordinary skills from being the only reason for rejection.

## Integration flow

```text
Multer quarantine file
  → local PDF text extraction and CV validation
  → create or reuse application for candidate + job posting
  → if this is a reapply with a previous parsed current CV:
       compare old rawText with new extracted text
       record score and method
       if score >= 0.95: throw DUPLICATE_CV_CONTENT
  → normal upload, malware scan, sanitize, and current-CV update
  → parse accepted clean CV; Gemini is called once
```

The old comparison text is read from the current parsed profile's stored `parsedData.rawText`. If the profile exists but raw text is absent, the implementation will extract text from the current clean CV locally as a fallback. If there is no previous parsed profile, the gate is skipped because there is no comparison target.

## Persistence and audit

Add `CV_CONTENT_SIMILARITY` as a `DuplicateCheckType`. For reapply checks, store:

- `applicationId`
- old parsed profile/CV document identifiers
- old and new normalized text hashes
- numeric similarity score
- threshold `0.95`
- `methodVersion: TFIDF_WORD_NGRAM_V1`
- n-gram range and normalization configuration
- decision `DUPLICATE_FOUND` or `PASSED`

The blocked request also writes an audit/workflow event while preserving the application's current status. No new parsed profile is created for a blocked upload.

The existing post-AI parsed-profile duplicate query must be scoped to the same application. Otherwise a CV submitted for another job posting could trigger the old global hash check and violate the new job-specific rule.

## Error behavior

Add public error code `DUPLICATE_CV_CONTENT` with HTTP 409 and a user-safe message that the new CV is too similar to the previous CV submitted for this job. The controller's existing cleanup path deletes the Multer quarantine file because the request has not been handed to `CvDocumentsService`.

Similarity calculation failures must not call Gemini. They should return the existing CV parse/process failure response and leave the previous CV unchanged.

## Non-goals

- No cross-candidate duplicate search.
- No cross-job duplicate search.
- No new application per reapply.
- No embedding or semantic paraphrase detection.
- No pgvector or vector database.
- No HR review workflow for the similarity score.
