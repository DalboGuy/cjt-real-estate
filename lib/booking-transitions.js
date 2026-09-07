/**
 * Owner booking actions. Approval, contract, payment, and date lock are
 * separate facts. This table does not invent a confirmation sequence.
 *
 * Date lock (#67): inquiry_hold, hold_verified, contract_sent, contract_signed,
 * and confirmed keep inventory blocked. Only reject/release reopen dates.
 */

const DATE_LOCKING_STATUSES = Object.freeze([
  'inquiry_hold',
  'hold_verified',
  'contract_sent',
  'contract_signed',
  'confirmed'
]);

const CLOSED_STATUSES = Object.freeze(['released', 'expired', 'cancelled']);

const OWNER_ACTIONS = Object.freeze({
  accept_request: {
    from: Object.freeze(['inquiry_hold']),
    to: 'hold_verified',
    eventType: 'request_accepted',
    fact: 'approval'
  },
  reject_request: {
    from: Object.freeze(['inquiry_hold', 'hold_verified', 'contract_sent', 'contract_signed']),
    to: 'released',
    eventType: 'request_rejected',
    fact: 'availability'
  },
  maintain_hold: {
    from: Object.freeze(['inquiry_hold', 'hold_verified']),
    to: null,
    eventType: 'hold_maintained',
    fact: 'availability'
  },
  contract_sent: {
    from: Object.freeze(['inquiry_hold', 'hold_verified', 'contract_sent']),
    to: 'contract_sent',
    eventType: 'contract_sent',
    fact: 'contract'
  },
  contract_signed: {
    from: Object.freeze(['inquiry_hold', 'hold_verified', 'contract_sent', 'contract_signed']),
    to: 'contract_signed',
    eventType: 'contract_signed',
    fact: 'contract'
  },
  deposit_received: {
    from: Object.freeze(['inquiry_hold', 'hold_verified', 'contract_sent', 'contract_signed', 'confirmed']),
    to: 'confirmed',
    eventType: 'deposit_received',
    fact: 'payment'
  },
  release_dates: {
    from: Object.freeze(['inquiry_hold', 'hold_verified', 'contract_sent', 'contract_signed', 'confirmed']),
    to: 'released',
    eventType: 'dates_released',
    fact: 'availability'
  }
});

function transitionError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  Object.assign(error, extra);
  return error;
}

function planOwnerTransition(currentStatus, action) {
  const from = String(currentStatus || '');
  const name = String(action || '').trim();
  const spec = OWNER_ACTIONS[name];
  if (!spec) {
    return {
      ok: false,
      error: transitionError(
        'invalid_transition',
        'That owner action is not a recognized booking transition.',
        { from, to: null, action: name || null }
      )
    };
  }
  if (!spec.from.includes(from)) {
    return {
      ok: false,
      error: transitionError(
        'invalid_transition',
        `Cannot apply ${name} while the reservation is ${from || 'unknown'}.`,
        { from: from || null, to: spec.to, action: name }
      )
    };
  }
  return {
    ok: true,
    action: name,
    from,
    to: spec.to === null ? from : spec.to,
    eventType: spec.eventType,
    fact: spec.fact,
    allowedFrom: spec.from
  };
}

function notUpdatedError({ from = null, to = null, action = null } = {}) {
  return transitionError(
    'not_updated',
    'The reservation changed or this action is no longer available. Refresh and try again.',
    { from, to, action }
  );
}

function conflictBody(error) {
  return {
    error: error.code,
    message: error.message,
    from: error.from ?? null,
    to: error.to ?? null,
    action: error.action ?? null
  };
}

module.exports = {
  DATE_LOCKING_STATUSES,
  CLOSED_STATUSES,
  OWNER_ACTIONS,
  planOwnerTransition,
  notUpdatedError,
  conflictBody
};
