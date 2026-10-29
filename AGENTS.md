# Pair collaboration rules

Read `FEATURES.md` and `HILA_STATUS.md` (when present) before starting, continuing, or merging feature work. Fetch
origin and read the current `origin/main:FEATURES.md`, since a worktree's copy may
be old. The shared board is the source of truth for ownership and status.

- `FEATURES.md` has one writer: Eldad's coordinating AI. Hila's AI must not edit it.
  Hila owns `HILA_STATUS.md`; Eldad must not edit that file after initial setup.
  Hila records claims/status/hook requests there; Eldad mirrors them into the board.
  Both read BOTH remote files before work and push claims/status before implementation.
  If an area is claimed in either file, coordinate before taking it. If a push is
  rejected, fetch and recheck ownership before retrying.
- Use a separate branch and worktree for every coding agent, created before edits.
- Stay within claimed files. Ask the other owner before changing overlapping files.
- Only the laptop's coordinating agent integrates or updates the shared board.
  Feature subagents commit in their worktree and report their SHA and checks.
- Review diffs against the recorded starting SHA. Test each feature and the merged
  game. Mark `done` only after checking the combined result, not merely merging.
- Each coordinator updates its OWN status file when implementing, awaiting integration, done, blocked, or
  failed. Record failures and fixes honestly; never erase another partner's rows.
- Pull before pushing; preserve both partners' contributions. Never force-push or
  rebase shared history. Keep the game offline and browser-only.
- Do not commit generated reports or raw session logs. Use the bundled lab-report
  skill at the end with the same time window on both laptops.
