# Chrome Button Rounding and Hover

**Date:** 2026-06-22
**Status:** Approved

## Goal

Round the corners of `.chrome-button` instances and add a subtle hover highlight, replacing the current square-cornered no-feedback buttons in the New Session and Settings modals.

## Background

The `.chrome-button` class (`public/css/term.css:1302`) is the primary action-button style used for `Connect`, `Cancel`, `Save`, `Save Connection`, `Apply`, `Import`, etc. in both the New Session and Settings modal dialogs. The base `button` element selector (`term.css:438`) sets no `border-radius`, and `.chrome-button` does not override it — so these buttons render with the browser default of 0 (square corners). Additionally, `.chrome-button` has no `:hover` rule of its own. The only hover effect is `cursor: pointer` from the base button style.

Other button classes in the same modals already have rounding and hover effects:
- `.workspace-chip` (SSH/Telnet protocol chips): `border-radius: 999px`, hover `translateY(-1px)`
- `.settings-tab` (Appearance/Background tabs): `border-radius: 8px 8px 0 0`, hover background
- `.toolbar-button` (top bar icons): `border-radius: 6px`, hover `translateY(-1px)`

So `.chrome-button` is the only visible button surface in these modals without rounding or hover feedback.

## Changes

**Single file: `public/css/term.css`**, three additions to the existing `.chrome-button` rule at line 1302, plus one new `:hover:not(:disabled)` rule.

### Updated `.chrome-button` rule

```css
.chrome-button {
  min-width: 82px;
  border-color: var(--ui-button-border);
  background: var(--ui-button-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;
}
```

Three additions:
- `border-radius: 8px` — matches `.saved-connection-item` (line 49) and `.settings-tab` top corners (line 6435), keeping the codebase's existing radius vocabulary
- `transition: background-color 140ms ease, border-color 140ms ease` — matches the 140ms duration used by `.toolbar-button` (line 1293-1297) so the hover cross-fade feels consistent across button surfaces

### New `.chrome-button:hover:not(:disabled)` rule

```css
.chrome-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--panel) 72%, transparent);
}
```

- Increases panel opacity from 52% (the static `--ui-button-bg` value) to 72% on hover — a subtle brighten, visible on both light and dark themes
- `:not(:disabled)` mirrors the pattern used by `.toolbar-button:hover:not(:disabled)` (line 1299) so disabled buttons don't show a hover effect (the base `button:disabled` style already dims them to `opacity: 0.56`)

## Out of Scope

- No changes to `.toolbar-button`, `.workspace-chip`, `.settings-tab`, `.settings-close-button`, or any other button class
- No HTML or JS changes
- No new CSS custom properties or design tokens
- No changes to `:focus-visible` styling (existing accent-ring behavior preserved)
- No changes to `.chrome-button.is-primary`, `.is-secondary`, `.is-danger`, `.is-icon-only` modifiers — they inherit radius/transition/hover from the base rule, which is the desired behavior

## Success Criteria

- All `.chrome-button` instances in New Session and Settings modals render with 8px rounded corners
- Hovering an enabled `.chrome-button` smoothly (140ms) brightens the background from 52% to 72% panel opacity
- Hovering a disabled `.chrome-button` shows no background change (only the existing `opacity: 0.56` dim)
- Existing focus-visible ring still renders correctly on top of the hover state
- Other button classes (toolbar, chips, tabs) are visually unchanged
