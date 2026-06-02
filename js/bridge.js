// h5/js/bridge.js
window.Bridge = (() => {
  function isInMiniProgram() {
    return typeof wx !== 'undefined' && wx.miniProgram;
  }

  function postArrival(turbineId, turbineName) {
    if (!isInMiniProgram()) {
      console.log('[Bridge] 非小程序环境，跳过 postMessage:', { turbineId, turbineName });
      return;
    }
    wx.miniProgram.postMessage({
      data: {
        turbineId,
        turbineName,
        arrivedAt: new Date().toISOString(),
      },
    });
  }

  return { postArrival };
})();
