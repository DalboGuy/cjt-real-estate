const {requireOwnerAuth}=require('../lib/owner-auth');
const {
  loadPricingCatalog,
  publicPricingPayload,
  updatePricingSettings,
  createPricingSeason,
  updatePricingSeason,
  deletePricingSeason
}=require('../lib/pricing-store');

function sendCatalog(res,catalog,extra){
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({...publicPricingPayload(catalog),...extra});
}

function sendStoreError(res,error){
  if(error?.code){
    return res.status(error.status||400).json({
      error:error.code,
      message:error.message,
      fields:error.fields||undefined
    });
  }
  console.error('pricing api error',error);
  return res.status(500).json({error:'pricing_api_error',message:'Pricing could not be updated right now.'});
}

module.exports=async function(req,res){
  try{
    if(req.method==='GET'){
      if(!(await requireOwnerAuth(req,res)))return;
      const catalog=await loadPricingCatalog();
      return sendCatalog(res,catalog);
    }

    if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
    if(!(await requireOwnerAuth(req,res)))return;

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=String(body.action||'').trim();

    if(action==='update_settings'){
      const catalog=await updatePricingSettings(body);
      return sendCatalog(res,catalog,{ok:true});
    }
    if(action==='create_season'){
      const {catalog,id}=await createPricingSeason(body);
      return sendCatalog(res,catalog,{ok:true,id});
    }
    if(action==='update_season'){
      const catalog=await updatePricingSeason(body.id,body);
      return sendCatalog(res,catalog,{ok:true});
    }
    if(action==='delete_season'){
      const {catalog,deleted}=await deletePricingSeason(body.id);
      return sendCatalog(res,catalog,{ok:true,deleted});
    }
    return res.status(400).json({error:'invalid_action',message:'Unknown pricing action.'});
  }catch(e){
    if(e instanceof SyntaxError)return res.status(400).json({error:'invalid_json',message:'The pricing request was not valid JSON.'});
    return sendStoreError(res,e);
  }
};
