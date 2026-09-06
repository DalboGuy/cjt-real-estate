const crypto=require('crypto');
const {db,ensureSchema}=require('../lib/db');
const {getReservationByGuestToken}=require('../lib/guest-access');
const {ensureChatSchema,getMessages,addMessage,markReadByGuest,markReadByOwner,listThreads}=require('../lib/chat');

function parseCookies(header=''){return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];}));}
function tokenHash(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex');}
function clean(v,max=4000){return String(v||'').trim().slice(0,max);}
async function authOwner(req){
  const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
  if(!token)return null;
  const sql=db();
  const rows=await sql`
    SELECT u.id,u.name,u.email,u.role,u.active,u.must_change_password
    FROM owner_sessions s JOIN owner_users u ON u.id=s.user_id
    WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now() AND u.active=true
    LIMIT 1
  `;
  return rows[0]||null;
}
async function reservationSummary(id){
  const sql=db();
  const rows=await sql`
    SELECT id,guest_name,guest_email,guest_phone,checkin::text,checkout::text,status,guests
    FROM reservations WHERE id=${id} LIMIT 1
  `;
  return rows[0]||null;
}
async function guestUnreadCount(reservationId){
  const sql=db();
  const rows=await sql`
    SELECT count(*)::int AS unread_count
    FROM chat_messages
    WHERE reservation_id=${reservationId} AND sender_type='owner' AND read_by_guest_at IS NULL
  `;
  return Number(rows[0]&&rows[0].unread_count||0);
}

module.exports=async function(req,res){
  try{
    await ensureSchema();
    await ensureChatSchema();
    res.setHeader('Cache-Control','no-store');

    if(req.method==='GET'&&String(req.query&&req.query.mode||'')==='owner_threads'){
      const owner=await authOwner(req);
      if(!owner)return res.status(401).json({error:'unauthorized'});
      if(owner.must_change_password)return res.status(428).json({error:'password_change_required'});
      return res.status(200).json({owner:{id:owner.id,name:owner.name,role:owner.role},threads:await listThreads()});
    }

    if(req.method==='GET'&&String(req.query&&req.query.mode||'')==='owner_thread'){
      const owner=await authOwner(req);
      if(!owner)return res.status(401).json({error:'unauthorized'});
      if(owner.must_change_password)return res.status(428).json({error:'password_change_required'});
      const reservationId=clean(req.query&&req.query.reservation_id,100);
      if(!reservationId)return res.status(400).json({error:'missing_reservation_id'});
      const reservation=await reservationSummary(reservationId);
      if(!reservation)return res.status(404).json({error:'reservation_not_found'});
      await markReadByOwner(reservationId);
      return res.status(200).json({owner:{id:owner.id,name:owner.name,role:owner.role},reservation,messages:await getMessages(reservationId)});
    }

    if(req.method==='GET'&&String(req.query&&req.query.mode||'')==='guest_summary'){
      const token=String((req.query&&req.query.token)||'');
      const reservation=await getReservationByGuestToken(token);
      if(!reservation)return res.status(404).json({error:'not_found',message:'This private conversation link is invalid or expired.'});
      const detail=await reservationSummary(reservation.id);
      return res.status(200).json({reservation:detail,unread_count:await guestUnreadCount(reservation.id)});
    }

    if(req.method==='GET'){
      const token=String((req.query&&req.query.token)||'');
      const reservation=await getReservationByGuestToken(token);
      if(!reservation)return res.status(404).json({error:'not_found',message:'This private conversation link is invalid or expired.'});
      await markReadByGuest(reservation.id);
      const detail=await reservationSummary(reservation.id);
      return res.status(200).json({reservation:detail,messages:await getMessages(reservation.id)});
    }

    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const action=clean(body.action,40);
      const message=clean(body.body,4000);
      if(!message)return res.status(400).json({error:'empty_message'});

      if(action==='guest_send'){
        const reservation=await getReservationByGuestToken(String(body.token||''));
        if(!reservation)return res.status(404).json({error:'not_found',message:'This private conversation link is invalid or expired.'});
        const detail=await reservationSummary(reservation.id);
        const inserted=await addMessage({reservationId:reservation.id,senderType:'guest',senderName:detail&&detail.guest_name||'Guest',body:message});
        return res.status(201).json({ok:true,message:inserted});
      }

      if(action==='owner_send'){
        const owner=await authOwner(req);
        if(!owner)return res.status(401).json({error:'unauthorized'});
        if(owner.must_change_password)return res.status(428).json({error:'password_change_required'});
        const reservationId=clean(body.reservation_id,100);
        if(!reservationId)return res.status(400).json({error:'missing_reservation_id'});
        const reservation=await reservationSummary(reservationId);
        if(!reservation)return res.status(404).json({error:'reservation_not_found'});
        const inserted=await addMessage({reservationId,senderType:'owner',senderName:owner.name,body:message});
        return res.status(201).json({ok:true,message:inserted});
      }
      return res.status(400).json({error:'invalid_action'});
    }

    return res.status(405).json({error:'method_not_allowed'});
  }catch(e){
    console.error('chat api error',e);
    return res.status(500).json({error:'chat_unavailable',message:'Messaging is temporarily unavailable.'});
  }
};
