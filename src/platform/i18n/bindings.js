const ATTRS = [
    ['i18nTitle', 'title'],
    ['i18nLabel', 'aria-label'],
    ['i18nPlaceholder', 'placeholder'],
    ['i18nTooltip', 'data-tooltip'],
];

/**
 * Apply a translation table to declarative DOM bindings.
 * Supported attributes: data-i18n, data-i18n-title, data-i18n-label,
 * data-i18n-placeholder, data-i18n-tooltip.
 */
export function applyI18nBindings(root, table, { fallback = null } = {}) {
    if (!root || !table) return 0;
    const scope = root.querySelectorAll ? root : document;
    const nodes = scope.querySelectorAll(
        '[data-i18n], [data-i18n-title], [data-i18n-label], [data-i18n-placeholder], [data-i18n-tooltip]'
    );
    let writes = 0;
    nodes.forEach(node => {
        const key = node.dataset.i18n;
        if (key) {
            const value = table[key] ?? fallback?.[key];
            if (value != null) {
                node.textContent = value;
                writes++;
            }
        }
        for (const [dataKey, attr] of ATTRS) {
            const attrKey = node.dataset[dataKey];
            if (!attrKey) continue;
            const value = table[attrKey] ?? fallback?.[attrKey];
            if (value != null) {
                node.setAttribute(attr, value);
                writes++;
            }
        }
    });
    return writes;
}

export function createI18nBinder({ root = document, getLang, tables, fallbackLang = 'en' }) {
    const apply = (lang = getLang?.() || fallbackLang) => {
        const table = tables?.[lang] || tables?.[fallbackLang] || {};
        const fallback = tables?.[fallbackLang] || {};
        if (typeof document !== 'undefined') {
            document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
        }
        return applyI18nBindings(root, table, { fallback });
    };
    return { apply };
}
