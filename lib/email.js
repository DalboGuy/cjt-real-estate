function formatStay(checkin, checkout) {
  const start = new Date(`${checkin}T12:00:00`);
  const end = new Date(`${checkout}T12:00:00`);
  const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${checkin} to ${checkout}`;
  return `${start.toLocaleDateString('en-US', opts)} → ${end.toLocaleDateString('en-US', opts)}`;
}

function formatUsd(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
}

async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.info('guest email skipped: set RESEND_API_KEY and FROM_EMAIL to enable');
    return { attempted: false, sent: false, skipped: true };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, text })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('guest email failed', r.status, body);
      return { attempted: true, sent: false };
    }
    return { attempted: true, sent: true };
  } catch (e) {
    console.error('guest email error', e);
    return { attempted: true, sent: false };
  }
}

function paymentReceivedText({ name, id, checkin, checkout, amountCents }) {
  const guest = name || 'there';
  const stay = formatStay(checkin, checkout);
  const paid = amountCents != null ? formatUsd(amountCents) : 'in full';
  return [
    `Hi ${guest},`,
    '',
    'Thank you for paying for Sand & Sea Manor at 1720 Avenue M, Galveston.',
    '',
    `Payment of ${paid} was received. Your dates are secured so no one else can book them.`,
    `Reference: ${id}`,
    `Stay: ${stay} (check-out is your departure morning)`,
    '',
    'This is not a completed booking yet. CJT will send the rental contract next. After you sign it, the reservation is confirmed.',
    '',
    'CJT Real Estate Holdings LLC',
    'cjtrealestateholdings@gmail.com'
  ].join('\n');
}

function bookingConfirmedText({ name, id, checkin, checkout }) {
  const guest = name || 'there';
  const stay = formatStay(checkin, checkout);
  return [
    `Hi ${guest},`,
    '',
    'Your booking at Sand & Sea Manor is now confirmed.',
    '',
    `Reference: ${id}`,
    `Stay: ${stay}`,
    '',
    'We look forward to hosting you in Galveston.',
    '',
    'CJT Real Estate Holdings LLC',
    'cjtrealestateholdings@gmail.com'
  ].join('\n');
}

function guestHoldText({ name, id, checkin, checkout, expiresAt }) {
  const guest = name || 'there';
  const stay = formatStay(checkin, checkout);
  const expires = expiresAt ? new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : '24 hours from now';
  return [
    `Hi ${guest},`,
    '',
    'Thank you for requesting Sand & Sea Manor at 1720 Avenue M, Galveston.',
    '',
    `Your dates are on a temporary 24-hour inquiry hold — not a confirmed reservation.`,
    `Hold reference: ${id}`,
    `Stay: ${stay} (check-out day is your departure date)`,
    `Hold expires: ${expires} CT`,
    '',
    'CJT Real Estate Holdings LLC',
    'cjtrealestateholdings@gmail.com'
  ].join('\n');
}

async function sendPaymentReceivedEmail(opts) {
  return sendEmail({
    to: opts.to,
    subject: `Payment received ${opts.id} · Sand & Sea Manor`,
    text: paymentReceivedText(opts)
  });
}

async function sendBookingConfirmedEmail(opts) {
  return sendEmail({
    to: opts.to,
    subject: `Booking confirmed ${opts.id} · Sand & Sea Manor`,
    text: bookingConfirmedText(opts)
  });
}

async function sendGuestHoldEmail(opts) {
  return sendEmail({
    to: opts.to,
    subject: `Inquiry hold ${opts.id} · Sand & Sea Manor`,
    text: guestHoldText(opts)
  });
}

module.exports = {
  sendEmail,
  sendPaymentReceivedEmail,
  sendBookingConfirmedEmail,
  sendGuestHoldEmail,
  paymentReceivedText,
  bookingConfirmedText,
  guestHoldText
};
