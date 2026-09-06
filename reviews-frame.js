(() => {
  const frame = document.getElementById('houfyReviews');
  if (!frame) return;
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== 'cjt-reviews-height' || !Number.isFinite(data.height)) return;
    frame.style.height = Math.max(260, Math.min(20000, data.height + 24)) + 'px';
  });
})();
