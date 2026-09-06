const {db}=require('./db');

async function tableExists(name){
  const sql=db();
  const rows=await sql`SELECT to_regclass(${`public.${name}`})::text AS relation`;
  return !!rows[0]?.relation;
}

function requestContext(req){
  const forwarded=String(req?.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  return {
    ip:forwarded||String(req?.headers?.['x-real-ip']||''),
    userAgent:String(req?.headers?.['user-agent']||'').slice(0,500)
  };
}

async function writeAudit({req,actorUserId=null,eventType,targetType=null,targetId=null,propertyId=null,metadata={}}){
  try{
    if(!(await tableExists('audit_log')))return false;
    const sql=db();
    const context=requestContext(req);
    const payload={...metadata,ip:context.ip||undefined,userAgent:context.userAgent||undefined};
    await sql`
      INSERT INTO audit_log(actor_user_id,event_type,target_type,target_id,property_id,metadata)
      VALUES (${actorUserId},${eventType},${targetType},${targetId},${propertyId},${JSON.stringify(payload)}::jsonb)
    `;
    return true;
  }catch(e){
    console.error('audit write failed',e);
    return false;
  }
}

module.exports={tableExists,writeAudit,requestContext};
