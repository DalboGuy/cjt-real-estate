'use strict';

function money(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v || 0));
}

function esc(v) {
  return String(v || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function percentLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${Math.round(n * 100)}%`;
}

function thresholdLabel(days) {
  const n = Number(days);
  if (!Number.isInteger(n) || n < 0) return '30 days';
  return `${n} day${n === 1 ? '' : 's'}`;
}

function guestPaymentTrust(quote) {
  const q = quote || {};
  const p = q.paymentSchedule || {};
  const pct = percentLabel(p.depositPct);
  const threshold = thresholdLabel(p.splitPaymentThresholdDays);
  const dueNow = p.dueAtBooking != null ? p.dueAtBooking : q.total;
  const holdNote = "You won't be charged until CJT accepts this request. Book Now places a 24-hour hold.";
  const agreementHref = '/booking-agreement';
  const agreementLabel = 'Booking agreement';

  if (p.mode === 'split') {
    return {
      mode: 'split',
      depositLabel: `${pct || 'Deposit'} deposit due when accepted`,
      depositAmount: dueNow,
      remainingLabel: `Remaining balance due ${p.balanceDueDateLabel || `${threshold} before arrival`}`,
      remainingAmount: p.remainingBalance,
      showRemaining: true,
      holdNote,
      mobileNote: `${pct || 'Deposit'} deposit · no charge until accepted`,
      agreementHref,
      agreementLabel
    };
  }

  const nearArrival = p.reason === 'within_30_days' || p.reason === 'within_threshold_days';
  return {
    mode: 'full',
    depositLabel: nearArrival ? 'Full balance due when accepted' : 'Due when accepted',
    depositAmount: dueNow,
    remainingLabel: nearArrival ? `Stay begins within ${threshold}, so the remaining balance is included now.` : '',
    remainingAmount: 0,
    showRemaining: false,
    holdNote: nearArrival
      ? `This stay begins within ${threshold}, so the full balance is due when CJT accepts. You won't be charged until then. Book Now places a 24-hour hold.`
      : holdNote,
    mobileNote: nearArrival ? 'Full balance due when accepted' : 'Due when accepted · no charge yet',
    agreementHref,
    agreementLabel
  };
}

function guestPaymentTrustMarkup(quote, formatMoney) {
  const fmt = typeof formatMoney === 'function' ? formatMoney : money;
  const t = guestPaymentTrust(quote);
  const remaining = t.showRemaining
    ? `<div class="quote-row quote-trust-row"><span>${esc(t.remainingLabel)}</span><strong>${esc(fmt(t.remainingAmount))}</strong></div>`
    : (t.remainingLabel ? `<p class="quote-trust-detail">${esc(t.remainingLabel)}</p>` : '');
  return `<div class="quote-trust-schedule"><div class="quote-row quote-trust-row deposit"><span>${esc(t.depositLabel)}</span><strong>${esc(fmt(t.depositAmount))}</strong></div>${remaining}<p class="quote-hold-note">${esc(t.holdNote)}</p><a class="agreement-link" href="${esc(t.agreementHref)}">${esc(t.agreementLabel)}</a></div>`;
}

const api = { guestPaymentTrust, guestPaymentTrustMarkup, money, esc };

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.CJTQuoteTrust = api;
}
