// speech.js
// 浏览器环境：SpeechSynthesis（Live Server 调试用）
// 微信小程序 web-view：写入 window.__ttsQueue，由小程序每 500ms 轮询取走用原生 TTS 播放
window.Speech = (() => {
  const _recentKeys = new Map();
  const DEDUPE_MS   = 10000;

  // 小程序轮询队列
  window.__ttsQueue = [];

  function _isInMiniProgram() {
    return typeof wx !== 'undefined' && wx.miniProgram;
  }

  function speak(text, dedupeKey) {
    const key = dedupeKey || text;
    const now  = Date.now();
    const last = _recentKeys.get(key);
    if (last && now - last < DEDUPE_MS) return;
    _recentKeys.set(key, now);

    if (_isInMiniProgram()) {
      window.__ttsQueue.push(text);
    } else {
      _speakBrowser(text);
    }
  }

  function _speakBrowser(text) {
    if (!window.speechSynthesis) return;
    // 取消当前播报再开始，避免队列堆积
    window.speechSynthesis.cancel();
    // Chrome 有时需要延迟才能正常播放
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = 1.0;
      utter.volume = 1.0;
      window.speechSynthesis.speak(utter);
    }, 100);
  }

  function reset() {
    window.__ttsQueue = [];
    _recentKeys.clear();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  return { speak, reset };
})();
