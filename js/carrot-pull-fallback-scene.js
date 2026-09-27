import { SCENE, createSceneAnimator } from './carrot-pull-scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    parent?.appendChild(node);
    return node;
}

function path(d, attrs, parent) {
    return el('path', { d, ...attrs }, parent);
}

function buildFallbackScene(svg) {
    const root = svg.querySelector('#cp-fallback-scene');
    if (!root) return null;
    root.replaceChildren();
    root.setAttribute('aria-hidden', 'true');

    const defs = el('defs', {}, root);
    const sky = el('linearGradient', { id: 'cp-fallback-sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#83c9e7' }, sky);
    el('stop', { offset: 0.64, 'stop-color': '#d8f0dc' }, sky);
    el('stop', { offset: 1, 'stop-color': '#f3edc9' }, sky);
    const soil = el('linearGradient', { id: 'cp-fallback-soil', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#a66a3e' }, soil);
    el('stop', { offset: 1, 'stop-color': '#704326' }, soil);

    el('rect', { width: 560, height: 720, fill: 'url(#cp-fallback-sky)' }, root);
    el('circle', { cx: 470, cy: 95, r: 34, fill: '#ffe8a2', opacity: 0.78 }, root);
    path('M0 407C80 372 142 382 212 402c80 22 156 12 220-8 54-16 92-12 128 4v130H0Z', { fill: '#aedb9e' }, root);
    path('M0 482c94-28 178-20 266-5 96 16 190 7 294-15v112H0Z', { fill: '#82bf6c' }, root);
    path('M-4 568c82-10 148-4 224 0 112 6 222 1 344-4v160H-4Z', { fill: 'url(#cp-fallback-soil)' }, root);
    path('M-4 578c112-12 184-3 286 0 92 3 184-3 282-4', { fill: 'none', stroke: '#d09054', 'stroke-width': 8, opacity: 0.72 }, root);
    path('M36 640h144M378 668h142M76 700h126', { fill: 'none', stroke: '#60371f', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.5 }, root);
    path('M0 502h560', { fill: 'none', stroke: '#ead19c', 'stroke-width': 9, opacity: 0.68 }, root);

    const carrot = el('g', { id: 'cp-fallback-carrot' }, root);
    path('M-48 -24C-46-70-26-98 0-102c28 5 48 32 48 78 0 78-21 188-43 290-3 14-14 19-19 3C-36 168-52 64-48-24Z', {
        fill: '#f18432', stroke: '#803f20', 'stroke-width': 5,
    }, carrot);
    path('M-27 8q22-12 42 0M-30 68q24-11 48 0M-24 132q18-10 36 0M-18 194q14-8 28 0', {
        fill: 'none', stroke: '#c95b25', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.72,
    }, carrot);
    path('M0-94C-32-134-47-150-44-174c24 4 39 22 44 51 8-35 26-54 52-58 1 25-15 51-46 74 18-29 18-54 8-74-17 12-22 35-14 67Z', {
        fill: '#73b84d', stroke: '#3d702d', 'stroke-width': 4, 'stroke-linejoin': 'round',
    }, carrot);


    const mole = el('g', { id: 'cp-fallback-mole' }, root);
    const moleHappy = el('g', { class: 'cp-fallback-happy' }, mole);
    el('ellipse', { cx: 0, cy: -44, rx: 84, ry: 68, fill: '#87614f', stroke: '#4e332a', 'stroke-width': 5 }, moleHappy);
    el('circle', { cx: -52, cy: -97, r: 27, fill: '#9c7662', stroke: '#4e332a', 'stroke-width': 5 }, moleHappy);
    el('circle', { cx: 52, cy: -97, r: 27, fill: '#9c7662', stroke: '#4e332a', 'stroke-width': 5 }, moleHappy);
    el('circle', { cx: -28, cy: -58, r: 8, fill: '#2e231e' }, moleHappy);
    el('circle', { cx: 28, cy: -58, r: 8, fill: '#2e231e' }, moleHappy);
    el('ellipse', { cx: 0, cy: -30, rx: 27, ry: 18, fill: '#d5a98e', stroke: '#4e332a', 'stroke-width': 3 }, moleHappy);
    path('M-12-26q12 14 24 0', { fill: 'none', stroke: '#4e332a', 'stroke-width': 4, 'stroke-linecap': 'round' }, moleHappy);
    const moleOops = el('g', { class: 'cp-fallback-oops' }, mole);
    el('ellipse', { cx: 0, cy: -44, rx: 84, ry: 68, fill: '#87614f', stroke: '#4e332a', 'stroke-width': 5 }, moleOops);
    el('circle', { cx: -52, cy: -97, r: 27, fill: '#9c7662', stroke: '#4e332a', 'stroke-width': 5 }, moleOops);
    el('circle', { cx: 52, cy: -97, r: 27, fill: '#9c7662', stroke: '#4e332a', 'stroke-width': 5 }, moleOops);
    path('M-36-64l16 14M-20-64l-16 14M20-64l16 14M36-64l-16 14', { stroke: '#2e231e', 'stroke-width': 5, 'stroke-linecap': 'round' }, moleOops);
    el('ellipse', { cx: 0, cy: -29, rx: 25, ry: 19, fill: '#d5a98e', stroke: '#4e332a', 'stroke-width': 3 }, moleOops);
    path('M-13-25q13-12 26 0', { fill: 'none', stroke: '#7d302e', 'stroke-width': 4, 'stroke-linecap': 'round' }, moleOops);

    const stemsGirl = el('g', { id: 'cp-fallback-stems-girl', class: 'cp-leaf-connectors', 'aria-hidden': 'true' }, root);
    [
        { fill: '#79ad4d', stroke: '#477d38' },
        { fill: '#6b9d43', stroke: '#3f7334' },
        { fill: '#8abd56', stroke: '#4b8337' },
    ].forEach((colors) => {
        el('path', { class: 'cp-leaf-stem', ...colors, 'stroke-width': 1.5 }, stemsGirl);
    });

    const girl = el('g', { id: 'cp-fallback-girl' }, root);
    const girlHappy = el('g', { class: 'cp-fallback-happy' }, girl);
    el('path', { d: 'M-76-194h88l18 120H-88Z', fill: '#267b78', stroke: '#173c3e', 'stroke-width': 5 }, girlHappy);
    el('path', { d: 'M-44-74h18v66h-18zM18-74h18v66H18z', fill: '#f0c66e', stroke: '#634530', 'stroke-width': 5 }, girlHappy);
    el('path', { d: 'M-62-218q0-78 56-94 58 16 54 94Z', fill: '#f3c886', stroke: '#553725', 'stroke-width': 5 }, girlHappy);
    el('ellipse', { cx: -6, cy: -220, rx: 68, ry: 18, fill: '#efc477', stroke: '#8d653b', 'stroke-width': 5 }, girlHappy);
    el('path', { d: 'M-36-240q12-14 24 0M-2-240q12-14 24 0', fill: 'none', stroke: '#4b2e25', 'stroke-width': 5, 'stroke-linecap': 'round' }, girlHappy);
    el('circle', { cx: -20, cy: -188, r: 7, fill: '#2e231e' }, girlHappy);
    el('circle', { cx: 22, cy: -188, r: 7, fill: '#2e231e' }, girlHappy);
    path('M-10-162q15 16 30 0', { fill: 'none', stroke: '#9b402f', 'stroke-width': 5, 'stroke-linecap': 'round' }, girlHappy);
    const girlOops = el('g', { class: 'cp-fallback-oops' }, girl);
    el('path', { d: 'M-76-194h88l18 120H-88Z', fill: '#267b78', stroke: '#173c3e', 'stroke-width': 5 }, girlOops);
    el('path', { d: 'M-44-74h18v66h-18zM18-74h18v66H18z', fill: '#f0c66e', stroke: '#634530', 'stroke-width': 5 }, girlOops);
    el('path', { d: 'M-62-218q0-78 56-94 58 16 54 94Z', fill: '#f3c886', stroke: '#553725', 'stroke-width': 5 }, girlOops);
    el('ellipse', { cx: -6, cy: -220, rx: 68, ry: 18, fill: '#efc477', stroke: '#8d653b', 'stroke-width': 5 }, girlOops);
    path('M-34-196l16 14M-18-196l-16 14M10-196l16 14M26-196l-16 14', { stroke: '#2e231e', 'stroke-width': 5, 'stroke-linecap': 'round' }, girlOops);
    el('ellipse', { cx: 2, cy: -163, rx: 13, ry: 17, fill: '#b8373a' }, girlOops);

    root.appendChild(stemsGirl);

    const girlHands = el('g', { id: 'cp-fallback-girl-hands' }, root);
    el('circle', { cx: 38, cy: -218, r: 14, fill: '#f3c29f', stroke: '#4a2e22', 'stroke-width': 4 }, girlHands);
    el('circle', { cx: 26, cy: -200, r: 13, fill: '#f3c29f', stroke: '#4a2e22', 'stroke-width': 4 }, girlHands);

    const tug = el('g', { id: 'cp-fallback-tug-lines', fill: 'none', stroke: '#f7d36e', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0 }, root);
    el('path', { d: 'M52 540l-24-10M46 562l-28 0M50 584l-24 10' }, tug);
    const particles = el('g', { id: 'cp-fallback-particles' }, root);

    return {
        carrot,
        girl,
        girlHands,
        mole,
        stemsGirl,
        tug,
        particles,
    };
}

export function createCarrotPullFallbackScene({ svg = document.getElementById('cp-scene') } = {}) {
    if (!svg) return null;
    const nodes = buildFallbackScene(svg);
    return nodes ? createSceneAnimator({ svg, nodes }) : null;
}

export { SCENE };
