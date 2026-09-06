const { getOtaBlockedDates, eachDate } = require('../lib/availability');
const { getActiveReservations } = require('../lib/db');

module.exports=async function(req,res){
  const all=new Set();
  const sources=[];
  let otaConfigError=null;
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
    for(const r of reservations)eachDate(r.checkin,r.checkout).forEach(d=>all.add(d));
    sources.push({name:'direct',ok:true,count:reservations.length});
  }catch(e){sources.push({name:'direct',ok:false,error:e.message});}
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=180');
  if(otaConfigError){
    return res.status(503).json({
      blockedDates:[],
      sources,
      error:'ota_calendar_configuration_missing',
      missingEnv:otaConfigError.missingEnv,
      checkedAt:new Date().toISOString()
    });
  }
  res.status(200).json({blockedDates:[...all].sort(),sources,checkedAt:new Date().toISOString()});
};
