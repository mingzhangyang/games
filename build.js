#!/usr/bin/env node

import { execSync } from 'child_process';

function run(command, description) {
  try {
    console.log(`[build] ${description}`);
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`[build] Failed: ${description}`);
    process.exit(error.status || 1);
  }
}

run('npm run build', 'Running production build via Vite');
console.log('[build] Build completed successfully');
