/** A difficulty change during an active run permanently invalidates its ranking. */
export function invalidateOnDifficultyChange(run, previousLevel, nextLevel) {
  if (run && previousLevel !== nextLevel) run.eligible = false;
}
