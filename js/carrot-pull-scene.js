export const SCENE = Object.freeze({
    carrot: { x: 316, y: 506 },
    girl: { x: 186, y: 692, s: 0.94 },
    mole: { x: 470, y: 620, s: 0.68 },
    girlHands: [[38, -218], [32, -210], [26, -200]],
    crown: [[-8, -22], [0, -24], [8, -22]],
    maxRise: 92,
    harvestMs: 720,
    emergeMs: 460,
});

const SVG_NS = 'http://www.w3.org/2000/svg';
const easeOut = t => 1 - (1 - t) ** 3;

function place(point, x, y, deg, scale = 1) {
    const rad = deg * Math.PI / 180;
    const px = point[0] * scale;
    const py = point[1] * scale;
    return [x + px * Math.cos(rad) - py * Math.sin(rad), y + px * Math.sin(rad) + py * Math.cos(rad)];
}

function organicLeafPath(from, to, index = 0) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const lane = (index - 1) * 3.4;
    const point = (t, normal) => [
        from[0] + dx * t + nx * normal,
        from[1] + dy * t + ny * normal,
    ];
    const start = point(0, lane);
    const end = point(1, lane);
    const c1 = point(0.28, lane + 5.5);
    const c2 = point(0.72, lane + 4);
    const b1 = point(0.72, lane - 3.5);
    const b2 = point(0.28, lane - 4.5);
    const fmt = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
    return `M${fmt(start)}C${fmt(c1)} ${fmt(c2)} ${fmt(end)}C${fmt(b1)} ${fmt(b2)} ${fmt(start)}Z`;
}

export function createSceneAnimator({ svg, nodes, reducedMotion } = {}) {
    if (!svg || !nodes?.carrot) return null;
    const girlStems = [...(nodes.stemsGirl?.querySelectorAll('path') || [])];
    const reduced = reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const fx = { rise: 0, tug: 0, miss: 0, harvestAt: -1e9, harvestRise: 0, last: 0 };
    let lastKey = '';
    let oopsTimer = 0;

    function hit() {
        fx.tug = 1;
        burst(true);
    }

    function miss() {
        fx.miss = 1;
        burst(false);
        svg.classList.add('is-oops');
        window.clearTimeout(oopsTimer);
        oopsTimer = window.setTimeout(() => svg.classList.remove('is-oops'), 650);
    }

    function harvest(now = performance.now()) {
        fx.harvestAt = now;
        fx.harvestRise = fx.rise;
        fx.rise = 0;
        burst(true, true);
    }

    function reset() {
        fx.rise = 0;
        fx.tug = 0;
        fx.miss = 0;
        fx.harvestAt = -1e9;
        fx.last = 0;
        lastKey = '';
        svg.classList.remove('is-oops');
        nodes.particles?.replaceChildren();
    }

    function burst(success, big = false) {
        if (reduced || !nodes.particles) return;
        const count = big ? 16 : success ? 9 : 5;
        for (let i = 0; i < count; i += 1) {
            const dirt = document.createElementNS(SVG_NS, 'circle');
            const side = i % 2 ? 1 : -1;
            dirt.setAttribute('cx', String(SCENE.carrot.x + side * (40 + Math.random() * 50)));
            dirt.setAttribute('cy', String(596 + Math.random() * 8));
            dirt.setAttribute('r', String(3 + Math.random() * (big ? 6 : 4)));
            dirt.setAttribute('fill', i % 3 ? '#7a4a2b' : '#a26a3e');
            dirt.setAttribute('class', 'cp-dirt');
            dirt.style.setProperty('--dx', `${side * (20 + Math.random() * (big ? 90 : 50))}px`);
            dirt.style.setProperty('--dy', `${-(30 + Math.random() * (big ? 110 : 60))}px`);
            spawn(dirt);
        }
        if (success) {
            for (let i = 0; i < (big ? 10 : 5); i += 1) {
                const spark = document.createElementNS(SVG_NS, 'circle');
                const angle = (Math.PI * 2 * i) / (big ? 10 : 5) + Math.random();
                spark.setAttribute('cx', String(SCENE.carrot.x));
                spark.setAttribute('cy', String(SCENE.carrot.y - fx.rise - 40));
                spark.setAttribute('r', String(big ? 5 : 3.5));
                spark.setAttribute('fill', i % 2 ? '#fff3b0' : '#f7d36e');
                spark.setAttribute('class', 'cp-spark');
                spark.style.setProperty('--dx', `${Math.cos(angle) * (big ? 110 : 60)}px`);
                spark.style.setProperty('--dy', `${Math.sin(angle) * (big ? 90 : 50)}px`);
                spawn(spark);
            }
        }
    }

    function spawn(node) {
        node.addEventListener('animationend', () => node.remove(), { once: true });
        nodes.particles.appendChild(node);
    }

    function tick(now, progress, playing) {
        const dt = Math.min(100, fx.last ? now - fx.last : 16);
        fx.last = now;
        fx.rise += (progress * SCENE.maxRise - fx.rise) * (1 - Math.exp(-dt / 90));
        fx.tug *= Math.exp(-dt / 170);
        fx.miss *= Math.exp(-dt / 220);
        if (fx.tug < 0.002) fx.tug = 0;
        if (fx.miss < 0.002) fx.miss = 0;
        const settling = Math.abs(progress * SCENE.maxRise - fx.rise) > 0.05;

        const sway = playing && !reduced ? Math.sin(now / 420) : 0;
        const shake = reduced ? 0 : Math.sin(now / 26) * 7 * fx.miss;
        let girlLean = -3 - progress * 4 - fx.tug * 9 + fx.miss * 5 + sway * 0.8;
        let moleLean = 2 + progress * 3 + fx.tug * 7 - fx.miss * 3 - sway * 0.8;
        let hop = 0;
        let cx = SCENE.carrot.x - fx.tug * 6;
        let cy = SCENE.carrot.y - fx.rise - fx.tug * 12;
        let tilt = -6 - progress * 10 - fx.tug * 4 + shake;
        let stemAlpha = 1;

        const since = now - fx.harvestAt;
        const active = (playing && !reduced) || settling || fx.tug > 0 || fx.miss > 0
            || since < SCENE.harvestMs + SCENE.emergeMs;
        if (since < SCENE.harvestMs) {
            const p = easeOut(since / SCENE.harvestMs);
            cx = SCENE.carrot.x - 150 * p;
            cy = SCENE.carrot.y - fx.harvestRise - 430 * p;
            tilt = -16 - 70 * p;
            stemAlpha = Math.max(0, 1 - since / 120);
            girlLean -= 5 * Math.sin(Math.PI * Math.min(1, since / 500));
            moleLean += 8 * Math.sin(Math.PI * Math.min(1, since / 500));
            hop = -18 * Math.sin(Math.PI * Math.min(1, since / 420));
        } else if (since < SCENE.harvestMs + SCENE.emergeMs) {
            const p = easeOut((since - SCENE.harvestMs) / SCENE.emergeMs);
            cy += 110 * (1 - p);
            stemAlpha = p;
        }

        const key = `${cx.toFixed(1)}|${cy.toFixed(1)}|${tilt.toFixed(2)}|${girlLean.toFixed(2)}|${moleLean.toFixed(2)}|${hop.toFixed(1)}|${stemAlpha.toFixed(2)}|${fx.tug.toFixed(2)}`;
        if (key === lastKey) return active;
        lastKey = key;

        const g = SCENE.girl;
        const m = SCENE.mole;
        const carrotTf = `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${tilt.toFixed(2)})`;
        const girlTf = `translate(${g.x} ${(g.y + hop).toFixed(1)}) rotate(${girlLean.toFixed(2)}) scale(${g.s})`;
        const moleTf = `translate(${m.x} ${(m.y + hop * 0.7).toFixed(1)}) rotate(${moleLean.toFixed(2)}) scale(${m.s})`;
        nodes.carrot.setAttribute('transform', carrotTf);
        nodes.girl?.setAttribute('transform', girlTf);
        nodes.girlHands?.setAttribute('transform', girlTf);
        nodes.mole?.setAttribute('transform', moleTf);

        const crowns = SCENE.crown.map(pt => place(pt, cx, cy, tilt));
        girlStems.forEach((path, i) => {
            const hand = place(SCENE.girlHands[i], g.x, g.y + hop, girlLean, g.s);
            path.setAttribute('d', organicLeafPath(crowns[i], hand, i));
        });
        nodes.stemsGirl?.setAttribute('opacity', stemAlpha.toFixed(2));
        nodes.tug?.setAttribute('opacity', (fx.tug * 0.9).toFixed(2));
        return active;
    }

    return { hit, miss, harvest, reset, tick };
}

export function createCarrotScene({ svg = document.getElementById('cp-scene') } = {}) {
    if (!svg) return null;
    const byId = id => svg.querySelector(`#${id}`);
    return createSceneAnimator({
        svg,
        nodes: {
            carrot: byId('cp-carrot'),
            girl: byId('cp-girl'),
            girlHands: byId('cp-girl-hands'),
            mole: byId('cp-mole'),
            // 生产美术不画程序叶柄：girl-hands.webp 自带一整束叶柄连到萝卜冠，
            // 而 SCENE.crown 在精灵里落在叶尖（不是萝卜冠），画出来是一根横穿女孩脸前的绿条。
            // 叶柄连接线只留给 fallback 场景（那里的手是圆点、萝卜没有画叶束）。
            tug: byId('cp-tug-lines'),
            particles: byId('cp-particles'),
        },
    });
}
