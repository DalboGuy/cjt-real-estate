const {db,ensureSchema}=require('../lib/db');
const {requireAdmin}=require('../lib/auth');
const {tableExists}=require('../lib/audit');

module.exports=async function(req,res){
  try{
    await ensureSchema();
    const session=await requireAdmin(req,res);
    if(!session)return;
    if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
    if(!(await tableExists('audit_log'))){
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({available:false,events:[],message:'audit_storage_not_available_on_current_database'});
    }
    const sql=db();
    const rows=await sql`
      SELECT a.id,a.event_type,a.target_type,a.target_id,a.property_id,a.metadata,a.created_at,
             u.name AS actor_name,u.email AS actor_email,u.role AS actor_role
      FROM audit_log a
      LEFT JOIN owner_users u ON u.id=a.actor_user_id
      ORDER BY a.created_at DESC
      LIMIT 200
    `;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({available:true,events:rows.map(r=>({
      id:r.id,eventType:r.event_type,targetType:r.target_type,targetId:r.target_id,propertyId:r.property_id,
      metadata:r.metadata||{},createdAt:r.created_at,
      actor:r.actor_name?{name:r.actor_name,email:r.actor_email,role:r.actor_role}:null
    }))});
  }catch(e){
    console.error('audit api error',e);
    return res.status(500).json({error:'audit_api_error'});
  }
};
