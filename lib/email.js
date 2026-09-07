function formatStay(checkin, checkout) {
  const start = new Date(`${checkin}T12:00:00`);
  const end = new Date(`${checkout}T12:00:00`);
  const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${checkin} to ${checkout}`;
  return `${start.toLocaleDateString('en-US', opts)} → ${end.toLocaleDateString('en-US', opts)}`;
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
    'No payment was collected on the website. CJT will review your request and follow up with the direct rate, rental agreement, and next steps. Your stay is confirmed only after you sign the agreement and pay the deposit with CJT.',
    '',
    'If these dates no longer work, reply to this email and we can release the hold.',
    '',
    'CJT Real Estate Holdings LLC',
    'cjtrealestateholdings@gmail.com'
  ].join('\n');
}

async function sendGuestHoldEmail({ to, name, id, checkin, checkout, expiresAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.info('guest confirmation email skipped: set RESEND_API_KEY and FROM_EMAIL to enable');
    return { attempted: false, sent: false, skipped: true };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Inquiry hold ${id} · Sand & Sea Manor`,
        text: guestHoldText({ name, id, checkin, checkout, expiresAt })
      })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('guest confirmation email failed', r.status, body);
      return { attempted: true, sent: false };
    }
    return { attempted: true, sent: true };
  } catch (e) {
    console.error('guest confirmation email error', e);
    return { attempted: true, sent: false };
  }
}

module.exports = { sendGuestHoldEmail, guestHoldText };
