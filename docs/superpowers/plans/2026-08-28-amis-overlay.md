# Implement AMIS overlay host

## Steps

1. Add a typed message contract for overlay readiness, open requests, and
   visibility control.
2. Add an idempotent content script entry that mounts the existing
   `side-panel.html` in a fixed iframe and preserves it while hidden.
3. Register the content script and iframe resources in the extension manifest,
   and add the normal Vite entry for the content script.
4. Route the existing popup and AMIS-capture open paths through the overlay;
   synchronize `SHOW`/`HIDE` on tab activation and AMIS navigation.
5. Run the repository-required typecheck and inspect runtime logs. Do not add
   test files because the repository explicitly prohibits modifying test files.
