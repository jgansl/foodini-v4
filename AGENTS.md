<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Deferred work

Log all deferred work in `docs/ROADMAP.md`, under its **Backlog** section. That covers anything you notice but don't do now: review findings you didn't fix, known bugs, TODOs, follow-ups, and anything skipped or descoped from a plan.

- Add the entry in the same change that defers the work. Don't leave `TODO` comments in code as the only record.
- One line per item: what is wrong or missing, where (file or feature), and why it matters. Mark with ★ anything a later phase depends on.
- When you finish a backlog item, remove its line and note the fix in `docs/CHANGELOG.md`.
- Record a significant design choice made while deferring in `docs/DECISIONS.md`.
