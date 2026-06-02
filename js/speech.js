// h5/js/speech.js
window.Speech = (() => {
  function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1.0;
    window.speechSynthesis.speak(utter);
  }

  return { speak };
})();
