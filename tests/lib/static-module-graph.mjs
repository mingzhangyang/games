import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const STATIC_IMPORT = /^\s*(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?(['"])([^'"]+)\1\s*;?/gm;

function resolveLocalImport(fromFile, specifier, root) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
    const base = specifier.startsWith('/')
        ? resolve(root, `.${specifier}`)
        : resolve(dirname(fromFile), specifier);
    const candidates = extname(base) ? [base] : [
        `${base}.js`,
        join(base, 'index.js'),
    ];
    return candidates.find(candidate => existsSync(candidate) && candidate.endsWith('.js')) || null;
}

/** Collect JS files reachable through static local import/export edges. */
export function collectStaticModuleGraph(entry, root) {
    const entryFile = resolve(root, entry);
    const pending = [entryFile];
    const modules = new Map();

    while (pending.length) {
        const file = pending.pop();
        if (modules.has(file) || !existsSync(file)) continue;

        const source = readFileSync(file, 'utf8');
        modules.set(file, source);
        for (const match of source.matchAll(STATIC_IMPORT)) {
            const imported = resolveLocalImport(file, match[2], root);
            if (imported && !modules.has(imported)) pending.push(imported);
        }
    }

    return new Map([...modules].map(([file, source]) => [
        relative(root, file).replace(/\\/g, '/'),
        source,
    ]));
}

export function graphIncludes(entry, target, root) {
    return collectStaticModuleGraph(entry, root).has(target);
}
