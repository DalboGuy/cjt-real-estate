const crypto=require('crypto');
const { db, ensureSchema, expireHolds }=require('../lib/db');
const {previewPasswordFreeActive}=require('../lib/preview-access');
const {ownerAdjustedQuote,normalizeOwnerQuote}=require('../lib/pricing');
const {paymentSnapshot}=require('../lib/payments');
const {getOtaBlockedDates, listOwnerConnections, FEED_ENV_BY_SOURCE, MAX_OWNER_CALENDARS, urlHostHint}=require('../lib/availability');

function parseCookies(header=''){return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];}));}
function hash(v){return crypto.createHash('sha256').update(v).digest('hex');}
function safeEqual(a,b){const A=Buffer.from(String(a||'')),B=Buffer.from(String(b||''));return A.length===B.length&&crypto.timingSafeEqual(A,B);}

async function authenticated(req){
  if(previewPasswordFreeActive(req))return true;
  await ensureSchema();
  const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
  if(!token)return false;
  const sql=db();
  const rows=await sql`SELECT token_hash FROM owner_sessions WHERE token_hash=${hash(token)} AND expires_at>now() LIMIT 1`;
  return rows.length>0;
}

function setSessionCookie(res,token){res.setHeader('Set-Cookie',`cjt_owner_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);}
function clearSessionCookie(res){res.setHeader('Set-Cookie','cjt_owner_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');}

module.exports=async function(req,res){
  try{
    await ensureSchema();
    const sql=db();
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(req.method==='POST'&&body.action==='login'){
      if(!process.env.OWNER_PORTAL_PASSCODE)return res.status(503).json({error:'owner_login_not_configured'});
      if(!safeEqual(body.passcode,process.env.OWNER_PORTAL_PASSCODE))return res.status(401).json({error:'invalid_passcode'});
      const token=crypto.randomBytes(32).toString('hex');
      await sql`DELETE FROM owner_sessions WHERE expires_at<=now()`;
      await sql`INSERT INTO owner_sessions(token_hash,expires_at) VALUES (${hash(token)},now()+interval '12 hours')`;
      setSessionCookie(res,token);
      return res.status(200).json({ok:true});
    }
    if(!(await authenticated(req)))return res.status(401).json({error:'unauthorized'});

    if(req.method==='GET'){
      await expireHolds();
      const reservations=await sql`
        SELECT r.id,r.guest_name,r.guest_email,r.guest_phone,r.guests,r.notes,r.checkin::text,r.checkout::text,r.status,
               r.hold_expires_at,r.contract_sent_at,r.contract_signed_at,r.deposit_received_at,r.released_at,r.created_at,r.updated_at,
               q.quote
        FROM reservations r
        LEFT JOIN LATERAL (
          SELECT e.metadata->'quote' AS quote
          FROM booking_events e
          WHERE e.reservation_id=r.id AND e.metadata ? 'quote'
          ORDER BY e.created_at DESC,e.id DESC
          LIMIT 1
        ) q ON true
        ORDER BY CASE WHEN r.status IN ('released','expired','cancelled') THEN 1 ELSE 0 END, r.checkin ASC, r.created_at DESC
        LIMIT 250
      `;
      const reservationsWithPayments=await Promise.all(reservations.map(async reservation=>({...reservation,quote:normalizeOwnerQuote(reservation.quote),payment:await paymentSnapshot(sql,reservation.id)})));
      return res.status(200).json({reservations:reservationsWithPayments,temporaryPasswordFree:previewPasswordFreeActive(req)});
    }

    if(req.method==='POST'&&body.action==='logout'){
      const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
      if(token)await sql`DELETE FROM owner_sessions WHERE token_hash=${hash(token)}`;
      clearSessionCookie(res);
      return res.status(200).json({ok:true});
    }

    if(req.method==='POST'&&body.action==='update_quote'){
      const id=String(body.id||'').trim();
      if(!id)return res.status(400).json({error:'missing_id'});
      const rows=await sql`
        SELECT r.id,r.status,q.quote,EXISTS (SELECT 1 FROM booking_events pe WHERE pe.reservation_id=r.id AND pe.event_type IN ('payment_checkout_created','payment_verified')) AS payment_started
        FROM reservations r
        LEFT JOIN LATERAL (
          SELECT e.metadata->'quote' AS quote
          FROM booking_events e
          WHERE e.reservation_id=r.id AND e.metadata ? 'quote'
          ORDER BY e.created_at DESC,e.id DESC LIMIT 1
        ) q ON true
        WHERE r.id=${id} LIMIT 1
      `;
      const row=rows[0];
      if(!row)return res.status(404).json({error:'reservation_not_found'});
      if(['released','expired','cancelled'].includes(row.status))return res.status(409).json({error:'reservation_closed'});
      if(row.payment_started)return res.status(409).json({error:'payment_started',message:'The quote cannot change after a Stripe checkout has been created.'});
      let quote;
      try{quote=ownerAdjustedQuote(row.quote||{},body.lodgingSubtotal);}catch(e){return res.status(e.status||400).json({error:e.code||'invalid_quote',message:e.message});}
      await sql`INSERT INTO booking_events(reservation_id,event_type,actor,metadata) VALUES (${id},'quote_updated','owner',${JSON.stringify({quote})}::jsonb)`;
      await sql`UPDATE reservations SET updated_at=now() WHERE id=${id}`;
      return res.status(200).json({ok:true,quote});
    }

    if(req.method==='POST'&&body.action==='update'){
      const id=String(body.id||'').trim(),next=String(body.status||'').trim();
      if(!id)return res.status(400).json({error:'missing_id'});
      let eventType;
      if(next==='accept_request'){
        await sql`UPDATE reservations SET status='hold_verified',hold_expires_at=GREATEST(COALESCE(hold_expires_at,now()),now())+interval '24 hours',updated_at=now() WHERE id=${id} AND status='inquiry_hold'`;
        eventType='request_accepted';
      }else if(next==='reject_request'){
        await sql`UPDATE reservations SET status='released',released_at=now(),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired','confirmed')`;
        eventType='request_rejected';
      }else if(next==='maintain_hold'){
        await sql`UPDATE reservations SET status='hold_verified',hold_expires_at=GREATEST(COALESCE(hold_expires_at,now()),now())+interval '24 hours',updated_at=now() WHERE id=${id} AND status IN ('inquiry_hold','hold_verified')`;
        eventType='hold_maintained';
      }else if(next==='contract_sent'){
        await sql`UPDATE reservations SET status='contract_sent',contract_sent_at=COALESCE(contract_sent_at,now()),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='contract_sent';
      }else if(next==='contract_signed'){
        await sql`UPDATE reservations SET status='contract_signed',contract_signed_at=COALESCE(contract_signed_at,now()),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='contract_signed';
      }else if(next==='deposit_received'){
        const payment=await paymentSnapshot(sql,id);
        if(!payment.verified)return res.status(409).json({error:'payment_not_verified',message:'A verified Stripe payment is required before confirmation.'});
        await sql`UPDATE reservations SET status='confirmed',deposit_received_at=COALESCE(deposit_received_at,now()),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='deposit_received';
      }else if(next==='release_dates'){
        await sql`UPDATE reservations SET status='released',released_at=now(),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status<>'cancelled'`;
        eventType='dates_released';
      }else{
        return res.status(400).json({error:'invalid_status'});
      }
      await sql`INSERT INTO booking_events(reservation_id,event_type,actor) VALUES (${id},${eventType},'owner')`;
      return res.status(200).json({ok:true});
    }



    if(req.method==='POST'&&body.action==='calendar_feeds_status'){
      const connections=await listOwnerConnections();
      const feeds=connections.map(row=>({
        id:Number(row.id),
        label:row.label,
        configured:true,
        origin:'owner',
        hostHint:urlHostHint(row.feed_url),
        updatedAt:row.updated_at
      }));
      const envFeeds=[];
      for(const [name, envName] of Object.entries(FEED_ENV_BY_SOURCE)){
        const url=String(process.env[envName]||'').trim();
        if(!url) continue;
        envFeeds.push({ name, configured:true, origin:'env', hostHint:urlHostHint(url) });
      }
      let liveSources=[];
      try{
        const live=await getOtaBlockedDates();
        liveSources=live.sources||[];
      }catch(e){
        liveSources=[{name:'ota',ok:false,error:e.message,missingEnv:e.missingEnv}];
      }
      return res.status(200).json({
        feeds,
        envFeeds,
        maxOwnerCalendars:MAX_OWNER_CALENDARS,
        ownerCount:feeds.length,
        liveSources,
        checkedAt:new Date().toISOString()
      });
    }

    if(req.method==='POST'&&body.action==='calendar_feeds_save'){
      const label=String(body.label||'').trim().slice(0,80);
      const feedUrl=String(body.feedUrl||'').trim();
      if(!label) return res.status(400).json({error:'missing_label',message:'Give this calendar a short name.'});
      if(!/^https:\/\//i.test(feedUrl)) return res.status(400).json({error:'invalid_feed_url',message:'Use a full https:// iCal URL.'});
      const existing=await sql`SELECT count(*)::int AS n FROM calendar_connections`;
      if((existing[0]?.n||0)>=MAX_OWNER_CALENDARS){
        return res.status(409).json({error:'calendar_limit',message:`You can connect up to ${MAX_OWNER_CALENDARS} calendars.`});
      }
      const rows=await sql`
        INSERT INTO calendar_connections(label, feed_url, updated_at, updated_by)
        VALUES (${label}, ${feedUrl}, now(), 'owner')
        RETURNING id, label, updated_at
      `;
      return res.status(200).json({ok:true, feed:{id:Number(rows[0].id), label:rows[0].label, hostHint:urlHostHint(feedUrl), origin:'owner'}});
    }

    if(req.method==='POST'&&body.action==='calendar_feeds_clear'){
      const id=Number(body.id);
      if(!Number.isInteger(id)||id<1) return res.status(400).json({error:'invalid_id'});
      await sql`DELETE FROM calendar_connections WHERE id=${id}`;
      return res.status(200).json({ok:true, id});
    }

    return res.status(405).json({error:'method_not_allowed'});
  }catch(e){console.error('owner api error',e);return res.status(500).json({error:'owner_api_error'});}
};
