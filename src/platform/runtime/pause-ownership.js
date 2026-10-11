/**
 * A game owns its state machine; this controller owns only temporary pauses
 * introduced by named UI/visibility interruptions. It never infers "paused"
 * to mean "safe to resume" and never mirrors the game's gameplay state.
 *
 * A reason is a lease, not a boolean toggle. The first lease records whether
 * the game was actively running. The final release may resume only that
 * original run, and only if every intervening reason allows auto-resume.
 */
export function createPauseOwnership({ isRunning, canResume, pause, resume, releaseInputs = () => {} }) {
    const reasons = new Set();
    let owned = false;
    let mayAutoResume = true;

    function acquire(reason, { autoResume = true } = {}) {
        if (!reason) throw new Error('Pause ownership requires a reason');
        if (reasons.has(reason)) return false; // e.g. repeated visibilitychange

        const running = !!isRunning();
        if (!reasons.size) {
            owned = running;
            mayAutoResume = true;
        } else if (running) {
            // A different run resumed/started under an existing lease. Stop it,
            // but never grant the old run's automatic resume permission.
            owned = false;
        }
        reasons.add(reason);
        if (!autoResume) mayAutoResume = false; // sticky until the last lease
        releaseInputs(reason);
        if (running) pause(reason);
        return true;
    }

    function release(reason) {
        if (!reasons.delete(reason)) return false;
        if (reasons.size) return true;

        const shouldResume = owned && mayAutoResume && canResume()
            && (typeof document === 'undefined' || !document.hidden);
        owned = false;
        mayAutoResume = true;
        if (shouldResume) resume();
        return true;
    }

    function invalidate() {
        // Restart, new level, menu or completed run: no prior UI lease may
        // resume a different run. Retain leases until their owning UI closes.
        owned = false;
        mayAutoResume = false;
        if (reasons.size && isRunning()) {
            releaseInputs('run-change');
            pause('run-change');
        }
    }

    return {
        acquire,
        release,
        invalidate,
        isHeld: reason => reason ? reasons.has(reason) : reasons.size > 0,
    };
}

/**
 * All six opted-in games share this event/lifetime contract. Per-game policy
 * is explicit: some games auto-resume on foreground; others require the user
 * to press Resume. One hidden lease also blocks an earlier modal release.
 */
export function bindPageVisibility(ownership, { autoResume = false, onHidden = () => {} } = {}) {
    const changed = () => {
        if (document.hidden) {
            ownership.acquire('hidden', { autoResume });
            onHidden();
        } else {
            ownership.release('hidden');
        }
    };
    document.addEventListener('visibilitychange', changed);
    if (document.hidden) changed();
    return () => {
        document.removeEventListener('visibilitychange', changed);
        ownership.release('hidden');
    };
}
