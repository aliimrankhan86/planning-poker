# Claude.ai project knowledge

This folder feeds the **Point Poker** project in Claude.ai. The project syncs this repository from GitHub (branch `main`), so whatever is committed here is what the assistant knows after the next sync.

| File | What it is | How it stays current |
|---|---|---|
| `PROJECT-BRIEF.md` | Current state: product facts, routes, SEO position, decisions, open work, access and deploy | Edited by hand as the last step of every major change |
| `CODE-MAP.md` | Every source file with its functions, components and constants, line numbers and the comment above each, plus the Firebase database shape | Regenerated on every commit by the pre-commit hook (`scripts/gen-code-map.mjs`), and by `npm run docs` |
| `LINK-BUILDING.md` | Where to get Point Poker listed, the listing copy to use everywhere, outreach emails and a progress log | Edited by hand whenever a listing or outreach happens |
| `SEARCH-CONSOLE-YYYY-MM-DD.md` | Dated Search Console snapshots | A new file at each review. Never edit an old one |
| `../AI-CONTEXT.md` | Generated structure, routes, constants and traps | Regenerated on every commit |

Kept out of git on purpose, because this repository is public:

- `CLAUDE.md` and `AGENTS.md`: private operational notes. Uploaded to the Claude.ai project directly.
- `CLAUDE-PROJECT-INSTRUCTIONS.md` (repo root): the canonical copy of the project instructions, which hold account details.

Never put account emails, credentials or anything private in this folder.

## What counts as a major change

- **Product facts:** price, room capacity, decks, roles, accounts, session limits, a feature added or removed.
- **Routes:** a landing page added, removed, renamed or retitled, a page translated, a language added or retired.
- **Architecture:** stack, hosting, build or deploy changes, Firebase rules or Functions.
- **SEO:** a Search Console review, a new baseline, redirect or indexing changes.
- **Business decisions:** anything that changes the discovery gates or spend.
- **Open items:** a defect or pending task opened or closed.
- **Access:** accounts, hosting projects or integrations changed.

Copy tweaks, refactors with no change in behaviour, and test-only changes are not major. The code map and AI context update themselves on every commit regardless.

## Refresh procedure

Whoever makes a major change (Ali or any AI agent) runs this as the last step of the task, without being asked.

1. **Brief:** update `PROJECT-BRIEF.md`, the "Last updated" date and every section the change touched. For a Search Console review, add a new `SEARCH-CONSOLE-<date>.md` and point the brief at it.
2. **Instructions:** if product truth, rules, playbooks, open items or access changed, edit `CLAUDE-PROJECT-INSTRUCTIONS.md`.
3. **Private notes:** update `CLAUDE.md` and `AGENTS.md` as the mandatory workflow already requires, and note whether either changed materially.
4. **Commit and push `main`.** The hook regenerates `CODE-MAP.md` and `docs/AI-CONTEXT.md`. Confirm the commit shows a Vercel status on GitHub.
5. **Claude.ai** (project URL in `CLAUDE.md`), in Chrome:
   - On the GitHub card in Context, sync, then open the card and check any new file under `docs/claude-project/` is ticked.
   - If step 2 changed the instructions: Instructions, edit, replace the text with `CLAUDE-PROJECT-INSTRUCTIONS.md`, save.
   - If step 3 changed `CLAUDE.md` or `AGENTS.md` materially: replace the uploaded copy with the new file.
6. **Verify** after a reload: instructions length and final line, the file list, capacity used.
7. **Record** the refresh in the `PROGRESS.md` entry for the change.
