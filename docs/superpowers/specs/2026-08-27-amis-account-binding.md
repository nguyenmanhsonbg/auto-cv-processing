# AMIS account binding for interview evaluation access

## Scope

Bind the active AMIS account to the logged-in Extension account before exposing
applications or an interview evaluation form for an AMIS recruitment.

## Rules

1. The Extension account is identified by its persisted `amisUserId` mapping.
2. The active AMIS account must be the exact account captured from the AMIS page,
   not merely a board member returned for the JD.
3. The mapped AMIS account must be an active member of the current JD's
   recruitment board.
4. A committee account can see applications only from the first interview round
   onward. Rounds and their ordering come from the persisted AMIS round catalog;
   no round name or ID is hardcoded.
5. The evaluation form remains the existing single case carried through later
   rounds. This change only gates access and supplies the AMIS context.
6. HR/Admin behavior remains unchanged unless a request carries an AMIS handoff
   context, in which case that context is checked as well.
7. A committee handoff must carry the AMIS user and recruitment context into the
   dedicated evaluation page. Direct local committee login without that context
   is denied for an evaluation opened from AMIS.

## Trust boundaries

- AMIS page data is untrusted external input and is validated before persistence.
- Handoff context is stored server-side and copied into the access-token claims;
  the form API revalidates committee access against the local user, recruitment
  reference and active board membership. HR/Admin retain their manager scope,
  while a supplied recruitment context is still checked against the application.
- Missing or ambiguous AMIS identity fails closed rather than guessing a user.

## Non-goals

- No changes to Facebook, TopCV, Freelancer, Internal or posting flows.
- No replacement of the existing evaluation form UI or old reviewer data model.
- No AMIS account creation or password handling.
