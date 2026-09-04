const crypto=require('crypto');
const {db,ensureSchema}=require('../lib/db');

function clean(v,max=500){return String(v||'').trim().slice(0,max)}
function email(v){return clean(v,180).toLowerCase()}
function validPassword(v){return typeof v==='string'&&v.length>=10&&v.length<=200}
function safeEqual(a,b){const A=Buffer.from(String(a||'')),B=Buffer.from(String(b||''));return A.length===B.length&&crypto.timingSafeEqual(A,B)}
function passwordHash(password,salt){return crypto.scryptSync(String(password),String(salt),64).toString('hex')}

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  try{
    await ensureSchema();
    if(!process.env.OWNER_PORTAL_PASSCODE)return res.status(503).json({error:'recovery_not_configured'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const mail=email(body.email),newPassword=body.newPassword,ownerPasscode=String(body.ownerPasscode||'');
    if(!mail.includes('@')||!validPassword(newPassword))return res.status(400).json({error:'invalid_request'});
    if(!safeEqual(ownerPasscode,process.env.OWNER_PORTAL_PASSCODE))return res.status(401).json({error:'invalid_passcode'});
    const sql=db();
    const rows=await sql`SELECT id,role,active FROM owner_users WHERE email=${mail} LIMIT 1`;
    const user=rows[0];
    if(!user||!user.active||user.role!=='admin')return res.status(404).json({error:'admin_not_found'});
    const salt=crypto.randomBytes(16).toString('hex'),hash=passwordHash(newPassword,salt);
    await sql`UPDATE owner_users SET password_salt=${salt},password_hash=${hash},must_change_password=false,updated_at=now() WHERE id=${user.id}`;
    await sql`DELETE FROM owner_sessions WHERE user_id=${user.id}`;
    return res.status(200).json({ok:true});
  }catch(e){console.error('owner recovery error',e);return res.status(500).json({error:'recovery_failed'});}
};
