'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { statusLabel, paymentLabel, statusClass } = require('./owner-status');

test('booking facts stay separate and are not collapsed into confirmed', () => {
  assert.equal(statusLabel('inquiry_hold'), 'Request received');
  assert.equal(statusLabel('hold_verified'), 'Owner approved');
  assert.equal(statusLabel('contract_sent'), 'Contract sent');
  assert.equal(statusLabel('contract_signed'), 'Contract completed');
  assert.equal(statusLabel('confirmed'), 'Confirmed');
  assert.notEqual(statusLabel('contract_signed'), statusLabel('confirmed'));
  assert.notEqual(statusLabel('hold_verified'), statusLabel('confirmed'));
});

test('payment received is independent of booking status', () => {
  assert.equal(paymentLabel({ status: 'confirmed' }), 'Payment pending');
  assert.equal(paymentLabel({ status: 'inquiry_hold', payment: { verified: true } }), 'Payment received');
  assert.equal(paymentLabel({ deposit_received_at: '2026-09-01' }), 'Payment received');
  assert.equal(statusClass('inquiry_hold'), 'warn');
  assert.equal(statusClass('confirmed'), 'good');
});
