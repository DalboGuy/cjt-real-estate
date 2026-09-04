const crypto=require('crypto');
const {db,ensureSchema}=require('../lib/db');

const LIVE_ORIGIN='https://cjtbookingpage.vercel.app';

function parseCookies(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];
  }));
}
function tokenHash(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex');}
function value(block,key){return (block.match(new RegExp(`${key}[^:]*:([^\\r\\n]+)`,'i'))||[])[1]||'';}
function isoDate(v){const m=String(v||'').match(/(\d{4})(\d{2})(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:null;}
function cleanId(v){return String(v||'').trim().slice(0,100);}

async function authUser(req){
  await ensureSchema();
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

async function fetchLiveBlocks(){
  const response=await fetch(`${LIVE_ORIGIN}/direct-bookings.ics?_=${Date.now()}`,{
    headers:{'user-agent':'CJT-Owner-Portal-Live-Controls/1.0','cache-control':'no-cache'}
  });
  if(!response.ok)throw new Error(`live_feed_${response.status}`);
  const text=await response.text();
  const blocks=[];
  for(const match of text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)){
    const block=match[1];
    const uid=value(block,'UID');
    if(!uid||uid.startsWith('calendar-init@'))continue;
    const id=uid.split('@')[0];
    const checkin=isoDate(value(block,'DTSTART'));
    const checkout=isoDate(value(block,'DTEND'));
    if(!checkin||!checkout)continue;
    blocks.push({
      id,
      checkin,
      checkout,
      summary:value(block,'SUMMARY')||'Reserved - Direct Booking'
    });
  }
  return blocks.sort((a,b)=>a.checkin.localeCompare(b.checkin));
}

async function productionLogin(passcode){
  const response=await fetch(`${LIVE_ORIGIN}/api/owner`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'login',passcode})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(data.error||'live_login_failed');
    error.status=response.status;
    throw error;
  }
  const setCookie=response.headers.get('set-cookie')||'';
  const cookie=setCookie.split(';')[0];
  if(!cookie)throw new Error('live_session_missing');
  return cookie;
}

async function releaseProductionReservation(id,passcode){
  const cookie=await productionLogin(passcode);
  try{
    const response=await fetch(`${LIVE_ORIGIN}/api/owner`,{
      method:'POST',
      headers:{'content-type':'application/json','cookie':cookie},
      body:JSON.stringify({action:'update',id,status:'release_dates'})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error(data.error||'live_release_failed');
      error.status=response.status;
      throw error;
    }
  }finally{
    fetch(`${LIVE_ORIGIN}/api/owner`,{
      method:'POST',
      headers:{'content-type':'application/json','cookie':cookie},
      body:JSON.stringify({action:'logout'})
    }).catch(()=>{});
  }
}

module.exports=async function(req,res){
  try{
    const user=await authUser(req);
    if(!user)return res.status(401).json({error:'unauthorized'});
    if(user.must_change_password)return res.status(428).json({error:'password_change_required'});
    res.setHeader('Cache-Control','no-store, max-age=0');

    if(req.method==='GET'){
      const blocks=await fetchLiveBlocks();
      return res.status(200).json({blocks,source:'production_direct_feed',checkedAt:new Date().toISOString()});
    }

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(req.method==='POST'&&body.action==='release_live_direct'){
      if(user.role!=='admin')return res.status(403).json({error:'admin_required'});
      const id=cleanId(body.id),passcode=String(body.passcode||'');
      if(!/^DB-\d{8}-[A-Z0-9]{6}$/.test(id)||passcode.length<1||passcode.length>200){
        return res.status(400).json({error:'invalid_release_request'});
      }
      const blocks=await fetchLiveBlocks();
      if(!blocks.some(b=>b.id===id))return res.status(404).json({error:'live_block_not_found'});
      await releaseProductionReservation(id,passcode);
      return res.status(200).json({ok:true,id,releasedAt:new Date().toISOString()});
    }

    return res.status(405).json({error:'method_not_allowed'});
  }catch(e){
    console.error('live-direct-bookings error',e.message);
    if(e.status===401)return res.status(401).json({error:'invalid_live_owner_passcode'});
    return res.status(500).json({error:e.message||'live_direct_controls_failed'});
  }
};
