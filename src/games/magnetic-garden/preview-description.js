/** Exact localized pre-commit outcomes from the pure rules, independent of DOM. */
function templateFill(template, values) { return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? ''); }
function cellDescription(level, cell, text) { return templateFill(text.cell, { r: Math.floor(cell / level.width) + 1, c: cell % level.width + 1 }); }
export function describePreview(level, current, preview, text) {
    if (!preview?.result?.valid) return '';
    const { action, result } = preview;
    const magnet = result.state.magnets.find(m => m.id === action.magnetId);
    if (!magnet) return '';
    const actionText = action.type === 'flip'
        ? templateFill(text.previewFlipAction, { id: action.magnetId, pole: magnet.polarity })
        : templateFill(text.moveAction, { id: action.magnetId,
            r: Math.floor(action.cell / level.width) + 1, c: action.cell % level.width + 1 });
    const before = new Map(current.seeds.map(seed => [seed.id, seed]));
    const seeds = result.state.seeds.map(seed => {
        const previous = before.get(seed.id);
        const status = seed.captured
            ? (previous?.captured ? text.previewAlreadyPlanted : text.previewCaptured)
            : (seed.cell === previous?.cell ? text.previewStayed : text.previewMoved);
        return templateFill(status, {
            seed: templateFill(text.previewSeed, { id: seed.id, pole: seed.polarity }),
            cell: cellDescription(level, seed.cell, text),
        });
    });
    return [templateFill(text.previewSummary, { action: actionText }), ...seeds].join(' ');
}
