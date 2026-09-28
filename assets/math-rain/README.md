# Math Rain Observatory Art

这组资源把数字雨的旧式紫绿街机界面统一为“数学天文台 / 数字观测舱”。

- `backgrounds/observatory-wide.webp`：桌面和横屏观测窗背景。
- `backgrounds/observatory-mobile.webp`：手机竖屏裁切，保留中央星图和观测地平线。
- `backgrounds/fallback.webp`：资源加载失败或校验夹具使用的低体积兜底图。
- `reference/concept-observatory.webp`：设计冻结稿，不参与运行时加载。
- `ui/*.svg`：目标环、道具和金币的正式图标；运行时按钮仍使用内联 SVG，以保持 currentColor、无障碍和命中测试一致。

背景没有文字、数字或 UI，Canvas 只负责绘制可交互算式与反馈粒子；这样背景不会拦截 Canvas pointer，也不会让每一帧重复绘制大图。
