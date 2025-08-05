// 移除重复的入口与本地状态，统一使用 migrated 模块提供的 API 与懒加载
import { applyLanguage, applyLanguageAsync, loadLanguagePreference, setupSettingsListeners } from "./main-inline-migrated.js";

(function(){
  document.addEventListener("DOMContentLoaded", function(){
    const language = loadLanguagePreference();
    if (typeof window !== 'undefined') {
      window.currentLanguage = language;
    }
    // 同步首屏填充 + 异步懒加载覆盖
    applyLanguage(language);
    applyLanguageAsync(language);

    const toggleBtn = document.getElementById("language-toggle");
    if (toggleBtn){
      toggleBtn.textContent = language === "zh" ? "🌐 EN" : "🌐 中文";
    }

    if (typeof window !== "undefined" && typeof window.MathRainGame !== "undefined"){
      try{
        if (!window.game || !(window.game instanceof window.MathRainGame)) {
          window.game = new window.MathRainGame();
        }
      }catch(e){ console.error("create MathRainGame error", e); }
      setupSettingsListeners();
    }
  });
})();