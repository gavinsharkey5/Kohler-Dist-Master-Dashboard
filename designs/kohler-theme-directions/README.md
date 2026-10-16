# Kohler Hub design archive — October 16, 2026

Gavin selected **Kohler Signature**, including its layout, for a separate-branch preview.
No Precision table layout was selected. The other four directions remain design references.

## Preserved designs

- Kohler Signature: navy sidebar, light canvas, blue actions, restrained gold.
- The Dispatch: paper surfaces, editorial headings, horizontal departments.
- Precision Workspace: compact neutral workspace, joined list/detail treatment.
- Fieldwork: forest green, rounded surfaces, task lanes.
- Nightshift: charcoal/amber operations workspace.

`concepts.html` is the editable five-variant concept source. `index.html` is a standalone,
sandboxed comparison with the original carousel, Home, Supplier Budgets and New Expense.
`design-*.png` preserves the five desktop home views. All figures and identities in the
versioned gallery are synthetic. It performs no live expense or document writes.

The original unsanitized source, standalone gallery, audit and five screenshots are also
saved in Gavin's workspace at `Design Archive/2026-10-16 Kohler Theme Concepts/` and a ZIP
alongside it. That local archive includes the invoice example supplied in the conversation.

## Active implementation

- `shared/signature.css`: Signature tokens, both appearance modes, site shell, home and budget styling.
- `shared/signature-home.js`: actual task summary, existing program links, frequently used tools,
  and the expandable directory. No sample business figures are used in the application.
- `shared/kdh-user.js`: authorized desktop links grouped into the Signature navigation.

The signature stylesheet is imported by the common `shared/kdh.css`, so legacy dashboard
aliases receive the same theme. Existing page logic, RLS, financial calculations, table fields,
CSV exports, and uploader remain authoritative.

## Changing direction later

These are saved design alternatives, not five finished production themes or an end-user theme
picker. To swap later, start a branch, take the selected direction's palette, typography and
composition from this gallery, adapt the shared stylesheet and relevant layouts, then rerun
role, workflow, light/dark and responsive checks. Preview and approve before merging.

The Signature light/dark switch remains the existing appearance control. Do not change user
permissions or weaken authentication to make a theme preview easier to open.
