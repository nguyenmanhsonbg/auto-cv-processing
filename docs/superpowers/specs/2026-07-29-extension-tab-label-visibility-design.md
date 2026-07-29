# Extension Tab Label Visibility Design

## Goal

Keep the extension's four workspace tabs on one row while ensuring the Vietnamese labels `Đăng bài`, `CV`, `Freelancer`, and `Nội bộ` remain fully readable in narrow side panels.

## Root cause

The tab label is a flex item with `overflow: hidden` and `text-overflow: ellipsis`. The final extension-shell override also keeps a compact fixed tab height while inheriting `line-height: 1` from the base rule. Together, these constraints can clip Vietnamese glyphs vertically or shorten the label when the panel becomes narrow.

## Design

- Keep the existing four-tab navigation and tab-selection behavior unchanged.
- Use a readable line-height for the tab button and label so Vietnamese diacritics have enough vertical room.
- Remove truncation behavior from the label; labels must remain on one line and use their intrinsic width.
- Preserve the four-column layout when the panel has enough room.
- Allow the navigation row to scroll horizontally when the panel is narrower than the intrinsic width of all four labels, instead of clipping or hiding text.
- Keep the existing active color, underline, icon set, and responsive visual style.

## Scope

Only `apps/extension/src/styles.css` and a focused regression check for the tab CSS contract are in scope. No React rendering, labels, navigation state, or unrelated extension styles will change.

## Acceptance criteria

1. All four tab labels render as complete, single-line strings at the normal extension width.
2. Vietnamese diacritics are not clipped vertically.
3. The labels are not replaced by ellipses or hidden by `overflow: hidden`.
4. The four tabs remain in one horizontal row at narrow widths; if the intrinsic content is wider than the panel, the row can scroll horizontally.
5. Existing extension typecheck/build checks pass.

## Verification

- Add a focused CSS regression check that fails when the label truncation or compact line-height regression is present.
- Run the focused regression check and the extension production build/typecheck.
- Review the final diff to confirm the change is limited to the tab presentation and its regression check.
