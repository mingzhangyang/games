// 首页入口：实现在 src/home/（组合根 src/home/index.js）。这里只注入中文翻译的懒加载器——
// js/index-i18n-zh.js 是 gen 产物，放在入口旁边，动态 import 让英文访客不下载它。
import { startHome } from '../src/home/index.js';

startHome({ loadZh: () => import('./index-i18n-zh.js') });
