/** Resolve the user's real responsive entry. Never make hidden game buttons clickable. */
export async function revealTopbarAction(page, selector) {
    const target = await page.evaluate(sel => {
        const source = document.querySelector(sel);
        if (!source) throw new Error('Missing action: ' + sel);
        if (source.getBoundingClientRect().width > 0
            && getComputedStyle(source).visibility !== 'hidden') return { selector: sel };
        if (!source.hasAttribute('data-topbar-overflow-source') || source.disabled
            || source.closest('[hidden], .hidden')) throw new Error('Unavailable action: ' + sel);
        const proxy = [...document.querySelectorAll('[data-topbar-proxy]')]
            .find(item => item.dataset.topbarProxy === source.id);
        if (!proxy) throw new Error('Missing proxy: ' + sel);
        const menu = proxy.closest('[popover]');
        const more = document.querySelector('[popovertarget="' + menu.id + '"]');
        return { selector: '[data-topbar-proxy="' + source.id + '"]',
            more: '#' + more.id, open: menu.matches(':popover-open') };
    }, selector);
    if (target.more && !target.open) await page.click(target.more);
    await page.waitForSelector(target.selector, { visible: true, timeout: 5000 });
    return target.selector;
}

export async function clickTopbarAction(page, selector) {
    await page.click(await revealTopbarAction(page, selector));
}
