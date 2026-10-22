// Pure screenshot viewport configuration shared by the CLI and its regression tests.
export function parseShotViewports(raw) {
    const tags = new Set();
    return raw.split(',').map(spec => {
        const match = /^(\d+)x(\d+)$/.exec(spec.trim());
        if (!match) throw new Error('Invalid SHOTS_VIEWPORTS: ' + spec);
        const width = Number(match[1]);
        const height = Number(match[2]);
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
            throw new Error('Invalid SHOTS_VIEWPORTS: ' + spec);
        }
        const tag = (width <= 480 ? 'm' : 'd') + width + 'x' + height;
        if (tags.has(tag)) throw new Error('Duplicate SHOTS_VIEWPORTS: ' + spec);
        tags.add(tag);
        return { tag, width, height };
    });
}

export function shotFilename(game, viewport, lang = 'default') {
    return game + '-' + viewport.tag + (lang === 'default' ? '' : '-' + lang) + '.png';
}
