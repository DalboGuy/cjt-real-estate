(() => {
  const frame = document.getElementById('houfyPricing');
  if (!frame) return;
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== 'cjt-pricing-height' || !Number.isFinite(data.height)) return;
    frame.style.height = Math.max(400, Math.min(20000, data.height + 24)) + 'px';
  });
})();
