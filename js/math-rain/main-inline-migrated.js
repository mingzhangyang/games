// js/math-rain/main-inline-migrated.js
// 说明：该文件从 math-rain.html 的内联脚本迁移而来，包含多语言文本、语言应用逻辑、设置监听与持久化，以及游戏初始化入口。
// 要求：保持与原有 DOM 结构、ID、类名一致；对不存在的元素做安全判断；与 MathRainGame 单例兼容。

// 语言文本（从内联迁移，保持键结构一致）
export const LANGUAGES = {
  zh: {
    // 作为同步首屏最小占位，详细文案改为异步包
  },
  en: {
    // 作为同步首屏最小占位，详细文案改为异步包
  }
};

let currentLanguage = "zh";
if (typeof window !== 'undefined') {
  window.currentLanguage = currentLanguage;
}

export function detectLanguage() {
  try {
    const navLang = (navigator.language || navigator.userLanguage || "zh").toLowerCase();
    if (navLang.startsWith("zh")) return "zh";
    return "en";
  } catch (_) {
    return "zh";
  }
}

export function applyLanguage(lang) {
  const texts = (typeof window !== 'undefined' && window.LANGUAGES && window.LANGUAGES[lang]) || LANGUAGES[lang] || LANGUAGES.zh || {};

  const safeText = (k, d = "") => (texts && typeof texts[k] === 'string') ? texts[k] : d;
  const setText = (sel, key, def = "") => {
    const el = document.querySelector(sel);
    if (el) el.textContent = safeText(key, def);
  };

  // 主菜单与基础按钮（保持最小同步首屏）
  setText('#game-title', 'gameTitle', '数学雨');
  setText('#target h2', 'targetLabel', '目标');
  setText('#score h2', 'scoreLabel', '分数');
  setText('#combo h2', 'comboLabel', '连击');
  setText('#lives h2', 'livesLabel', '生命');
  setText('#time h2', 'timeLabel', '时间');
  setText('#start-btn', 'startBtn', '开始');
  setText('#pause-btn', 'pauseBtn', '暂停');
  setText('#resume-btn', 'resumeBtn', '继续');
  setText('#end-btn', 'endBtn', '结束');

  setText('#session-complete h2', 'sessionCompleteTitle', '会话完成');
  setText('#session-stats-title', 'sessionStats', '会话统计');
  setText('#total-score-label', 'totalScore', '总分');
  setText('#max-combo-label', 'maxCombo', '最大连击');
  setText('#accuracy-label', 'accuracy', '准确率');
  setText('#continue-btn', 'continueBtn', '继续');
  setText('#restart-btn', 'restartBtn', '重新开始');
  setText('#back-to-menu-btn', 'backToMenuBtn', '返回菜单');

  setText('#settings-screen h2', 'gameSettings', '游戏设置');

  const settingLabels = document.querySelectorAll('#settings-screen label');
  const settingTexts = [
    safeText('soundVolume', '音效音量'),
    safeText('musicVolume', '音乐音量'),
    safeText('particleEffects', '粒子效果'),
    safeText('screenShake', '屏幕震动'),
    safeText('cssAnimations', 'CSS 动画'),
    safeText('performanceMode', '性能模式'),
    safeText('languageLabel', '语言')
  ];
  settingLabels.forEach((label, index) => {
    if (settingTexts[index]) label.textContent = settingTexts[index];
  });

  const settingsCloseBtn = document.getElementById('settings-close-btn');
  if (settingsCloseBtn) settingsCloseBtn.textContent = safeText('closeSettings', '关闭设置');

  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.textContent = safeText('helpBtn', '帮助');

  const helpTitle = document.querySelector('#help-screen h2');
  if (helpTitle) helpTitle.textContent = safeText('helpTitle', '玩法说明');

  const helpGoalTitle = document.querySelector('#help-screen .help-section:nth-child(1) h3');
  if (helpGoalTitle) helpGoalTitle.textContent = safeText('helpGoal', '目标');

  const helpGoalDesc = document.querySelector('#help-screen .help-section:nth-child(1) p');
  if (helpGoalDesc) helpGoalDesc.textContent = safeText('helpGoalDesc', '在表达式掉落前，解出结果等于目标数字的算式。');

  const helpControlsTitle = document.querySelector('#help-screen .help-section:nth-child(2) h3');
  if (helpControlsTitle) helpControlsTitle.textContent = safeText('helpControls', '操作方法');

  const helpControlsList = document.querySelector('#help-screen .help-section:nth-child(2) .controls-guide');
  if (helpControlsList && texts.helpControlsList) {
    const controlItems = helpControlsList.querySelectorAll('.control');
    const keys = ['clickToSelect', 'spaceToDrop', 'escToPause', 'enterToResume'];
    controlItems.forEach((item, idx) => {
      const span = item.querySelector('span');
      if (span) span.textContent = texts.helpControlsList[idx] || texts[keys[idx]] || '';
    });
  }

  if (document && document.documentElement) {
    document.documentElement.setAttribute('lang', lang);
  }
}

export function saveLanguagePreference(lang) {
  try {
    localStorage.setItem("mathrain_language", lang);
  } catch (_) {}
}

export function loadLanguagePreference() {
  try {
    const saved = localStorage.getItem("mathrain_language");
    if (saved && LANGUAGES[saved]) {
      currentLanguage = saved;
    } else {
      currentLanguage = detectLanguage();
    }
  } catch (_) {
    currentLanguage = detectLanguage();
  }
  return currentLanguage;
}

export function toggleLanguage() {
  currentLanguage = currentLanguage === "zh" ? "en" : "zh";
  applyLanguage(currentLanguage);
  saveLanguagePreference(currentLanguage);
}

// 支持按需懒加载语言包
async function loadLanguagePack(lang) {
  try {
    if (lang === "zh") {
      const mod = await import("./i18n/lang-zh.js");
      return mod.default || mod.LANG_ZH || {};
    }
    if (lang === "en") {
      const mod = await import("./i18n/lang-en.js");
      return mod.default || mod.LANG_EN || {};
    }
  } catch (_) { /* ignore */ }
  return {};
}

export async function applyLanguageAsync(lang) {
  // 先应用内置文案，确保首屏不空
  applyLanguage(lang);
  // 再懒加载覆盖对应 key
  const pack = await loadLanguagePack(lang);
  if (pack && typeof pack === "object") {
    try {
      window.LANGUAGES = window.LANGUAGES || {};
      window.LANGUAGES[lang] = Object.assign({}, window.LANGUAGES[lang] || {}, pack);
      applyLanguage(lang);
    } catch (_) { /* ignore */ }
  }
}

export function setupSettingsListeners() {
  // 音效音量
  const soundVolumeSlider = document.getElementById("sound-volume");
  const soundVolumeValue = document.getElementById("sound-volume-value");
  if (soundVolumeSlider && soundVolumeValue) {
    soundVolumeSlider.addEventListener("input", (e) => {
      const volume = Number(e.target.value || 0);
      soundVolumeValue.textContent = volume + "%";
      if (window.game && window.game.soundManager && typeof window.game.soundManager.setSoundVolume === "function") {
        window.game.soundManager.setSoundVolume(Math.max(0, Math.min(1, volume / 100)));
      }
      try { localStorage.setItem("mathrain_sound_volume", String(volume)); } catch (_) {}
    });

    try {
      const savedVolume = localStorage.getItem("mathrain_sound_volume");
      if (savedVolume !== null) {
        soundVolumeSlider.value = savedVolume;
        soundVolumeValue.textContent = savedVolume + "%";
        if (window.game && window.game.soundManager && typeof window.game.soundManager.setSoundVolume === "function") {
          window.game.soundManager.setSoundVolume(Math.max(0, Math.min(1, Number(savedVolume) / 100)));
        }
      }
    } catch (_) {}
  }

  // 背景音乐音量
  const musicVolumeSlider = document.getElementById("music-volume");
  const musicVolumeValue = document.getElementById("music-volume-value");
  if (musicVolumeSlider && musicVolumeValue) {
    musicVolumeSlider.addEventListener("input", (e) => {
      const volume = Number(e.target.value || 0);
      musicVolumeValue.textContent = volume + "%";
      if (window.game && window.game.soundManager && typeof window.game.soundManager.setMusicVolume === "function") {
        window.game.soundManager.setMusicVolume(Math.max(0, Math.min(1, volume / 100)));
      }
      try { localStorage.setItem("mathrain_music_volume", String(volume)); } catch (_) {}
    });

    try {
      const savedMusicVolume = localStorage.getItem("mathrain_music_volume");
      if (savedMusicVolume !== null) {
        musicVolumeSlider.value = savedMusicVolume;
        musicVolumeValue.textContent = savedMusicVolume + "%";
        if (window.game && window.game.soundManager && typeof window.game.soundManager.setMusicVolume === "function") {
          window.game.soundManager.setMusicVolume(Math.max(0, Math.min(1, Number(savedMusicVolume) / 100)));
        }
      }
    } catch (_) {}
  }

  // 粒子效果
  const particleEffectsCheckbox = document.getElementById("particle-effects");
  if (particleEffectsCheckbox) {
    particleEffectsCheckbox.addEventListener("change", (e) => {
      if (window.game && window.game.config) {
        window.game.config.enableParticleEffects = !!e.target.checked;
      }
      try { localStorage.setItem("mathrain_particle_effects", String(!!e.target.checked)); } catch (_) {}
    });

    try {
      const savedParticles = localStorage.getItem("mathrain_particle_effects");
      if (savedParticles !== null) {
        particleEffectsCheckbox.checked = savedParticles === "true";
        if (window.game && window.game.config) {
          window.game.config.enableParticleEffects = particleEffectsCheckbox.checked;
        }
      }
    } catch (_) {}
  }

  // 屏幕震动
  const screenShakeCheckbox = document.getElementById("screen-shake");
  if (screenShakeCheckbox) {
    screenShakeCheckbox.addEventListener("change", (e) => {
      if (window.game && window.game.config) {
        window.game.config.enableScreenShake = !!e.target.checked;
      }
      try { localStorage.setItem("mathrain_screen_shake", String(!!e.target.checked)); } catch (_) {}
    });

    try {
      const savedShake = localStorage.getItem("mathrain_screen_shake");
      if (savedShake !== null) {
        screenShakeCheckbox.checked = savedShake === "true";
        if (window.game && window.game.config) {
          window.game.config.enableScreenShake = screenShakeCheckbox.checked;
        }
      }
    } catch (_) {}
  }

  // 语言切换按钮
  const languageToggle = document.getElementById("language-toggle");
  if (languageToggle) {
    languageToggle.addEventListener("click", async () => {
      toggleLanguage();
      await applyLanguageAsync(currentLanguage);
      const toggleBtn = document.getElementById('language-toggle');
      if (toggleBtn) {
        toggleBtn.textContent = (currentLanguage === 'zh') ? '🌐 EN' : '🌐 中文';
      }
    });
  }
}

// 初始化入口
function onDomReadyInit() {
  const language = loadLanguagePreference();
  currentLanguage = language;
  if (typeof window !== 'undefined') {
    window.currentLanguage = currentLanguage;
  }
  // 同步首屏填充
  applyLanguage(language);
  // 懒加载完整语言包并再次填充
  applyLanguageAsync(language);

  const toggleBtn = document.getElementById('language-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = (currentLanguage === 'zh') ? '🌐 EN' : '🌐 中文';
  }

  if (typeof window !== 'undefined' && typeof window.MathRainGame !== 'undefined') {
    if (!window.game || !(window.game instanceof window.MathRainGame)) {
      try {
        window.game = new window.MathRainGame();
      } catch (e) {
        console.error('[MathRain] Failed to init game instance on DOM ready:', e);
      }
    }
  }

  setupSettingsListeners();
}

function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReadyInit, { once: true });
  } else {
    onDomReadyInit();
  }
}

init();