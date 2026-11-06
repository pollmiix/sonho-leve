'use strict';
const {createHmac, timingSafeEqual, randomUUID} = require('node:crypto');
const BASE = 'https://api.blackcatoficial.com/api';
const PRODUCTS = require('../assets/produtos.js');
const STATES = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const fail = (status, message) => Object.assign(new Error(message), {status});
function config(env) {
  let origin;
  try { const url = new URL(env.PAYMENT_SITE_URL || 'https://loteria-taupe-iota.vercel.app'); if(url.protocol !== 'https:' || url.username || url.password) throw Error(); origin = url.origin; } catch { throw fail(503,'Pagamento aguardando configuração do servidor.'); }
  const shippingValue=env.PAYMENT_SHIPPING_CENTS ?? '0';
  const shipping = Number(shippingValue);
  const states = (env.PAYMENT_ALLOWED_STATES || STATES.join(',')).split(',').map(s=>s.trim());
  if(!env.BLACKCAT_API_KEY || (env.PAYMENT_TOKEN_SECRET && env.PAYMENT_TOKEN_SECRET.length < 32) || !/^\d+$/.test(shippingValue) || !Number.isSafeInteger(shipping) || shipping > 100000 || states.some(s=>!STATES.includes(s))) throw fail(503,'Pagamento aguardando configuração do servidor.');
  const secret=env.PAYMENT_TOKEN_SECRET || createHmac('sha256',env.BLACKCAT_API_KEY).update('vasco-pg:blackcat:receipt-key:v1').digest('hex');
  return {origin, shipping, states, secret};
}
function sign(data, secret) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}
function verify(token, secret) {
  if(typeof token !== 'string' || token.length > 3000) throw fail(400,'Recibo inválido.');
  const [body,signature,...extra] = token.split('.');
  const expected = createHmac('sha256',secret).update(body || '').digest('base64url');
  if(extra.length || typeof signature !== 'string' || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw fail(400,'Recibo inválido.');
  let data; try {data=JSON.parse(Buffer.from(body,'base64url'));} catch {throw fail(400,'Recibo inválido.');}
  if(!data.id || !Number.isSafeInteger(data.amount) || !Number.isFinite(data.expires) || data.expires < Date.now()) throw fail(400,'Recibo expirado ou inválido. Consulte o vendedor.');
  return data;
}
function textField(value, min, max) {
  if(typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\x00-\x1f]/.test(value)) throw fail(400,'Confira os dados obrigatórios do comprador e da entrega.');
  return value.trim();
}
function cpfValid(cpf) {
  if(!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  for(let n=9;n<11;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);const digit=(sum*10)%11; if((digit===10?0:digit)!==Number(cpf[n]))return false;}
  return true;
}
function sale(body, cfg) {
  const requestedItems=body.items;
  if(!Array.isArray(requestedItems) || !requestedItems.length || requestedItems.length>Object.keys(PRODUCTS).length) throw fail(400,'Confira os produtos do carrinho.');
  const seen=new Set();
  const productItems=requestedItems.map(item=>{
    if(!item || typeof item.id!=='string' || !Object.hasOwn(PRODUCTS,item.id) || seen.has(item.id) || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>10) throw fail(400,'Produto inválido ou quantidade fora do limite de 1 a 10.');
    seen.add(item.id);
    const product=PRODUCTS[item.id];
    return {title:'SONHO LEVE',unitPrice:product.price,quantity:item.quantity,tangible:true};
  });
  const c = body.customer || {}, s = body.shipping || {};
  const customer = {name:textField(c.name,3,100), email:textField(c.email,5,150), phone:textField(c.phone,10,11), document:{type:'cpf', number:textField(c.cpf,11,11)}};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || !/^\d{10,11}$/.test(customer.phone) || !cpfValid(customer.document.number)) throw fail(400,'Confira e-mail, telefone e CPF.');
  const shipping = {name:customer.name};
  for(const field of ['street','number','neighborhood','city','state','zipCode']) shipping[field]=textField(s[field],1,field==='state'?2:120);
  shipping.complement=s.complement?textField(s.complement,1,100):'';
  if(!/^\d{8}$/.test(shipping.zipCode) || !cfg.states.includes(shipping.state)) throw fail(400,'Confira o CEP e se o estado está na região atendida.');
  const items=productItems;
  if(cfg.shipping)items.push({title:'Frete',unitPrice:cfg.shipping,quantity:1,tangible:false});
  return {amount:productItems.reduce((sum,item)=>sum+(item.tangible?item.unitPrice*item.quantity:0),0)+cfg.shipping,currency:'BRL',paymentMethod:'pix',items,customer,shipping,pix:{expiresInDays:1},externalRef:'VP-'+randomUUID()};
}
function makeHandler({env=process.env, request=globalThis.fetch}={}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>res.status(status).json(data);
    try {
      if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');throw fail(405,'Método não permitido.');}
      const cfg=config(env);
      const url = new URL(req.url,cfg.origin);
      if(req.method==='GET' && url.searchParams.get('action')==='config') return send(200,{enabled:true,unitPrice:1890,shipping:cfg.shipping,states:cfg.states,products:Object.fromEntries(Object.values(PRODUCTS).map(p=>[p.id,{price:p.price,name:p.name,variant:p.variant}]))});
      let payload, receipt, endpoint;
      if(req.method==='POST') {
        if(req.headers.origin !== cfg.origin) throw fail(403,'Origem não permitida.');
        if(!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw fail(415,'Envie JSON.');
        if(Number(req.headers['content-length'])>16384) throw fail(413,'Dados muito grandes.');
        let body=req.body;
        if(Buffer.isBuffer(body))body=body.toString('utf8');
        if(typeof body==='string'){if(Buffer.byteLength(body)>16384)throw fail(413,'Dados muito grandes.');try{body=JSON.parse(body);}catch{throw fail(400,'JSON inválido.');}}
        if(!body || typeof body!=='object' || Array.isArray(body))throw fail(400,'Dados inválidos.');
        if(Buffer.byteLength(JSON.stringify(body))>16384)throw fail(413,'Dados muito grandes.');
        payload=sale(body,cfg); endpoint='/sales/create-sale';
      } else {
        if(url.searchParams.get('action')!=='status')throw fail(404,'Rota não encontrada.');
        receipt=verify(url.searchParams.get('receipt'),cfg.secret);
        endpoint='/sales/'+encodeURIComponent(receipt.id)+'/status';
      }
      let response, result;
      try {
        response=await request(BASE+endpoint,{method:payload?'POST':'GET',headers:{'Content-Type':'application/json','X-API-Key':env.BLACKCAT_API_KEY},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});
        result=await response.json();
      } catch {throw fail(502,payload?'Não foi possível confirmar a criação. Não gere outro PIX; consulte o vendedor para evitar duplicidade.':'Não foi possível consultar o pagamento. Tente consultar novamente.');}
      if(!response.ok || result.success!==true) throw fail(502,payload?'O provedor não confirmou a cobrança. Consulte o vendedor antes de tentar novamente.':'Consulta indisponível no provedor.');
      const d=result.data;
      const amount=payload?payload.amount:receipt.amount;
      if(!d || d.amount!==amount || typeof d.transactionId!=='string' || !d.transactionId || (receipt && d.transactionId!==receipt.id)) throw fail(502,'Resposta inconsistente do provedor. Consulte o vendedor.');
      if(!['PENDING','PAID','CANCELLED','REFUNDED','EXPIRED','REJECTED'].includes(d.status))throw fail(502,'Status não reconhecido. Consulte o vendedor.');
      if(!payload)return send(200,{status:d.status,amount,id:d.transactionId});
      const code=d.paymentData?.copyPaste || d.paymentData?.qrCode;
      if(typeof code!=='string' || !code.startsWith('000201') || code.length>4096)throw fail(502,'PIX não confirmado. Consulte o vendedor antes de gerar outro.');
      return send(201,{id:d.transactionId,amount,status:d.status,code,receipt:sign({id:d.transactionId,amount,expires:Date.now()+7*86400000},cfg.secret)});
    } catch(error) {return send(error.status || 500,{error:error.status?error.message:'Falha interna ao processar o pagamento.'});}
  };
}
module.exports=makeHandler();
module.exports.makeHandler=makeHandler;
