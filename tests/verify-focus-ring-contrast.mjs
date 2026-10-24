// A focused control must still stand out on all four substantial backdrop
// strips, without failing when Tetris' tiny animated stars cross one pixel.
import assert from 'node:assert/strict';
import { contrastRatio, outlineBackdropContrast } from './lib/focus-ring-contrast.mjs';

const ring = [165, 184, 255]; // --tok-focus for the dark theme
const rect = [10, 10, 36, 36];
const dark = [20, 25, 45], bright = [240, 240, 240];
const sample = fn => outlineBackdropContrast(fn, ring, rect);
const plain = () => dark;
const particles = (x, y) => (
    (x === 7 && y >= 26 && y <= 28)
    || (x === 48 && y >= 26 && y <= 28)
    || (y === 7 && x >= 26 && x <= 28)
    || (y === 48 && x >= 26 && x <= 28)
) ? bright : dark;

assert(contrastRatio(ring, bright) < 3, 'a bright speck is locally low contrast');
assert(sample(plain) >= 3, 'an ordinary dark surface passes');
assert(sample(particles) >= 3, 'up to 3px bright specks on all four sides do not fail the ring');

// A real adjacent low-contrast surface remains a failure even if only one
// of the four sides is poor. A median must never dilute a whole bad side.
for (const badSide of [
    (x, y) => x === 7 && y >= 24 && y <= 32,
    (x, y) => x === 48 && y >= 24 && y <= 32,
    (x, y) => y === 7 && x >= 24 && x <= 32,
    (x, y) => y === 48 && x >= 24 && x <= 32,
]) {
    assert(sample((x, y) => badSide(x, y) ? bright : dark) < 3,
        'an entire low-contrast outline side must fail');
}
assert(sample(() => bright) < 3, 'an entire bright background must fail');
assert(Number.isNaN(sample(() => null)), 'fully off-screen samples must not pass by Infinity');

// Also test an arbitrary particle position along a strip: size <= 3px must
// not change the contrast verdict, independent of its exact random location.
for (let top = 20; top <= 36; top++) {
    const particle = (x, y) => x === 7 && y >= top && y < top + 3 ? bright : dark;
    assert(sample(particle) >= 3, 'isolated bright point at offset ' + top);
}
console.log('verify-focus-ring-contrast: dark, four particles, four coherent bad sides, all-bright, invalid and 17 particle placements passed');
