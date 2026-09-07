const {quoteStay,eachDate}=require('../lib/pricing');
const {getOtaBlockedDates}=require('../lib/availability');
const {getActiveReservations}=require('../lib/db');

module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  try{
    const checkin=String(req.query?.checkin||'').trim();
    const checkout=String(req.query?.checkout||'').trim();
    const guests=Number(req.query?.guests||1);
    const quote=await quoteStay(checkin,checkout,guests);

    const blocked=new Set();
    const [ota,reservations]=await Promise.all([getOtaBlockedDates(),getActiveReservations()]);
    ota.dates.forEach(d=>blocked.add(d));
    for(const r of reservations)eachDate(r.checkin,r.checkout).forEach(d=>blocked.add(d));
    const requested=eachDate(checkin,checkout);
    if(requested.some(d=>blocked.has(d))){
      return res.status(409).json({error:'dates_unavailable',message:'One or more requested nights are no longer available.'});
    }

    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({available:true,quote,checkedAt:new Date().toISOString(),sources:ota.sources});
  }catch(e){
    if(e?.code)return res.status(e.status||422).json({error:e.code,message:e.message});
    console.error('quote api error',e);
    return res.status(500).json({error:'quote_unavailable',message:'We could not calculate the direct-booking quote right now.'});
  }
};
