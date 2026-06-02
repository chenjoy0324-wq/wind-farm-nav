// speech.js
// 在微信小程序 web-view 环境：把待播文本写入 window.__ttsQueue，由小程序轮询消费
// 在普通浏览器环境：直接调腾讯云 TTS，失败降级 SpeechSynthesis
window.Speech = (() => {
  const _params    = new URLSearchParams(location.search);
  const SECRET_ID  = _params.get('sid')  || '';
  const SECRET_KEY = _params.get('skey') || '';

  const TTS_HOST    = 'tts.tencentcloudapi.com';
  const TTS_SERVICE = 'tts';
  const TTS_VERSION = '2019-08-23';
  const TTS_ACTION  = 'TextToVoice';
  const TTS_REGION  = 'ap-guangzhou';

  const _recentKeys = new Map();
  const DEDUPE_MS   = 10000;

  // 小程序轮询消费的队列，挂在 window 上供 evalJS 访问
  window.__ttsQueue = [];

  let _audio    = null;
  let _speaking = false;
  const _localQueue = [];

  function _isInMiniProgram() {
    return typeof wx !== 'undefined' && wx.miniProgram;
  }

  function _getAudio() {
    if (!_audio) {
      _audio = new Audio();
      _audio.onended = () => { _speaking = false; _nextLocal(); };
      _audio.onerror = () => { _speaking = false; _nextLocal(); };
    }
    return _audio;
  }

  function speak(text, dedupeKey) {
    const key = dedupeKey || text;
    const now  = Date.now();
    const last = _recentKeys.get(key);
    if (last && now - last < DEDUPE_MS) return;
    _recentKeys.set(key, now);

    if (_isInMiniProgram()) {
      // 写入队列，由小程序轮询取走播放
      window.__ttsQueue.push(text);
    } else {
      _localQueue.push(text);
      if (!_speaking) _nextLocal();
    }
  }

  // ── 浏览器本地播放（非小程序环境）────────────────────────

  function _nextLocal() {
    if (_localQueue.length === 0) { _speaking = false; return; }
    _speaking = true;
    const text = _localQueue.shift();
    _tryTts(text);
  }

  function _tryTts(text) {
    if (!SECRET_ID || !SECRET_KEY) { _fallback(text); return; }

    const { hmacSha256, sha256, uint8ArrayToHex } = HmacSha256Lib;
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

    const payload = JSON.stringify({
      Text: text, SessionId: 'nav-' + timestamp,
      VoiceType: 1002, Codec: 'mp3', SampleRate: 16000,
    });

    const hashedPayload    = uint8ArrayToHex(sha256(payload));
    const canonicalHeaders = `content-type:application/json\nhost:${TTS_HOST}\n`;
    const signedHeaders    = 'content-type;host';
    const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n');
    const credentialScope  = `${date}/${TTS_SERVICE}/tc3_request`;
    const hashedCanonical  = uint8ArrayToHex(sha256(canonicalRequest));
    const stringToSign     = ['TC3-HMAC-SHA256', timestamp, credentialScope, hashedCanonical].join('\n');
    const secretDate       = hmacSha256('TC3' + SECRET_KEY, date);
    const secretSvc        = hmacSha256(secretDate, TTS_SERVICE);
    const secretSigning    = hmacSha256(secretSvc, 'tc3_request');
    const signature        = uint8ArrayToHex(hmacSha256(secretSigning, stringToSign));
    const authorization    = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    fetch(`https://${TTS_HOST}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Host': TTS_HOST,
        'X-TC-Action': TTS_ACTION, 'X-TC-Version': TTS_VERSION,
        'X-TC-Timestamp': String(timestamp), 'X-TC-Region': TTS_REGION,
        'Authorization': authorization,
      },
      body: payload,
    })
      .then((r) => r.json())
      .then((body) => {
        if (body && body.Response && body.Response.Audio) {
          const au = _getAudio();
          au.src = 'data:audio/mp3;base64,' + body.Response.Audio;
          au.play().catch(() => _fallback(text));
        } else {
          _fallback(text);
        }
      })
      .catch(() => _fallback(text));
  }

  function _fallback(text) {
    if (!window.speechSynthesis) { _speaking = false; _nextLocal(); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1.0;
    utter.onend  = () => { _speaking = false; _nextLocal(); };
    utter.onerror = () => { _speaking = false; _nextLocal(); };
    window.speechSynthesis.speak(utter);
  }

  function reset() {
    window.__ttsQueue = [];
    _localQueue.length = 0;
    _speaking = false;
    _recentKeys.clear();
    if (_audio) { try { _audio.pause(); } catch (e) {} _audio.src = ''; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  return { speak, reset };
})();
