// speech.js
// 策略：
//   浏览器 / 微信 WebView 均使用 Audio 元素播放腾讯云 TTS mp3
//   Audio 实例在首次用户手势（点击 GPS 按钮）时解锁
//   TTS 密钥从 URL 参数 ?sid=&skey= 读取；缺少时降级 SpeechSynthesis（仅普通浏览器）
//   微信小程序 webview 环境下 SpeechSynthesis 不可靠，不使用
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

  // 判断是否在微信 WebView（包含小程序 webview）
  function _isWechat() {
    return /micromessenger/i.test(navigator.userAgent);
  }

  // 首次用户手势时调用，解锁 Audio 自动播放限制
  function unlock() {
    if (_unlocked) return;
    _audio = new Audio();
    // 播放一段无声音频来解锁
    _audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    _audio.play().then(() => {
      _unlocked = true;
      _audio.onended = () => { _speaking = false; _next(); };
      _audio.onerror = () => { _speaking = false; _next(); };
    }).catch(() => {
      // 解锁失败不影响后续，继续尝试
      _unlocked = true;
      _audio.onended = () => { _speaking = false; _next(); };
      _audio.onerror = () => { _speaking = false; _next(); };
    });
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
    } else if (!_isWechat() && window.speechSynthesis) {
      _synthFallback(text);
    } else {
      // 无密钥且在微信里，跳过
      _speaking = false;
      _next();
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
    const canonicalRequest = ['POST','/','' , canonicalHeaders, signedHeaders, hashedPayload].join('\n');
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
        'Content-Type': 'application/json',
        'Host': TTS_HOST,
        'X-TC-Action': TTS_ACTION,
        'X-TC-Version': TTS_VERSION,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': TTS_REGION,
        'Authorization': authorization,
      },
      body: payload,
    })
      .then(r => r.json())
      .then(body => {
        if (body && body.Response && body.Response.Audio) {
          _playBase64(body.Response.Audio, text);
        } else {
          console.warn('[Speech] TTS错误:', JSON.stringify(body));
          _synthFallback(text);
        }
      })
      .catch(err => {
        console.warn('[Speech] TTS请求失败:', err);
        _synthFallback(text);
      });
  }

  function _playBase64(base64, text) {
    const src = 'data:audio/mp3;base64,' + base64;
    if (_audio) {
      _audio.src = src;
      _audio.play().catch(() => _synthFallback(text));
    } else {
      // Audio 未解锁时创建新实例播放
      const a = new Audio(src);
      a.onended = () => { _speaking = false; _next(); };
      a.onerror = () => { _speaking = false; _next(); };
      a.play().catch(() => _synthFallback(text));
    }
  }

  function _synthFallback(text) {
    if (_isWechat() || !window.speechSynthesis) {
      _speaking = false; _next(); return;
    }
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = 1.0;
      utter.volume = 1.0;
      utter.onend  = () => { _speaking = false; _next(); };
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
