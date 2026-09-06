const { db, ensureSchema } = require('../lib/db');
const { createCheckoutSession, verifySessionId, handleWebhook, confirmReservation, paymentSnapshot } = require('../lib/payments');

function bodyOf(req) { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
function rawBodyOf(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return null;
}
function fail(res, error) { return res.status(error.status || 500).json({error:error.code || 'payment_error',message:error.message || 'Payment request failed.'}); }

module.exports = async function(req,res) {
  try {
    await ensureSchema();
    const sql=db();
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({error:'method_not_allowed'});
    if (req.method === 'POST' && req.headers['stripe-signature']) {
      const raw=rawBodyOf(req);
      if (raw === null) return res.status(400).json({error:'raw_body_required',message:'Stripe webhook bodies must be provided without JSON parsing.'});
      const result=await handleWebhook(sql,raw,req.headers['stripe-signature']);
      return res.status(200).json(result);
    }
    const body=req.method === 'GET' ? (req.query || {}) : bodyOf(req);
    const action=String(body.action || '').trim();
    if (action === 'create_checkout') {
      const result=await createCheckoutSession(req,sql,String(body.reservationId || '').trim(),body.email,body.paymentType);
      return res.status(201).json({ok:true,checkout:result});
    }
    if (action === 'verify') {
      const result=await verifySessionId(sql,String(body.sessionId || '').trim());
      return res.status(200).json({ok:true,payment:result});
    }
    if (action === 'confirm') {
      const id=String(body.reservationId || '').trim();
      const sessionId=String(body.sessionId || '').trim() || null;
      if (sessionId) await verifySessionId(sql,sessionId);
      const result=await confirmReservation(sql,id,sessionId);
      return res.status(200).json({ok:true,confirmation:result});
    }
    if (action === 'status') {
      const id=String(body.reservationId || '').trim();
      return res.status(200).json({ok:true,payment:await paymentSnapshot(sql,id)});
    }
    return res.status(400).json({error:'invalid_action'});
  } catch (error) {
    console.error('payments api error',error);
    return fail(res,error);
  }
};
