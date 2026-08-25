# Candidate Interview Evaluation Design

## Goal

Add a round-based interview evaluation workflow to the existing recruitment application without changing the existing candidate-card metrics or unrelated recruitment flows.

## Approved UX

- Keep the current candidate card unchanged.
- Add one full-width `Phiếu đánh giá phỏng vấn` block below the existing status/metric tiles.
- Show the current round, evaluation status, evaluator progress, and one contextual action button:
  - `Đánh giá vòng ...`
  - `Tiếp tục đánh giá`
  - `Xem tiến độ`
  - `Xem phiếu`
  - `Xem phiếu đánh giá`
  - `Bổ sung đánh giá`
- The first click opens a small confirmation dialog containing the candidate, job description, round, template, and assigned evaluators.
- The confirmation then opens a dedicated full-page evaluation view; the complete form must not be squeezed into the narrow extension panel.

## Business Workflow

1. A candidate belongs to one application and one job description. Each application has an independent evaluation case and round history.
2. When the candidate reaches an eligible interview round, HR can create or open the round evaluation.
3. HR fills the HRBP section and may save a draft. Autosave is represented by persisted draft updates; the UI exposes the current saved state.
4. HR submits the round to the assigned professional committee. Committee members can only evaluate the sections assigned to them and cannot see peer scores before submitting their own evaluation.
5. HR or the committee chair aggregates the submitted reviews, records the final decision, and completes the round.
6. A completed round is immutable to ordinary users and enables the next-stage transition. Any correction is a new revision and is auditable.
7. The evaluation follows the candidate across later rounds as historical context, while every round keeps its own immutable result.

## Templates and Form Data

- Use the BM04 workbook as the source model.
- Support `BM04.1 KNL` for job descriptions with a competency framework and `BM04.2 Careerpath` otherwise.
- Keep the evaluation data structured in the application database so it can later be exported back to BM04.
- Preserve the main BM04 sections: candidate/placement information, overall assessment, HRBP, professional committee, final interview/offer summary, and history.

## Authorization

- HR and administrators can create, edit, submit, aggregate, and complete evaluations within their permitted recruitment scope.
- Assigned committee/interviewer users can view the case and submit only their assigned review section.
- A user may not read or mutate a candidate evaluation outside the application/JD scope or assigned review.
- Authorization must be enforced in backend endpoints; frontend visibility is only a convenience.

## Non-goals

- Do not change the existing session-based `evaluations` flow.
- Do not change existing candidate metrics, AI labels, AMIS synchronization, CV processing, recruitment channel posting, or current status transitions except for the explicit evaluation-round action.
- Do not modify test/spec files, Sonar configuration, or unrelated UI.
