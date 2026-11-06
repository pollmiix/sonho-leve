'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeHandler}=require('../api/blackcat.js');
const env={BLACKCAT_API_KEY:'fixture-only',PAYMENT_SITE_URL:'https://store.example'};
function body(items){return {items,amount:1,customer:{name:'Pessoa Teste',email:'fixture@example.com',phone:'11999999999',cpf:'52998224725'},shipping:{street:'Rua Teste',number:'1',neighborhood:'Centro',city:'Cidade',state:'SP',zipCode:'01001000'}};}
async function submit(items){
  let payload,calls=0;
  const handler=makeHandler({env,request:async(url,options)=>{
    calls++;payload=JSON.parse(options.body);
    return {ok:true,json:async()=>({success:true,data:{transactionId:'FIXTURE',amount:payload.amount,status:'PENDING',paymentData:{copyPaste:'000201-FIXTURE-NOT-PAYABLE'}}})};
  }});
  const result={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
  await handler({method:'POST',url:'/api/blackcat',headers:{origin:env.PAYMENT_SITE_URL,'content-type':'application/json'},body:body(items)},result);
  return {result,payload,calls};
}
test('mask colors use server prices and SONHO LEVE gateway title',async()=>{const {result,payload}=await submit([{id:'relaxsound-preto',quantity:2,price:1},{id:'relaxsound-cinza',quantity:1}]);assert.equal(result.code,201);assert.equal(payload.amount,5670);assert.deepEqual(payload.items.map(i=>i.unitPrice),[1890,1890]);assert.ok(payload.items.every(i=>i.tangible));assert.ok(payload.items.every(i=>i.title==='SONHO LEVE'));});
test('removed fan cannot create a new charge',async()=>{for(const items of [[{id:'ventilador',quantity:1}],undefined]){const {result,calls}=await submit(items);assert.equal(result.code,400);assert.equal(calls,0);}});
test('two masks total R$37.80 rather than the legacy fan price',async()=>{const {result,payload}=await submit([{id:'relaxsound-preto',quantity:2}]);assert.equal(result.code,201);assert.equal(payload.amount,3780);});
test('invalid products, duplicates and quantities never reach the provider',async()=>{for(const items of [[],null,[{id:'mega-sena',quantity:1}],[{id:'unknown',quantity:1}],[{id:'__proto__',quantity:1}],[{id:'relaxsound-preto',quantity:0}],[{id:'relaxsound-preto',quantity:11}],[{id:'relaxsound-preto',quantity:1.5}],[{id:'relaxsound-preto',quantity:1},{id:'relaxsound-preto',quantity:1}]]){const {result,calls}=await submit(items);assert.equal(result.code,400);assert.equal(calls,0);}});
