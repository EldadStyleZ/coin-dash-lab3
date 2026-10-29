# Engagement design notes

Research guided these design choices; actual enjoyment still needs playtesting.

- **Skill and control.** Ryan, Rigby and Przybylski (2006) found perceived autonomy
  and competence associated with enjoyment and future play in their studies.
  Our application: responsive movement, dash, adjustable starting difficulty,
  clear lives, and optional music/voice. [Primary paper](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf).
- **Clear goals, feedback and challenge.** Sweetser and Wyeth's GameFlow (2005)
  model identifies these among its enjoyment criteria. Our application: three
  short missions, visible progress, coin/combo feedback, level palettes, and
  gradually increasing difficulty. [Primary paper](https://doi.org/10.1145/1077246.1077253).

The exact timings and mechanics are our design choices, not claims measured in
those papers: +3 seconds per coin, four-second combos, quick-coin reactions,
shield/magnet coins, temporary one-enemy rage, and personal bests. Research does
not establish that this particular prototype is enjoyable without player testing.

## Behavior and integration

- Reactions measure active time between pickups. Pauses never count as slow play.
- Voice has a cooldown, doesn't queue overlapping lines, and uses local voices only.
- Reduced-motion preferences simplify effects; readable captions remain.
- All gameplay state resets on restart. Browser preferences and personal bests persist.
- Shield/magnet pickup effects do not own score or the timer. Their event reaches
  the same coin-award method as a normal coin, including the three-second bonus.
- Rage never changes an enemy's type. One marked enemy temporarily receives chase
  velocity after normal enemy updates; its original appearance/speed is restored.
- Obstacles are fixed within a round. Spawn checks and magnet clearance prevent
  normal or special coins from entering walls.
