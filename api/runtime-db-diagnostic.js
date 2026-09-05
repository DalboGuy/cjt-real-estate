module.exports = async function(req,res){
  try{
    if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
    const raw=process.env.DATABASE_URL||'';
    if(!raw) return res.status(200).json({databaseUrlConfigured:false});
    const u=new URL(raw);
    const info={
      databaseUrlConfigured:true,
      hostname:u.hostname,
      port:u.port||'5432',
      database:u.pathname.replace(/^\//,''),
      sslmode:u.searchParams.get('sslmode')||null,
      ownerPasscodeConfigured:Boolean(process.env.OWNER_PORTAL_PASSCODE),
      bookingComIcalConfigured:Boolean(process.env.BOOKING_COM_ICAL_URL),
      vercelEnvironment:process.env.VERCEL_ENV||null,
      vercelGitCommitRef:process.env.VERCEL_GIT_COMMIT_REF||null,
      vercelGitCommitSha:process.env.VERCEL_GIT_COMMIT_SHA||null
    };
    return res.status(200).json(info);
  }catch(e){
    return res.status(500).json({error:'diagnostic_failed'});
  }
};
