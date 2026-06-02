// h5/js/ui.js
window.UI = (() => {
  let travelMode = 'drive';
  let turbinesCache = [];

  function init() {
    _startClock();
    _bindGpsButton();
    _bindRouteButton();
    _bindClearButton();
    _bindDestSelect();

    MapModule.init(
      (turbine) => {
        document.getElementById('dest-sel').value = turbine.id;
        _checkReady();
        MapModule.panTo(turbine.lat, turbine.lng);
      },
      (turbines) => {
        turbinesCache = turbines;
        _renderDeviceList(turbines);
      }
    );
  }

  function _startClock() {
    function tick() {
      const now = new Date();
      document.getElementById('time-display').textContent =
        now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    tick();
    setInterval(tick, 1000);
  }

  function _bindGpsButton() {
    document.getElementById('btn-gps').addEventListener('click', async () => {
      const ring   = document.getElementById('gps-ring');
      const status = document.getElementById('gps-status');
      const coords = document.getElementById('gps-coords');

      ring.className   = 'gps-ring loading';
      ring.textContent = '↻';
      status.textContent = '定位中…';
      coords.textContent = '正在获取 GPS 信号';

      // 在用户手势内预热 speechSynthesis（微信 WebView 需要手势解锁音频）
      if (window.speechSynthesis) {
        const warmup = new SpeechSynthesisUtterance('');
        warmup.volume = 0;
        window.speechSynthesis.speak(warmup);
      }

      try {
        await Location.requestPermissions();
      } catch (e) {
        ring.className   = 'gps-ring err';
        ring.textContent = '📍';
        status.textContent = '权限被拒绝';
        coords.textContent = '请在浏览器设置中允许定位';
        return;
      }

      Location.start(
        (lat, lng) => {
          ring.className   = 'gps-ring ok';
          ring.textContent = '📍';
          status.textContent = '已定位';
          coords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          Navigation.updatePosition(lat, lng);
          _checkReady();
        },
        (alpha) => {
          Navigation.updateHeading(alpha);
        }
      );
    });
  }

  function _bindRouteButton() {
    document.getElementById('btn-route').addEventListener('click', () => {
      const destId = document.getElementById('dest-sel').value;
      if (!destId || !turbinesCache.length) return;
      Navigation.planRoute(destId, travelMode, turbinesCache);
      if (window.innerWidth <= 640) closePanel();
    });
  }

  function _bindClearButton() {
    document.getElementById('btn-clear').addEventListener('click', () => {
      Navigation.clearRoute();
      Location.stop();
      document.getElementById('gps-ring').className   = 'gps-ring';
      document.getElementById('gps-ring').textContent = '📍';
      document.getElementById('gps-status').textContent  = '未定位';
      document.getElementById('gps-coords').textContent  = '点击下方按钮获取位置';
      document.getElementById('dest-sel').value = '';
      document.getElementById('btn-route').disabled = true;
    });
  }

  function _bindDestSelect() {
    document.getElementById('dest-sel').addEventListener('change', _checkReady);
  }

  function _checkReady() {
    const hasDest = !!document.getElementById('dest-sel').value;
    const hasGps  = document.getElementById('gps-ring').classList.contains('ok');
    document.getElementById('btn-route').disabled = !(hasDest && hasGps);
  }

  function _renderDeviceList(turbines) {
    const cfg = CONFIG.TYPE_CONFIG;
    const el  = document.getElementById('device-list');
    el.innerHTML = '';
    turbines.forEach((t) => {
      const color = (cfg[t.type] || cfg.wind).color;
      const warn  = t.status === 'warn';
      const item  = document.createElement('div');
      item.className = 'device-item';
      item.innerHTML = `
        <div class="device-dot" style="background:${color}"></div>
        <span class="device-name">${t.name}</span>
        <span class="device-status ${warn ? 'status-warn' : 'status-normal'}">${warn ? '待检修' : '正常'}</span>
      `;
      item.addEventListener('click', () => {
        document.getElementById('dest-sel').value = t.id;
        _checkReady();
        MapModule.panTo(t.lat, t.lng, 17);
        MapModule.openMarkerPopup(t.id);
        if (window.innerWidth <= 640) closePanel();
      });
      el.appendChild(item);
    });
  }

  function setMode(mode) {
    travelMode = mode;
    document.getElementById('mode-drive').classList.toggle('active', mode === 'drive');
    document.getElementById('mode-walk').classList.toggle('active', mode === 'walk');
  }

  function togglePanel() {
    const panel  = document.getElementById('panel');
    const btn    = document.getElementById('panel-toggle');
    const isOpen = panel.classList.toggle('open');
    btn.textContent = isOpen ? '✕ 关闭面板' : '☰ 导航面板';
  }

  function closePanel() {
    document.getElementById('panel').classList.remove('open');
    document.getElementById('panel-toggle').textContent = '☰ 导航面板';
  }

  return { init, setMode, togglePanel, closePanel };
})();

// 启动
UI.init();
