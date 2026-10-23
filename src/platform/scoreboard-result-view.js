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
