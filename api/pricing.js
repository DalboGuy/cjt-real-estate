const crypto=require('crypto');
const {db,ensureSchema}=require('../lib/db');
const {previewPasswordFreeActive}=require('../lib/preview-access');
const {
  loadPricingCatalog,
  publicPricingPayload,
  updatePricingSettings,
  createPricingSeason,
  updatePricingSeason,
  deletePricingSeason,
  savePricingOverride,
  deletePricingOverride,
  savePricingDiscount,
  deletePricingDiscount,
  savePricingCostPolicy,
  commitPricingImport
}=require('../lib/pricing-store');
const {previewPricingImport}=require('../lib/pricing-import');
const {quoteStayWithCatalog}=require('../lib/pricing');

function parseCookies(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];
  }));
}
function hash(v){return crypto.createHash('sha256').update(v).digest('hex')}
async function authenticated(req){
  if(previewPasswordFreeActive(req))return true;
  await ensureSchema();
  const token=parseCookies(req.headers.cookie||'').cjt_owner_session;
  if(!token)return false;
  const sql=db();
  const rows=await sql`SELECT token_hash FROM owner_sessions WHERE token_hash=${hash(token)} AND expires_at>now() LIMIT 1`;
  return rows.length>0;
}

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
      if(!(await authenticated(req)))return res.status(401).json({error:'unauthorized'});
      const catalog=await loadPricingCatalog();
      return sendCatalog(res,catalog);
    }

    if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
    if(!(await authenticated(req)))return res.status(401).json({error:'unauthorized'});

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
    if(action==='save_override'){
      const {catalog,id}=await savePricingOverride(body);
      return sendCatalog(res,catalog,{ok:true,id,message:'Pricing override saved.'});
    }
    if(action==='delete_override'){
      const {catalog,deleted}=await deletePricingOverride(body.id);
      return sendCatalog(res,catalog,{ok:true,deleted,message:'Pricing override deleted.'});
    }
    if(action==='save_discount'){
      const {catalog,id}=await savePricingDiscount(body);
      return sendCatalog(res,catalog,{ok:true,id,message:'Discount saved.'});
    }
    if(action==='delete_discount'){
      const {catalog,deleted}=await deletePricingDiscount(body.id);
      return sendCatalog(res,catalog,{ok:true,deleted,message:'Discount deleted.'});
    }
    if(action==='save_cost_policy'){
      const catalog=await savePricingCostPolicy(body);
      return sendCatalog(res,catalog,{ok:true,message:`${body.channel} cost policy saved.`});
    }
    if(action==='preview_import'){
      const csv=String(body.csv||'');
      if(csv.length>500000)return res.status(413).json({error:'import_too_large',message:'Pricing CSV must be 500 KB or smaller.'});
      return res.status(200).json(previewPricingImport(csv,body.fileName));
    }
    if(action==='commit_import'){
      const csv=String(body.csv||'');
      if(csv.length>500000)return res.status(413).json({error:'import_too_large',message:'Pricing CSV must be 500 KB or smaller.'});
      const {catalog,replayed,importId,preview}=await commitPricingImport(csv,body.fileName);
      return sendCatalog(res,catalog,{ok:true,replayed,importId,importedRows:preview.rowCount,message:replayed?'This exact file was already imported. No duplicate rules were added.':`${preview.rowCount} pricing rules imported.`});
    }
    if(action==='preview_quote'){
      const catalog=await loadPricingCatalog({allowFallback:false,fresh:true});
      const quote=quoteStayWithCatalog(catalog,body.checkin,body.checkout,body.guests,{channel:body.channel,includeInternal:true});
      return res.status(200).json({ok:true,quote});
    }
    return res.status(400).json({error:'invalid_action',message:'Unknown pricing action.'});
  }catch(e){
    if(e instanceof SyntaxError)return res.status(400).json({error:'invalid_json',message:'The pricing request was not valid JSON.'});
    return sendStoreError(res,e);
  }
};
