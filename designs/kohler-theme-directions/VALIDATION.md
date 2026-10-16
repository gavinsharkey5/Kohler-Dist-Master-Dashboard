# Signature branch validation

Branch: `codex/kohler-signature-theme`; base: `8e9f0d50`.
This is a preview candidate. It is not approved for main or production.

## Automated checks

- `node tools/signature-static-test.cjs`: 42 theme text/background pairs meet 4.5:1;
  102 authenticated pages reference the shared Signature assets; five synthetic concepts
  and the self-hosted DM Sans font/license are present.
- `node tools/invoice-documents-browser-test.cjs`: 29 checks passed on the second run.
  The first run failed the saved invoice-number assertion; the unchanged rerun passed.
  This suite uses synthetic API fixtures and an isolated browser, not live records.
- `node tools/work-browser-test.cjs`: 23 checks passed with synthetic API fixtures.
- JavaScript syntax checks and `git diff --check`: passed.

## Interactive checks on actual application pages

Local `tools/signature-preview-server.cjs` serves the real branch source with synthetic,
read-only data. The local fake identity and API are never deployed (`tools/` is ignored).

Home, Supplier Budgets, Add Expense, Accounts, Incentive Hub, Inventory, Team, and Field
Tasks were checked at 1366 and 390 pixels in light mode, and at 1366, 820, and 390 pixels
in dark mode: the shared DM Sans theme rendered and no document exceeded viewport width.

Desktop role checks:

- Finance: five navigation destinations, exactly four home tool cards, no personal task
  card or task metrics. Existing Alexis finance boundaries are preserved.
- Rep: rep destinations and personal task summary; no budget navigation.
- Associate: My Tasks and its existing single Home destination.
- IT: UPC Audit only.
- Manager: all existing tools remain reachable; Supplier Budgets is a primary desktop
  link, with the remaining tools grouped into expandable sections.

This is presentation and workflow regression verification, not a new database/RLS audit.
No middleware, API, database schema, authentication, expense calculations, table fields,
CSV exports, or document-storage rules were changed.

The saved design references are alternatives for future work. They are not five
production theme implementations or an end-user theme switcher.
