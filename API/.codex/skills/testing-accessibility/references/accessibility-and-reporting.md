# Accessibility and Defect Reporting

## Manual keyboard checks

For each critical state:

- navigate from the browser chrome using only Tab, Shift+Tab, Enter, Space, arrow keys where defined, and Escape where supported;
- verify a visible focus indicator and logical focus order;
- verify skip navigation and landmark entry points;
- verify no keyboard trap;
- verify hidden, disabled, or inert content is not focusable;
- verify menus, comboboxes, tabs, dialogs, drawers, quantity controls, variant selectors, and checkout steps follow expected keyboard behavior;
- move focus to a useful target after route changes, destructive actions, validation failure, and content removal;
- place initial dialog focus deliberately and return it to the trigger on close;
- ensure sticky bars, cookie banners, and virtual keyboard behavior do not obscure focused controls.

## Screen-reader checks

Use a real screen reader supported by the available operating system and browser. Record the exact pairing.

Verify:

- page title, language, landmarks, headings, and reading order;
- link/button names make sense out of context;
- current navigation, expanded/collapsed, selected variant, quantity, availability, and disabled states are announced;
- product price, discounts, old/new price, and cart totals are understandable without visual layout;
- image alternatives convey purpose without duplicating nearby text;
- cart changes, validation summaries, loading, saved state, payment status, and unexpected errors are announced at an appropriate priority;
- dialog name/description and focus containment are correct;
- checkout step, progress, required fields, and confirmation are understandable.

If a real screen reader is unavailable, mark this section `Not verified`. DOM inspection or an accessibility tree snapshot is useful evidence but is not a screen-reader pass.

## Forms

Verify:

- every input has a persistent programmatic label;
- required/optional status is communicated in text and semantics;
- `autocomplete`, input type, and input mode match the data;
- instructions precede the control they describe;
- errors identify the field and correction, are programmatically associated, and are not conveyed by color alone;
- an error summary links or moves focus to invalid fields for long forms;
- server-side errors preserve safe user input but never repopulate passwords or payment secrets;
- disabled submit states do not strand users; busy/submitting state is announced;
- password controls support paste and password managers;
- success does not rely only on a transient toast.

## Visual, zoom, and motion

- Check text and non-text contrast in default, hover, focus, disabled, error, and selected states.
- Check browser zoom and text scaling, including 200% zoom and 400% reflow where applicable.
- Check narrow widths for two-dimensional scrolling unless the content genuinely requires it.
- Check forced colors/high contrast when supported.
- Check light/dark schemes if the application offers them.
- Respect reduced motion; do not require animation to understand or complete a task.
- Check touch targets and spacing, especially quantity, remove, variant, menu, and payment controls.

## Severity

- **Critical:** blocks purchase/login for most users, causes unsafe payment duplication, exposes sensitive data, or has no accessible path through a critical flow.
- **High:** blocks a critical flow for a device or assistive-technology group, keyboard trap, unlabeled required control, lost checkout state, or persistent `5xx`/crash.
- **Medium:** materially impairs completion but has a reliable workaround; significant responsive overlap, poor focus handling, or incomplete error association.
- **Low:** localized friction, minor semantic issue, or cosmetic defect with limited task impact.

Severity describes user impact, not code complexity or rule name.

## Finding template

```markdown
### [ID] Concise user-impact title

- Severity:
- Category: Functional | Accessibility | Responsive | Console | Network | Contract | Test/Environment
- Environment/build:
- Route and state:
- Browser/device/assistive technology:
- Preconditions/fixture:
- Steps:
  1.
- Expected:
- Actual:
- Frequency:
- Evidence: trace, screenshot, video, console excerpt, safe request path/status, ProblemDetails code/traceId
- WCAG criterion/rule, when applicable:
- Sensitive-data review: Passed | Redaction required
- Likely owner:
- Retest criteria:
```

Do not paste secrets or personal/payment data into the report.

## Test summary template

```markdown
## Test summary

- Scope:
- Environment/build:
- Projects/devices:
- Passed:
- Failed:
- Skipped:
- Not verified:
- Flaky:
- Console/page errors:
- Unexpected network failures:
- Accessibility automated/manual coverage:
- Artifacts:
- Residual risk:
```

Keep skipped, blocked, and not-verified results separate from passes. Link each failure to one reproducible finding and note whether the failure is a product defect, contract mismatch, environment problem, or test defect.
