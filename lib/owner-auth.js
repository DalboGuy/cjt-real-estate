const crypto=require('crypto');

const COOKIE_NAME='cjt_owner_session';

function ownerPasscodeRequired(){
  const value=String(process.env.OWNER_PORTAL_PASSCODE_REQUIRED||'').trim().toLowerCase();
  return value==='1'||value==='true'||value==='yes'||value==='on';
}

function ownerAuthOpen(){
  return !ownerPasscodeRequired();
}

function openOwnerSession(){
  if(!ownerAuthOpen())return null;
  return {
    token:null,
    userId:null,
    legacy:true,
    ownerAuthOpen:true,
    createdAt:new Date().toISOString(),
    expiresAt:null,
    user:null
  };
}

function parseCookies(header=''){
  return Object.fromEntries(String(header||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];
  }));
}

function sha256(value){
  return crypto.createHash('sha256').update(String(value||'')).digest('hex');
}

async function ownerSessionCookieValid(req){
  const token=parseCookies(req?.headers?.cookie||'')[COOKIE_NAME];
  if(!token)return false;
  const {db,ensureSchema}=require('./db');
  await ensureSchema();
  const sql=db();
  const rows=await sql`SELECT token_hash FROM owner_sessions WHERE token_hash=${sha256(token)} AND expires_at>now() LIMIT 1`;
  return rows.length>0;
}

async function ownerAuthenticated(req){
  if(ownerAuthOpen())return true;
  return ownerSessionCookieValid(req);
}

async function requireOwnerAuth(req,res){
  if(await ownerAuthenticated(req))return true;
  res.status(401).json({error:'unauthorized'});
  return false;
}

module.exports={
  COOKIE_NAME,
  ownerPasscodeRequired,
  ownerAuthOpen,
  openOwnerSession,
  ownerAuthenticated,
  requireOwnerAuth,
  ownerSessionCookieValid,
  parseCookies,
  sha256
};
