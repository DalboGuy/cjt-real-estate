const {quoteStay,eachDate}=require('../lib/pricing');
const {getGuestBlockedDates}=require('../lib/calendar-view');
const {buildSourceHealth}=require('../lib/availability');

function healthFailPayload(error, sources){
  const code=error && error.code;
  if(code!=='OTA_FEED_CONFIG_MISSING' && code!=='OTA_FEED_UNHEALTHY') return null;
  const list=error && error.sources && error.sources.length ? error.sources : (sources||[]);
  const sourceHealth=error && error.sourceHealth ? error.sourceHealth : buildSourceHealth(list);
  const checkedAt=sourceHealth.checkedAt || new Date().toISOString();
  if(code==='OTA_FEED_CONFIG_MISSING'){
    return {
      error:'ota_calendar_configuration_missing',
      message:error.message,
      missingEnv:error.missingEnv,
      sources:list,
      sourceHealth:{...sourceHealth, ok:false, failClosed:true, checkedAt},
      checkedAt
    };
  }
  return {
    error:'ota_calendar_unhealthy',
    message:(error && error.message) || 'One or more calendar feeds could not be verified. Quotes are paused until availability sources are healthy.',
    sources:list,
    sourceHealth:{...sourceHealth, ok:false, failClosed:true, checkedAt},
    checkedAt
  };
}

module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  try{
    const checkin=String(req.query?.checkin||'').trim();
    const checkout=String(req.query?.checkout||'').trim();
    const guests=Number(req.query?.guests||1);
    const quote=await quoteStay(checkin,checkout,guests);

    const blocked=await getGuestBlockedDates();
    const sources=blocked.sources||[];
    const sourceHealth=blocked.sourceHealth || buildSourceHealth(sources);
    if(!sourceHealth.ok){
      res.setHeader('Cache-Control','no-store');
      return res.status(503).json(healthFailPayload({
        code:'OTA_FEED_UNHEALTHY',
        message:'One or more calendar feeds could not be verified. Quotes are paused until availability sources are healthy.',
        sources,
        sourceHealth
      }, sources));
    }

    const requested=eachDate(checkin,checkout);
    if(requested.some(d=>blocked.dates.has(d))){
      return res.status(409).json({
        error:'dates_unavailable',
        message:'One or more requested nights are no longer available.',
        sources,
        sourceHealth
      });
    }

    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({available:true,quote,checkedAt:new Date().toISOString(),sources,sourceHealth});
  }catch(e){
    const health=healthFailPayload(e, e.sources||[]);
    if(health){
      res.setHeader('Cache-Control','no-store');
      return res.status(503).json(health);
    }
    if(e?.code)return res.status(e.status||422).json({error:e.code,message:e.message});
    console.error('quote api error',e);
    return res.status(500).json({error:'quote_unavailable',message:'We could not calculate the direct-booking quote right now.'});
  }
};
