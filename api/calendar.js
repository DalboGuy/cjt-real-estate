const { getOtaBlockedDates, eachDate } = require('../lib/availability');
const { getActiveReservations } = require('../lib/db');

module.exports=async function(req,res){
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
    const reservations=await getActiveReservations();
    const directDates=new Set();
    for(const r of reservations){
      eachDate(r.checkin,r.checkout).forEach(d=>{all.add(d);directDates.add(d)});
      events.push({source:'direct',start:r.checkin,end:r.checkout,kind:'reservation_like'});
    }
    blockedBySource.direct=[...directDates].sort();
    sources.push({name:'direct',ok:true,count:reservations.length});
  }catch(e){
    blockedBySource.direct=[];
    sources.push({name:'direct',ok:false,error:e.message});
  }
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=180');
  res.status(200).json({blockedDates:[...all].sort(),blockedBySource,sources,events,checkedAt:new Date().toISOString()});
};
