---
name: testing-accessibility
description: ADHD planlayıcısının Next.js arayüzünde JWT giriş, görev ağacı, takvim, plan önizleme/geri alma ve odak akışlarını Playwright ile test et; responsive ve erişilebilirlik denetle. API/DB testleri için backend becerilerini kullan.
---

# Testing and Accessibility

Test observable ADHD planner outcomes against the real frontend and documented ASP.NET API. Authentication is a non-expiring application JWT in localStorage, no refresh token or auth cookie. Automated accessibility checks are one layer, not proof of accessibility.

## Ground the work

1. Locate the frontend root from the nearest `package.json`.
2. Inspect the package manager, test tools, Next.js version, route tree, central JWT adapter, error boundaries, forms, and conventions.
3. Locate AGENTS.md, Uygulama Adımları.md and existing OpenAPI/docs/api-design.md; do not assume future docs already exist.
4. Read [adhd-flows.md](references/adhd-flows.md) before testing login, tasks, planning, calendar, or focus.
5. Read [test-architecture.md](references/test-architecture.md) before adding test dependencies, configuration, fixtures, or selectors.
6. Read [accessibility-and-reporting.md](references/accessibility-and-reporting.md) before an accessibility audit or defect report.
7. Inspect the relevant OpenAPI operation and Markdown endpoint contract. Report conflicts instead of inventing expected behavior.
8. Verify version-specific test-library behavior against current official documentation.

Use isolated non-production accounts/tasks; do not expose JWTs or assume a seeded fixture exists.

## Use available MCP tools

- Use **Playwright MCP** (`playwright`) for exploratory browser execution, responsive emulation, keyboard interaction, screenshots, console capture, and quick reproduction of login/product/cart/checkout states. Convert valuable coverage into committed Playwright Test cases; an MCP session is not the regression suite.
- Use **Chrome DevTools MCP** (`chrome_devtools`) for independent console, page, network, accessibility/Lighthouse, rendering, and performance evidence when a browser failure needs deeper diagnosis.
- Use **Next DevTools MCP** (`next_devtools`) for Next.js-specific route/runtime errors, rendering behavior, and version-matched framework guidance.
- Use the smallest sufficient tool set and correlate evidence by route/state. If an MCP is unavailable, continue with repository tests or local browser tooling and mark what was not verified.

## Define scope before execution

Record:

- base URL and environment;
- build or commit identifier;
- browser, viewport/device profile, operating system, locale, and color scheme;
- anonymous or authenticated user state;
- fixture/account identifiers without secrets;
- mocked, sandboxed, or real test API boundaries;
- flows and states included or explicitly not verified.

Prefer a small risk-based matrix over duplicating every assertion at every viewport. Run the canonical happy paths plus high-risk error and recovery states.

## Build stable end-to-end coverage

- Use Playwright Test for browser-level flows unless the repository already standardizes on another capable runner.
- Prefer `getByRole`, `getByLabel`, `getByText`, and visible user outcomes.
- Use `data-testid` only when no stable accessible or user-facing locator exists.
- Never select by generated CSS class, DOM depth, arbitrary timeout, or implementation-only text.
- Use web-first assertions and event-driven waits. Do not use fixed sleeps.
- Keep each test isolated and repeatable. Create unique users, tasks, plans, sessions, and idempotency keys per test or worker.
- Use API/fixture setup for prerequisites, but keep at least one full browser journey through every critical boundary.
- Store reusable login state only in a gitignored location. Never commit cookies, tokens, passwords, or storage-state files.
- Preserve traces, screenshots, and videos on failure according to the repository's CI retention policy.

## Cover the critical ADHD journeys

Implement the matrix in [adhd-flows.md](references/adhd-flows.md). At minimum cover:

1. JWT login, invalid credentials, persisted login after reload, protected routes, invalid token handling, and local logout. No expiry/refresh flow.
2. Quick task entry, nested tasks, direct/budget/unknown estimates, complete/reopen, pool and filters.
3. Calendar editing, fixed blocks, preview/apply, stale conflict, urgent insertion, multi-day move and history-safe undo.
4. Work start/pause/resume, two tabs, 35/7 focus, target overtime, breaks, notes and truthful statistics.

Assert visible state and important API behavior. Do not duplicate scheduling/workload/analytics rules in frontend expectations; use controlled fixture facts and authoritative API results.

## Test responsive behavior

- Configure representative desktop Chromium and mobile Chrome/Safari-compatible projects.
- Add targeted narrow, tablet, desktop, and zoom/reflow checks where the layout risk exists.
- Check for horizontal overflow, clipped content, overlapping controls, unreachable actions, off-screen dialogs, sticky-element collisions, and virtual keyboard obstruction.
- Exercise navigation, task tree, calendar menus/drag alternatives, focus controls, form errors, drawers and orientation changes.
- Verify touch target spacing manually when automation cannot determine it.
- Assert behavior and usable layout, not pixel-perfect screenshots across every browser.
- Use visual snapshots only for stable, high-value regions with deterministic data, fonts, animations, and clocks.

## Audit accessibility

Target WCAG 2.2 AA unless the project declares a stricter standard.

- Run axe on stable task/planning/focus states, open panels, menus and validation errors.
- Treat every excluded selector or disabled rule as a documented, time-bounded exception.
- Review axe `incomplete` results; do not discard them.
- Manually complete keyboard, focus, screen-reader, form, zoom, reflow, contrast, and motion checks from [accessibility-and-reporting.md](references/accessibility-and-reporting.md).
- Test semantic names and states, not merely the presence of ARIA attributes.
- Test with a real screen reader when the environment permits. Otherwise report screen-reader behavior as not verified, never as passed.
- Re-test the exact affected state after a fix and run a focused regression around it.

## Capture runtime failures

Collect evidence from the beginning of each test:

- uncaught page exceptions;
- unexpected `console.error` messages;
- failed requests;
- unexpected `4xx` and `5xx` responses;
- redirect loops and unexpected token-refresh calls (refresh is not part of this project);
- hydration warnings;
- broken images and fonts;
- visible error, empty, loading, and retry states.

Allowlist only errors intentionally produced by the scenario, and scope the allowlist to the exact request and status. Redact authorization headers, cookies, tokens, credentials, personal data, payment data, and sensitive request bodies from all attachments and reports.

For UI failures, include the last visible state and accessible locator/action. For network failures, include method, safe path, status, response code/trace ID when available, and request correlation without secrets.

## Classify findings accurately

Separate:

- product defect;
- accessibility defect;
- frontend/API contract mismatch;
- environment or fixture failure;
- test defect or flake;
- observation requiring manual verification.

Report one root cause per issue when possible. Include severity, affected flow/state/device, reproducible steps, expected and actual results, evidence, likely owner, and retest criteria. Never call a flow passed if a required assertion was skipped or the environment masked the behavior.

## Validate changes

1. Run the smallest focused test set during iteration.
2. Run type checking, lint, and relevant unit/component tests.
3. Run critical E2E flows on the primary desktop and mobile projects.
4. Run the accessibility scan plus required manual checks.
5. Inspect console, page-error, and network evidence.
6. Repeat failed tests to distinguish deterministic failures from flakes; fix the cause rather than adding retries.
7. Run the production build when test/configuration changes affect the application boundary.
8. Summarize passes, failures, skipped/not-verified checks, artifacts, and residual risk.

When asked only to plan, review, audit, or report, do not modify application code. When asked to implement or fix, make the smallest cohesive change, preserve the repository architecture, and provide evidence from focused retesting.
# JWT project boundary

Login yanıtında accessToken beklenir; merkezi adaptörün localStorage kaydı yetkilidir. Bu kayıt dışında token'ı DOM, normal URL, console veya artifact'e yayma. Logout local token/cache'i temizler; kopya JWT'nin sunucuda iptal edildiğini assert etme. Google proof ve parola-reset kodu uygulama access token'ından ayrı süre kurallarına sahiptir. Kullanıcı talebi olmadan cookie/refresh auth geri ekleme.
