const { getOtaBlockedDates, eachDate } = require('../lib/availability');
const { getActiveReservations } = require('../lib/db');

function bookingTestMode(req){
  return process.env.VERCEL_ENV==='preview' &&
    process.env.VERCEL_GIT_COMMIT_REF==='customer-v3-ops' &&
    String(req.query&&req.query.booking_test||'')==='1';
}

module.exports=async function(req,res){
  const testMode=bookingTestMode(req);
  const all=new Set();
  const sources=[];
  const blockedBySource={};
  const events=[];
  try{
    const ota=await getOtaBlockedDates();
    ota.dates.forEach(d=>all.add(d));
    sources.push(...ota.sources);
    Object.assign(blockedBySource,ota.sourceDates||{});
    for(const e of ota.events||[]){
      if(!e||!e.source||!e.start||!e.end)continue;
      events.push({source:e.source,start:e.start,end:e.end,kind:e.kind||'block'});
    }
  }catch(e){sources.push({name:'ota',ok:false,error:e.message});}
  try{
    const active=await getActiveReservations();
    const reservations=testMode
      ? active.filter(r=>!['inquiry_hold','hold_verified'].includes(String(r.status||'')))
      : active;
    const directDates=new Set();
    for(const r of reservations){
      eachDate(r.checkin,r.checkout).forEach(d=>{all.add(d);directDates.add(d)});
      events.push({source:'direct',start:r.checkin,end:r.checkout,kind:'reservation_like'});
    }
    blockedBySource.direct=[...directDates].sort();
    sources.push({name:'direct',ok:true,count:reservations.length,temporaryHoldsIgnored:testMode});
  }catch(e){
    blockedBySource.direct=[];
    sources.push({name:'direct',ok:false,error:e.message});
  }
  res.setHeader('Cache-Control',testMode?'no-store':'s-maxage=60, stale-while-revalidate=180');
  const requiredSources=['airbnb','vrbo','direct'];
  const bookingSource=sources.find(source=>source.name==='booking.com');
  if(bookingSource&&bookingSource.error!=='not_configured')requiredSources.push('booking.com');
  const failedSources=requiredSources.filter(name=>!sources.some(source=>source.name===name&&source.ok));
  res.status(200).json({blockedDates:[...all].sort(),blockedBySource,sources,events,healthy:failedSources.length===0,failedSources,testMode,checkedAt:new Date().toISOString()});
};
