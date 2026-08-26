# AMIS Recruitment Board Reviewers

## Goal

Use the members selected in AMIS `RecruitmentBoards` as the reviewers of the single interview evaluation form for a job posting. The local VCS user role determines which section each selected account can edit.

## Rules

- AMIS membership is the assignment source for a recruitment/JD.
- VCS database role is the authorization source.
- `HR` accounts review the HRBP section.
- `COMMITTEE` accounts review the HĐCM section.
- An account with both applicable permissions may review both sections.
- A selected AMIS account without a VCS mapping is not granted evaluation access.
- The evaluation case is created only when an application reaches an AMIS interview round (`roundType = 3`).
- All subsequent interview rounds reuse the same evaluation case and form.
- The HR committee-selection popup is removed from the extension flow.
- Existing manual committee administration endpoints remain available for legacy/settings usage, but are not used to create AMIS application reviewers.

## AMIS source

The extension calls `detail-board-info/{recruitmentId}` with AMIS page credentials and reads `Data.RecruitmentBoards`. `SaveRecruitment` is not sufficient because its response does not include the board members.
