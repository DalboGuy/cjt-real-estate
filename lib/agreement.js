const crypto = require('crypto');

const AGREEMENT_VERSION = 'ssm-rental-v1';
const AGREEMENT_LABEL = 'Agreement accepted';
const AGREEMENT_NOT_VERIFIED_NOTE = 'This records guest acceptance of the rental agreement. It is not a signature or identity verification.';

const PROPERTY = {
  name: 'Sand & Sea Manor',
  address: '1720 Avenue M, Galveston, TX 77550',
  bedrooms: 5,
  bathrooms: 3,
  maxGuests: 14,
  host: 'CJT Realty',
  checkinTime: '4:00 PM',
  checkoutTime: '10:00 AM'
};

function stableStringify(value) {
  if (value == null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function money(amount) {
  const value = Number(amount || 0);
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function paymentScheduleCopy(schedule, total) {
  const payment = schedule || {};
  if (payment.mode === 'split') {
    return {
      headline: `${money(payment.dueAtBooking)} initially (50%); remaining ${money(payment.remainingBalance)} due 30 days before arrival.`,
      detail: payment.balanceDueDateLabel
        ? `Balance due date: ${payment.balanceDueDateLabel}.`
        : 'Balance is due 30 days before arrival.',
      deferredNote: 'Online payment collection is deferred. No charge is collected in this step, and this request is not a confirmed reservation.'
    };
  }
  return {
    headline: `${money(payment.dueAtBooking || total)} is due in full because arrival is within 30 days.`,
    detail: 'Full payment is required for stays that begin within 30 days of booking acceptance.',
    deferredNote: 'Online payment collection is deferred. No charge is collected in this step, and this request is not a confirmed reservation.'
  };
}

function quoteFingerprint(quote) {
  const q = quote || {};
  const schedule = q.paymentSchedule || {};
  return {
    currency: q.currency || 'USD',
    checkin: q.checkin || null,
    checkout: q.checkout || null,
    guests: q.guests == null ? null : Number(q.guests),
    lodgingSubtotal: Number(q.lodgingSubtotal || 0),
    cleaningFee: Number(q.cleaningFee || 0),
    taxes: Number(q.taxes || 0),
    total: Number(q.total || 0),
    dueAtBooking: Number(schedule.dueAtBooking || 0),
    remainingBalance: Number(schedule.remainingBalance || 0),
    mode: schedule.mode || null
  };
}

function quoteHash(quote) {
  return sha256(stableStringify(quoteFingerprint(quote)));
}

function materialQuoteChanged(previousQuote, nextQuote) {
  return quoteHash(previousQuote) !== quoteHash(nextQuote);
}

function buildAgreementDocument({ reservation = {}, quote = {} } = {}) {
  const schedule = paymentScheduleCopy(quote.paymentSchedule, quote.total);
  const stay = {
    checkin: reservation.checkin || quote.checkin || null,
    checkout: reservation.checkout || quote.checkout || null,
    guests: Number(reservation.guests || quote.guests || 0) || null,
    reservationId: reservation.id || null,
    guestName: reservation.guest_name || reservation.guestName || null
  };
  const sections = [
    {
      heading: 'Property',
      paragraphs: [
        `${PROPERTY.name} at ${PROPERTY.address} is hosted by ${PROPERTY.host}.`,
        `The home has ${PROPERTY.bedrooms} bedrooms, ${PROPERTY.bathrooms} full bathrooms, and a maximum of ${PROPERTY.maxGuests} overnight guests.`
      ]
    },
    {
      heading: 'Stay',
      paragraphs: [
        `Reservation ${stay.reservationId || 'pending'} for ${stay.guestName || 'the requesting guest'}.`,
        `Arrival ${stay.checkin || 'TBD'} at ${PROPERTY.checkinTime}. Departure ${stay.checkout || 'TBD'} at ${PROPERTY.checkoutTime}.`,
        `Overnight occupancy for this reservation: ${stay.guests || 'TBD'} guest${stay.guests === 1 ? '' : 's'} (maximum ${PROPERTY.maxGuests}).`
      ]
    },
    {
      heading: 'Quoted amount',
      paragraphs: [
        `Lodging ${money(quote.lodgingSubtotal)}, cleaning ${money(quote.cleaningFee)}, tax ${money(quote.taxes)}.`,
        `All-in total: ${money(quote.total)} ${quote.currency || 'USD'}.`
      ]
    },
    {
      heading: 'Payment schedule (deferred collection)',
      paragraphs: [schedule.headline, schedule.detail, schedule.deferredNote]
    },
    {
      heading: 'House rules',
      paragraphs: [
        `Check-in after ${PROPERTY.checkinTime}. Checkout by ${PROPERTY.checkoutTime}.`,
        'No smoking.',
        'Pets are considered case by case and must be requested before booking.',
        'Events and gatherings are considered case by case and must be requested before booking.'
      ]
    },
    {
      heading: 'Cancellation',
      paragraphs: [
        'Guest-facing cancellation summary: full refund more than 14 days before arrival, 50% refund 7–14 days before arrival, and non-refundable less than 7 days before arrival.',
        'The accepted booking agreement controls final terms.'
      ]
    },
    {
      heading: 'Acceptance',
      paragraphs: [
        'Owner approval of a request does not confirm the reservation.',
        'Reservation confirmation is deferred until owner approval, agreement acceptance, required initial payment verification, a valid hold, and no availability conflict are all complete.',
        AGREEMENT_NOT_VERIFIED_NOTE
      ]
    }
  ];

  const document = {
    version: AGREEMENT_VERSION,
    title: `${PROPERTY.name} rental agreement`,
    property: PROPERTY,
    stay,
    quote: quoteFingerprint(quote),
    paymentScheduleCopy: schedule,
    sections
  };

  const contentText = renderAgreementText(document);
  const contentHash = sha256(stableStringify({
    version: document.version,
    title: document.title,
    property: document.property,
    stay: {
      checkin: document.stay.checkin,
      checkout: document.stay.checkout,
      guests: document.stay.guests,
      reservationId: document.stay.reservationId
    },
    quote: document.quote,
    sections: document.sections
  }));

  return { ...document, contentText, contentHash };
}

function renderAgreementText(document) {
  const lines = [
    document.title,
    `Agreement version ${document.version}`,
    ''
  ];
  for (const section of document.sections || []) {
    lines.push(section.heading);
    for (const paragraph of section.paragraphs || []) lines.push(paragraph);
    lines.push('');
  }
  lines.push(AGREEMENT_NOT_VERIFIED_NOTE);
  return lines.join('\n').trim();
}

function typedNameValid(name) {
  const value = String(name || '').trim().replace(/\s+/g, ' ');
  if (value.length < 3 || value.length > 80) return false;
  if (!/^[A-Za-z][A-Za-z .'-]*[A-Za-z]$/.test(value) && !/^[A-Za-z][A-Za-z .'-]{1,78}[A-Za-z.]$/.test(value)) return false;
  return value.split(' ').filter(Boolean).length >= 2;
}

function normalizeTypedName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function validateAcceptanceInput({ agreed, acceptedName }) {
  if (agreed !== true) {
    const error = new Error('Check “I agree” to accept this rental agreement.');
    error.code = 'agreement_not_checked';
    error.status = 400;
    throw error;
  }
  const name = normalizeTypedName(acceptedName);
  if (!typedNameValid(name)) {
    const error = new Error('Type your full name to accept the rental agreement.');
    error.code = 'invalid_accepted_name';
    error.status = 400;
    throw error;
  }
  return name;
}

function createCompletionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashCompletionToken(token) {
  return sha256(String(token || '').trim().toLowerCase());
}

function bindCompletionLink(origin, token) {
  const base = String(origin || '').replace(/\/$/, '');
  return `${base}/complete-booking?token=${encodeURIComponent(token)}`;
}

function acceptanceRecord({ reservationId, document, acceptedName, acceptedAt }) {
  return {
    reservationId,
    agreementVersion: document.version,
    agreementHash: document.contentHash,
    agreementTitle: document.title,
    agreementContent: document.contentText,
    acceptedName,
    acceptedAt,
    label: AGREEMENT_LABEL,
    identityVerified: false,
    signatureVerified: false
  };
}

module.exports = {
  AGREEMENT_VERSION,
  AGREEMENT_LABEL,
  AGREEMENT_NOT_VERIFIED_NOTE,
  PROPERTY,
  sha256,
  stableStringify,
  money,
  paymentScheduleCopy,
  quoteFingerprint,
  quoteHash,
  materialQuoteChanged,
  buildAgreementDocument,
  renderAgreementText,
  typedNameValid,
  normalizeTypedName,
  validateAcceptanceInput,
  createCompletionToken,
  hashCompletionToken,
  bindCompletionLink,
  acceptanceRecord
};
