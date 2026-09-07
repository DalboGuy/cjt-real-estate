const crypto=require('crypto');
const {db,ensureSchema,expireHolds}=require('../lib/db');
const {previewPasswordFreeActive}=require('../lib/preview-access');
const {loadOwnerFinancials}=require('../lib/financials');

function parseCookies(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];
  }));
}
function hash(v){return crypto.createHash('sha256').update(v).digest('hex')}
async function authenticated(req){
  if(previewPasswordFreeActive(req))return true;
  await ensureSchema();
  const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
  if(!token)return false;
  const sql=db();
  const rows=await sql`SELECT token_hash FROM owner_sessions WHERE token_hash=${hash(token)} AND expires_at>now() LIMIT 1`;
  return rows.length>0;
}

module.exports=async function(req,res){
  try{
    if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
    await ensureSchema();
    if(!(await authenticated(req)))return res.status(401).json({error:'unauthorized'});
    await expireHolds();
    const {summary,bookings}=await loadOwnerFinancials(db());
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      checkedAt:new Date().toISOString(),
      temporaryPasswordFree:previewPasswordFreeActive(req),
      summary,
      bookings
    });
  }catch(e){
    console.error('financials api error',e);
    return res.status(500).json({error:'financials_api_error'});
  }
};
