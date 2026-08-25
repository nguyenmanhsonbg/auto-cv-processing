# Recruitment import workbook

Import file: `.xlsx`, uploaded from Dashboard → `Import dữ liệu`.

The workbook must contain these four sheets:

## candidates

Required columns: `candidate_key`, `name`.

Optional columns: `email`, `phone`, `birth_year`, `position`, `level`.

## applications

Required columns: `application_key`, `candidate_key`, `job_posting_id`.

Optional columns: `external_application_id`, `source_channel`, `current_stage`,
`assigned_recruiter_id`, `offer_status`, `hired_at`, `created_at`.

## interview_rounds

Required columns: `application_key`, `round_type`.

Optional columns: `external_round_id`, `scheduled_at`, `started_at`,
`completed_at`, `result`, `overall_grade`, `scores_json`, `summary`.

## offers

Required columns: `application_key`, `status`, `job_title`.

Optional columns: `version`, `external_offer_id`, `department`, `level`,
`gross_salary`, `start_date`, `contract_type`, `work_location`, `sent_at`,
`responded_at`, `expires_at`, `notes`.

## Allowed enum values

- `level`: `ENTRY`, `EXPERIENCED`, `SENIOR`, `SPECIALIST`
- `source_channel`: `VCS_PORTAL`, `FACEBOOK`, `TOPCV`, `ITVIEC`, `VIETNAMWORKS`, `LINKEDIN`, `MANUAL`, `OTHER`
- `current_stage`: `APPLIED`, `PRE_TEST_1`, `SCREEN_CV`, `INTERVIEW_1`, `PRE_TEST_2`, `INTERVIEW_2`, `OFFER_PENDING`, `OFFER_SENT`, `OFFER_REVISED`, `HIRED`, `REJECTED`, `TALENT_POOL`
- `round_type`: `INTERVIEW_1`, `INTERVIEW_2`
- `result`: `PASS`, `FAIL`, `NO_SHOW`, `PENDING`
- `overall_grade`: `EXCELLENT`, `GOOD`, `AVERAGE`, `POOR`
- `status`: `PENDING`, `SENT`, `REVISED`, `ACCEPTED`, `REJECTED_BY_CANDIDATE`, `CANCELLED`, `EXPIRED`
- `contract_type`: `PROBATION`, `INDEFINITE`, `FIXED_TERM`

Dates accept ISO date-time strings. `start_date` uses `YYYY-MM-DD`.
`scores_json` must be a JSON object, for example `{"technical": 4}`.

The import validates the complete workbook before writing. Invalid references or
rows identify their sheet, row and column, and no partial import is committed.
