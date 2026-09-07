const { getGuestBlockedDates } = require('../lib/calendar-view');
const { buildSourceHealth } = require('../lib/availability');

function failClosedBody(error, sources){
  const list=error && error.sources && error.sources.length ? error.sources : (sources||[]);
  const sourceHealth=error && error.sourceHealth ? error.sourceHealth : buildSourceHealth(list);
  const checkedAt=sourceHealth.checkedAt || new Date().toISOString();
  const code=error && error.code;
  const payload={
    blockedDates:[],
    sources:list.length ? list : [{name:'ota',ok:false,error:error && error.message,missingEnv:error && error.missingEnv}],
    sourceHealth:{...sourceHealth, failClosed:true, ok:false, checkedAt},
    checkedAt
  };
  if(code==='OTA_FEED_CONFIG_MISSING'){
    payload.error='ota_calendar_configuration_missing';
    payload.missingEnv=error.missingEnv;
    payload.message=error.message;
    return payload;
  }
  if(code==='OTA_FEED_UNHEALTHY'){
    payload.error='ota_calendar_unhealthy';
    payload.message=error.message;
    return payload;
  }
  payload.error='availability_unavailable';
  payload.message=error && error.message ? error.message : 'Live availability could not be verified.';
  return payload;
}

module.exports=async function(req,res){
  try{
    const merged=await getGuestBlockedDates();
    const sources=merged.sources||[];
    const sourceHealth=merged.sourceHealth || buildSourceHealth(sources);
    if(!sourceHealth.ok){
      res.setHeader('Cache-Control','no-store');
      return res.status(503).json(failClosedBody(
        Object.assign(new Error('One or more calendar feeds could not be verified. Availability is paused until feeds are healthy.'), {
          code:'OTA_FEED_UNHEALTHY',
          sources,
          sourceHealth
        }),
        sources
      ));
    }
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=180');
    return res.status(200).json({
      blockedDates:[...merged.dates].sort(),
      sources,
      sourceHealth,
      checkedAt:sourceHealth.checkedAt || new Date().toISOString()
    });
  }catch(e){
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json(failClosedBody(e, e.sources||[]));
  }
};
