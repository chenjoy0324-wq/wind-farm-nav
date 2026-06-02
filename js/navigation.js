// h5/js/navigation.js
window.Navigation = (() => {
  let currentTarget = null;
  let currentPosition = null;
  let arrived = false;
  let travelMode = 'drive';

  // ── 路线规划 ──────────────────────────────────────────────

  function _haversine([lat1, lng1], [lat2, lng2]) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _buildGraph() {
    const graph = {};
    const segments = CONFIG.ROAD_SEGMENTS;
    segments.forEach((seg) => {
      if (!graph[seg.from]) graph[seg.from] = [];
      if (!graph[seg.to])   graph[seg.to]   = [];
      let dist = 0;
      for (let i = 1; i < seg.via.length; i++) dist += _haversine(seg.via[i - 1], seg.via[i]);
      graph[seg.from].push({ to: seg.to,   dist, via: seg.via });
      graph[seg.to].push  ({ to: seg.from, dist, via: [...seg.via].reverse() });
    });
    return graph;
  }

  function _dijkstra(graph, startId, endId) {
    const dist = {}, prev = {}, prevEdge = {};
    Object.keys(graph).forEach((id) => { dist[id] = Infinity; });
    dist[startId] = 0;
    const visited = new Set();
    const queue = [startId];

    while (queue.length) {
      queue.sort((a, b) => dist[a] - dist[b]);
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      if (cur === endId) break;
      for (const edge of (graph[cur] || [])) {
        const nd = dist[cur] + edge.dist;
        if (nd < dist[edge.to]) {
          dist[edge.to] = nd;
          prev[edge.to] = cur;
          prevEdge[edge.to] = edge.via;
          queue.push(edge.to);
        }
      }
    }

    if (!isFinite(dist[endId])) return null;

    const nodeIds = [];
    let cur = endId;
    while (cur !== startId) {
      nodeIds.unshift(cur);
      cur = prev[cur];
    }
    nodeIds.unshift(startId);

    const fullCoords = [...prevEdge[nodeIds[1]]];
    for (let i = 2; i < nodeIds.length; i++) {
      fullCoords.push(...prevEdge[nodeIds[i]].slice(1));
    }

    return { nodeIds, fullCoords, totalDist: dist[endId] };
  }

  function _nearestNode(latLng, turbines) {
    let best = null, bestDist = Infinity;
    turbines.forEach((t) => {
      const d = _haversine(latLng, [t.lat, t.lng]);
      if (d < bestDist) { bestDist = d; best = t.id; }
    });
    return { id: best, dist: bestDist };
  }

  function planRoute(destId, mode, turbines) {
    travelMode = mode || 'drive';
    if (!currentPosition || !destId) return;

    const dest = turbines.find((t) => t.id === destId);
    if (!dest) return;

    const nearest = _nearestNode([currentPosition.lat, currentPosition.lng], turbines);
    const graph   = _buildGraph();

    let result;
    if (nearest.id === destId) {
      result = {
        nodeIds: [destId],
        fullCoords: [[currentPosition.lat, currentPosition.lng], [dest.lat, dest.lng]],
        totalDist: nearest.dist,
      };
    } else {
      result = _dijkstra(graph, nearest.id, destId);
      if (result) {
        result.fullCoords = [[currentPosition.lat, currentPosition.lng], ...result.fullCoords];
        result.totalDist += nearest.dist;
      }
    }

    if (!result) {
      document.getElementById('route-result').innerHTML =
        '<div style="padding:16px;text-align:center;font-size:12px;color:#484f58">⚠ 未找到路线</div>';
      return;
    }

    const speedKmh = travelMode === 'drive' ? 20 : 4;
    const distKm   = (result.totalDist / 1000).toFixed(2);
    const durMin   = Math.round(result.totalDist / 1000 / speedKmh * 60);
    const durStr   = durMin >= 60
      ? `${Math.floor(durMin / 60)} 时 ${durMin % 60} 分`
      : `${durMin} 分钟`;

    MapModule.drawRoadNetwork(CONFIG.ROAD_SEGMENTS);
    MapModule.drawRoute(result.fullCoords);
    MapModule.showDestMarker(dest);
    MapModule.selectTurbine(destId);

    Speech.speak(`前往${dest.name}`);
    _renderRouteResult(distKm, durStr, result.nodeIds, turbines);

    currentTarget = dest;
    arrived = false;
  }

  function _renderRouteResult(distKm, durStr, nodeIds, turbines) {
    const stepsHtml = nodeIds.map((id, i) => {
      const t = turbines.find((x) => x.id === id);
      if (!t) return '';
      const cls = i === 0 ? 's' : i === nodeIds.length - 1 ? 'e' : 'm';
      const num = i === 0 ? '起' : i === nodeIds.length - 1 ? '终' : i;
      const txt = i === 0
        ? `从 ${t.name} 出发`
        : i === nodeIds.length - 1
          ? `到达目的地：${t.name}`
          : `经过 ${t.name}`;
      return `<div class="step">
        <div class="step-dot ${cls}">${num}</div>
        <div class="step-text">${txt}</div>
      </div>`;
    }).join('');

    document.getElementById('route-result').innerHTML = `
      <div class="sec">
        <div class="sec-label">路线信息 · 场区路网</div>
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-val">${distKm} <span class="stat-unit">km</span></div>
            <div class="stat-lbl">场区距离</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${durStr.split(' ')[0]} <span class="stat-unit">${durStr.split(' ').slice(1).join(' ')}</span></div>
            <div class="stat-lbl">预计用时</div>
          </div>
        </div>
      </div>
      <div class="sec">
        <div class="sec-label">导航步骤</div>
        <div class="steps-wrap">${stepsHtml}</div>
      </div>
    `;
  }

  function clearRoute() {
    MapModule.clearRoute();
    MapModule.clearSelection();
    currentTarget = null;
    arrived = false;
    document.getElementById('route-result').innerHTML = '';
  }

  // ── GPS 到达判定 ────────────────────────────────────────────

  function selectTarget(turbine) {
    currentTarget = turbine;
    arrived = false;
    MapModule.selectTurbine(turbine.id);
    Speech.speak(`前往${turbine.name}`);
  }

  function updatePosition(lat, lng) {
    currentPosition = { lat, lng };
    MapModule.updateUserPosition(lat, lng);
    _checkArrival();
  }

  function updateHeading(alpha) {
    MapModule.setRotation(alpha);
  }

  function _checkArrival() {
    if (!currentTarget || arrived || !currentPosition) return;
    const from = turf.point([currentPosition.lng, currentPosition.lat]);
    const to   = turf.point([currentTarget.lng, currentTarget.lat]);
    const distanceMeters = turf.distance(from, to, { units: 'meters' });

    if (distanceMeters <= CONFIG.ARRIVAL_THRESHOLD_METERS) {
      arrived = true;
      Speech.speak(`已到达${currentTarget.name}`);
      Bridge.postArrival(currentTarget.id, currentTarget.name);
      currentTarget = null;
      MapModule.clearSelection();
      MapModule.clearRoute();
      document.getElementById('route-result').innerHTML =
        '<div style="padding:16px;text-align:center;font-size:13px;color:#3fb950">✓ 已到达目的地</div>';
    }
  }

  return {
    planRoute, clearRoute,
    selectTarget, updatePosition, updateHeading,
  };
})();
