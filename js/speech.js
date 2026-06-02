// speech.js — 语音播报
// 在微信小程序 web-view 环境：通过 postMessage 委托小程序调用腾讯云 TTS
// 在普通浏览器环境：直接调用腾讯云 TTS fetch（需密钥），失败降级 SpeechSynthesis
window.Speech = (() => {
  const _params    = new URLSearchParams(location.search);
  const SECRET_ID  = _params.get('sid')  || '';
  const SECRET_KEY = _params.get('skey') || '';
  const TTS_HOST    = 'tts.tencentcloudapi.com';
  const TTS_SERVICE = 'tts';
  const TTS_VERSION = '2019-08-23';
  const TTS_ACTION  = 'TextToVoice';
  const TTS_REGION  = 'ap-guangzhou';

  const _queue      = [];
  let   _speaking   = false;
  const _recentKeys = new Map();
  const DEDUPE_MS   = 10000;

  let _audio = null;

  function _isInMiniProgram() {
    return typeof wx !== 'undefined' && wx.miniProgram;
  }

  function _getAudio() {
    if (!_audio) {
      _audio = new Audio();
      _audio.onended = () => { _speaking = false; _next(); };
      _audio.onerror = () => { _speaking = false; _next(); };
    }
    return _audio;
  }

  // 小程序回调接口：小程序合成完毕后调用此函数传回 base64 音频
  window.__onTtsResult = function(base64Audio, text) {
    if (!base64Audio) { _fallback(text); return; }
    const au = _getAudio();
    au.src = 'data:audio/mp3;base64,' + base64Audio;
    au.play().catch(() => _fallback(text));
  };

  function speak(text, dedupeKey) {
    const key = dedupeKey || text;
    const now  = Date.now();
    const last = _recentKeys.get(key);
    if (last && now - last < DEDUPE_MS) return;
    _recentKeys.set(key, now);
    _queue.push(text);
    if (!_speaking) _next();
  }

  function _next() {
    if (_queue.length === 0) { _speaking = false; return; }
    _speaking = true;
    const text = _queue.shift();
    if (_isInMiniProgram()) {
      // 委托小程序调用 TTS
      wx.miniProgram.postMessage({ data: { type: 'tts', text } });
      // 小程序 postMessage 仅在后退时触发，无法实时回调
      // 改用 evaluateJavascript 轮询方式——因此直接降级 SpeechSynthesis 更可靠
      // 实际上微信 WebView 在用户点击后支持 speechSynthesis
      _fallback(text);
    } else {
      _tryTts(text);
    }
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
    if (!window.speechSynthesis) { _speaking = false; _next(); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1.0;
    utter.onend  = () => { _speaking = false; _next(); };
    utter.onerror = () => { _speaking = false; _next(); };
    window.speechSynthesis.speak(utter);
  }

  function reset() {
    _queue.length = 0;
    _speaking = false;
    _recentKeys.clear();
    if (_audio) { try { _audio.pause(); } catch (e) {} _audio.src = ''; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  return { speak, reset };
})();
