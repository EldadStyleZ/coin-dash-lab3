# Coin Dash — Neon Arcade

A browser-only arcade game built by Eldad and Hila for HUJI AICODE Lab 3.
Collect coins, dodge creatures and survive a growing swarm. Start with 60 seconds;
**every normal or special coin adds 3 seconds**. Difficulty rises every 10 seconds
of active play, even when coins extend the timer.

## Play online

[Play Coin Dash](https://eldadstylez.github.io/coin-dash-lab3/)

GitHub Pages serves the latest `main` branch. The `.nojekyll` file keeps this
plain static game unchanged by a site generator.

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

The game stays inside the viewport. Use the **⚙ settings** button for difficulty,
players, audio, voice and mission details. Opening settings pauses the round;
closing it returns focus to play. Apply & new round applies changed settings.
Space and arrow keys never scroll the play screen, including during cooldown.

- WASD / arrows move; Space performs the sword dash; Shift is disabled; F shoots. P or Escape pauses; R restarts.
- Touch D-pad and Strike appear on narrow screens or touch devices.
  Landscape phones place the controls beside the arena, with 44px minimum touch targets.
- Choose Easy / Normal / Hard, 1–12 base creatures and 1, 3, or 5 lives, then New round. Difficulty scales creature count/speed and starting time (80/60/48 seconds).
- Local 2P: P1 WASD, Space sword dash, F shoot; P2 arrows, Enter slice, L shoot.
  Separate scores, coin combos and lives; shared timer. M switches mode and restarts.
  A knocked-out player stays out while the other continues; highest score wins.
- Each level changes the arena color, adds a creature (up to 20), and increases
  speed with a cap. Four starting obstacles create routes and cover.
- Sword kills require physical contact during the dash, as in the original game. A kill resets the attack cooldown immediately. A missed strike has a 1.8-second cooldown; the sword lunges at 2.5× movement speed for 180ms. There is no separate Shift dash. The original fading afterimages and diagonal hit slash are preserved.
- Chain kills within 2.5 seconds for double/triple-kill feedback. A missed strike breaks the chain. Shooting kills also reset that player's shot cooldown.
- Fast coins build ×2/×3 combos. Personal bests are saved per initial settings.
- Collect five coins, land three sword kills, and reach level three to complete missions.
- Special shield coins block one hit; magnets attract nearby coins; speed coins grant 1.6× speed for 5 seconds. Effects belong to the collecting player.
- Hila's chasers pursue the nearest player, patrollers pace a line, and zippers bounce fast.
  Slicing/shooting them awards 5/3/10 points; they respawn after 3 active seconds.
- An untouched close call earns +2 points. Combat and close calls never add coin time.
- One creature at a time can turn angry/red and chase briefly, now at half the previous chase speed (maximum 180 px/s).
- Three, six and ten quick coins by the same player trigger playful lines such as “Coin vacuum: activated!”;
  gaps without either coins or kills get occasional nudges such as “That coin has started a book club.”
  Captions wait at least 3.5 seconds, voices 14 seconds, and slow nudges 25 seconds.
  Coin streaks expire after 2 seconds; kill chains after 2.5 seconds. Missed sword
  attacks and damage reset that player's performance streaks and clear obsolete
  praise. Other players' streaks remain independent. The sword mission counts
  actual kills rather than button presses. Every coin keeps its reward popup; at most six are visible together. Voice/teasing
  are optional controls. Softer coin chirps vary in pitch, misses get a quiet boing,
  and sound bursts are limited to eight simultaneous effect voices.
- Pause, focus loss, restart and game over cleanly stop active gameplay effects.

## Pair collaboration

**Read [FEATURES.md](FEATURES.md), [HILA_STATUS.md](HILA_STATUS.md), and
[AGENTS.md](AGENTS.md) before work.** Eldad alone edits FEATURES.md; Hila alone
edits HILA_STATUS.md. Both read both files. Claim features before coding, isolate
agents with branches/worktrees, and review and test before merging. See
[the feature contract](docs/feature-contract.md) for Hila's enemy adapter.

## Architecture and checks

The Phaser scene coordinates focused components: `CoinDashRound` owns active time
and levels; lives, strikes, scoring, touch, arena, reactions, missions, power-ups and
rage own their state and cleanup. Multiplayer owns per-player state; combat owns
projectiles/respawns; scoring owns the single points ledger. Modules use `player-strike` and `special-coin`
events instead of replacing each other's methods. Hila's enemy, combat, difficulty, multiplayer and close-call branches were ported
into the shared component architecture with coauthor credit. The optional rage overlay takes temporary velocity priority after her update.

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
