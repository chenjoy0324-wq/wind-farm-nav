// hmac_sha256.js — 纯 JS 实现 HMAC-SHA256（浏览器版，无 Node.js 依赖）
window.HmacSha256Lib = (() => {
  function strToUtf8(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF) {
        const hi = code;
        const lo = str.charCodeAt(++i);
        code = ((hi - 0xD800) << 10) + (lo - 0xDC00) + 0x10000;
      }
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      } else if (code < 0x10000) {
        out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      } else {
        out.push(
          0xF0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3F),
          0x80 | ((code >> 6) & 0x3F),
          0x80 | (code & 0x3F)
        );
      }
    }
    return new Uint8Array(out);
  }

  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    return strToUtf8(String(input));
  }

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function sha256(message) {
    const H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
      0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
      0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
      0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
      0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
      0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    const bytes = toBytes(message);
    const len = bytes.length;
    const bitLen = len * 8;
    const padLen = ((len + 9 + 63) & ~63);
    const padded = new Uint8Array(padLen);
    padded.set(bytes);
    padded[len] = 0x80;

    const view = new DataView(padded.buffer);
    view.setUint32(padLen - 4, bitLen >>> 0, false);
    view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);

    for (let offset = 0; offset < padLen; offset += 64) {
      const W = new Uint32Array(64);
      for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i-15], 7) ^ rotr(W[i-15], 18) ^ (W[i-15] >>> 3);
        const s1 = rotr(W[i-2], 17) ^ rotr(W[i-2], 19) ^ (W[i-2] >>> 10);
        W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e;
        e = (d + temp1) >>> 0;
        d = c; c = b; b = a;
        a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    const result = new Uint8Array(32);
    const rv = new DataView(result.buffer);
    H.forEach((v, i) => rv.setUint32(i * 4, v, false));
    return result;
  }

  function hmacSha256(key, message) {
    let keyBytes = toBytes(key);
    if (keyBytes.length > 64) keyBytes = sha256(keyBytes);
    const ipad = new Uint8Array(64);
    const opad = new Uint8Array(64);
    ipad.set(keyBytes);
    opad.set(keyBytes);
    for (let i = 0; i < 64; i++) { ipad[i] ^= 0x36; opad[i] ^= 0x5c; }
    const msgBytes = toBytes(message);
    const inner = new Uint8Array(64 + msgBytes.length);
    inner.set(ipad);
    inner.set(msgBytes, 64);
    const innerHash = sha256(inner);
    const outer = new Uint8Array(64 + 32);
    outer.set(opad);
    outer.set(innerHash, 64);
    return sha256(outer);
  }

  function uint8ArrayToHex(arr) {
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return { sha256, hmacSha256, uint8ArrayToHex };
})();
