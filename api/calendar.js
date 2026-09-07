const { getOtaBlockedDates, eachDate } = require('../lib/availability');
const { summarizeCalendarHealth } = require('../lib/calendar-health');
const { getActiveReservations } = require('../lib/db');

function noStore(res){
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control','no-store');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('Pragma','no-cache');
}

module.exports=async function(req,res){
  const all=new Set();
  const sources=[];
  let otaConfigError=null;
  let holds=0;
  try{
    const ota=await getOtaBlockedDates();
    ota.dates.forEach(d=>all.add(d));
    sources.push(...ota.sources);
  }catch(e){
    otaConfigError=e.code==='OTA_FEED_CONFIG_MISSING'?e:null;
    sources.push({name:'ota',ok:false,error:e.message,missingEnv:e.missingEnv});
  }
  try{
    const reservations=await getActiveReservations();
    holds=reservations.filter(r=>r.status==='inquiry_hold'||r.status==='hold_verified').length;
    for(const r of reservations)eachDate(r.checkin,r.checkout).forEach(d=>all.add(d));
    sources.push({name:'direct',ok:true,count:reservations.length,holds});
  }catch(e){sources.push({name:'direct',ok:false,error:e.message});}
  noStore(res);
  const health=summarizeCalendarHealth(sources);
  if(otaConfigError){
    return res.status(503).json({
      blockedDates:[],
      sources,
      health,
      error:'ota_calendar_configuration_missing',
      missingEnv:otaConfigError.missingEnv,
      checkedAt:new Date().toISOString()
    });
  }
  res.status(200).json({blockedDates:[...all].sort(),sources,health,holds,checkedAt:new Date().toISOString()});
};
