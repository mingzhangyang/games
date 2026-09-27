# 针尖对麦芒 · 东方赛博水墨场景

这组资源是《针尖对麦芒》的生产级视觉层，逻辑画布保持 `480×640`，所有场景板按 `2×` 输出为 `960×1280` WebP。

## 图层职责

- `sky-ink.webp`：深青黑天幕与残月，作为不透明底板。
- `mountains.webp`：远山与云海，透明叠加。
- `mist.webp`：边缘墨雾，中央留出弹幕与尖端的高对比阅读区。
- `arena-floor.webp`：悬空演武台、石纹和克制的麦金圆阵。
- `foreground.webp`：竹叶、檐角和近景石沿，只压住边缘。
- `fallback.webp`：资源失败时的完整视觉预览；真正的运行时故障回退仍由 scene 模块的程序绘制保证可玩性。

## Boss 法相

`bosses/` 中的三张透明 WebP 只负责视觉外壳：`needle_sovereign`、`awn_emperor`、`grandmaster`。碰撞仍使用 `js/needle-awn.js` 中现有的 `radius`、`tipDistance` 和尖端检测，不把位图边界当作判定盒。

## 生成与运行约定

原画冻结稿是 `reference/concept-arena.webp`。正式场景由 `js/needle-awn-art.js` 加载、由 `js/needle-awn-scene.js` 缓存和绘制。禁止把文字、按钮或 HUD 烘焙进这些位图。
