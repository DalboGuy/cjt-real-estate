const crypto=require('crypto');
const {db,ensureSchema}=require('../lib/db');
const {previewPasswordFreeActive}=require('../lib/preview-access');
const {
  loadPricingCatalog,
  publicPricingPayload,
  updatePricingSettings,
  createPricingSeason,
  updatePricingSeason,
  deletePricingSeason
}=require('../lib/pricing-store');

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
    return res.status(400).json({error:'invalid_action',message:'Unknown pricing action.'});
  }catch(e){
    if(e instanceof SyntaxError)return res.status(400).json({error:'invalid_json',message:'The pricing request was not valid JSON.'});
    return sendStoreError(res,e);
  }
};
