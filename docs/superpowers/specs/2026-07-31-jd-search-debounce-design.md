# JD Search Debounce Design

## Goal

Job description search should run automatically after the user stops typing for 300ms, without requiring Enter. The existing Enter key and Search button remain available for immediate search.

## Behavior

- `searchInput` remains the controlled input value.
- After each input change, cancel the previous timer and start a new 300ms timer.
- When the timer fires, trim the input, reset pagination to page 1, and update the committed `search` value.
- Enter or clicking Search immediately commits the trimmed value and cancels any pending debounce timer.
- Existing loading, error, pagination, and API behavior remain unchanged.

## Scope and testing

Change only the job description list page. Verify that debounce commits the latest value once after 300ms, immediate submit still works, and the frontend typecheck/build pass.
