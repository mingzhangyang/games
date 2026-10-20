import { ELEMENTS, EL_ORDER, RULES, costOf } from '../model/rules.js';

/** The console only reads the recipe; every paid action stays in the runtime. */
export function createLabConsole(game) {
    const lab = document.getElementById('fv-lab');
    const rack = document.getElementById('fv-reagents');
    const dose = document.getElementById('fv-dose');
    const status = document.getElementById('fv-lab-status');
    const add = document.getElementById('fv-add-btn');
    const empty = document.getElementById('fv-clear-btn');
    const assay = document.getElementById('fv-run-btn');
    let selected = EL_ORDER[0];
    const jars = EL_ORDER.map(key => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fv-reagent';
        button.dataset.salt = key;
        button.style.setProperty('--salt-color', ELEMENTS[key].color);
        const bottle = document.createElement('span');
        bottle.className = 'fv-bottle';
        bottle.setAttribute('aria-hidden', 'true');
        const symbol = document.createElement('b');
        symbol.textContent = ELEMENTS[key].sym;
        bottle.append(symbol);
        const name = document.createElement('span');
        const amount = document.createElement('span');
        amount.className = 'fv-reagent-dose';
        button.append(bottle, name, amount);
        button.addEventListener('click', () => {
            if (!game.isRunning()) return;
            selected = key;
            sync();
        });
        rack.append(button);
        return { key, button, name, amount };
    });
    add.addEventListener('click', () => game.throwSalt(selected));
    // A held key must not repeatedly dispatch a native button click.
    lab.addEventListener('keydown', event => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });
    function sync() {
        const active = game.state === 'playing';
        const enabled = active && !game.isPaused;
        lab.setAttribute('aria-label', game.t('rack'));
        lab.inert = !active;
        for (const { key, button, name, amount } of jars) {
            const count = game.recipe[key] | 0;
            button.disabled = !enabled;
            button.setAttribute('aria-pressed', String(key === selected));
            name.textContent = game.saltName(key);
            amount.textContent = `${count}/${RULES.maxDose}`;
            button.setAttribute('aria-label', `${game.saltName(key)} · ${count}/${RULES.maxDose}`);
        }
        const count = game.recipe[selected] | 0;
        dose.textContent = `${game.saltName(selected)} · ${game.t('currentDose')} ${count}/${RULES.maxDose} · ${game.doseWord(count)}`;
        add.textContent = game.t('addPinch', { salt: ELEMENTS[selected].sym });
        empty.querySelector('.sci-action-label').textContent = game.t('dumpShort');
        empty.querySelector('.fv-empty-cost').textContent = ` (+${RULES.refillCost})`;
        assay.querySelector('.sci-action-label').textContent = game.t('assay');
        add.disabled = !enabled || count >= RULES.maxDose;
        empty.disabled = !enabled || costOf(game.recipe) === 0;
        assay.disabled = !enabled || costOf(game.recipe) === 0;
        status.textContent = game.diff.length
            ? `${game.t('failDiff')} · ${game.diffText()}`
            : `${game.t('cost')} ${game.cost()} · ${game.t('par')} ${game.spec?.par || 0} · ${game.t('throws')} ${game.throws} · ${game.t('refills')} ${game.refills}`;
    }
    return { sync };
}
