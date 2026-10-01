/** Pure initial player state; gameplay systems mutate the instance-owned object. */
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config.js';

export function createPlayerState() {
    return {
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT * 0.72,
        targetX: CANVAS_WIDTH / 2,
        targetY: CANVAS_HEIGHT * 0.72,
        vx: 0,
        vy: 0,
        angle: 0,
        tilt: 0,
        speed: 5,
        baseSpeed: 5,
        lives: 3,
        maxLives: 3,
        qi: 100,
        maxQi: 100,
        ultEnergy: 0,
        maxUltEnergy: 100,
        dashTimer: 0,
        invincibleTimer: 0,
        realmIndex: 0,
        swordCount: 1,
        ribbonNodes: [
            { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
        ],
        trailHistory: []
    };
}
