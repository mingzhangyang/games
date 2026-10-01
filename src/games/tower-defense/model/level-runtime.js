import { CELL, COLS, ROWS } from '../config.js';

/** Compile a grid waypoint path into a distance-addressable polyline. */
export function compilePath(waypoints, cell = CELL) {
    const pts = waypoints.map(([c, r]) => ({ x: (c + 0.5) * cell, y: (r + 0.5) * cell }));
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        segs.push(len);
        total += len;
    }
    const pointAt = (distance) => {
        if (distance <= 0) return { x: pts[0].x, y: pts[0].y };
        if (distance >= total) return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
        let acc = 0;
        for (let i = 0; i < segs.length; i++) {
            if (distance <= acc + segs[i]) {
                const t = (distance - acc) / segs[i];
                const a = pts[i], b = pts[i + 1];
                return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            }
            acc += segs[i];
        }
        return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
    };
    return { pts, segs, total, pointAt };
}

export function compilePathGrid(waypoints, cols, rows) {
    const grid = new Uint8Array(cols * rows);
    for (let i = 0; i < waypoints.length - 1; i++) {
        const [c0, r0] = waypoints[i];
        const [c1, r1] = waypoints[i + 1];
        const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
        if (dc !== 0 && dr !== 0) throw new Error('Tower defense maps must use orthogonal segments');
        let c = c0, r = r0;
        while (true) {
            if (c >= 0 && c < cols && r >= 0 && r < rows) grid[r * cols + c] = 1;
            if (c === c1 && r === r1) break;
            c += dc;
            r += dr;
        }
    }
    return grid;
}

export function compileLevelMap(levelMap) {
    const map = levelMap || { cols: COLS, rows: ROWS, cell: CELL, groundWaypoints: [] };
    const groundWaypoints = map.groundWaypoints || [];
    const airWaypoints = map.airWaypoints || groundWaypoints;
    const groundPath = compilePath(groundWaypoints, map.cell);
    const airPath = compilePath(airWaypoints, map.cell);
    const pathGrid = compilePathGrid(groundWaypoints, map.cols, map.rows);
    let buildableCount = 0;
    for (let i = 0; i < pathGrid.length; i++) if (!pathGrid[i]) buildableCount++;
    return {
        cols: map.cols,
        rows: map.rows,
        cell: map.cell,
        variant: map.variant || 'outpost',
        groundWaypoints,
        airWaypoints,
        groundPath,
        airPath,
        pathGrid,
        buildableCount,
        signature: groundWaypoints.map(([c, r]) => `${c},${r}`).join(';')
    };
}

export function isBuildable(map, c, r) {
    return c >= 0 && c < map.cols && r >= 0 && r < map.rows
        && !map.pathGrid[r * map.cols + c];
}
