# Accessibility

The target is **WCAG 2.2 level AA**.

## Concrete commitments

**Contrast** ratios are verified in both the light and dark palettes (defined in `client/src/styles/theme.css`): at least 4.5:1 for body text, at least 3:1 for interface elements. **Focus** is always visible: a two-pixel `--accent` outline is drawn on every `:focus-visible` and is never suppressed without an explicit alternative. **Semantic HTML** is preferred over ARIA wherever it suffices: `<header>`, `<main>`, `<aside>` for the notes panel, `<button>` for every action, `<fieldset>` plus `<legend>` for grouped form controls.

**ARIA** is used surgically where semantics cannot carry the meaning. `aria-live="polite"` is set on the toast root (`#toast-root`), on the hand-raise banner, on the persistent connection banner, and on a dedicated screen-reader-only region inside `SpeakerSpotlight` that only receives a sentence on speaker-identity changes (not on every chronometer tick). `aria-label` is set on every icon-only button through the `components/Icon.ts` wrapper. `aria-selected` is set on the focused row of the participant list (`role="listbox"` plus `role="option"`). `role="status"` is set on the chronometers, with an `aria-label` carrying the spoken duration ("Alice, twelve minutes thirty-four seconds"). The language picker carries `aria-haspopup="menu"` plus `aria-expanded`, and each menu item is a `role="menuitemradio"` with `aria-checked`. Decorative elements (icons without a label, the floating background of the home page, the diagonal stripe pattern of the participant fill bars) all carry `aria-hidden="true"`.

**Avatars** use `role="img"` with a reconstructed `aria-label` that combines the participant's full name, role and connection or speaking state ("Alice Martin, Product Manager, speaking"). The two initials rendered inside the avatar are `aria-hidden` so the screen reader does not read both.

**Required form fields** carry the `.required` class on the `<legend>` or label `<span>` and CSS adds a red asterisk through a `::after` rule. The native HTML `required` attribute is also set on the matching `<input>` so screen readers announce the requirement.

**Keyboard navigation** covers every interaction. The first tab stop in the SPA shell is a "Skip to main content" link that targets `<main id="main-content" tabindex="-1">`; the router moves focus to that element on every route change so keyboard users land in the new view instead of staying on a stale element. The full shortcut table lives in `keyboard.md`. The shortcuts use a modifier (Alt, Ctrl, Ctrl + Shift) so the same keys work whether or not the host is typing in the notes. Every modal dialog runs through the shared `lib/dialogA11y.ts` helper, which traps Tab inside the dialog, closes on Escape and backdrop click, and restores focus to the element that opened the dialog on close. The drag-and-drop reorder for participants and topics is doubled by chevron buttons that are keyboard-accessible. The notes panel is resizable through a `role="separator"` handle that responds to the left and right arrow keys when focused, so the mouse-only drag is not the only way to set its width.

**Hit targets** for primary actions are at least 44 by 44 pixels (`.btn { min-height: 44px }`); header icon buttons are 40 by 40; secondary in-list actions are 32 by 32 (acceptable for dense lists where the primary action is already large).

**Motion** respects `prefers-reduced-motion: reduce`: the hand-icon pulse, the phase-pill pulse, the `turn-over-pulse` on the spotlight's small chronometer and progress bar, the toast in and out, the global timer water animation, the floating-background icons and **all global CSS transitions** are disabled in that mode.

**No information is conveyed by colour alone.** A participant's share of the speaking time is rendered both by a deterministic hue and by the orientation of a stripe pattern whose angle varies by index (20, 70, 110, 160, 45, 135 degrees) so two close hues remain distinguishable for colour-blind viewers. The "speaker granted" state is marked by a Speech badge on the avatar, a ring around the avatar and a proportional fill bar. The time-box is doubled by a border colour, by the green-to-orange-to-red transition of the secondary progress bar, by a discreet pulse on the small chronometer and its bar when the limit is exceeded, and by audible ticks at 10, 5, 3, 2 and 1 seconds.

## Verification

Lighthouse Accessibility scores at least 95 on the home page and the meeting page. Manual NVDA and VoiceOver testing confirms that the sequence "Bob raises his hand" is announced correctly. The full path from the home page to exporting the notes can be completed with the keyboard alone.

## Known limits

CodeMirror 6 itself is highly accessible, but **remote collaborator cursors are not announced** verbally. This is a generic limitation of collaborative editors and is not specific to Meetingtime. The application targets **desktop**; a banner warns visitors on small screens.
