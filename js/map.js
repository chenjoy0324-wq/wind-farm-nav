// h5/js/map.js
window.MapModule = (() => {
  let map;
  let userMarker;
  let turbineMarkers = {};
  let selectedMarkerId = null;
  let routeLayer = null;
  let destMarker = null;
  let roadNetworkDrawn = false;

  function _makeDevIcon(type, status, isSelected) {
    const cfg = CONFIG.TYPE_CONFIG[type] || CONFIG.TYPE_CONFIG.wind;
    const borderColor = isSelected ? '#da3633'
      : status === 'warn' ? '#d29922'
      : cfg.color;
    const glowColor = isSelected ? 'rgba(218,54,51,0.4)'
      : status === 'warn' ? 'rgba(210,153,34,0.3)'
      : 'rgba(46,160,67,0.3)';
    return L.divIcon({
      className: '',
      html: `<div style="
        background:${cfg.bg};width:36px;height:36px;border-radius:50%;
        border:2px solid ${borderColor};
        display:flex;align-items:center;justify-content:center;font-size:16px;
        box-shadow:0 0 0 4px ${glowColor},0 2px 8px rgba(0,0,0,0.5);
      ">${cfg.emoji}</div>`,
      iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -22],
    });
  }

  function _makeUserIcon() {
    return L.divIcon({
      className: '',
      html: `<div style="
        background:rgba(218,54,51,0.2);width:38px;height:38px;border-radius:50%;
        border:2px solid #da3633;
        display:flex;align-items:center;justify-content:center;font-size:18px;
        box-shadow:0 0 0 6px rgba(218,54,51,0.15),0 2px 10px rgba(0,0,0,0.5);
        animation:userPulse 2s ease-in-out infinite;
      ">🧑</div>`,
      iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -24],
    });
  }

  function init(onTurbineClick, onTurbinesLoaded) {
    map = L.map('map', {
      rotate: true,
      touchRotate: false,
      center: CONFIG.MAP_DEFAULT_CENTER,
      zoom: CONFIG.MAP_DEFAULT_ZOOM,
    });

    L.tileLayer(CONFIG.OSM_TILE_URL, {
      attribution: CONFIG.OSM_ATTRIBUTION,
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 19,
    }).addTo(map);

    _loadTrack();
    _loadTurbines(onTurbineClick, onTurbinesLoaded);
  }

  function _loadTrack() {
    fetch('data/track.json')
      .then((r) => r.json())
      .then(({ track }) => {
        L.polyline(track, {
          color: '#4fc3f7', weight: 3, opacity: 0.7, dashArray: '6,4',
        }).addTo(map);
      })
      .catch((e) => console.warn('[Map] track.json 加载失败:', e));
  }

  function _loadTurbines(onTurbineClick, onTurbinesLoaded) {
    fetch('data/turbines.json')
      .then((r) => r.json())
      .then(({ turbines }) => {
        turbines.forEach((t) => {
          const warn = t.status === 'warn';
          const marker = L.marker([t.lat, t.lng], { icon: _makeDevIcon(t.type, t.status, false) })
            .bindPopup(`
              <div class="popup-name">${t.name}</div>
              <div class="popup-coords">${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}</div>
              <div class="popup-status ${warn ? 'status-warn' : 'status-normal'}"
                   style="${warn ? 'background:rgba(210,153,34,0.15);color:#d29922' : 'background:rgba(46,160,67,0.12);color:#3fb950'}">
                ${warn ? '⚠ 待检修' : '✓ 运行正常'}
              </div>
            `)
            .on('click', () => onTurbineClick(t))
            .addTo(map);
          turbineMarkers[t.id] = { marker, data: t };
        });
        if (onTurbinesLoaded) onTurbinesLoaded(turbines);
      })
      .catch((e) => {
        console.error('[Map] turbines.json 加载失败:', e);
        if (onTurbinesLoaded) onTurbinesLoaded([]);
      });
  }

  function selectTurbine(turbineId) {
    if (selectedMarkerId && turbineMarkers[selectedMarkerId]) {
      const prev = turbineMarkers[selectedMarkerId].data;
      turbineMarkers[selectedMarkerId].marker.setIcon(_makeDevIcon(prev.type, prev.status, false));
    }
    selectedMarkerId = turbineId;
    if (turbineMarkers[turbineId]) {
      turbineMarkers[turbineId].marker.setIcon(_makeDevIcon(
        turbineMarkers[turbineId].data.type,
        turbineMarkers[turbineId].data.status,
        true
      ));
    }
  }

  function clearSelection() {
    if (selectedMarkerId && turbineMarkers[selectedMarkerId]) {
      const prev = turbineMarkers[selectedMarkerId].data;
      turbineMarkers[selectedMarkerId].marker.setIcon(_makeDevIcon(prev.type, prev.status, false));
    }
    selectedMarkerId = null;
  }

  function updateUserPosition(lat, lng) {
    const latlng = [lat, lng];
    if (!userMarker) {
      userMarker = L.marker(latlng, { icon: _makeUserIcon() }).addTo(map);
    } else {
      userMarker.setLatLng(latlng);
    }
    map.panTo(latlng);
  }

  function setRotation(degrees) {
    map.setBearing(degrees);
  }

  function drawRoadNetwork(segments) {
    if (!segments || !segments.length || roadNetworkDrawn) return;
    roadNetworkDrawn = true;
    segments.forEach((seg) => {
      L.polyline(seg.via, {
        color: 'rgba(180,180,180,0.35)', weight: 2.5, dashArray: '4,4',
      }).addTo(map);
    });
  }

  function drawRoute(latlngs) {
    if (routeLayer) { routeLayer.remove(); routeLayer = null; }
    routeLayer = L.polyline(latlngs, {
      color: '#1abc9c', weight: 6, opacity: 0.9,
      dashArray: '12,5', lineCap: 'round', lineJoin: 'round',
    }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [40, 50] });
  }

  function clearRoute() {
    if (routeLayer)  { routeLayer.remove();  routeLayer  = null; }
    if (destMarker)  { destMarker.remove();  destMarker  = null; }
  }

  function showDestMarker(turbine) {
    if (destMarker) { destMarker.remove(); destMarker = null; }
    destMarker = L.marker([turbine.lat, turbine.lng], {
      icon: _makeDevIcon(turbine.type, turbine.status, true),
    }).addTo(map)
      .bindPopup(`<div class="popup-name">🎯 目的地：${turbine.name}</div>`)
      .openPopup();
  }

  function panTo(lat, lng, zoom) {
    map.setView([lat, lng], zoom || map.getZoom());
  }

  function openMarkerPopup(turbineId) {
    if (turbineMarkers[turbineId]) {
      turbineMarkers[turbineId].marker.openPopup();
    }
  }

  return {
    init, selectTurbine, clearSelection,
    updateUserPosition, setRotation,
    drawRoadNetwork, drawRoute, clearRoute, showDestMarker,
    panTo, openMarkerPopup,
  };
})();
