// Canonical build-time compatibility plugin retained through CSS Layers P4/P5.
// Keep the implementation isolated from vite.config.js composition so the migration
// guard can pin the ordering behavior while P4 conditionally disables only this plugin.
export function createSharedCssFirstPlugin() {
    return {
        name: 'shared-css-first',
        transformIndexHtml: {
            order: 'post',
            handler(html) {
                const rank = (name) => {
                    if (/\/tokens-/.test(name)) return 0;
                    if (/\/layout-/.test(name)) return 1;
                    // 科学展柜共享皮肤（5 个实验室游戏）：源码里排在 layout 之后、页面 CSS 之前
                    if (/\/science-showcase-/.test(name)) return 2;
                    if (/\/more-games-/.test(name)) return 9;
                    return 5;
                };

                // ① 外链之间排序：tokens → layout → [science-showcase] → 页面 → more-games
                const links = [...html.matchAll(/[ \t]*<link rel="stylesheet"[^>]*>/g)];
                if (links.length >= 2) {
                    const sorted = [...links].sort((a, b) => rank(a[0]) - rank(b[0]));
                    if (!sorted.every((match, index) => match.index === links[index].index)) {
                        let out = '';
                        let last = 0;
                        links.forEach((match, index) => {
                            out += html.slice(last, match.index) + sorted[index][0];
                            last = match.index + match[0].length;
                        });
                        html = out + html.slice(last);
                    }
                }
                if (!links.length) return html;

                // ② 外链还必须排在内联 <style> 之前。
                //    定位内联样式前先把 HTML 注释抹掉，避免说明文字里的标签名干扰匹配。
                const masked = html.replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length));
                const styleAt = masked.search(/<style[\s>]/);
                if (styleAt < 0) return html;
                const all = [...html.matchAll(/[ \t]*<link rel="stylesheet"[^>]*>[ \t]*\r?\n?/g)];
                if (!all.length || all.every(match => match.index < styleAt)) return html;

                const tags = all.map(match => match[0].trim());
                let stripped = '';
                let previous = 0;
                for (const match of all) {
                    stripped += html.slice(previous, match.index);
                    previous = match.index + match[0].length;
                }
                stripped += html.slice(previous);
                const maskedOut = stripped.replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length));
                const styleIndex = maskedOut.search(/<style[\s>]/);
                const lineStart = stripped.lastIndexOf('\n', styleIndex) + 1;
                const indent = stripped.slice(lineStart, styleIndex).match(/^[ \t]*/)[0];
                return stripped.slice(0, lineStart)
                    + tags.map(tag => indent + tag + '\n').join('')
                    + stripped.slice(lineStart);
            },
        },
    };
}
