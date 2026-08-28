# AMIS extension overlay design

## Goal

Replace the browser-dependent Side Panel visibility behavior with an in-page
overlay on the AMIS tab. The overlay must show the existing extension UI,
remain mounted while the user changes tabs, and become visible again when the
user returns to AMIS without resetting the React session.

## Scope

- Reuse `side-panel.html` and its existing React application as the overlay
  iframe document.
- Add a small AMIS content script that owns the iframe host and responds to
  `SHOW`/`HIDE` messages.
- Let the background service worker synchronize visibility with the active tab.
- Keep the existing AMIS capture, authentication, Facebook, CV, and API
  business logic unchanged.
- Keep the interview-evaluation route eligible through the existing URL scope
  helper.

## Lifecycle

1. The content script loads on AMIS and eligible interview-evaluation pages.
2. The content script sends a ready message to the service worker.
3. The service worker sends `SHOW` only for an allowed active tab and `HIDE`
   for other active tabs.
4. `SHOW` creates the iframe once, then only changes host visibility. `HIDE`
   does not remove or reload the iframe, so React state survives tab switches.
5. The toolbar popup and AMIS capture path request `SHOW` through the service
   worker. If an already-open page did not receive the manifest content script,
   the service worker injects the same idempotent script once and retries.

## Compatibility and safety

- The overlay is isolated in an iframe, so AMIS CSS cannot change extension UI
  and extension CSS cannot change AMIS UI.
- The existing side-panel page remains the single UI source of truth; no
  duplicate UI implementation is introduced.
- No Facebook DOM automation or backend contract is changed.
- The old Side Panel API is no longer required for the primary flow, avoiding
  the browser-specific reopen behavior that caused the bug.
