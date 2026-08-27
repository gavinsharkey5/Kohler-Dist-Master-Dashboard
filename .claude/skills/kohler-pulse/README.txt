kohler-pulse skill
==================

Invoke with /kohler-pulse (or just ask for "the Sales Pulse").

  SKILL.md                     the workflow, structure and guardrails
  references/data-sources.md   where every number lives + the traps
  references/voice.md          how it's written, with rejected/accepted pairs
  scripts/extract.py           pulls the whole fact base in one run
  scripts/build_pdf.sh         renders a page to an attachable PDF
  assets/pulse-template.html   the two-view page (report + Outlook-safe email)

Refresh the dashboards first (each folder's own README.txt), then run
the skill. extract.py prints a freshness block so stale inputs are obvious.
