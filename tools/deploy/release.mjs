#!/usr/bin/env node
/**
 * The only supported site release path: install the shared scoreboard Worker,
 * verify its real public API, then publish the site. New client keys cannot
 * outrun their backend, even when invoked via the standard npm deploy command.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmStep = (...args) => ({ command: npm, args });
const nodeStep = script => ({ command: process.execPath, args: [join(ROOT, script)] });

export function releasePlan(target) {
    if (target !== 'site' && target !== 'all') {
        throw new Error('Unknown release target: ' + target);
    }
    return [
        npmStep('run', 'gen', '--', '--check'),
        npmStep('run', 'deploy:scores'),
        nodeStep('tools/deploy/verify-scores-worker.mjs'),
        ...(target === 'all' ? [
            npmStep('run', 'deploy:analytics'),
            npmStep('run', 'deploy:word-stats'),
        ] : []),
        npmStep('run', 'build'),
        npmStep('exec', '--', 'wrangler', 'deploy'),
    ];
}

export function executeRelease(target, spawn = spawnSync) {
    for (const step of releasePlan(target)) {
        console.log('Release:', step.command, ...step.args);
        const result = spawn(step.command, step.args, { cwd: ROOT, stdio: 'inherit' });
        if (result.error) throw result.error;
        if (result.status !== 0) {
            // Fail closed. The site must never publish if the backend or
            // verification failed. A Worker-only update is backward compatible.
            return result.status || 1;
        }
    }
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = executeRelease(process.argv[2] || 'site');
    } catch (error) {
        console.error('Release aborted:', error);
        process.exitCode = 1;
    }
}
