const PREVIEW_PASSWORD_FREE_UNTIL='2026-09-06T02:25:00.000Z';
const PREVIEW_PASSWORD_FREE_UNTIL_MS=Date.parse(PREVIEW_PASSWORD_FREE_UNTIL);

function previewPasswordFreeActive(req){
  return process.env.VERCEL_ENV==='preview'
    && String(req?.method||'GET').toUpperCase()==='GET'
    && Date.now()<PREVIEW_PASSWORD_FREE_UNTIL_MS;
}

function previewPasswordFreeSession(req){
  if(!previewPasswordFreeActive(req))return null;
  return {
    token:null,
    userId:null,
    legacy:false,
    temporaryBypass:true,
    createdAt:new Date().toISOString(),
    expiresAt:PREVIEW_PASSWORD_FREE_UNTIL,
    user:{
      id:null,
      name:'Temporary Preview Access',
      email:'preview-access@cjtrealty.local',
      role:'admin',
      active:true,
      mustChangePassword:false,
      temporaryBypass:true
    }
  };
}

module.exports={PREVIEW_PASSWORD_FREE_UNTIL,previewPasswordFreeActive,previewPasswordFreeSession};
