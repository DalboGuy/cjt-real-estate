// Retire the obsolete cross-deployment passcode proxy. Existing clients must
// reload the owner portal to use its authenticated inquiry workflow.
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  return res.status(410).json({error:'Reload the owner portal to manage inquiries with your current login.'});
};
