const { getGuestBlockedDates } = require('../lib/calendar-view');

module.exports=async function(req,res){
  try{
    const merged=await getGuestBlockedDates();
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=180');
    return res.status(200).json({
      blockedDates:[...merged.dates].sort(),
      sources:merged.sources||[],
      checkedAt:new Date().toISOString()
    });
  }catch(e){
    const missing=e.code==='OTA_FEED_CONFIG_MISSING';
    const unverified=e.code==='OTA_AVAILABILITY_UNVERIFIED';
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({
      blockedDates:[],
      sources:e.sources||[{name:'ota',ok:false,error:e.message,missingEnv:e.missingEnv}],
      error:missing?'ota_calendar_configuration_missing':(unverified?'ota_availability_unverified':'calendar_unavailable'),
      message:e.message,
      missingEnv:e.missingEnv,
      checkedAt:new Date().toISOString()
    });
  }
};
