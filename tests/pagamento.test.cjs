'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeHandler}=require('../api/blackcat.js');
const env={BLACKCAT_API_KEY:'fixture-key',PAYMENT_TOKEN_SECRET:'fixture-secret-that-is-at-least-32-characters',PAYMENT_SITE_URL:'https://store.example',PAYMENT_SHIPPING_CENTS:'1200',PAYMENT_ALLOWED_STATES:'SP,RJ'};
const body=()=>({items:[{id:"relaxsound-preto",quantity:2}],amount:1,customer:{name:'Pessoa Teste',email:'fixture@example.com',phone:'11999999999',cpf:'52998224725'},shipping:{street:'Rua Teste',number:'1',neighborhood:'Centro',city:'Cidade',state:'SP',zipCode:'01001000'}});
async function call(handler,{method='POST',url='/api/blackcat',data=body(),origin=env.PAYMENT_SITE_URL,contentType='application/json'}={}){
  const req={method,url,headers:{origin,'content-type':contentType},body:data};
  const result={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
  await handler(req,result);return result;
}
const fixture=(amount=4980,status='PENDING')=>({ok:true,json:async()=>({success:true,data:{transactionId:'TXN-FIXTURE',amount,status,paymentData:{copyPaste:'000201-FIXTURE-NOT-PAYABLE'}}})});
test('disabled without configuration; no provider call',async()=>{
  let called=false;const h=makeHandler({env:{},request:async()=>{called=true;}});
  assert.equal((await call(h)).code,503);assert.equal(called,false);
});
test('server recalculates physical product, quantity and shipping; key stays server-side',async()=>{
  let payload,headers;const h=makeHandler({env,request:async(url,options)=>{assert.equal(url,'https://api.blackcatoficial.com/api/sales/create-sale');payload=JSON.parse(options.body);headers=options.headers;return fixture();}});
  const r=await call(h);assert.equal(r.code,201);assert.equal(payload.amount,4980);assert.equal(payload.items[0].unitPrice,1890);assert.equal(payload.items[0].tangible,true);assert.equal(payload.shipping.state,'SP');assert.equal(headers['X-API-Key'],env.BLACKCAT_API_KEY);assert.ok(r.data.receipt);assert.ok(!JSON.stringify(r.data).includes(env.BLACKCAT_API_KEY));assert.equal(r.headers['Cache-Control'],'no-store');
});
test('rejects malformed quantity, CPF, shipping, origin and content type before provider',async()=>{
  let calls=0;const h=makeHandler({env,request:async()=>{calls++;return fixture();}});
  for(const change of [b=>b.items[0].quantity=0,b=>b.items[0].quantity=1.5,b=>b.items[0].quantity=11,b=>b.customer.cpf='11111111111',b=>b.shipping.state='MG',b=>b.shipping.zipCode='123',b=>b.customer=null]){const b=body();change(b);assert.equal((await call(h,{data:b})).code,400);}
  assert.equal((await call(h,{origin:'https://evil.example'})).code,403);
  assert.equal((await call(h,{contentType:'text/plain'})).code,415);assert.equal(calls,0);
});
test('signed status consults provider and rejects tampered receipts and mismatched totals',async()=>{
  let status=false,calls=0;
  const h=makeHandler({env,request:async()=>{calls++;return fixture(4980,status?'PAID':'PENDING');}});
  const created=await call(h);status=true;
  const url='/api/blackcat?action=status&receipt='+encodeURIComponent(created.data.receipt);
  const paid=await call(h,{method:'GET',url});assert.equal(paid.code,200);assert.equal(paid.data.status,'PAID');
  const before=calls;assert.equal((await call(h,{method:'GET',url:url+'x'})).code,400);assert.equal(calls,before);
  const wrong=makeHandler({env,request:async()=>fixture(1,'PAID')});assert.equal((await call(wrong,{method:'GET',url})).code,502);
});
test('provider timeout and errors never report paid or leak upstream details',async()=>{
  for(const request of [async()=>{throw Error('private upstream detail');},async()=>({ok:false,json:async()=>({error:'private upstream detail'})}),async()=>fixture(1),async()=>fixture(4980,'INVENTED')]){
    const r=await call(makeHandler({env,request}));assert.equal(r.code,502);assert.ok(!JSON.stringify(r.data).includes('private upstream detail'));assert.equal(r.data.status,undefined);
  }
});
test('configuration exposes only public values; explicit zero shipping supported',async()=>{
  const r=await call(makeHandler({env:{...env,PAYMENT_SHIPPING_CENTS:'0'}}),{method:'GET',url:'/api/blackcat?action=config'});
  const {products,...configuration}=r.data;
  assert.deepEqual(configuration,{enabled:true,unitPrice:1890,shipping:0,states:['SP','RJ']});
  assert.equal(products['relaxsound-preto'].price,1890);
  assert.equal(products['relaxsound-cinza'].price,1890);
});
test('approved nationwide free shipping works with only the private key configured',async()=>{
  const minimalEnv={BLACKCAT_API_KEY:'fixture-private-key'};
  const h=makeHandler({env:minimalEnv,request:async()=>fixture(3780)});
  const configuration=await call(h,{method:'GET',url:'/api/blackcat?action=config'});
  assert.equal(configuration.data.shipping,0);assert.equal(configuration.data.states.length,27);
  assert.ok(!JSON.stringify(configuration.data).includes(minimalEnv.BLACKCAT_API_KEY));
  const created=await call(h,{origin:'https://loteria-taupe-iota.vercel.app'});
  assert.equal(created.code,201);assert.equal(created.data.amount,3780);
  const status=await call(h,{method:'GET',url:'/api/blackcat?action=status&receipt='+encodeURIComponent(created.data.receipt)});
  assert.equal(status.code,200);
});
