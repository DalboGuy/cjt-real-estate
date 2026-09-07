const { ensureSchema, expireHolds } = require('../lib/db');
const { db } = require('../lib/db');
const { loadTokenContext, acceptAgreement } = require('../lib/booking-lifecycle');
const { AGREEMENT_LABEL, AGREEMENT_NOT_VERIFIED_NOTE, paymentScheduleCopy } = require('../lib/agreement');

function publicReservation(reservation) {
  if (!reservation) return null;
  return {
    id: reservation.id,
    guestName: reservation.guest_name,
    checkin: reservation.checkin,
    checkout: reservation.checkout,
    guests: reservation.guests,
    status: reservation.status,
    holdExpiresAt: reservation.hold_expires_at || null
  };
}

function publicPayload(context, extras = {}) {
  const schedule = paymentScheduleCopy(context.quote?.paymentSchedule, context.quote?.total);
  return {
    reservation: publicReservation(context.reservation),
    quote: context.quote,
    agreement: {
      version: context.document.version,
      title: context.document.title,
      contentText: context.document.contentText,
      contentHash: context.document.contentHash,
      sections: context.document.sections
    },
    paymentSchedule: schedule,
    paymentDeferred: true,
    confirmationDeferred: true,
    agreementLabel: extras.lifecycle?.agreementLabel || 'Agreement pending',
    agreementAccepted: Boolean(extras.lifecycle?.agreementAccepted),
    acceptedName: extras.lifecycle?.acceptedName || extras.record?.acceptedName || null,
    acceptedAt: extras.lifecycle?.acceptedAt || extras.record?.acceptedAt || null,
    identityVerified: false,
    signatureVerified: false,
    acceptanceNote: AGREEMENT_NOT_VERIFIED_NOTE,
    alreadyAccepted: Boolean(extras.alreadyAccepted),
    message: extras.message || null
  };
}

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await ensureSchema();
    await expireHolds();
    const sql = db();
    const query = req.query || {};
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const token = String(query.token || body.token || '').trim();

    if (req.method === 'GET') {
      const context = await loadTokenContext(sql, token);
      if (query.download === '1' || query.download === 'true') {
        if (!context.tokenRow.used_at && context.reservation.status !== 'contract_signed') {
          return res.status(409).json({ error: 'agreement_not_accepted', message: 'The agreement can be downloaded after it is accepted.' });
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${context.reservation.id}-${context.document.version}.txt"`);
        return res.status(200).send(context.document.contentText);
      }
      const { eventsFor, lifecycleFromEvents } = require('../lib/booking-lifecycle');
      const events = await eventsFor(sql, context.reservation.id);
      const lifecycle = lifecycleFromEvents(events, context.reservation, context.quote);
      return res.status(200).json(publicPayload(context, { lifecycle, alreadyAccepted: Boolean(context.tokenRow.used_at || lifecycle.agreementAccepted) }));
    }

    if (req.method === 'POST') {
      const result = await acceptAgreement(sql, token, {
        agreed: body.agreed === true || body.agreed === 'true' || body.agreed === 'on',
        acceptedName: body.acceptedName || body.name
      });
      return res.status(result.alreadyAccepted ? 200 : 201).json({
        ...publicPayload(result, result),
        message: result.alreadyAccepted
          ? `${AGREEMENT_LABEL}. Payment and reservation confirmation remain deferred.`
          : `${AGREEMENT_LABEL}. Payment collection and automatic confirmation remain deferred.`
      });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('complete-booking error', error);
    return res.status(status).json({
      error: error.code || 'completion_unavailable',
      message: error.message || 'This completion link could not be opened.'
    });
  }
};
