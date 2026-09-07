const { getOtaBlockedDates } = require('./availability');
const { eachDate, normalizeOwnerQuote } = require('./pricing');
const {
  AGREEMENT_LABEL,
  AGREEMENT_VERSION,
  buildAgreementDocument,
  quoteHash,
  materialQuoteChanged,
  createCompletionToken,
  hashCompletionToken,
  bindCompletionLink,
  acceptanceRecord
} = require('./agreement');

function lifecycleError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function siteOrigin(req) {
  const configured = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const host = String(req?.headers?.host || '').trim();
  const protocol = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  if (!host) return '';
  return `${protocol}://${host}`;
}

async function appendEvent(sql, reservationId, eventType, actor, metadata) {
  await sql`
    INSERT INTO booking_events(reservation_id,event_type,actor,metadata)
    VALUES (${reservationId},${eventType},${actor},${JSON.stringify(metadata || {})}::jsonb)
  `;
}

async function createOwnerNotification(sql, { reservationId, kind, title, body }) {
  await sql`
    INSERT INTO owner_notifications(reservation_id,kind,title,body)
    VALUES (${reservationId},${kind},${title},${body || null})
  `;
}

async function latestQuote(sql, reservationId) {
  const rows = await sql`
    SELECT e.metadata->'quote' AS quote
    FROM booking_events e
    WHERE e.reservation_id=${reservationId} AND e.metadata ? 'quote'
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  `;
  return normalizeOwnerQuote(rows[0]?.quote || null);
}

async function reservationRow(sql, reservationId) {
  const rows = await sql`
    SELECT id,guest_name,guest_email,guest_phone,guests,notes,checkin::text,checkout::text,status,
           hold_expires_at,contract_sent_at,contract_signed_at,deposit_received_at,released_at,created_at,updated_at
    FROM reservations
    WHERE id=${reservationId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function datesAvailable(sql, checkin, checkout, ignoreId) {
  let otaBlocked = new Set();
  try {
    const live = await getOtaBlockedDates();
    otaBlocked = live.dates || new Set();
  } catch (error) {
    throw lifecycleError('availability_unavailable', error.message || 'Live availability could not be verified.', 503);
  }
  const requested = eachDate(checkin, checkout);
  if (requested.some((date) => otaBlocked.has(date))) {
    throw lifecycleError('dates_unavailable', 'One or more requested dates are no longer available.', 409);
  }
  const overlap = await sql`
    SELECT id FROM reservations
    WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
      AND daterange(checkin,checkout,'[)') && daterange(${checkin}::date,${checkout}::date,'[)')
      AND id <> ${ignoreId || '__none__'}
    LIMIT 1
  `;
  if (overlap.length) {
    throw lifecycleError('dates_unavailable', 'Those dates are currently being held or are booked.', 409);
  }
}

function holdStillValid(reservation) {
  if (!reservation?.hold_expires_at) return false;
  return new Date(reservation.hold_expires_at).getTime() > Date.now();
}

async function eventsFor(sql, reservationId) {
  return sql`
    SELECT event_type,actor,metadata,created_at
    FROM booking_events
    WHERE reservation_id=${reservationId}
    ORDER BY created_at ASC, id ASC
  `;
}

function latestEventOfType(events, types) {
  const wanted = new Set(Array.isArray(types) ? types : [types]);
  return [...events].reverse().find((event) => wanted.has(event.event_type)) || null;
}

function lifecycleFromEvents(events, reservation, quote) {
  const list = events || [];
  const processing = latestEventOfType(list, 'request_processing');
  const approved = latestEventOfType(list, ['owner_approved', 'request_accepted']);
  const declined = latestEventOfType(list, ['owner_declined', 'request_rejected']);
  const agreementSent = latestEventOfType(list, 'agreement_sent');
  const accepted = latestEventOfType(list, 'agreement_accepted');
  const reaccept = latestEventOfType(list, 'agreement_reacceptance_required');
  const acceptedMeta = parseMetadata(accepted?.metadata);
  const sentMeta = parseMetadata(agreementSent?.metadata);
  const currentHash = quote ? quoteHash(quote) : null;
  const currentAgreement = reservation && quote
    ? buildAgreementDocument({ reservation, quote })
    : null;
  const acceptedCurrent = Boolean(
    accepted
    && acceptedMeta.agreementHash
    && currentAgreement
    && acceptedMeta.agreementHash === currentAgreement.contentHash
    && acceptedMeta.quoteHash === currentHash
    && (!reaccept || new Date(reaccept.created_at) < new Date(accepted.created_at))
  );

  return {
    processing: Boolean(processing && (!approved || new Date(processing.created_at) > new Date(approved.created_at))),
    ownerApproved: Boolean(approved && (!declined || new Date(approved.created_at) > new Date(declined.created_at))),
    ownerDeclined: Boolean(declined && (!approved || new Date(declined.created_at) > new Date(approved.created_at))),
    agreementSent: Boolean(agreementSent),
    agreementAccepted: acceptedCurrent,
    agreementStale: Boolean(accepted && !acceptedCurrent),
    agreementLabel: acceptedCurrent ? AGREEMENT_LABEL : (accepted ? 'Revised agreement required' : 'Agreement pending'),
    acceptedName: acceptedCurrent ? acceptedMeta.acceptedName || null : null,
    acceptedAt: acceptedCurrent ? acceptedMeta.acceptedAt || accepted.created_at : null,
    agreementVersion: acceptedCurrent ? acceptedMeta.agreementVersion : (currentAgreement?.version || AGREEMENT_VERSION),
    paymentDeferred: true,
    confirmationDeferred: true,
    identityVerified: false,
    quoteHash: currentHash,
    agreementHash: currentAgreement?.contentHash || sentMeta.agreementHash || null
  };
}

async function revokeOpenTokens(sql, reservationId) {
  await sql`
    UPDATE booking_completion_tokens
    SET revoked_at=now()
    WHERE reservation_id=${reservationId}
      AND revoked_at IS NULL
      AND used_at IS NULL
  `;
}

async function issueCompletionToken(sql, req, reservation, quote) {
  const document = buildAgreementDocument({ reservation, quote });
  await revokeOpenTokens(sql, reservation.id);
  const token = createCompletionToken();
  const tokenHash = hashCompletionToken(token);
  const expiresAt = reservation.hold_expires_at || null;
  await sql`
    INSERT INTO booking_completion_tokens(
      token_hash,reservation_id,agreement_version,agreement_hash,quote_hash,expires_at
    ) VALUES (
      ${tokenHash},${reservation.id},${document.version},${document.contentHash},${quoteHash(quote)},${expiresAt}
    )
  `;
  const origin = siteOrigin(req);
  const url = origin ? bindCompletionLink(origin, token) : `/complete-booking?token=${encodeURIComponent(token)}`;
  return { token, tokenHash, url, document, quoteHash: quoteHash(quote) };
}

async function markRequestReceived(sql, reservation, extras) {
  await appendEvent(sql, reservation.id, 'request_received', 'guest', extras);
  await createOwnerNotification(sql, {
    reservationId: reservation.id,
    kind: 'request_received',
    title: `New booking request from ${reservation.guest_name}`,
    body: `${reservation.checkin} → ${reservation.checkout} · ${reservation.guests} guests · 24-hour hold. Not confirmed.`
  });
}

async function markRequestProcessing(sql, reservationId) {
  const reservation = await reservationRow(sql, reservationId);
  if (!reservation) throw lifecycleError('reservation_not_found', 'Reservation not found.', 404);
  if (['released', 'expired', 'cancelled'].includes(reservation.status)) {
    throw lifecycleError('reservation_closed', 'This reservation is closed.', 409);
  }
  await appendEvent(sql, reservationId, 'request_processing', 'owner', {});
  await sql`UPDATE reservations SET updated_at=now() WHERE id=${reservationId}`;
  return { ok: true, status: reservation.status };
}

async function approveRequest(sql, req, reservationId) {
  const reservation = await reservationRow(sql, reservationId);
  if (!reservation) throw lifecycleError('reservation_not_found', 'Reservation not found.', 404);
  if (['released', 'expired', 'cancelled'].includes(reservation.status)) {
    throw lifecycleError('reservation_closed', 'This reservation is closed.', 409);
  }
  await datesAvailable(sql, reservation.checkin, reservation.checkout, reservation.id);
  const quote = await latestQuote(sql, reservation.id);
  if (!quote) throw lifecycleError('quote_missing', 'This request does not have a stored quote.', 409);
  const rows = await sql`
    UPDATE reservations
    SET status='hold_verified',
        hold_expires_at=GREATEST(COALESCE(hold_expires_at,now()),now())+interval '24 hours',
        contract_sent_at=COALESCE(contract_sent_at,now()),
        updated_at=now()
    WHERE id=${reservationId}
      AND status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed')
    RETURNING id,guest_name,guest_email,guests,checkin::text,checkout::text,status,hold_expires_at,contract_sent_at
  `;
  const updated = rows[0];
  if (!updated) throw lifecycleError('reservation_not_approvable', 'This request cannot be approved in its current state.', 409);
  const issued = await issueCompletionToken(sql, req, { ...reservation, ...updated }, quote);
  await appendEvent(sql, reservationId, 'owner_approved', 'owner', {
    quote,
    agreementVersion: issued.document.version,
    agreementHash: issued.document.contentHash,
    quoteHash: issued.quoteHash
  });
  await appendEvent(sql, reservationId, 'agreement_sent', 'owner', {
    agreementVersion: issued.document.version,
    agreementHash: issued.document.contentHash,
    quoteHash: issued.quoteHash
  });
  await appendEvent(sql, reservationId, 'payment_pending', 'system', {
    deferred: true,
    reason: 'stripe_on_hold',
    paymentSchedule: quote.paymentSchedule || null
  });
  await createOwnerNotification(sql, {
    reservationId,
    kind: 'owner_approved',
    title: `Approved — completion link ready for ${updated.guest_name}`,
    body: 'Owner approval does not confirm the reservation. Guest still needs to accept the agreement. Payment remains deferred.'
  });
  return {
    ok: true,
    reservation: updated,
    quote,
    completionUrl: issued.url,
    agreementVersion: issued.document.version,
    message: 'Owner approval recorded. Share the Complete your booking link. This reservation is not confirmed.'
  };
}

async function declineRequest(sql, reservationId) {
  const reservation = await reservationRow(sql, reservationId);
  if (!reservation) throw lifecycleError('reservation_not_found', 'Reservation not found.', 404);
  if (['confirmed'].includes(reservation.status)) {
    throw lifecycleError('reservation_confirmed', 'A confirmed reservation cannot be declined here.', 409);
  }
  await revokeOpenTokens(sql, reservationId);
  await sql`
    UPDATE reservations
    SET status='released',released_at=now(),hold_expires_at=NULL,updated_at=now()
    WHERE id=${reservationId} AND status NOT IN ('released','cancelled','expired')
  `;
  await appendEvent(sql, reservationId, 'owner_declined', 'owner', {});
  await appendEvent(sql, reservationId, 'dates_released', 'owner', { reason: 'owner_declined' });
  return { ok: true };
}

async function extendHold(sql, reservationId) {
  const rows = await sql`
    UPDATE reservations
    SET status=CASE WHEN status='inquiry_hold' THEN 'inquiry_hold' ELSE status END,
        hold_expires_at=GREATEST(COALESCE(hold_expires_at,now()),now())+interval '24 hours',
        updated_at=now()
    WHERE id=${reservationId} AND status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed')
    RETURNING id,status,hold_expires_at
  `;
  if (!rows[0]) throw lifecycleError('hold_not_extendable', 'The hold cannot be extended for this reservation.', 409);
  await appendEvent(sql, reservationId, 'hold_extended', 'owner', { holdExpiresAt: rows[0].hold_expires_at });
  return { ok: true, holdExpiresAt: rows[0].hold_expires_at };
}

async function releaseDates(sql, reservationId) {
  await revokeOpenTokens(sql, reservationId);
  await sql`
    UPDATE reservations
    SET status='released',released_at=now(),hold_expires_at=NULL,updated_at=now()
    WHERE id=${reservationId} AND status<>'cancelled'
  `;
  await appendEvent(sql, reservationId, 'dates_released', 'owner', {});
  return { ok: true };
}

async function recordQuoteUpdate(sql, reservationId, quote) {
  const events = await eventsFor(sql, reservationId);
  const lifecycle = lifecycleFromEvents(events, await reservationRow(sql, reservationId), quote);
  await revokeOpenTokens(sql, reservationId);
  if (lifecycle.agreementAccepted || lifecycle.agreementStale) {
    await appendEvent(sql, reservationId, 'agreement_reacceptance_required', 'owner', {
      reason: 'quote_changed',
      quoteHash: quoteHash(quote)
    });
  }
}

async function loadTokenContext(sql, rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) throw lifecycleError('missing_token', 'This completion link is missing its secure token.', 400);
  const tokenHash = hashCompletionToken(token);
  const rows = await sql`
    SELECT t.token_hash,t.reservation_id,t.agreement_version,t.agreement_hash,t.quote_hash,
           t.created_at,t.expires_at,t.revoked_at,t.used_at,
           r.id,r.guest_name,r.guest_email,r.guests,r.notes,r.checkin::text,r.checkout::text,r.status,
           r.hold_expires_at,r.contract_sent_at,r.contract_signed_at
    FROM booking_completion_tokens t
    JOIN reservations r ON r.id=t.reservation_id
    WHERE t.token_hash=${tokenHash}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw lifecycleError('invalid_token', 'This completion link is invalid or has been replaced.', 404);
  if (['released', 'expired', 'cancelled'].includes(row.status)) {
    throw lifecycleError('reservation_closed', 'This booking request is no longer available.', 409);
  }
  if (row.revoked_at) throw lifecycleError('token_revoked', 'This completion link was replaced. Ask CJT Realty for the current link.', 409);
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now() && !row.used_at) {
    throw lifecycleError('token_expired', 'This completion link has expired. Ask CJT Realty to send a new link.', 409);
  }
  const quote = await latestQuote(sql, row.reservation_id);
  if (!quote) throw lifecycleError('quote_missing', 'The stored quote is no longer available.', 409);
  const reservation = {
    id: row.id,
    guest_name: row.guest_name,
    guest_email: row.guest_email,
    guests: row.guests,
    notes: row.notes,
    checkin: row.checkin,
    checkout: row.checkout,
    status: row.status,
    hold_expires_at: row.hold_expires_at,
    contract_sent_at: row.contract_sent_at,
    contract_signed_at: row.contract_signed_at
  };
  const document = buildAgreementDocument({ reservation, quote });
  if (document.contentHash !== row.agreement_hash || quoteHash(quote) !== row.quote_hash) {
    throw lifecycleError(
      'terms_changed',
      'The price or agreement terms changed after this link was created. CJT Realty must send a revised Complete your booking link.',
      409
    );
  }
  return { tokenHash, reservation, quote, document, tokenRow: row };
}

async function acceptAgreement(sql, rawToken, { agreed, acceptedName }) {
  const context = await loadTokenContext(sql, rawToken);
  if (context.tokenRow.used_at) {
    const events = await eventsFor(sql, context.reservation.id);
    return {
      alreadyAccepted: true,
      reservation: context.reservation,
      quote: context.quote,
      document: context.document,
      lifecycle: lifecycleFromEvents(events, context.reservation, context.quote)
    };
  }
  if (!holdStillValid(context.reservation)) {
    throw lifecycleError('hold_expired', 'The temporary hold has expired. Ask CJT Realty to review the dates again.', 409);
  }
  await datesAvailable(sql, context.reservation.checkin, context.reservation.checkout, context.reservation.id);
  const { validateAcceptanceInput } = require('./agreement');
  const name = validateAcceptanceInput({ agreed, acceptedName });
  const acceptedAt = new Date().toISOString();
  const record = acceptanceRecord({
    reservationId: context.reservation.id,
    document: context.document,
    acceptedName: name,
    acceptedAt
  });
  await sql`
    UPDATE booking_completion_tokens
    SET used_at=now()
    WHERE token_hash=${context.tokenHash} AND used_at IS NULL AND revoked_at IS NULL
  `;
  await sql`
    UPDATE reservations
    SET status='contract_signed',
        contract_signed_at=COALESCE(contract_signed_at,now()),
        updated_at=now()
    WHERE id=${context.reservation.id}
      AND status NOT IN ('released','cancelled','expired','confirmed')
  `;
  await appendEvent(sql, context.reservation.id, 'agreement_accepted', 'guest', {
    ...record,
    quoteHash: quoteHash(context.quote),
    quote: context.quote
  });
  await createOwnerNotification(sql, {
    reservationId: context.reservation.id,
    kind: 'agreement_accepted',
    title: `Agreement accepted for ${context.reservation.id}`,
    body: `${AGREEMENT_LABEL} by ${name}. Payment and reservation confirmation remain deferred.`
  });
  const reservation = await reservationRow(sql, context.reservation.id);
  const events = await eventsFor(sql, context.reservation.id);
  return {
    alreadyAccepted: false,
    reservation,
    quote: context.quote,
    document: context.document,
    record,
    lifecycle: lifecycleFromEvents(events, reservation, context.quote)
  };
}

async function lifecycleSnapshots(sql, reservations) {
  const ids = reservations.map((row) => row.id);
  if (!ids.length) return reservations.map((row) => ({ ...row, events: [], lifecycle: lifecycleFromEvents([], row, row.quote) }));
  const events = await sql`
    SELECT reservation_id,event_type,actor,metadata,created_at
    FROM booking_events
    WHERE reservation_id IN ${sql(ids)}
    ORDER BY created_at ASC, id ASC
  `;
  const notifications = await sql`
    SELECT id,reservation_id,kind,title,body,read_at,created_at
    FROM owner_notifications
    WHERE read_at IS NULL
    ORDER BY created_at DESC
    LIMIT 40
  `;
  const byReservation = new Map();
  for (const event of events) {
    const list = byReservation.get(event.reservation_id) || [];
    list.push(event);
    byReservation.set(event.reservation_id, list);
  }
  return {
    reservations: reservations.map((row) => {
      const list = byReservation.get(row.id) || [];
      return {
        ...row,
        events: list,
        lifecycle: lifecycleFromEvents(list, row, row.quote)
      };
    }),
    notifications
  };
}

async function agreementRecordFor(sql, reservationId) {
  const rows = await sql`
    SELECT metadata,created_at
    FROM booking_events
    WHERE reservation_id=${reservationId} AND event_type='agreement_accepted'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
  const metadata = parseMetadata(rows[0]?.metadata);
  if (!metadata.agreementContent) return null;
  return {
    reservationId,
    agreementVersion: metadata.agreementVersion,
    acceptedName: metadata.acceptedName,
    acceptedAt: metadata.acceptedAt || rows[0].created_at,
    label: metadata.label || AGREEMENT_LABEL,
    identityVerified: false,
    content: metadata.agreementContent
  };
}

module.exports = {
  lifecycleError,
  parseMetadata,
  siteOrigin,
  appendEvent,
  createOwnerNotification,
  latestQuote,
  reservationRow,
  datesAvailable,
  holdStillValid,
  eventsFor,
  lifecycleFromEvents,
  revokeOpenTokens,
  issueCompletionToken,
  markRequestReceived,
  markRequestProcessing,
  approveRequest,
  declineRequest,
  extendHold,
  releaseDates,
  recordQuoteUpdate,
  loadTokenContext,
  acceptAgreement,
  lifecycleSnapshots,
  agreementRecordFor
};
