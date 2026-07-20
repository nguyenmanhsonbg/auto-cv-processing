# CV Clean-to-Clean Similarity Gate

## Goal

Public reapply CV similarity must compare equivalent sanitized representations. An exact original file hash check remains the first gate, while content similarity runs only after the new PDF has passed the same sanitization and extraction pipeline as the previous CV.

## Root Cause

The current public apply flow validates and extracts the new upload before sanitization, then compares that text with the previous parsed profile, which was extracted from a sanitized clean PDF. Ghostscript changes PDF text extraction enough to join words, emit ligatures, and introduce control characters. For the two supplied CVs, comparing original-to-original is about 98.91%, comparing sanitized-to-sanitized is about 98.78%, while the mixed clean-old/original-new flow records 89.6347%.

## Design

1. Keep upload validation and SHA-256 original-file hash calculation at the beginning of the request.
2. On a public reapply, query the existing ORIGINAL document by hash before any similarity sanitization. An exact match returns the existing exact-file duplicate result.
3. If the hash is new, sanitize the uploaded quarantine file into a temporary safe PDF, parse that temporary clean PDF, and compare it with the previous clean parsed text.
4. Delete the temporary safe artifact in a `finally` block. The real upload/sanitize/parse pipeline runs only after the content gate passes.
5. Harden similarity canonicalization with Unicode NFKC, removal of embedded control characters, existing hyphenation repair, and whitespace normalization. This handles ligatures and extraction noise without treating unrelated CVs as identical.
6. Keep the existing 95% content threshold and exact-file hash as separate decisions. No database migration is required.

## Error Handling

- Exact original hash: return `DUPLICATE_CV_FILE` with exact-hash method metadata.
- Temporary sanitization or parsing failure: return the existing CV sanitize/parse failure response; do not persist a new CV version.
- Clean-to-clean similarity at or above 95%: return `DUPLICATE_CV_CONTENT`; the temporary safe file is deleted and no new database document is created.
- Similarity below 95%: continue through the existing real upload, sanitization, parsing, and version cleanup flow.

## Verification

- Reproduce the supplied two PDFs and prove the current mixed-stage score is below the threshold before the change.
- Prove the new clean-to-clean comparison is above 95% after the change.
- Preserve exact-file hash rejection and low-similarity acceptance behavior.
- Run backend/frontend typechecks, API smoke test, browser smoke test, and inspect runtime logs. Project rules prohibit modifying `*.spec.ts`/`*.test.ts`, so the PDF regression uses a temporary probe outside those patterns and is removed after verification.
