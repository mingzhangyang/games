// canonical / og:url / og:image 跟随当前地址；JSON-LD 的游戏列表从生成卡片 DOM 派生（英文原文）。
import { cardDefaults } from './i18n.js';

export function syncSocialMeta() {
    const currentUrl = window.location.href.split('#')[0];
    document.getElementById('canonical-link')?.setAttribute('href', currentUrl);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', currentUrl);
    const imageUrl = new URL('assets/seo/og-collection.svg', new URL('.', currentUrl)).href;
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', imageUrl);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', imageUrl);
}

export function injectStructuredData() {
    const currentUrl = window.location.href.split('#')[0];
    const baseUrl = new URL('.', currentUrl).href;
    const items = [...document.querySelectorAll('.game-card[data-game-id]')].map((card, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: cardDefaults(card)?.name || card.querySelector('.card-title')?.textContent || '',
        description: cardDefaults(card)?.desc || card.querySelector('.card-desc-text')?.textContent || '',
        url: new URL(card.getAttribute('href') || '', baseUrl).href,
    }));
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'WebSite', name: 'Mini Games Collection', url: currentUrl, publisher: { '@type': 'Organization', name: 'Orangely' } },
            { '@type': 'ItemList', name: 'Mini Games Collection', itemListElement: items },
        ],
    });
    document.head.appendChild(script);
}
