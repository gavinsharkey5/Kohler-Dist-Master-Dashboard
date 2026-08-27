---
name: kohler-pulse
description: Build the Kohler Sales Pulse — the recurring executive sales briefing for Kohler's VP of Sales, published as an Artifact with a report view, an Outlook-safe email view, and a PDF to attach. Use this whenever the user asks for the Sales Pulse, a sales pulse, "the pulse", a weekly/Monday sales briefing, an executive sales update, a newsletter or recap for the VP, or wants the dashboards in this repo turned into something leadership can read. Also use it when they ask to refresh, rerun, or update the Pulse with new data, or when new exports land and they want to know what leadership should hear about.
---

# Kohler Sales Pulse

You are writing a market-intelligence briefing for Kohler Distributing's VP of
Sales — roughly 40 years in beer, runs on instinct and feel, reads on his phone,
does not open dashboards. He is 70 and dislikes cognitive load.

The job is to do genuinely deep analysis across every dashboard in this repo and
then throw almost all of it away, keeping the five to eight things he would want
to know if he walked into the sales office that morning. The sophistication lives
in the analysis. The output is plain, short, and confident.

## The one rule that matters most

**Never judge a rep, territory, or district on raw totals.** Judge on what they
could actually have done. A rep with 137 tiny bodega accounts and a rep with 29
big-box liquor stores are not in the same business, and the customer base files
in this repo tell you which is which. Getting this wrong produced the single
worst error in the Pulse's history — a headline calling the Southern District a
loser on tap share when the truth was we had only surveyed 16% of their accounts,
and when on the portfolio built for those accounts they were beating Core Market.

Before any rep or district appears in a headline, know their account count,
premise mix, account size, draft-capable count, and target-list size. `scripts/
extract.py` prints all of it.

## Workflow

1. **Pull the fact base.** From the repo root:
   ```
   python3 .claude/skills/kohler-pulse/scripts/extract.py
   ```
   It reads every dashboard's embedded data and prints tap share, draft velocity,
   draft volume trends, MPO progress against each rep's own target list, Wine &
   Spirits activation and reorders, displays per account, rep opportunity
   profiles, and inventory backorders. Takes a few seconds. Read the whole output.

2. **Check the data's age.** The script prints a freshness block. Anything more
   than a week or two stale gets said out loud in the footer rather than quietly
   presented as current. `git log --oneline -8` shows what was refreshed recently.

3. **Read `references/data-sources.md`** if you need to go past what the script
   prints, or if a number looks wrong. It documents every source and — more
   importantly — the traps that produce plausible-looking nonsense.

4. **Pick the stories.** Five to eight, total. Ask of each: *would a VP mention
   this to a manager?* If it just says someone is behind, it is not a story.

5. **Write it** following `references/voice.md`. That file has the phrasings that
   have been rejected and what replaced them; it will save you a rewrite.

6. **Build the page** from `assets/pulse-template.html`. Replace the content,
   keep the structure — both views and the copy button are load-bearing.

7. **Publish** with the Artifact tool. Redeploy to the same URL if the user has
   an existing Pulse link; a new edition only gets a new URL if they ask.

8. **Render the PDF** and send it with SendUserFile:
   ```
   bash .claude/skills/kohler-pulse/scripts/build_pdf.sh <pulse.html> <out.pdf>
   ```

## Structure

Keep this order. It moves from "what is happening" to "what to do."

| Section | Content |
|---|---|
| Headline + top line | Two sentences. The single biggest thing, plus the contrast. |
| Scoreboard | Four numbers, no dollars. |
| 🍺 Draft Pulse | 3–4 lines: share → scale → velocity → momentum. Core Market. |
| 🟢 Winning | 2–3 lines. Name people here. |
| 🍷 Wine & Spirits | 2–3 lines. Its own section, every time. |
| 🟡 Open Opportunities | 2–3 lines. Where business is available. |
| 👀 Watching | 2–3 lines. Context, inventory, thin data, pace changes. |
| 🎯 Where to Lean In | 2–4 lines. Conversation starters, not orders. |

Draft leads because it is the business he thinks in, and because Core Market tap
data is the deepest dataset here. If a month's data makes something else the
obvious lead, lead with that instead — the order is a default, not a cage.

## The two views

The page carries the same briefing twice, and both are necessary:

- **Report view** — the full read, rich typography, what the PDF prints.
- **Email view** — a fixed-width table with styling written inline on every cell,
  plus a "Copy for email" button that selects and copies only that block.

The email view looks like over-engineering and is not. Outlook pastes through
Word's HTML importer, which discards `<style>` blocks, collapses margins on
`<p>`, and ignores `max-width`. A normal page pasted into Outlook collapses into
an unreadable wall — this happened, the user sent a screenshot, it is why the
email view exists. Padded table cells and `bgcolor` rules are what survives. If
you restructure the email view, keep it tables-and-inline-styles or it breaks.

Expect the VP's Outlook to be in dark mode. You cannot control how it re-tints
colors, so build hierarchy from spacing, bold lead-ins, and rules — never color
alone.

## Scoreboard rules

Four numbers, all sales or execution — cases, handles, accounts, days left,
placements. **No dollars.** Payouts, "amplify earned", and money locked behind
incentives were explicitly rejected: he does not think in payout, he thinks in
cases and distribution. Money can appear in a supporting clause when it is
genuinely the point, never as a headline or a tile.

## Colour

🟢 momentum · 🟡 opportunity or worth watching · 🔴 reserved for something that
truly needs intervention this week.

Most months should use no red at all. If every gap is red the report reads as a
performance warning, which is the opposite of the intent. The section is called
Open Opportunities, not Needs Attention, for the same reason.

## Before you publish

- Every negative framed as available business, not as a failure.
- No rep named in a negative context. Names in Winning only.
- No dollar figures in headlines or tiles.
- Each item is a headline plus one to three short sentences. No mini-dashboards.
- Any number stale or shaky is dated or hedged in the footer.
- Sixty seconds on a phone, out loud. If you run long, cut Watching first.
