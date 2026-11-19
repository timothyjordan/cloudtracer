# Playwright E2E Conventions

Cover user-observable browser workflows with deterministic Playwright end-to-end tests.

## Running E2E suites

1. Run `npx playwright test` and confirm passing output before committing UI or user-flow changes.
2. Keep each test independent so specs pass regardless of execution order or parallelism.

## Selector and accessibility stability

1. Prefer accessible, user-facing locators first: `page.getByRole(...)`, `page.getByLabel(...)`, `page.getByPlaceholder(...)`, and `page.getByText(...)`.
2. Fall back to `page.getByTestId(...)` only when semantic roles and accessible names do not distinguish elements.
3. Avoid brittle CSS class chains, XPath expressions, or DOM-index selectors.
4. Use Playwright web-first assertions (`await expect(locator).toBeVisible()`, `toHaveURL()`, `toHaveText()`) instead of fixed sleeps (`waitForTimeout`).

## Failure artifacts and debugging

1. Inspect Playwright failure traces, screenshots, and HTML reports under `test-results/` and `playwright-report/` before changing application or test code.
2. Never commit `playwright-report/` or `test-results/` artifact directories to git.
