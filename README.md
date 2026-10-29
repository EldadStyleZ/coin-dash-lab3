# Coin Dash — Neon Arcade

A browser-only arcade game built by Eldad and Hila for HUJI AICODE Lab 3.
Collect coins, dodge creatures and survive a growing swarm. Start with 60 seconds;
**every normal or special coin adds 3 seconds**. Difficulty rises every 10 seconds
of active play, even when coins extend the timer.

## Play locally

Open `index.html`, or serve this folder:

```sh
python3 -m http.server 8003 --bind 127.0.0.1
```

Then open http://127.0.0.1:8003. No packages, build, backend or deployment needed.
Everything uses local code. Music and sound effects are synthesized in the browser.
Funny spoken reactions use a locally installed browser/OS voice when available;
captions still work without one. Interact with the page to enable audio.

## Controls and game features

- WASD / arrows move; Shift dashes; P or Escape pauses; R restarts.
- Touch D-pad and Dash appear on narrow screens or touch devices.
- Set 1–12 starting creatures and 1, 3, or 5 lives, then choose New round.
- Each level changes the arena color, adds a creature (up to 20), and increases
  speed with a cap. Four starting obstacles create routes and cover.
- Fast coins build ×2/×3 combos. Personal bests are saved per initial settings.
- Collect five coins, dash three times, and reach level three to complete missions.
- Special shield coins block one hit; magnet coins attract nearby coins briefly.
- One creature at a time can turn angry/red and chase for a short burst.
- Fast chains trigger WOW / YOU SUPER, reward floats and funny voice reactions;
  slow gaps can trigger playful comments. Voice/teasing are optional controls.
- Pause, focus loss, restart and game over cleanly stop active gameplay effects.

## Pair collaboration

**Read [FEATURES.md](FEATURES.md), [HILA_STATUS.md](HILA_STATUS.md), and
[AGENTS.md](AGENTS.md) before work.** Eldad alone edits FEATURES.md; Hila alone
edits HILA_STATUS.md. Both read both files. Claim features before coding, isolate
agents with branches/worktrees, and review and test before merging. See
[the feature contract](docs/feature-contract.md) for Hila's enemy adapter.

## Architecture and checks

The Phaser scene coordinates focused components: `CoinDashRound` owns active time
and levels; lives, dash, scoring, touch, arena, reactions, missions, power-ups and
rage own their state and cleanup. Modules use `player-dash` and `special-coin`
events instead of replacing each other's methods. Hila owns enemy varieties;
the optional rage overlay takes temporary velocity priority after her update.

```sh
node --test tests/*.test.cjs
git diff --check
git log --graph --oneline --decorate --all
```

Phaser 3.90.0 is vendored locally and verified against the CDN release. Source and
Phaser licenses are included. The design rationale and research links are in
[engagement-design.md](docs/engagement-design.md).

## Lab report

Use the bundled `.claude/skills/lab-report/SKILL.md` with both partners' agreed
start/end timestamps (Asia/Jerusalem). Generated exports live in ignored `reports/`.
Load both laptop JSON files into the report page, check it, and save the combined
HTML for Moodle. Raw agent logs are never committed. An interim single-laptop
report is not the final pair report.
