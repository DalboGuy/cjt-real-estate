const crypto=require('crypto');
const { db, ensureSchema, expireHolds }=require('../lib/db');
const {ownerAuthOpen,requireOwnerAuth,parseCookies,sha256}=require('../lib/owner-auth');

function safeEqual(a,b){const A=Buffer.from(String(a||'')),B=Buffer.from(String(b||''));return A.length===B.length&&crypto.timingSafeEqual(A,B);}

function setSessionCookie(res,token){res.setHeader('Set-Cookie',`cjt_owner_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);}
function clearSessionCookie(res){res.setHeader('Set-Cookie','cjt_owner_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');}

module.exports=async function(req,res){
  try{
    await ensureSchema();
    const sql=db();
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(req.method==='POST'&&body.action==='login'){
      if(ownerAuthOpen())return res.status(200).json({ok:true,ownerAuthOpen:true});
      if(!process.env.OWNER_PORTAL_PASSCODE)return res.status(503).json({error:'owner_login_not_configured'});
      if(!safeEqual(body.passcode,process.env.OWNER_PORTAL_PASSCODE))return res.status(401).json({error:'invalid_passcode'});
      const token=crypto.randomBytes(32).toString('hex');
      await sql`DELETE FROM owner_sessions WHERE expires_at<=now()`;
      await sql`INSERT INTO owner_sessions(token_hash,expires_at) VALUES (${sha256(token)},now()+interval '12 hours')`;
      setSessionCookie(res,token);
      return res.status(200).json({ok:true,ownerAuthOpen:false});
    }
    if(!(await requireOwnerAuth(req,res)))return;

    if(req.method==='GET'){
      await expireHolds();
      const reservations=await sql`
        SELECT id,guest_name,guest_email,guest_phone,guests,notes,checkin::text,checkout::text,status,
               hold_expires_at,contract_sent_at,contract_signed_at,deposit_received_at,released_at,created_at,updated_at
        FROM reservations
        ORDER BY CASE WHEN status IN ('released','expired','cancelled') THEN 1 ELSE 0 END, checkin ASC, created_at DESC
        LIMIT 250
      `;
      return res.status(200).json({reservations,ownerAuthOpen:ownerAuthOpen()});
    }

    if(req.method==='POST'&&body.action==='logout'){
      const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
      if(token)await sql`DELETE FROM owner_sessions WHERE token_hash=${sha256(token)}`;
      clearSessionCookie(res);
      return res.status(200).json({ok:true});
    }

    if(req.method==='POST'&&body.action==='update'){
      const id=String(body.id||'').trim(),next=String(body.status||'').trim();
      if(!id)return res.status(400).json({error:'missing_id'});
      let eventType;
      if(next==='maintain_hold'){
        await sql`UPDATE reservations SET status='hold_verified',hold_expires_at=GREATEST(COALESCE(hold_expires_at,now()),now())+interval '24 hours',updated_at=now() WHERE id=${id} AND status IN ('inquiry_hold','hold_verified')`;
        eventType='hold_maintained';
      }else if(next==='contract_sent'){
        await sql`UPDATE reservations SET status='contract_sent',contract_sent_at=COALESCE(contract_sent_at,now()),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='contract_sent';
      }else if(next==='contract_signed'){
        await sql`UPDATE reservations SET status='contract_signed',contract_signed_at=COALESCE(contract_signed_at,now()),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
        eventType='contract_signed';
      }else if(next==='deposit_received'){
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
    return res.status(405).json({error:'method_not_allowed'});
  }catch(e){console.error('owner api error',e);return res.status(500).json({error:'owner_api_error'});}
};
