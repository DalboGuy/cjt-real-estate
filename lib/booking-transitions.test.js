const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DATE_LOCKING_STATUSES,
  planOwnerTransition,
  notUpdatedError,
  conflictBody
} = require('./booking-transitions');

describe('planOwnerTransition', () => {
  it('accepts a new request and keeps dates locked', () => {
    const plan = planOwnerTransition('inquiry_hold', 'accept_request');
    assert.equal(plan.ok, true);
    assert.equal(plan.to, 'hold_verified');
    assert.equal(plan.eventType, 'request_accepted');
    assert.equal(plan.fact, 'approval');
    assert.ok(DATE_LOCKING_STATUSES.includes(plan.to));
  });

  it('rejects illegal approval and closed-state release with invalid_transition', () => {
    const alreadyAccepted = planOwnerTransition('hold_verified', 'accept_request');
    assert.equal(alreadyAccepted.ok, false);
    assert.equal(alreadyAccepted.error.code, 'invalid_transition');
    assert.equal(alreadyAccepted.error.from, 'hold_verified');
    assert.equal(alreadyAccepted.error.action, 'accept_request');
    assert.equal(alreadyAccepted.error.to, 'hold_verified');

    const released = planOwnerTransition('released', 'release_dates');
    assert.equal(released.ok, false);
    assert.equal(released.error.code, 'invalid_transition');
    assert.equal(released.error.from, 'released');
  });

  it('does not downgrade confirmed when recording contract', () => {
    const sent = planOwnerTransition('confirmed', 'contract_sent');
    assert.equal(sent.ok, false);
    assert.equal(sent.error.code, 'invalid_transition');
    const signed = planOwnerTransition('confirmed', 'contract_signed');
    assert.equal(signed.ok, false);
    assert.equal(signed.error.code, 'invalid_transition');
  });

  it('keeps contract and payment as separate allowed facts without requiring accept first', () => {
    const contract = planOwnerTransition('inquiry_hold', 'contract_sent');
    assert.equal(contract.ok, true);
    assert.equal(contract.to, 'contract_sent');
    assert.equal(contract.fact, 'contract');
    const pay = planOwnerTransition('hold_verified', 'deposit_received');
    assert.equal(pay.ok, true);
    assert.equal(pay.to, 'confirmed');
    assert.equal(pay.fact, 'payment');
  });

  it('treats maintain_hold as lock-preserving, not approval', () => {
    const plan = planOwnerTransition('inquiry_hold', 'maintain_hold');
    assert.equal(plan.ok, true);
    assert.equal(plan.to, 'inquiry_hold');
    assert.equal(plan.fact, 'availability');
  });

  it('uses not_updated for a matched-zero apply', () => {
    const error = notUpdatedError({ from: 'inquiry_hold', to: 'hold_verified', action: 'accept_request' });
    assert.equal(error.code, 'not_updated');
    assert.deepEqual(conflictBody(error), {
      error: 'not_updated',
      message: error.message,
      from: 'inquiry_hold',
      to: 'hold_verified',
      action: 'accept_request'
    });
  });
});
