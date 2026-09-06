const crypto=require('crypto');
const {db,ensureSchema}=require('../lib/db');
const {normalizeEmail,sha256,createPassword}=require('../lib/auth');
const {tableExists,writeAudit}=require('../lib/audit');

function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
function baseUrl(req){
  const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();
  return `${proto}://${host}`;
}
async function deliverReset({to,name,resetUrl}){
  const url=process.env.PASSWORD_RESET_DELIVERY_URL;
  if(!url)return {ok:false,reason:'delivery_not_configured'};
  const headers={'Content-Type':'application/json'};
  if(process.env.PASSWORD_RESET_DELIVERY_KEY)headers.Authorization=`Bearer ${process.env.PASSWORD_RESET_DELIVERY_KEY}`;
  const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({to,name,resetUrl,expiresMinutes:30,template:'cjt_password_reset'})});
  if(!r.ok)return {ok:false,reason:'delivery_failed'};
  return {ok:true};
}

module.exports=async function(req,res){
  try{
    await ensureSchema();
    if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
    const sql=db();
    const body=bodyOf(req);
    const action=String(body.action||'');

    if(action==='request'){
      if(!(await tableExists('password_reset_tokens')))return res.status(503).json({error:'recovery_storage_not_available'});
      if(!process.env.PASSWORD_RESET_DELIVERY_URL)return res.status(503).json({error:'recovery_delivery_not_configured'});
      const email=normalizeEmail(body.email);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'valid_email_required'});
      const users=await sql`SELECT id,name,email FROM owner_users WHERE lower(email)=lower(${email}) AND active=true LIMIT 1`;
      if(!users.length)return res.status(200).json({ok:true});
      const user=users[0];
      const token=crypto.randomBytes(32).toString('hex');
      const tokenHash=sha256(token);
      await sql`DELETE FROM password_reset_tokens WHERE user_id=${user.id} AND used_at IS NULL`;
      await sql`INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES (${tokenHash},${user.id},now()+interval '30 minutes')`;
      const resetUrl=`${baseUrl(req)}/reset-password-v1?token=${encodeURIComponent(token)}`;
      const delivery=await deliverReset({to:user.email,name:user.name,resetUrl});
      if(!delivery.ok){
        await sql`DELETE FROM password_reset_tokens WHERE token_hash=${tokenHash}`;
        return res.status(503).json({error:delivery.reason});
      }
      await writeAudit({req,actorUserId:user.id,eventType:'auth.password_reset_requested',targetType:'user',targetId:String(user.id)});
      return res.status(200).json({ok:true});
    }

    if(action==='reset'){
      if(!(await tableExists('password_reset_tokens')))return res.status(503).json({error:'recovery_storage_not_available'});
      const token=String(body.token||'');
      const password=String(body.password||'');
      if(token.length<20)return res.status(400).json({error:'invalid_or_expired_token'});
      if(password.length<5)return res.status(400).json({error:'password_too_short'});
      const tokenHash=sha256(token);
      const rows=await sql`
        SELECT t.token_hash,t.user_id,u.active
        FROM password_reset_tokens t
        JOIN owner_users u ON u.id=t.user_id
        WHERE t.token_hash=${tokenHash} AND t.used_at IS NULL AND t.expires_at>now()
        LIMIT 1
      `;
      const row=rows[0];
      if(!row||!row.active)return res.status(400).json({error:'invalid_or_expired_token'});
      const creds=createPassword(password);
      await sql`UPDATE owner_users SET password_salt=${creds.salt},password_hash=${creds.hash},must_change_password=false,updated_at=now() WHERE id=${row.user_id}`;
      await sql`UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=${tokenHash}`;
      await sql`DELETE FROM owner_sessions WHERE user_id=${row.user_id}`;
      await writeAudit({req,actorUserId:row.user_id,eventType:'auth.password_reset_completed',targetType:'user',targetId:String(row.user_id),metadata:{sessionsRevoked:true}});
      return res.status(200).json({ok:true});
    }

    return res.status(400).json({error:'invalid_action'});
  }catch(e){
    console.error('password recovery api error',e);
    return res.status(500).json({error:'password_recovery_error'});
  }
};
