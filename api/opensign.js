const { db, ensureSchema } = require('../lib/db');
const {
  rawBodyOf,
  verifyWebhookSignature,
  parseWebhookPayload,
  isVerifiedCompletion,
  documentIdFromEvent,
  eventName,
  sendConfig,
  fetchDocument,
  documentLooksCompleted,
  opensignError
} = require('../lib/opensign');

function fail(res, error) {
  return res.status(error.status || 500).json({
    error: error.code || 'opensign_webhook_error',
    message: error.message || 'OpenSign webhook failed.'
  });
}

async function applyVerifiedCompletion(sql, payload) {
  const documentId = documentIdFromEvent(payload);
  if (!documentId) {
    throw opensignError('opensign_document_id_missing', 'The OpenSign webhook did not include a document id.', 400);
  }

  const sent = await sql`
    SELECT reservation_id, metadata
    FROM booking_events
    WHERE event_type='contract_sent'
      AND metadata->>'opensignDocumentId'=${documentId}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
  if (!sent.length) {
    throw opensignError(
      'opensign_document_not_linked',
      'This OpenSign document is not linked to a stored contract_sent event.',
      409
    );
  }
  const reservationId = sent[0].reservation_id;

  const closed = await sql`
    SELECT id, status FROM reservations
    WHERE id=${reservationId} AND status IN ('released','cancelled','expired')
    LIMIT 1
  `;
  if (closed.length) {
    throw opensignError('reservation_closed', 'This reservation is no longer open for signature completion.', 409);
  }

  const already = await sql`
    SELECT id FROM booking_events
    WHERE reservation_id=${reservationId}
      AND event_type='contract_signed'
      AND metadata->>'opensignDocumentId'=${documentId}
    LIMIT 1
  `;

  const changed = await sql`
    UPDATE reservations
    SET status='contract_signed',
        contract_signed_at=COALESCE(contract_signed_at,now()),
        hold_expires_at=NULL,
        updated_at=now()
    WHERE id=${reservationId}
      AND status NOT IN ('released','cancelled','expired')
    RETURNING id, status, contract_signed_at
  `;
  if (!changed.length) {
    throw opensignError('status_transition_not_applied', 'The reservation could not be marked contract_signed.', 409);
  }

  if (!already.length) {
    await sql`
      INSERT INTO booking_events(reservation_id,event_type,actor,metadata)
      VALUES (
        ${reservationId},
        'contract_signed',
        'opensign',
        ${JSON.stringify({
          source: 'opensign_webhook',
          opensignDocumentId: documentId,
          opensignEvent: eventName(payload),
          completedAt: payload.completedAt || null,
          certificate: Boolean(payload.certificate)
        })}::jsonb
      )
    `;
  }

  return { handled: true, verified: true, reservationId, documentId, reservation: changed[0] };
}

module.exports = async function(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    await ensureSchema();
    const sql = db();
    const raw = rawBodyOf(req);
    if (raw === null) {
      return res.status(400).json({
        error: 'raw_body_required',
        message: 'OpenSign webhook bodies must be provided as raw JSON for signature verification.'
      });
    }
    verifyWebhookSignature(raw, req.headers['x-webhook-signature']);
    const payload = parseWebhookPayload(raw);
    if (!isVerifiedCompletion(payload)) {
      return res.status(200).json({ handled: false, event: eventName(payload) || null });
    }

    const config = sendConfig();
    if (config.apiToken) {
      try {
        const document = await fetchDocument(documentIdFromEvent(payload), { config });
        if (!documentLooksCompleted(document) && !isVerifiedCompletion(document)) {
          // Webhook HMAC already proved completion. OpenSign document GET shapes vary;
          // only fail closed when the document explicitly reports a non-complete status.
          const status = String(document?.status || document?.result?.status || '').toLowerCase();
          if (status && !['completed', 'complete', 'signed'].includes(status)) {
            throw opensignError('opensign_not_completed', 'OpenSign has not marked this document completed.', 409);
          }
        }
      } catch (error) {
        if (error.code === 'opensign_not_completed') throw error;
        console.error('opensign document re-fetch skipped', error.code || error.message);
      }
    }

    const result = await applyVerifiedCompletion(sql, payload);
    return res.status(200).json(result);
  } catch (error) {
    console.error('opensign webhook error', error);
    return fail(res, error);
  }
};

module.exports.applyVerifiedCompletion = applyVerifiedCompletion;
