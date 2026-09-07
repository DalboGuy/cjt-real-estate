const {describe,it,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');
const {
  DEFAULT_API_BASE_URL,
  assertSendConfigured,
  assertWebhookConfigured,
  buildCreateDocumentBody,
  buildPrefillWidgets,
  createAndSendDocument,
  documentIdFromEvent,
  extractDocumentRef,
  isVerifiedCompletion,
  parseWebhookPayload,
  quoteFields,
  rawBodyOf,
  verifyWebhookSignature
}=require('./opensign');

const ENV_KEYS=['OPENSIGN_API_TOKEN','OPENSIGN_API_BASE_URL','OPENSIGN_TEMPLATE_ID','OPENSIGN_SIGNER_ROLE','OPENSIGN_SENDER_NAME','OPENSIGN_WEBHOOK_SECRET'];
const saved={};

function setEnv(map){
  for(const key of ENV_KEYS){
    if(map[key]==null) delete process.env[key];
    else process.env[key]=map[key];
  }
}

beforeEach(()=>{
  for(const key of ENV_KEYS) saved[key]=process.env[key];
});
afterEach(()=>{
  for(const key of ENV_KEYS){
    if(saved[key]==null) delete process.env[key];
    else process.env[key]=saved[key];
  }
});

const reservation={
  reservationId:'DB-20260910-TEST01',
  guestName:'Ada Lovelace',
  guestEmail:'ada.test@example.com',
  guestPhone:'4095550100',
  guests:4,
  checkin:'2026-09-10',
  checkout:'2026-09-13',
  quote:{
    lodgingSubtotal:1000,
    cleaningFee:240,
    taxes:186,
    total:1426,
    nights:3,
    currency:'USD',
    quoteVersion:'seasonal-v2',
    paymentSchedule:{mode:'split',dueAtBooking:713,remainingBalance:713,balanceDueDate:'2026-08-11'}
  }
};

describe('assertSendConfigured',()=>{
  it('fails closed when the API token is missing',()=>{
    setEnv({OPENSIGN_TEMPLATE_ID:'tmpl_1'});
    assert.throws(()=>assertSendConfigured(),error=>{
      assert.equal(error.code,'opensign_not_configured');
      assert.equal(error.status,503);
      return true;
    });
  });
  it('fails closed when the template id is missing',()=>{
    setEnv({OPENSIGN_API_TOKEN:'token'});
    assert.throws(()=>assertSendConfigured(),error=>{
      assert.equal(error.code,'opensign_template_missing');
      assert.equal(error.status,503);
      return true;
    });
  });
  it('accepts token plus template and defaults to sandbox v1.2',()=>{
    setEnv({OPENSIGN_API_TOKEN:'token',OPENSIGN_TEMPLATE_ID:'tmpl_1'});
    const config=assertSendConfigured();
    assert.equal(config.apiBaseUrl,DEFAULT_API_BASE_URL);
    assert.equal(config.signerRole,'Guest');
  });
});

describe('buildCreateDocumentBody',()=>{
  it('fills signer email, dates, guests, and quoted totals without live emails',()=>{
    setEnv({OPENSIGN_API_TOKEN:'token',OPENSIGN_TEMPLATE_ID:'tmpl_1',OPENSIGN_SIGNER_ROLE:'Guest'});
    const body=buildCreateDocumentBody(reservation);
    assert.equal(body.send_email,true);
    assert.equal(body.signers[0].email,'ada.test@example.com');
    assert.equal(body.signers[0].name,'Ada Lovelace');
    assert.equal(body.signers[0].role,'Guest');
    const names=Object.fromEntries(body.signers[0].widgets.map(w=>[w.name,w.default]));
    assert.equal(names.reservation_id,'DB-20260910-TEST01');
    assert.equal(names.checkin,'2026-09-10');
    assert.equal(names.checkout,'2026-09-13');
    assert.equal(names.guests,'4');
    assert.equal(names.quote_total,'1426.00');
    assert.equal(names.lodging_subtotal,'1000.00');
    assert.match(body.title,/DB-20260910-TEST01/);
    const quoted=quoteFields(reservation.quote);
    assert.equal(quoted.dueAtBooking,'713.00');
  });
  it('omits empty widgets so a missing quote does not invent amounts',()=>{
    const {widgets}=buildPrefillWidgets({
      reservationId:'DB-NONE',
      guestName:'Bo',
      guestEmail:'bo.test@example.com',
      guests:2,
      checkin:'2026-10-01',
      checkout:'2026-10-04',
      quote:null
    });
    assert.ok(!widgets.some(w=>w.name==='quote_total'));
    assert.equal(widgets.find(w=>w.name==='name').default,'Bo');
  });
});

describe('extractDocumentRef',()=>{
  it('reads official objectId and signurl fields',()=>{
    const ref=extractDocumentRef({objectId:'kpeg6Q2rO7',signurl:'https://sandbox.opensignlabs.com/login/kpeg6Q2rO7'});
    assert.equal(ref.documentId,'kpeg6Q2rO7');
    assert.equal(ref.signingUrl,'https://sandbox.opensignlabs.com/login/kpeg6Q2rO7');
  });
});

describe('createAndSendDocument',()=>{
  it('POSTs /createdocument/:template_id with x-api-token and stores the returned id',async()=>{
    setEnv({OPENSIGN_API_TOKEN:'sandbox-token',OPENSIGN_TEMPLATE_ID:'tmpl_abc',OPENSIGN_API_BASE_URL:'https://sandbox.opensignlabs.com/api/v1.2'});
    const calls=[];
    const fetchImpl=async(url,options)=>{
      calls.push({url,options});
      return {ok:true,status:200,json:async()=>({objectId:'doc_123',signurl:'https://example.test/sign/doc_123'})};
    };
    const sent=await createAndSendDocument(reservation,{fetchImpl});
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://sandbox.opensignlabs.com/api/v1.2/createdocument/tmpl_abc');
    assert.equal(calls[0].options.headers['x-api-token'],'sandbox-token');
    assert.equal(calls[0].options.method,'POST');
    const posted=JSON.parse(calls[0].options.body);
    assert.equal(posted.signers[0].email,'ada.test@example.com');
    assert.equal(sent.documentId,'doc_123');
    assert.equal(sent.quoteTotal,'1426.00');
  });
  it('does not treat a failed OpenSign response as sent',async()=>{
    setEnv({OPENSIGN_API_TOKEN:'sandbox-token',OPENSIGN_TEMPLATE_ID:'tmpl_abc'});
    const fetchImpl=async()=>({ok:false,status:401,json:async()=>({error:'Invalid API Token!'})});
    await assert.rejects(()=>createAndSendDocument(reservation,{fetchImpl}),error=>{
      assert.equal(error.code,'opensign_request_failed');
      assert.equal(error.status,502);
      return true;
    });
  });
});

describe('webhook verification',()=>{
  const payload={
    event:'completed',
    type:'request-sign',
    objectId:'kpeg6Q2rO7',
    completedAt:'Fri, 16 May 2025 16:18:35 GMT+5:30',
    signers:[{name:'Ada Lovelace',email:'ada.test@example.com'}]
  };
  const raw=JSON.stringify(payload);

  it('accepts HMAC-SHA256 of the raw body',()=>{
    setEnv({OPENSIGN_WEBHOOK_SECRET:'webhook-secret'});
    const signature=crypto.createHmac('sha256','webhook-secret').update(raw).digest('hex');
    assert.equal(verifyWebhookSignature(raw,signature,'webhook-secret'),true);
  });
  it('rejects a tampered body',()=>{
    setEnv({OPENSIGN_WEBHOOK_SECRET:'webhook-secret'});
    const signature=crypto.createHmac('sha256','webhook-secret').update(raw).digest('hex');
    assert.throws(()=>verifyWebhookSignature(raw.replace('completed','viewed'),signature,'webhook-secret'),error=>{
      assert.equal(error.code,'invalid_webhook_signature');
      return true;
    });
  });
  it('fails closed when the webhook secret is missing',()=>{
    setEnv({});
    assert.throws(()=>assertWebhookConfigured(),error=>{
      assert.equal(error.code,'opensign_webhook_not_configured');
      assert.equal(error.status,503);
      return true;
    });
  });
  it('treats completed as verified completion and ignores viewed/signed',()=>{
    assert.equal(isVerifiedCompletion(parseWebhookPayload(raw)),true);
    assert.equal(documentIdFromEvent(payload),'kpeg6Q2rO7');
    assert.equal(isVerifiedCompletion({event:'viewed',objectId:'kpeg6Q2rO7'}),false);
    assert.equal(isVerifiedCompletion({event:'signed',objectId:'kpeg6Q2rO7'}),false);
    assert.equal(isVerifiedCompletion({event:'completed'}),false);
  });
  it('verifies a parsed JSON body the same way Vercel may deliver it',()=>{
    setEnv({OPENSIGN_WEBHOOK_SECRET:'webhook-secret'});
    const serialized=JSON.stringify(payload);
    const signature=crypto.createHmac('sha256','webhook-secret').update(serialized).digest('hex');
    const asDelivered=rawBodyOf({body:payload});
    assert.equal(asDelivered,serialized);
    assert.equal(verifyWebhookSignature(asDelivered,signature,'webhook-secret'),true);
  });
});
