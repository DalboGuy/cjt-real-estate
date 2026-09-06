const { db, ensureSchema } = require('../lib/db');

module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  try{
    await ensureSchema();
    const sql=db();
    const rows=await sql`SELECT key,value,updated_at FROM site_config WHERE key IN ('midweek_offer','long_stay_offer')`;
    const config=Object.fromEntries(rows.map(r=>[r.key,r.value]));
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=180');
    return res.status(200).json({config,checkedAt:new Date().toISOString()});
  }catch(e){
    console.error('site config error',e);
    return res.status(200).json({config:{midweek_offer:{enabled:false,discount_pct:0,min_nights:2},long_stay_offer:{enabled:false,seven_night_pct:0,fourteen_night_pct:0,twentyeight_night_pct:0}},checkedAt:new Date().toISOString()});
  }
};
