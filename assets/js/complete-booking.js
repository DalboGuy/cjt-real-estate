(() => {
  const params = new URLSearchParams(location.search);
  const token = params.get('token') || '';
  const status = document.getElementById('status');
  const money = (v) => Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  const esc = (v = '') => String(v).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmt = (v) => v ? new Date(v).toLocaleString() : '—';

  function show(id, on = true) {
    document.getElementById(id).hidden = !on;
  }
  function setStatus(text, kind = '') {
    status.textContent = text;
    status.className = `notice ${kind}`.trim();
    status.hidden = !text;
  }

  function render(data) {
    const reservation = data.reservation || {};
    const quote = data.quote || {};
    document.getElementById('staySummary').innerHTML = `<div class="list-row"><div><strong>${esc(reservation.guestName || 'Guest')}</strong><span class="meta">${esc(reservation.id || '')} · ${esc(reservation.checkin)} → ${esc(reservation.checkout)} · ${esc(reservation.guests)} guests</span></div><span class="badge">${esc(data.agreementAccepted ? data.agreementLabel : 'Not confirmed')}</span></div>`;
    document.getElementById('quoteRows').innerHTML = [
      ['Lodging', money(quote.lodgingSubtotal)],
      ['Cleaning', money(quote.cleaningFee)],
      ['Tax', money(quote.taxes)],
      ['Total', money(quote.total)]
    ].map(([label, value], i) => `<div class="quote-row${i === 3 ? ' total' : ''}"><span>${label}</span><strong>${value}</strong></div>`).join('');
    const schedule = data.paymentSchedule || {};
    document.getElementById('scheduleBox').innerHTML = `<strong>${esc(schedule.headline || 'Payment schedule')}</strong><div>${esc(schedule.detail || '')}</div><div>${esc(schedule.deferredNote || 'Payment collection is deferred.')}</div>`;
    document.getElementById('agreementMeta').textContent = `${data.agreement?.title || 'Rental agreement'} · version ${data.agreement?.version || ''}`;
    document.getElementById('agreementText').textContent = data.agreement?.contentText || '';
    show('summaryCard', true);
    show('agreementCard', true);
    document.getElementById('downloadLink').href = `/api/complete-booking?token=${encodeURIComponent(token)}&download=1`;

    if (data.agreementAccepted) {
      show('acceptCard', false);
      show('recordCard', true);
      document.getElementById('recordRows').innerHTML = `
        <div class="list-row"><div><strong>Status</strong></div><span class="badge good">${esc(data.agreementLabel || 'Agreement accepted')}</span></div>
        <div class="list-row"><div><strong>Reservation</strong></div><span>${esc(reservation.id)}</span></div>
        <div class="list-row"><div><strong>Typed name</strong></div><span>${esc(data.acceptedName || '')}</span></div>
        <div class="list-row"><div><strong>Accepted at</strong></div><span>${esc(fmt(data.acceptedAt))}</span></div>
        <div class="list-row"><div><strong>Agreement version</strong></div><span>${esc(data.agreement?.version || '')}</span></div>
        <p class="meta">${esc(data.acceptanceNote || '')} Payment and reservation confirmation remain deferred.</p>`;
      setStatus(data.message || 'Agreement accepted. Payment and confirmation remain deferred.', 'good');
    } else {
      show('acceptCard', true);
      show('recordCard', false);
      setStatus('This request is approved for completion, but it is not a confirmed reservation.', 'warn');
    }
  }

  async function load() {
    if (!token) {
      setStatus('This completion link is missing its secure token. Ask CJT Realty for the current Complete your booking link.', 'error');
      return;
    }
    try {
      const response = await fetch(`/api/complete-booking?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'This completion link could not be opened.');
      render(data);
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  document.getElementById('acceptForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = document.getElementById('acceptBtn');
    btn.disabled = true;
    try {
      const response = await fetch('/api/complete-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          agreed: document.getElementById('agreeBox').checked,
          acceptedName: document.getElementById('acceptedName').value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'The agreement could not be accepted.');
      render(data);
    } catch (error) {
      setStatus(error.message, 'error');
      btn.disabled = false;
    }
  });

  load();
})();
