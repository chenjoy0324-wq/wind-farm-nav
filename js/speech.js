// speech.js
// 浏览器环境：腾讯云 TTS（密钥从 URL 参数读取），失败降级 SpeechSynthesis
// 微信 WebView：直接用 SpeechSynthesis（需用户手势解锁）
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
  const _queue      = [];
  let   _speaking   = false;
  let   _audio      = null;
  let   _unlocked   = false;

  // GPS 按钮点击时调用，在用户手势内解锁音频播放
  function unlock() {
    if (_unlocked) return;
    _unlocked = true;
    // 解锁 Audio 元素
    if (!_audio) _audio = new Audio();
    const silentSrc = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    _audio.src = silentSrc;
    _audio.play().catch(() => {});
    // 解锁 SpeechSynthesis
    if (window.speechSynthesis) {
      const w = new SpeechSynthesisUtterance('');
      w.volume = 0;
      window.speechSynthesis.speak(w);
    }
    _audio.onended = () => { _speaking = false; _next(); };
    _audio.onerror = () => { _speaking = false; _next(); };
  }

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
    if (SECRET_ID && SECRET_KEY) {
      _tts(text);
    } else {
      _synthFallback(text);
    }
  }

  function _tts(text) {
    const { hmacSha256, sha256, uint8ArrayToHex } = HmacSha256Lib;
    const timestamp = Math.floor(Date.now() / 1000);
    const date      = new Date(timestamp * 1000).toISOString().slice(0, 10);

    const payload = JSON.stringify({
      Text: text, SessionId: 'nav-' + timestamp,
      VoiceType: 1002, Codec: 'mp3', SampleRate: 16000,
    });

    const hashedPayload    = uint8ArrayToHex(sha256(payload));
    const canonicalHeaders = `content-type:application/json\nhost:${TTS_HOST}\n`;
    const signedHeaders    = 'content-type;host';
    const canonicalRequest = ['POST','/','' ,canonicalHeaders,signedHeaders,hashedPayload].join('\n');
    const credentialScope  = `${date}/${TTS_SERVICE}/tc3_request`;
    const hashedCanonical  = uint8ArrayToHex(sha256(canonicalRequest));
    const stringToSign     = ['TC3-HMAC-SHA256',timestamp,credentialScope,hashedCanonical].join('\n');
    const secretDate       = hmacSha256('TC3' + SECRET_KEY, date);
    const secretSvc        = hmacSha256(secretDate, TTS_SERVICE);
    const secretSigning    = hmacSha256(secretSvc, 'tc3_request');
    const signature        = uint8ArrayToHex(hmacSha256(secretSigning, stringToSign));
    const authorization    = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    fetch(`https://${TTS_HOST}`, {
      method: 'POST',
      headers: {
        'Content-Type':'application/json','Host':TTS_HOST,
        'X-TC-Action':TTS_ACTION,'X-TC-Version':TTS_VERSION,
        'X-TC-Timestamp':String(timestamp),'X-TC-Region':TTS_REGION,
        'Authorization':authorization,
      },
      body: payload,
    })
      .then(r => r.json())
      .then(body => {
        if (body && body.Response && body.Response.Audio) {
          if (!_audio) _audio = new Audio();
          _audio.onended = () => { _speaking = false; _next(); };
          _audio.onerror = () => { _speaking = false; _next(); };
          _audio.src = 'data:audio/mp3;base64,' + body.Response.Audio;
          _audio.play().catch(() => _synthFallback(text));
        } else {
          _synthFallback(text);
        }
      })
      .catch(() => _synthFallback(text));
  }

  function _synthFallback(text) {
    if (!window.speechSynthesis) { _speaking = false; _next(); return; }
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = 1.0;
      utter.volume = 1.0;
      utter.onend   = () => { _speaking = false; _next(); };
      utter.onerror = () => { _speaking = false; _next(); };
      window.speechSynthesis.speak(utter);
    }, 50);
  }

  function reset() {
    _queue.length = 0;
    _speaking = false;
    _recentKeys.clear();
    if (_audio) { try { _audio.pause(); } catch(e){} }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  return { speak, unlock, reset };
})();
