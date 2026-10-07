// Canonical build-time compatibility plugin retained through CSS Layers P4/P5.
// Keep the implementation isolated from vite.config.js composition so the migration
// guard can pin the ordering behavior while P4 conditionally disables only this plugin.
export function createSharedCssFirstPlugin() {
  return {
    name: 'shared-css-first',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const RANK = name =>
          /\/tokens-/.test(name) ? 0
            : /\/layout-/.test(name) ? 1
              // 科学展柜共享皮肤（5 个实验室游戏）：源码里排在 layout 之后、页面 CSS 之前
              : /\/science-showcase-/.test(name) ? 2
                : /\/more-games-/.test(name) ? 9
                  : 5;
        // ① 外链之间排序：tokens → layout → [science-showcase] → 页面 → more-games
        const links = [...html.matchAll(/[ \t]*<link rel="stylesheet"[^>]*>/g)];
        if (links.length >= 2) {
          const sorted = [...links].sort((a, b) => RANK(a[0]) - RANK(b[0]));
          if (!sorted.every((m, i) => m.index === links[i].index)) {
            let out = '', last = 0;
            links.forEach((m, i) => {
              out += html.slice(last, m.index) + sorted[i][0];
              last = m.index + m[0].length;
            });
            html = out + html.slice(last);
          }
        }
        if (!links.length) return html;

        // ② 外链还必须排在内联 <style> 之前。
        //    定位内联样式前先把 HTML 注释抹掉，避免说明文字里的标签名干扰匹配。
        const masked = html.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
        const styleAt = masked.search(/<style[\s>]/);
        if (styleAt < 0) return html;
        const all = [...html.matchAll(/[ \t]*<link rel="stylesheet"[^>]*>[ \t]*\r?\n?/g)];
        if (!all.length || all.every(m => m.index < styleAt)) return html;

        const tags = all.map(m => m[0].trim());
        let stripped = '', prev = 0;
        for (const m of all) {
          stripped += html.slice(prev, m.index);
          prev = m.index + m[0].length;
        }
        stripped += html.slice(prev);
        const maskedOut = stripped.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
        const si = maskedOut.search(/<style[\s>]/);
        const lineStart = stripped.lastIndexOf('\n', si) + 1;
        const indent = stripped.slice(lineStart, si).match(/^[ \t]*/)[0];
        return stripped.slice(0, lineStart)
          + tags.map(t => indent + t + '\n').join('')
          + stripped.slice(lineStart);
      }
    }
  };
}
