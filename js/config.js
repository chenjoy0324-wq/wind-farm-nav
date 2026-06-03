// WGS84 → GCJ-02 坐标转换（高德/腾讯地图使用 GCJ-02）
window.wgs84ToGcj02 = function(lat, lng) {
  const a = 6378245.0, ee = 0.00669342162296594323;
  function outOfChina(lat, lng) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }
  function transformLat(x, y) {
    let ret = -100.0 + 2.0*x + 3.0*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
    ret += (20.0*Math.sin(6.0*x*Math.PI) + 20.0*Math.sin(2.0*x*Math.PI)) * 2.0/3.0;
    ret += (20.0*Math.sin(y*Math.PI) + 40.0*Math.sin(y/3.0*Math.PI)) * 2.0/3.0;
    ret += (160.0*Math.sin(y/12.0*Math.PI) + 320*Math.sin(y*Math.PI/30.0)) * 2.0/3.0;
    return ret;
  }
  function transformLng(x, y) {
    let ret = 300.0 + x + 2.0*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
    ret += (20.0*Math.sin(6.0*x*Math.PI) + 20.0*Math.sin(2.0*x*Math.PI)) * 2.0/3.0;
    ret += (20.0*Math.sin(x*Math.PI) + 40.0*Math.sin(x/3.0*Math.PI)) * 2.0/3.0;
    ret += (150.0*Math.sin(x/12.0*Math.PI) + 300.0*Math.sin(x/30.0*Math.PI)) * 2.0/3.0;
    return ret;
  }
  if (outOfChina(lat, lng)) return [lat, lng];
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  const magic = Math.sin(radLat);
  const sqrtMagic = Math.sqrt(1 - ee * magic * magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (sqrtMagic * sqrtMagic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return [lat + dLat, lng + dLng];
};

window.CONFIG = {
  ARRIVAL_THRESHOLD_METERS: 50,
  MAP_DEFAULT_CENTER: wgs84ToGcj02(28.1145, 113.0205),
  MAP_DEFAULT_ZOOM: 16,
  OSM_TILE_URL: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
  OSM_ATTRIBUTION: '© 高德地图',
  TYPE_CONFIG: {
    wind:  { color: '#2ea043', bg: 'rgba(46,160,67,0.15)',   emoji: '💨' },
    subst: { color: '#1f6feb', bg: 'rgba(31,111,235,0.15)', emoji: '⚡' },
    met:   { color: '#d29922', bg: 'rgba(210,153,34,0.15)', emoji: '📡' },
    base:  { color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', emoji: '🏠' },
  },
  ROAD_SEGMENTS: [
    { from: 'base', to: 'wt06', via: [
      [28.115088, 113.019159], [28.115246, 113.019246]
    ]},
    { from: 'base', to: 'sub', via: [
      [28.115088, 113.019159],
      [28.114917, 113.019133],
      [28.114663, 113.019238],
      [28.114523, 113.019315]
    ]},
    { from: 'sub', to: 'met', via: [
      [28.114523, 113.019315], [28.114375, 113.019326]
    ]},
    { from: 'sub', to: 'wt01', via: [
      [28.114523, 113.019315],
      [28.114375, 113.019326],
      [28.114052, 113.019586],
      [28.113953, 113.019668],
      [28.113933, 113.019993]
    ]},
    { from: 'wt01', to: 'wt02', via: [
      [28.113933, 113.019993],
      [28.113926, 113.020168],
      [28.113921, 113.020327],
      [28.113932, 113.020502]
    ]},
    { from: 'wt02', to: 'wt03', via: [
      [28.113932, 113.020502],
      [28.113932, 113.020669],
      [28.113930, 113.020856],
      [28.113952, 113.021013]
    ]},
    { from: 'wt03', to: 'wt04', via: [
      [28.113952, 113.021013],
      [28.113959, 113.021183],
      [28.113959, 113.021363],
      [28.113953, 113.021528]
    ]},
    { from: 'wt04', to: 'wt05', via: [
      [28.113953, 113.021528],
      [28.113957, 113.021697],
      [28.113971, 113.021867]
    ]},
  ],
};
