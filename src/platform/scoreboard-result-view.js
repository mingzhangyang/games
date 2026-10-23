/**
 * Embedded score result presentation for the 6c-2a migration family.
 *
 * Game runtimes own eligibility, score, date, run lifecycle, analytics and DOM
 * layout. Result sessions own the frozen POST receipt and independent GET,
 * journal and retry states. This adapter never infers POST success from GET.
 */
const SUBMISSION_TEXT = Object.freeze({
    submitting: 'lbSubmitting',
    sent: 'lbSent',
    queued: 'lbQueued',
    notSaved: 'lbNotSaved',
});

/** Leave in-flight POSTs running, but detach stale views on navigation or restart. */
export function resetEmbeddedScoreResult(session, el) {
    session.close();
    if (el['clear-status']) {
        el['clear-status'].textContent = '';
        el['clear-status'].classList.add('hidden');
    }
    if (el['lb-status']) el['lb-status'].textContent = '';
    el['lb-list']?.replaceChildren();
}

/** Render a single immutable result and the two independent network states. */
export function renderEmbeddedScoreResult({ result, el, text, renderBoard, readLocalBoard }) {
    if (!result) return;

    if (result.board === 'ready') renderBoard(result.rows);
    else if (result.board === 'offline' || result.board === 'unsupported') {
        renderBoard(readLocalBoard(result.entry.game));
    } else {
        el['lb-list']?.replaceChildren();
    }

    const submissionKey = SUBMISSION_TEXT[result.submission];
    if (!submissionKey) throw new Error('Unknown scoreboard submission state: ' + result.submission);
    const submission = text(submissionKey);
    const campaign = el['clear-status'];
    if (campaign) {
        campaign.textContent = submission;
        campaign.classList.toggle('hidden', result.entry.date !== null);
    }

    const messages = [submission];
    if (result.board === 'loading') messages.push(text('lbLoading'));
    if (result.board === 'offline' || result.board === 'unsupported') messages.push(text('lbOffline'));
    if (el['lb-status']) el['lb-status'].textContent = messages.join(' ');
}

/**
 * Present the common compact result board without owning its ranking policy.
 * The caller supplies an already sorted row list, its legacy CSS prefix and
 * whether that game's existing design highlights the top three positions.
 */
export function renderEmbeddedScoreRows(list, rows, prefix, emptyText, highlightTopThree = false) {
    if (!list) return;
    list.innerHTML = '';
    if (!rows || !rows.length) {
        const empty = document.createElement('div');
        empty.className = prefix + '-lb-empty game-lb-empty';
        empty.textContent = emptyText;
        list.appendChild(empty);
        return;
    }
    rows.slice(0, 10).forEach((row, index) => {
        const item = document.createElement('li');
        item.className = prefix + '-lb-row game-lb-row';
        if (highlightTopThree && index < 3) item.classList.add(prefix + '-lb-top' + (index + 1));
        const rank = document.createElement('span');
        rank.className = prefix + '-lb-rank game-lb-rank';
        rank.textContent = String(index + 1);
        const name = document.createElement('span');
        name.className = prefix + '-lb-name game-lb-name';
        name.textContent = row.name || '—';
        const score = document.createElement('span');
        score.className = prefix + '-lb-score game-lb-score';
        score.textContent = String(row.score);
        item.append(rank, name, score);
        list.appendChild(item);
    });
}
