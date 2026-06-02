// h5/js/location.js
window.Location = (() => {
  let onPositionChange = null;
  let onHeadingChange = null;
  let watchId = null;

  function start(positionCallback, headingCallback) {
    onPositionChange = positionCallback;
    onHeadingChange = headingCallback;
    _startGPS();
    _startCompass();
  }

  function _startGPS() {
    if (!navigator.geolocation) {
      console.warn('[Location] 浏览器不支持 Geolocation');
      return;
    }
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (onPositionChange) {
          onPositionChange(pos.coords.latitude, pos.coords.longitude);
        }
      },
      (err) => console.warn('[Location] GPS 错误:', err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }

  function _startCompass() {
    if (typeof DeviceOrientationEvent === 'undefined') {
      console.warn('[Location] 不支持 DeviceOrientationEvent');
      return;
    }
    window.addEventListener('deviceorientation', (e) => {
      if (onHeadingChange && e.alpha !== null) {
        onHeadingChange(e.alpha);
      }
    });
  }

  function stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  async function requestPermissions() {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') {
        console.warn('[Location] 罗盘权限被拒绝');
      }
    }
  }

  return { start, stop, requestPermissions };
})();
