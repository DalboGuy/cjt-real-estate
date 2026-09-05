const {db,ensureSchema}=require('../lib/db');
const {requireAdmin}=require('../lib/auth');

module.exports=async function(req,res){
  try{
    await ensureSchema();
    const session=await requireAdmin(req,res);
    if(!session)return;
    if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
    const sql=db();
    const users=await sql`
      SELECT id,name,email,role,active,must_change_password,created_at,updated_at,
             (SELECT max(s.created_at) FROM owner_sessions s WHERE s.user_id=owner_users.id) AS last_session_at,
             (SELECT count(*)::int FROM owner_sessions s WHERE s.user_id=owner_users.id AND s.expires_at>now()) AS active_sessions
      FROM owner_users
      ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END,name,email
      LIMIT 250
    `;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({users,currentUser:session.user});
  }catch(e){
    console.error('admin users api error',e);
    return res.status(500).json({error:'admin_users_api_error'});
  }
};
