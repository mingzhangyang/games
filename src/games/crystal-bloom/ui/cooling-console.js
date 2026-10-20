import { RULES } from '../model/rules.js';

/** Numeric input is another entrance to placeAnchor, never a second curve. */
export function createCoolingConsole(game) {
    const root = document.getElementById('cb-cooling');
    const time = document.getElementById('cb-anchor-time');
    const temperature = document.getElementById('cb-anchor-temp');
    const add = document.getElementById('cb-anchor-add');
    const reading = document.getElementById('cb-reading');
    const last = document.getElementById('cb-last-anchor');
    const feedback = document.getElementById('cb-anchor-feedback');
    const timeLabel = document.getElementById('cb-time-label');
    const tempLabel = document.getElementById('cb-temp-label');
    const grow = document.getElementById('cb-run-btn');
    const stir = document.getElementById('cb-stir-btn');
    root.addEventListener('submit', event => {
        event.preventDefault();
        const t = time.valueAsNumber;
        const T = temperature.valueAsNumber;
        if (!Number.isFinite(t) || !Number.isFinite(T)) return;
        const placed = game.placeAnchor(t, T);
        feedback.textContent = game.t(placed ? 'anchorPlaced' : 'anchorRejected');
        sync();
    });
    root.addEventListener('keydown', event => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });
    function reset() {
        time.value = '';
        temperature.value = '';
        feedback.textContent = '';
    }
    function sync() {
        const enabled = game.isRunning();
        root.inert = game.state !== 'playing';
        const spec = game.spec;
        const world = game.world;
        const anchor = game.anchors[game.anchors.length - 1];
        timeLabel.textContent = game.t('anchorTime');
        tempLabel.textContent = game.t('anchorTemp');
        add.textContent = game.t('addAnchor');
        time.max = spec?.tMax || 1;
        time.min = Math.max(1, (anchor?.t || 0) + 1, game.phase === 'grow' ? Math.floor((world?.t || 0) + 0.5) + 1 : 1);
        temperature.min = RULES.tRange[0];
        temperature.max = anchor?.T ?? spec?.t0 ?? RULES.tRange[1];
        time.disabled = temperature.disabled = add.disabled = !enabled || game.phase === 'done';
        grow.disabled = !enabled || game.phase !== 'draw';
        stir.disabled = !enabled || game.phase !== 'grow';
        if (!spec || !world) return;
        reading.textContent = `${game.t(game.phase === 'grow' ? 'running' : game.phase === 'done' ? 'finished' : 'planning')} · ${world.t.toFixed(0)}/${spec.tMax} · ${world.temp.toFixed(1)}°C · S ${world.s.toFixed(2)} · ${game.regimeName(world.regime)}`;
        last.textContent = `${game.t('target')} ${game.habitName(spec.target)} · ${game.t('size')} ${world.cells}/${spec.minCells} · ${game.t('endTemp')} ${spec.tEndMin}–${spec.tEndMax}°C`;
        if (anchor) last.textContent += ` · ${game.t('lastAnchor')} ${anchor.t} / ${anchor.T}°C`;
    }
    return { sync, reset };
}
