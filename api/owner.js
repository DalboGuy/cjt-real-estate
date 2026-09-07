const crypto=require('crypto');
const { db, ensureSchema, expireHolds }=require('../lib/db');
const {previewPasswordFreeActive}=require('../lib/preview-access');
const {ownerAdjustedQuote,normalizeOwnerQuote}=require('../lib/pricing');
const {paymentSnapshot}=require('../lib/payments');
const {getOtaBlockedDates, listOwnerConnections, FEED_ENV_BY_SOURCE, MAX_OWNER_CALENDARS, urlHostHint}=require('../lib/availability');
const {
  approveRequest,
  declineRequest,
  extendHold,
  releaseDates,
  markRequestProcessing,
  recordQuoteUpdate,
  lifecycleSnapshots,
  agreementRecordFor,
  issueCompletionToken,
  latestQuote,
  reservationRow
}=require('../lib/booking-lifecycle');

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
      const snapshot=await lifecycleSnapshots(sql,reservationsWithPayments);
      return res.status(200).json({
        reservations:snapshot.reservations,
        notifications:snapshot.notifications,
        paymentDeferred:true,
        confirmationDeferred:true,
        temporaryPasswordFree:previewPasswordFreeActive(req)
      });
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
      try{quote=await ownerAdjustedQuote(row.quote||{},body.lodgingSubtotal);}catch(e){return res.status(e.status||400).json({error:e.code||'invalid_quote',message:e.message});}
      await sql`INSERT INTO booking_events(reservation_id,event_type,actor,metadata) VALUES (${id},'quote_updated','owner',${JSON.stringify({quote})}::jsonb)`;
      await recordQuoteUpdate(sql,id,quote);
      await sql`UPDATE reservations SET updated_at=now() WHERE id=${id}`;
      return res.status(200).json({ok:true,quote,agreementReacceptanceRequired:true,message:'Quote updated. If a completion link or agreement already existed, the guest must accept the revised version.'});
    }

    if(req.method==='POST'&&(body.action==='process_request'||body.action==='approve_request'||body.action==='issue_completion_link'||body.action==='agreement_record'||body.action==='mark_notifications_read')){
      try{
        if(body.action==='mark_notifications_read'){
          await sql`UPDATE owner_notifications SET read_at=now() WHERE read_at IS NULL`;
          return res.status(200).json({ok:true});
        }
        const id=String(body.id||'').trim();
        if(!id)return res.status(400).json({error:'missing_id'});
        if(body.action==='process_request')return res.status(200).json(await markRequestProcessing(sql,id));
        if(body.action==='approve_request')return res.status(200).json(await approveRequest(sql,req,id));
        if(body.action==='issue_completion_link'){
          const reservation=await reservationRow(sql,id);
          if(!reservation)return res.status(404).json({error:'reservation_not_found'});
          if(!['hold_verified','contract_sent','contract_signed'].includes(reservation.status)){
            return res.status(409).json({error:'not_approved',message:'Approve the request before issuing a completion link.'});
          }
          const quote=await latestQuote(sql,id);
          if(!quote)return res.status(409).json({error:'quote_missing',message:'This request does not have a stored quote.'});
          const issued=await issueCompletionToken(sql,req,reservation,quote);
          await sql`INSERT INTO booking_events(reservation_id,event_type,actor,metadata) VALUES (${id},'agreement_sent','owner',${JSON.stringify({agreementVersion:issued.document.version,agreementHash:issued.document.contentHash,quoteHash:issued.quoteHash,regenerated:true})}::jsonb)`;
          return res.status(200).json({ok:true,completionUrl:issued.url,agreementVersion:issued.document.version,message:'Completion link generated. Owner approval still does not confirm the reservation.'});
        }
        const record=await agreementRecordFor(sql,id);
        if(!record)return res.status(404).json({error:'agreement_not_accepted',message:'No accepted agreement is on file for this reservation.'});
        return res.status(200).json({ok:true,record});
      }catch(e){
        return res.status(e.status||500).json({error:e.code||'owner_action_failed',message:e.message||'The owner action could not be completed.'});
      }
    }

    if(req.method==='POST'&&body.action==='update'){
      const id=String(body.id||'').trim(),next=String(body.status||'').trim();
      if(!id)return res.status(400).json({error:'missing_id'});
      try{
        if(next==='accept_request'||next==='approve_request')return res.status(200).json(await approveRequest(sql,req,id));
        if(next==='reject_request')return res.status(200).json(await declineRequest(sql,id));
        if(next==='maintain_hold')return res.status(200).json(await extendHold(sql,id));
        if(next==='release_dates')return res.status(200).json(await releaseDates(sql,id));
        if(next==='process_request')return res.status(200).json(await markRequestProcessing(sql,id));
      }catch(e){
        return res.status(e.status||500).json({error:e.code||'owner_action_failed',message:e.message||'The owner action could not be completed.'});
      }
      let eventType;
      if(next==='contract_sent'){
        await sql`UPDATE reservations SET status='contract_sent',contract_sent_at=COALESCE(contract_sent_at,now()),updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='contract_sent';
      }else if(next==='contract_signed'){
        await sql`UPDATE reservations SET status='contract_signed',contract_signed_at=COALESCE(contract_signed_at,now()),updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='contract_signed';
      }else if(next==='deposit_received'){
        return res.status(409).json({error:'payment_deferred',message:'Payment verification and confirmation are deferred. Stripe remains on hold.'});
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
