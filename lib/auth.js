const crypto=require('crypto');
const {db,ensureSchema}=require('./db');

const COOKIE_NAME='cjt_owner_session';
const SESSION_SECONDS=60*60*12;

function parseCookies(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];
  }));
}

function sha256(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function normalizeEmail(value){return String(value||'').trim().toLowerCase();}
function safeEqual(a,b){
  const A=Buffer.from(String(a||''));
  const B=Buffer.from(String(b||''));
  return A.length===B.length&&crypto.timingSafeEqual(A,B);
}
function passwordHash(password,salt){return crypto.scryptSync(String(password),String(salt),64).toString('hex');}
function createPassword(password){
  const salt=crypto.randomBytes(16).toString('hex');
  return {salt,hash:passwordHash(password,salt)};
}
function verifyPassword(password,salt,expected){return safeEqual(passwordHash(password,salt),expected);}

function setSessionCookie(res,token){
  res.setHeader('Set-Cookie',`${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`);
}
function clearSessionCookie(res){res.setHeader('Set-Cookie',`${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);}

async function createSession(res,userId=null){
  await ensureSchema();
  const sql=db();
  const token=crypto.randomBytes(32).toString('hex');
  await sql`DELETE FROM owner_sessions WHERE expires_at<=now()`;
  await sql`INSERT INTO owner_sessions(token_hash,expires_at,user_id) VALUES (${sha256(token)},now()+interval '12 hours',${userId})`;
  setSessionCookie(res,token);
  return token;
}

async function getSession(req){
  await ensureSchema();
  const token=parseCookies(req.headers.cookie||'')[COOKIE_NAME];
  if(!token)return null;
  const sql=db();
  const rows=await sql`
    SELECT s.token_hash,s.user_id,s.created_at,s.expires_at,
           u.name,u.email,u.role,u.active,u.must_change_password
    FROM owner_sessions s
    LEFT JOIN owner_users u ON u.id=s.user_id
    WHERE s.token_hash=${sha256(token)} AND s.expires_at>now()
    LIMIT 1
  `;
  if(!rows.length)return null;
  const row=rows[0];
  if(row.user_id&&row.active===false)return null;
  return {
    token,
    userId:row.user_id||null,
    legacy:!row.user_id,
    createdAt:row.created_at,
    expiresAt:row.expires_at,
    user:row.user_id?{
      id:row.user_id,
      name:row.name,
      email:row.email,
      role:row.role,
      active:row.active,
      mustChangePassword:row.must_change_password
    }:null
  };
}

async function destroySession(req,res){
  const token=parseCookies(req.headers.cookie||'')[COOKIE_NAME];
  if(token){
    const sql=db();
    await sql`DELETE FROM owner_sessions WHERE token_hash=${sha256(token)}`;
  }
  clearSessionCookie(res);
}

async function requireSession(req,res){
  const session=await getSession(req);
  if(!session){res.status(401).json({error:'unauthorized'});return null;}
  return session;
}

async function requireNamedUser(req,res){
  const session=await requireSession(req,res);
  if(!session)return null;
  if(!session.user){res.status(403).json({error:'named_account_required'});return null;}
  return session;
}

async function requireAdmin(req,res){
  const session=await requireNamedUser(req,res);
  if(!session)return null;
  if(session.user.role!=='admin'){res.status(403).json({error:'admin_required'});return null;}
  return session;
}

module.exports={
  COOKIE_NAME,SESSION_SECONDS,parseCookies,sha256,normalizeEmail,safeEqual,
  passwordHash,createPassword,verifyPassword,setSessionCookie,clearSessionCookie,
  createSession,getSession,destroySession,requireSession,requireNamedUser,requireAdmin
};
