import { measure } from '../model/rules.js';

/** All readings come from the same complex amplitude used by the judge. */
export function createWaveConsole(game) {
    const root = document.getElementById('rd-console');
    const sources = document.getElementById('rd-sources');
    const phase = document.getElementById('rd-phase');
    const minus = document.getElementById('rd-minus');
    const plus = document.getElementById('rd-plus');
    const freeze = document.getElementById('rd-freeze');
    const note = document.getElementById('rd-measure-note');
    const readings = document.getElementById('rd-measures');
    let previous = '';
    minus.addEventListener('click', () => game.turnPhase(-1));
    plus.addEventListener('click', () => game.turnPhase(1));
    freeze.addEventListener('click', () => game.pressFreeze());
    root.addEventListener('keydown', event => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });
    return {
        sync() {
            if (!game.spec) return;
            const signature = JSON.stringify([game.spec.id, game.place, game.lang, game.state, game.isPaused, game.sel]);
            if (signature === previous) return;
            previous = signature;
            const active = game.isRunning();
            root.inert = game.state !== 'playing';
            root.setAttribute('aria-label', game.t('phase'));
            if (sources.children.length !== game.place.length) {
                sources.replaceChildren(...game.place.map((_, index) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.dataset.source = index;
                    button.textContent = `S${index + 1}`;
                    button.addEventListener('click', () => {
                        if (!game.isRunning()) return;
                        game.sel = index;
                        this.sync();
                    });
                    return button;
                }));
            }
            [...sources.children].forEach((button, index) => {
                button.disabled = !active;
                button.setAttribute('aria-pressed', String(game.sel === index));
                button.setAttribute('aria-label', `${game.t('srcLabel')} ${index + 1}`);
            });
            const angle = (game.place[game.sel]?.ph || 0) * 45;
            phase.textContent = `${game.t('phase')} ${angle}°`;
            minus.setAttribute('aria-label', `${game.t('phase')} −45° (+1)`);
            plus.setAttribute('aria-label', `${game.t('phase')} +45° (+1)`);
            minus.disabled = plus.disabled = !active || !game.place.length;
            freeze.disabled = !active;
            freeze.textContent = game.t('freeze');
            freeze.dataset.ready = String(game.allSatisfied());
            note.textContent = game.t('measureNote');
            readings.replaceChildren(...game.spec.targets.map((target, index) => {
                const result = measure(game.spec, game.place, index, game.k);
                const line = document.createElement('div');
                const label = document.createElement('span');
                label.textContent = `${index + 1} · ${game.t(target.kind === 'calm' ? 'calm' : target.kind === 'blaze' ? 'blaze' : 'lane')}`;
                const value = document.createElement('b');
                value.textContent = `${result.ok ? '✓' : '○'} ${result.value.toFixed(3)} ${target.kind === 'blaze' ? '≥' : '≤'} ${result.need.toFixed(3)}`;
                line.append(label, value);
                return line;
            }));
        },
    };
}
