'use strict';

const STATUS_LABELS = Object.freeze({
  inquiry_hold: 'Request received',
  hold_verified: 'Owner approved',
  contract_sent: 'Contract sent',
  contract_signed: 'Contract completed',
  confirmed: 'Confirmed',
  completed: 'Stay completed',
  pending: 'Request received',
  released: 'Released',
  expired: 'Expired',
  cancelled: 'Cancelled'
});

function statusLabel(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.replaceAll('_', ' ');
}

function paymentLabel(record = {}) {
  const payment = record.payment || {};
  if (payment.verified || record.deposit_received_at) return 'Payment received';
  return 'Payment pending';
}

function bookingFacts(record = {}) {
  const status = String(record.status || '');
  const approved = ['hold_verified', 'contract_sent', 'contract_signed', 'confirmed', 'completed'].includes(status);
  return [
    { id: 'request_received', label: 'Request received', done: Boolean(record.id || status) },
    { id: 'owner_approved', label: 'Owner approved', done: approved },
    { id: 'contract_sent', label: 'Contract sent', done: Boolean(record.contract_sent_at) || ['contract_sent', 'contract_signed'].includes(status) },
    { id: 'contract_completed', label: 'Contract completed', done: Boolean(record.contract_signed_at) || status === 'contract_signed' },
    { id: 'payment_received', label: 'Payment received', done: Boolean(record.payment?.verified || record.deposit_received_at) },
    { id: 'confirmed', label: 'Confirmed', done: status === 'confirmed' || status === 'completed' }
  ];
}

function statusClass(status = '') {
  const key = String(status || '');
  if (['confirmed', 'completed'].includes(key)) return 'good';
  if (['inquiry_hold', 'hold_verified', 'contract_sent', 'contract_signed', 'pending'].includes(key)) return 'warn';
  return '';
}

module.exports = {
  STATUS_LABELS,
  statusLabel,
  paymentLabel,
  bookingFacts,
  statusClass
};
