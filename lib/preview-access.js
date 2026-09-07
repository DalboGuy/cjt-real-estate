const {ownerAuthOpen,openOwnerSession}=require('./owner-auth');

// Replaced the expired Preview datetime bypass. Owner portal access is
// controlled by lib/owner-auth.js (open by default; set
// OWNER_PORTAL_PASSCODE_REQUIRED=1 to restore passcode checks).
function previewPasswordFreeActive(){
  return ownerAuthOpen();
}
function previewPasswordFreeSession(){
  return openOwnerSession();
}

module.exports={
  PREVIEW_PASSWORD_FREE_UNTIL:null,
  previewPasswordFreeActive,
  previewPasswordFreeSession
};
