const {describe,it,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {
  ownerPasscodeRequired,
  ownerAuthOpen,
  openOwnerSession,
  ownerAuthenticated,
  requireOwnerAuth
}=require('./owner-auth');

const FLAG='OWNER_PORTAL_PASSCODE_REQUIRED';
const previous=process.env[FLAG];

function setFlag(value){
  if(value==null)delete process.env[FLAG];
  else process.env[FLAG]=value;
}

beforeEach(()=>setFlag(undefined));
afterEach(()=>{
  if(previous==null)delete process.env[FLAG];
  else process.env[FLAG]=previous;
});

describe('ownerPasscodeRequired',()=>{
  it('defaults off so Preview and Production stay open without new secrets',()=>{
    setFlag(undefined);
    assert.equal(ownerPasscodeRequired(),false);
    assert.equal(ownerAuthOpen(),true);
  });
  it('treats empty and 0 as open',()=>{
    setFlag('');
    assert.equal(ownerPasscodeRequired(),false);
    setFlag('0');
    assert.equal(ownerPasscodeRequired(),false);
    setFlag('false');
    assert.equal(ownerPasscodeRequired(),false);
  });
  it('turns passcode auth back on for 1 / true / yes / on',()=>{
    for(const value of ['1','true','TRUE','yes','on']){
      setFlag(value);
      assert.equal(ownerPasscodeRequired(),true,value);
      assert.equal(ownerAuthOpen(),false,value);
    }
  });
});

describe('openOwnerSession',()=>{
  it('returns a durable open session when passcode auth is disabled',()=>{
    setFlag(undefined);
    const session=openOwnerSession();
    assert.equal(session.ownerAuthOpen,true);
    assert.equal(session.legacy,true);
    assert.equal(session.user,null);
    assert.equal(session.token,null);
  });
  it('returns null when passcode auth is required',()=>{
    setFlag('1');
    assert.equal(openOwnerSession(),null);
  });
});

describe('ownerAuthenticated / requireOwnerAuth',()=>{
  it('allows any request when passcode auth is open, including writes and missing cookies',async()=>{
    setFlag(undefined);
    const req={method:'POST',headers:{}};
    assert.equal(await ownerAuthenticated(req),true);
    const res={
      status(code){this.code=code;return this;},
      json(body){this.body=body;return this;}
    };
    assert.equal(await requireOwnerAuth(req,res),true);
    assert.equal(res.code,undefined);
  });
  it('rejects missing sessions with 401 when passcode auth is required',async()=>{
    setFlag('1');
    const req={method:'GET',headers:{}};
    assert.equal(await ownerAuthenticated(req),false);
    const res={
      status(code){this.code=code;return this;},
      json(body){this.body=body;return this;}
    };
    assert.equal(await requireOwnerAuth(req,res),false);
    assert.equal(res.code,401);
    assert.deepEqual(res.body,{error:'unauthorized'});
  });
});
