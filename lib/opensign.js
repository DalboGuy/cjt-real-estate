const crypto = require('crypto');

const DEFAULT_API_BASE_URL = 'https://sandbox.opensignlabs.com/api/v1.2';
const DEFAULT_SIGNER_ROLE = 'Guest';
const COMPLETION_EVENTS = new Set(['completed', 'document_completed', 'document completed']);

function opensignError(code, message, status=400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function trimEnv(name) {
  return String(process.env[name] || '').trim();
}

function sendConfig() {
  return {
    apiToken: trimEnv('OPENSIGN_API_TOKEN'),
    apiBaseUrl: trimEnv('OPENSIGN_API_BASE_URL') || DEFAULT_API_BASE_URL,
    templateId: trimEnv('OPENSIGN_TEMPLATE_ID'),
    signerRole: trimEnv('OPENSIGN_SIGNER_ROLE') || DEFAULT_SIGNER_ROLE,
    senderName: trimEnv('OPENSIGN_SENDER_NAME') || 'CJT Realty'
  };
}

function webhookConfig() {
  return { secret: trimEnv('OPENSIGN_WEBHOOK_SECRET') };
}

function assertSendConfigured(config=sendConfig()) {
  if (!config.apiToken) {
    throw opensignError(
      'opensign_not_configured',
      'OpenSign is not configured. Set OPENSIGN_API_TOKEN (x-api-token) before sending a booking agreement.',
      503
    );
  }
  if (!config.templateId) {
    throw opensignError(
      'opensign_template_missing',
      'OpenSign is not configured. Set OPENSIGN_TEMPLATE_ID to the booking-agreement template before sending.',
      503
    );
  }
  return config;
}

function assertWebhookConfigured(config=webhookConfig()) {
  if (!config.secret) {
    throw opensignError(
      'opensign_webhook_not_configured',
      'OpenSign webhook verification is not configured. Set OPENSIGN_WEBHOOK_SECRET.',
      503
    );
  }
  return config;
}

function moneyText(value) {
  if (value == null || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toFixed(2);
}

function quoteFields(quote) {
  const q = quote && typeof quote === 'object' ? quote : {};
  const schedule = q.paymentSchedule && typeof q.paymentSchedule === 'object' ? q.paymentSchedule : {};
  return {
    lodgingSubtotal: moneyText(q.lodgingSubtotal),
    cleaningFee: moneyText(q.cleaningFee),
    taxes: moneyText(q.taxes),
    total: moneyText(q.total),
    nights: q.nights != null ? String(q.nights) : '',
    currency: String(q.currency || 'USD'),
    dueAtBooking: moneyText(schedule.dueAtBooking),
    remainingBalance: moneyText(schedule.remainingBalance),
    balanceDueDate: String(schedule.balanceDueDate || schedule.balanceDueDateLabel || ''),
    quoteVersion: String(q.quoteVersion || '')
  };
}

function widget(name, value, readonly=true) {
  if (value == null || value === '') return null;
  return { name, readonly, default: String(value) };
}

function prefill(name, value) {
  if (value == null || value === '') return null;
  return { name, response: String(value) };
}

function buildPrefillWidgets(fields) {
  const quoted = quoteFields(fields.quote);
  const values = [
    ['name', fields.guestName],
    ['guest_name', fields.guestName],
    ['email', fields.guestEmail],
    ['guest_email', fields.guestEmail],
    ['phone', fields.guestPhone],
    ['guest_phone', fields.guestPhone],
    ['checkin', fields.checkin],
    ['check_in', fields.checkin],
    ['checkout', fields.checkout],
    ['check_out', fields.checkout],
    ['guests', fields.guests],
    ['reservation_id', fields.reservationId],
    ['quote_total', quoted.total],
    ['total', quoted.total],
    ['lodging_subtotal', quoted.lodgingSubtotal],
    ['cleaning_fee', quoted.cleaningFee],
    ['taxes', quoted.taxes],
    ['nights', quoted.nights],
    ['due_at_booking', quoted.dueAtBooking]
  ];
  return {
    widgets: values.map(([name, value]) => widget(name, value)).filter(Boolean),
    prefill: values.map(([name, value]) => prefill(name, value)).filter(Boolean)
  };
}

function buildCreateDocumentBody(fields, config=sendConfig()) {
  const quoted = quoteFields(fields.quote);
  const { widgets } = buildPrefillWidgets(fields);
  const title = `Sand & Sea Manor booking agreement — ${fields.reservationId}`;
  const note = [
    `Reservation ${fields.reservationId}`,
    `${fields.checkin} → ${fields.checkout}`,
    `${fields.guests} guests`,
    quoted.total ? `Quoted total ${quoted.currency} ${quoted.total}` : 'Quoted total not stored'
  ].join(' · ');
  const signer = {
    role: config.signerRole,
    email: fields.guestEmail,
    name: fields.guestName,
    widgets
  };
  if (fields.guestPhone) signer.phone = String(fields.guestPhone);
  return {
    title,
    note,
    description: 'CJT Realty direct-booking agreement. Signature completion is recorded separately from payment and confirmation.',
    signers: [signer],
    send_email: true,
    sendInOrder: false,
    timeToCompleteDays: 14,
    sender_name: config.senderName,
    folderId: ''
  };
}

function extractDocumentRef(apiResponse) {
  const data = apiResponse && typeof apiResponse === 'object' ? apiResponse : {};
  const nested = data.result && typeof data.result === 'object' ? data.result : {};
  const firstSigner = Array.isArray(data.signers) ? data.signers[0] : (Array.isArray(nested.signers) ? nested.signers[0] : null);
  const documentId = String(
    data.objectId || data.object_id || data.documentId || data.document_id ||
    nested.objectId || nested.object_id || nested.documentId || nested.id || data.id ||
    ''
  ).trim();
  const signingUrl = String(
    data.signurl || data.signUrl || data.signingUrl || data.url ||
    nested.signurl || nested.signUrl || firstSigner?.url || firstSigner?.signurl ||
    ''
  ).trim();
  return { documentId, signingUrl: signingUrl || null, raw: data };
}

function eventName(payload) {
  return String(payload?.event || payload?.event_type || payload?.status || '').trim().toLowerCase();
}

function documentIdFromEvent(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  return String(
    data.objectId || data.object_id || data.documentId || data.document_id ||
    data.data?.objectId || data.data?.documentId ||
    ''
  ).trim();
}

function isVerifiedCompletion(payload) {
  const event = eventName(payload);
  if (!COMPLETION_EVENTS.has(event)) return false;
  return Boolean(documentIdFromEvent(payload));
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function hmacHex(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function signaturesMatch(expected, received) {
  const a = Buffer.from(String(expected || ''));
  const b = Buffer.from(String(received || '').replace(/^sha256=/i, ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function rawBodyOf(req) {
  if (Buffer.isBuffer(req?.body)) return req.body.toString('utf8');
  if (typeof req?.body === 'string') return req.body;
  if (typeof req?.rawBody === 'string') return req.rawBody;
  if (req?.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return null;
}

function verifyWebhookSignature(rawBody, signature, secret=webhookConfig().secret) {
  assertWebhookConfigured({ secret });
  const received = String(signature || '').trim();
  if (!received) throw opensignError('invalid_webhook_signature', 'Missing OpenSign webhook signature.', 400);
  const body = rawBody == null ? '' : String(rawBody);
  const expectedRaw = hmacHex(secret, body);
  if (signaturesMatch(expectedRaw, received)) return true;
  // Official sample signs JSON.stringify(parsed object). Accept that encoding too.
  try {
    const parsed = JSON.parse(body);
    const expectedParsed = hmacHex(secret, JSON.stringify(parsed));
    if (signaturesMatch(expectedParsed, received)) return true;
  } catch (_) { /* raw body was not JSON */ }
  throw opensignError('invalid_webhook_signature', 'Invalid OpenSign webhook signature.', 400);
}

function parseWebhookPayload(rawBody) {
  try {
    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    if (!payload || typeof payload !== 'object') throw new Error('not object');
    return payload;
  } catch (_) {
    throw opensignError('invalid_webhook_body', 'Invalid OpenSign webhook body.', 400);
  }
}

async function opensignRequest(path, options={}, config=sendConfig(), fetchImpl=fetch) {
  assertSendConfigured(config);
  const base = String(config.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const response = await fetchImpl(`${base}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'x-api-token': config.apiToken,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('opensign request failed', response.status, data?.error || data?.message || 'unknown');
    throw opensignError(
      'opensign_request_failed',
      'OpenSign could not create or send the booking agreement. The contract was not marked sent.',
      502
    );
  }
  return data;
}

function assertSendableFields(fields) {
  const guestEmail = String(fields?.guestEmail || '').trim();
  const guestName = String(fields?.guestName || '').trim();
  const reservationId = String(fields?.reservationId || '').trim();
  if (!reservationId) throw opensignError('missing_reservation', 'A reservation is required to send a booking agreement.', 400);
  if (!guestName) throw opensignError('missing_guest_name', 'The reservation is missing a guest name.', 409);
  if (!guestEmail.includes('@')) throw opensignError('missing_guest_email', 'The reservation is missing a guest email for OpenSign.', 409);
  return { ...fields, guestEmail, guestName, reservationId };
}

async function createAndSendDocument(fields, options={}) {
  const config = assertSendConfigured(options.config || sendConfig());
  const payload = assertSendableFields(fields);
  const body = buildCreateDocumentBody(payload, config);
  const data = await opensignRequest(
    `/createdocument/${encodeURIComponent(config.templateId)}`,
    { method: 'POST', body },
    config,
    options.fetchImpl || fetch
  );
  const ref = extractDocumentRef(data);
  if (!ref.documentId) {
    throw opensignError(
      'opensign_document_id_missing',
      'OpenSign accepted the request but did not return a document id. The contract was not marked sent.',
      502
    );
  }
  return {
    documentId: ref.documentId,
    signingUrl: ref.signingUrl,
    templateId: config.templateId,
    signerRole: config.signerRole,
    apiBaseUrl: config.apiBaseUrl,
    title: body.title,
    quoteTotal: quoteFields(payload.quote).total || null,
    quoteVersion: quoteFields(payload.quote).quoteVersion || null
  };
}

async function fetchDocument(documentId, options={}) {
  const config = assertSendConfigured(options.config || sendConfig());
  const id = String(documentId || '').trim();
  if (!id) throw opensignError('missing_document_id', 'An OpenSign document id is required.', 400);
  return opensignRequest(`/document/${encodeURIComponent(id)}`, { method: 'GET' }, config, options.fetchImpl || fetch);
}

function documentLooksCompleted(document) {
  const data = document && typeof document === 'object' ? document : {};
  const nested = data.result && typeof data.result === 'object' ? data.result : data;
  const status = String(nested.status || nested.Status || nested.documentStatus || '').toLowerCase();
  if (['completed', 'complete', 'signed'].includes(status)) return true;
  if (nested.IsCompleted === true || nested.isCompleted === true || nested.completed === true) return true;
  return false;
}

module.exports = {
  DEFAULT_API_BASE_URL,
  DEFAULT_SIGNER_ROLE,
  opensignError,
  sendConfig,
  webhookConfig,
  assertSendConfigured,
  assertWebhookConfigured,
  quoteFields,
  buildPrefillWidgets,
  buildCreateDocumentBody,
  extractDocumentRef,
  eventName,
  documentIdFromEvent,
  isVerifiedCompletion,
  parseMetadata,
  rawBodyOf,
  verifyWebhookSignature,
  parseWebhookPayload,
  opensignRequest,
  createAndSendDocument,
  fetchDocument,
  documentLooksCompleted
};
