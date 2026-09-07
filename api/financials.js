const {db,ensureSchema,expireHolds}=require('../lib/db');
const {ownerAuthOpen,requireOwnerAuth}=require('../lib/owner-auth');
const {loadOwnerFinancials}=require('../lib/financials');

module.exports=async function(req,res){
  try{
    if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
    await ensureSchema();
    if(!(await requireOwnerAuth(req,res)))return;
    await expireHolds();
    const {summary,bookings}=await loadOwnerFinancials(db());
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      checkedAt:new Date().toISOString(),
      ownerAuthOpen:ownerAuthOpen(),
      summary,
      bookings
    });
  }catch(e){
    console.error('financials api error',e);
    return res.status(500).json({error:'financials_api_error'});
  }
};
