const crypto=require('crypto');
const {db,ensureSchema}=require('../lib/db');
const {previewPasswordFreeActive}=require('../lib/preview-access');
const {WEEKEND_DAYS,SEASONS,CLEANING_FEE,TAX_RATE,PRICING_THROUGH,MAX_GUESTS,SPLIT_PAYMENT_THRESHOLD_DAYS,ADVANCE_PAYMENT_PCT}=require('../lib/pricing');

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
    if(!(await authenticated(req)))return res.status(401).json({error:'unauthorized'});
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      seasons:SEASONS,
      cleaningFee:CLEANING_FEE,
      taxRate:TAX_RATE,
      pricingThrough:PRICING_THROUGH,
      maxGuests:MAX_GUESTS,
      weekendDays:Array.from(WEEKEND_DAYS).map(day=>({0:'Sunday',1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday'}[day])),
      splitPaymentThresholdDays:SPLIT_PAYMENT_THRESHOLD_DAYS,
      advancePaymentPct:ADVANCE_PAYMENT_PCT
    });
  }catch(e){
    console.error('pricing api error',e);
    return res.status(500).json({error:'pricing_api_error'});
  }
};
