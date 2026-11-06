'use strict';
// Local browser regression checks. No external gateway or real customer data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.webp':'image/webp'};
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  let filename;
  try { filename = path.resolve(root,'.'+decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (!filename.startsWith(root+path.sep) || path.relative(root,filename).split(path.sep).some(p => p.startsWith('.')) || filename.endsWith('.php')) { res.writeHead(404).end(); return; }
  fs.readFile(filename,(error,data) => { if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(filename)] || 'application/octet-stream');res.end(data); });
});
let browser, socket;
const pending = new Map();
const errors = [];
let serial = 0;
function command(method,params={}) {
  const id = ++serial;
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => {pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
  if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression) {
  for(let i=0;i<150;i++){if(await evaluate(expression))return;await pause(50);}
  throw new Error('Condition failed: '+expression);
}
let base;
async function navigate(url) {
  await command('Page.navigate',{url:base+url});
  await until('document.readyState === "complete"');
  await evaluate('document.fonts.ready');
}
function check(ok,message){if(!ok)throw new Error(message);}

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  let port = process.env.BROWSER_CDP_PORT;
  if (!port) {
    const profile = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'.portal-browser-smoke-'));
    const binary = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    browser = spawn(binary,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    browser.on('error',error => console.error(error.message));
    for(let i=0;i<150;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await pause(100);}}
  }
  if(!port)throw new Error('Browser debugging did not start.');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message',event => {
    const message = JSON.parse(event.data);
    if(message.id){const entry=pending.get(message.id);if(entry){clearTimeout(entry.timer);pending.delete(message.id);message.error?entry.reject(new Error(message.error.message)):entry.resolve(message.result);}}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  await command('Page.enable');await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const checks = [];
  async function run(name,fn){if(process.env.BROWSER_CHECK_FILTER && !name.includes(process.env.BROWSER_CHECK_FILTER))return;try{await fn();checks.push({name,pass:true});console.log('PASS '+name);}catch(error){checks.push({name,pass:false,error:error.message});console.log('FAIL '+name+': '+error.message);}}


  const products=require('../assets/produtos.js');
  const fixtureSource='window.fixtureCalls=[];window.fetch=async(url,options)=>{if(!String(url).startsWith("/api/blackcat"))return window.originalFetch(url,options);fixtureCalls.push({url,options});const data=String(url).includes("action=config")?'+JSON.stringify({enabled:true,unitPrice:1890,shipping:0,states:['SP'],products})+':String(url).includes("action=status")?{status:"PAID",amount:5670,id:"FIXTURE"}:{id:"FIXTURE",amount:5670,status:"PENDING",code:"000201-FIXTURE-NOT-PAYABLE-"+"0123456789ABCDEF".repeat(20),receipt:"fixture-receipt"};return {ok:true,json:async()=>data};};';
  await command('Page.addScriptToEvaluateOnNewDocument',{source:'window.originalFetch=window.fetch.bind(window);'+fixtureSource});
  for (const width of [390,768,1440]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
    await navigate('/relaxsound.html');
    await until('!!window.ShopCart && document.querySelectorAll(".gallery-thumb").length===5');
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Product overflow at '+width);
    check(await evaluate('document.querySelectorAll(".customer-review").length===6 && document.getElementById("reviews-average").textContent==="4.7" && document.getElementById("reviews-count").textContent.includes("122") && [5,4,3,2,1].map(rating=>document.getElementById("review-count-"+rating).textContent).join(",")==="106,7,4,2,3" && document.getElementById("reviews-list").textContent.includes("Rafaela Ferreira") && !document.getElementById("reviews-list").textContent.includes("Verificado")'),'Supplied review cards, counts or average incorrect');
    check(await evaluate('document.querySelector(".review-source-note").textContent.includes("Produtgy")'),'Review source missing');
    const reviewPhotos=await evaluate('Promise.all(Array.from(document.querySelectorAll(".customer-review img"),async image=>{image.loading="eager";await image.decode();return image.naturalWidth>0&&image.naturalHeight>0}))');
    check(reviewPhotos.length===6&&reviewPhotos.every(Boolean),'Review photos missing at '+width);
    check(await evaluate('getComputedStyle(document.querySelector(".store-header")).backgroundColor==="rgb(255, 255, 255)" && !!document.querySelector(".store-search") && document.querySelector(".store-wordmark").textContent.includes("SONHO LEVE") && !document.querySelector(".brand-mark")'),'White store header is missing');
    check(await evaluate('document.getElementById("subtotal").textContent.includes("18,90")'),'Wrong mask price');
    await evaluate('document.querySelectorAll(".color-swatch")[1].click()');
    check(await evaluate('document.getElementById("product-color").value==="relaxsound-cinza" && document.getElementById("selected-color-name").textContent==="Cinza" && document.querySelectorAll(".color-swatch")[1].getAttribute("aria-pressed")==="true" && document.getElementById("main-product-image").getAttribute("src").includes("gallery-1.png")'),'Image color selection not synchronized');
    await evaluate('document.querySelectorAll(".color-swatch")[0].click()');
    if(width>850)check(await evaluate('document.querySelector(".gallery-thumbs").getBoundingClientRect().right<=document.getElementById("main-product-image").getBoundingClientRect().left && document.querySelector(".product-info").getBoundingClientRect().left>document.querySelector(".product-gallery").getBoundingClientRect().right'),'Reference desktop layout incorrect');
    check(await evaluate('document.querySelectorAll(".product-story>img").length===4 && !!document.querySelector(".story-specifications") && document.getElementById("add-to-cart").textContent.includes("COMPRAR AGORA")'),'Sequential description missing');
    if(width>850){
      await evaluate('window.scrollTo({top:1050,behavior:"instant"});new Promise(resolve=>requestAnimationFrame(resolve))');
      check(await evaluate('Math.abs(document.querySelector(".product-info").getBoundingClientRect().top-parseFloat(getComputedStyle(document.querySelector(".product-info")).top))<2'),'Purchase panel did not stay alongside description');
      await evaluate('window.scrollTo({top:0,behavior:"instant"})');
    }
    await evaluate('window.scrollTo({top:document.body.scrollHeight,behavior:"instant"})');
    await until('(()=>{const r=document.getElementById("add-to-cart").getBoundingClientRect();return !document.querySelector(".sticky-purchase").hidden||(r.top>=0&&r.bottom<=innerHeight);})()');
    check(await evaluate('(()=>{const bar=document.querySelector(".sticky-purchase"),button=bar.hidden?document.getElementById("add-to-cart"):document.getElementById("sticky-buy"),r=button.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth+1;})()'),'Purchase action not visible at bottom of page');
    await evaluate('document.getElementById("product-color").value="relaxsound-cinza";document.getElementById("product-color").dispatchEvent(new Event("change"));document.getElementById("quantity").value="2";document.getElementById("quantity").dispatchEvent(new Event("change"))');
    await until('document.getElementById("sticky-purchase-total").textContent.includes("37,80") && document.getElementById("sticky-purchase-choice").textContent.includes("Cinza")');
    if(width===390){const stickyShot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync('compra-fixa-preview.png',Buffer.from(stickyShot.data,'base64'));}
    await evaluate('document.getElementById("product-color").value="relaxsound-preto";document.getElementById("product-color").dispatchEvent(new Event("change"));document.getElementById("quantity").value="1";document.getElementById("quantity").dispatchEvent(new Event("change"));window.scrollTo({top:0,behavior:"instant"})');
    await evaluate('document.querySelectorAll(".gallery-thumb")[1].click();document.getElementById("main-product-image").click()');
    check(await evaluate('document.getElementById("image-dialog").open'),'Zoom not opening');
    await evaluate('document.getElementById("close-image").click()');
    const images=await evaluate('Promise.all(Array.from(document.querySelectorAll("main img")).map(async img=>({src:img.getAttribute("src"),ok:(await originalFetch(img.src)).ok})))');
    check(images.every(image=>image.ok),'Broken image '+JSON.stringify(images));
    for(const route of ['/loja.html','/','/carrinho-loja.html']){await navigate(route);check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Layout overflow at '+route+' '+width);if(route==='/')check(await evaluate('!!document.getElementById("add-to-cart") && !!document.getElementById("product-color") && !document.getElementById("catalog-grid") && !document.body.textContent.includes("modalidades")'),'Home must contain only the physical product page');}
    console.log('PASS product, gallery, image downloads and page widths at '+width+'px');
  }
  await navigate('/relaxsound.html');
  await evaluate('document.getElementById("open-review").click()');
  check(await evaluate('document.getElementById("review-dialog").open'),'Review form did not open');
  await evaluate('const form=document.getElementById("review-form");form.elements.name.value="Pessoa Teste";form.elements.comment.value="Comentario de teste local sobre o produto.";form.elements.rating.value="5";form.requestSubmit()');
  check(await evaluate('!document.getElementById("review-dialog").open && document.getElementById("review-draft-status").textContent.includes("Ainda") && document.querySelectorAll(".customer-review").length===6'),'Private review draft was published or not saved');
  await evaluate('document.getElementById("open-review").click()');
  check(await evaluate('document.getElementById("review-form").elements.rating.value==="5" && document.getElementById("review-form").elements.name.value==="Pessoa Teste"'),'Review draft not restored');
  await evaluate('document.getElementById("close-review").click()');
  console.log('PASS supplied public review cards, draft form and draft recovery');
  await navigate('/relaxsound.html?cor=cinza');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('localStorage.clear();sessionStorage.clear();document.getElementById("quantity").value="2";document.getElementById("quantity").dispatchEvent(new Event("change"));window.scrollTo({top:document.body.scrollHeight,behavior:"instant"})');
  await until('!document.querySelector(".sticky-purchase").hidden');
  await evaluate('document.getElementById("sticky-buy").click()');
  await until('location.pathname.endsWith("carrinho-loja.html") && !!window.ShopCart');
  check(await evaluate('ShopCart.read().length===1 && ShopCart.read()[0].id==="relaxsound-cinza" && ShopCart.read()[0].quantity===2 && ShopCart.total(ShopCart.read())===3780'),'Fixed purchase button ignored selected color or quantity');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  console.log('PASS always-visible purchase button and selected variant subtotal');
  await navigate('/relaxsound.html');
  await evaluate('localStorage.clear();sessionStorage.clear();document.getElementById("quantity").value="2";document.getElementById("quantity").dispatchEvent(new Event("change"));document.getElementById("add-to-cart").click()');
  await until('location.pathname.endsWith("carrinho-loja.html") && !!window.ShopCart');
  check(await evaluate('ShopCart.total(ShopCart.read())===3780 && document.querySelector("[data-cart-total]").textContent.includes("37,80")'),'Black mask subtotal wrong');
  for(const width of [390,768,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1 && !!document.querySelector(".cart-table-heading") && document.querySelector(".cart-finish").getAttribute("href")==="checkout-loja.html" && document.querySelector(".cart-continue").getAttribute("href")==="loja.html" && document.querySelectorAll(".cart-benefits article").length===4'),'New populated cart layout failed at '+width);
  }
  await evaluate('Promise.all(Array.from(document.querySelectorAll(".shop-cart-row img")).map(img=>img.decode()))');
  const cartShot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync('carrinho-preview.png',Buffer.from(cartShot.data,'base64'));
  console.log('PASS cart reference layout, summary actions and populated mobile widths');
  await navigate('/relaxsound.html?cor=cinza');
  check(await evaluate('document.getElementById("product-color").value==="relaxsound-cinza"'),'Color URL not honored');
  await evaluate('document.getElementById("add-to-cart").click()');
  await until('location.pathname.endsWith("carrinho-loja.html") && !!window.ShopCart');
  check(await evaluate('document.querySelectorAll(".shop-cart-row").length===2 && ShopCart.total(ShopCart.read())===5670'),'Mixed cart incorrect');
  await evaluate('document.querySelector(".shop-line-controls button").click()');
  check(await evaluate('ShopCart.total(ShopCart.read())===3780'),'Quantity decrease failed');
  await evaluate('document.querySelectorAll(".shop-line-controls button")[1].click()');
  await navigate('/carrinho-loja.html');
  check(await evaluate('ShopCart.total(ShopCart.read())===5670'),'Quantity persistence failed');
  console.log('PASS mixed cart, colors, quantity changes and persistence');
  await navigate('/checkout-loja.html');
  await until('!!document.getElementById("payment-fields") && !document.getElementById("payment-fields").disabled');
  check(await evaluate('document.getElementById("generate-pix").disabled && document.getElementById("delivery-body").hidden && document.getElementById("payment-body").hidden'),'Checkout stages not initially locked');
  for(const width of [390,768,1440]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Checkout overflow at '+width);}
  await evaluate('Promise.all(Array.from(document.querySelectorAll(".shop-cart-row img")).map(img=>img.decode()))');
  const checkoutShot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync('checkout-preview.png',Buffer.from(checkoutShot.data,'base64'));
  check(await evaluate('document.getElementById("payment-total").textContent.includes("56,70") && document.querySelectorAll(".shop-cart-row").length===2'),'Checkout total incorrect');
  await evaluate('document.getElementById("go-delivery").click()');
  check(await evaluate('document.getElementById("delivery-body").hidden && fixtureCalls.every(c=>c.options?.method!=="POST")'),'Blank identification advanced');
  await evaluate('for(const [key,value] of Object.entries({name:"Pessoa Teste",email:"fixture@example.com",phone:"11999999999",cpf:"11111111111"}))document.getElementById("payment-form").elements[key].value=value;document.getElementById("go-delivery").click()');
  check(await evaluate('document.getElementById("delivery-body").hidden && document.getElementById("identification-feedback").textContent.includes("CPF")'),'Invalid CPF advanced');
  await evaluate('document.getElementById("payment-form").elements.cpf.value="52998224725";document.getElementById("go-delivery").click()');
  check(await evaluate('!document.getElementById("delivery-body").hidden && document.getElementById("identification-body").hidden && document.getElementById("generate-pix").disabled'),'Delivery step not unlocked');
  await evaluate('document.getElementById("go-payment").click()');
  check(await evaluate('document.getElementById("payment-body").hidden'),'Blank delivery advanced');
  await evaluate('for(const [key,value] of Object.entries({zipCode:"01001000",street:"Rua Teste",number:"1",neighborhood:"Centro",city:"Cidade",state:"SP"}))document.getElementById("payment-form").elements[key].value=value;document.getElementById("go-payment").click()');
  check(await evaluate('!document.getElementById("payment-body").hidden && !document.getElementById("generate-pix").disabled'),'Payment step not unlocked');
  await evaluate('document.getElementById("edit-identification").click()');
  check(await evaluate('!document.getElementById("identification-body").hidden && document.getElementById("generate-pix").disabled'),'Edit identification did not relock payment');
  await evaluate('document.getElementById("go-delivery").click();document.getElementById("go-payment").click();document.getElementById("generate-pix").click()');
  await until('!document.getElementById("pix-result").hidden');
  check(await evaluate('!!document.querySelector("#payment-step #pix-result #pix-qrcode svg") && document.getElementById("generate-pix").hidden && !document.getElementById("copy-pix").disabled && !document.getElementById("check-payment").disabled'),'PIX QR or enabled payment actions missing from payment step');
  await evaluate(fs.readFileSync(path.join(__dirname,'vendor/jsQR.js'),'utf8'));
  const decoded=await evaluate('(async()=>{const svg=document.querySelector("#pix-qrcode svg");const image=new Image();const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:"image/svg+xml"}));try{image.src=url;await image.decode();const canvas=document.createElement("canvas");canvas.width=600;canvas.height=600;const context=canvas.getContext("2d");context.fillStyle="#fff";context.fillRect(0,0,600,600);context.drawImage(image,0,0,600,600);const pixels=context.getImageData(0,0,600,600);return jsQR(pixels.data,600,600)?.data===document.getElementById("pix-code").value;}finally{URL.revokeObjectURL(url);}})()');
  check(decoded,'Rendered QR does not decode to the PIX copy-paste payload');
  await evaluate('window.copiedPix=null;Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{window.copiedPix=value;}}});document.getElementById("copy-pix").click()');
  await until('window.copiedPix===document.getElementById("pix-code").value');
  for(const width of [390,768,1440]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1 && !!document.querySelector("#payment-step #pix-qrcode svg")'),'PIX layout failed at '+width);}
  await evaluate('document.getElementById("payment-step").scrollIntoView({behavior:"instant",block:"start"})');
  const pixShot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync('pix-qr-preview.png',Buffer.from(pixShot.data,'base64'));
  check(await evaluate('JSON.parse(fixtureCalls.find(c=>c.options?.method==="POST").options.body).items.length===2 && fixtureCalls.filter(c=>c.options?.method==="POST").length===1'),'Checkout payload incorrect');
  check(await evaluate('!JSON.stringify({...localStorage,...sessionStorage}).includes("52998224725")'),'Customer CPF persisted');
  check(await evaluate('Array.from(document.querySelectorAll(".checkout-order-items input,.checkout-order-items button")).every(control=>control.disabled)'),'Cart can change while a charge is active');
  await navigate('/checkout-loja.html');
  await until('!document.getElementById("pix-result").hidden');
  check(await evaluate('!!document.querySelector("#payment-step #pix-qrcode svg") && !document.getElementById("copy-pix").disabled && fixtureCalls.every(c=>c.options?.method!=="POST")'),'Saved PIX did not restore its QR without another charge');
  check(await evaluate('document.getElementById("payment-total").textContent.includes("56,70") && document.getElementById("generate-pix").disabled'),'Saved receipt failed');
  await evaluate('ShopCart.setQuantity("relaxsound-preto",1)');
  await navigate('/checkout-loja.html');
  await until('!document.getElementById("pix-result").hidden');
  const recovered=await evaluate('({hidden:document.querySelector("[data-shop-lines]").closest(".cart-panel").hidden,message:document.getElementById("payment-message").textContent,total:document.getElementById("payment-total").textContent,items:ShopCart.read()})');
  check(recovered.hidden&&recovered.message.includes('pedido anterior')&&recovered.total.includes('56,70'),'Old receipt confused with current cart: '+JSON.stringify(recovered));
  console.log('PASS checkout, one fixture charge, saved receipt and changed-cart protection');
  await navigate('/carrinho-loja.html');
  await evaluate('for(const item of ShopCart.read())ShopCart.setQuantity(item.id,0)');
  check(await evaluate('!document.querySelector("[data-cart-empty]").hidden && document.querySelector("[data-cart-content]").hidden'),'Removal or empty state failed');
  await evaluate('localStorage.clear();localStorage.setItem("vasco-pg-fan-cart-v1",JSON.stringify({product:"ventilador",quantity:2}));ShopCart.render()');
  check(await evaluate('ShopCart.total(ShopCart.read())===0'),'Legacy cart not read');
  await evaluate('ShopCart.setQuantity("relaxsound-preto",1)');
  check(await evaluate('ShopCart.total(ShopCart.read())===1890 && localStorage.getItem("vasco-pg-fan-cart-v1")===null'),'Legacy migration failed');
  await evaluate('localStorage.setItem("vasco-pg-shop-cart-v2",JSON.stringify([{id:"ventilador",quantity:2},{id:"relaxsound-preto",quantity:1}]));ShopCart.render()');
  check(await evaluate('ShopCart.read().length===1 && ShopCart.read()[0].id==="relaxsound-preto" && ShopCart.total(ShopCart.read())===1890 && !document.querySelector("main").textContent.includes("Ventilador")'),'Removed fan survived in an existing mixed cart');
  check((await fetch(base+'/ventilador.html')).status===404,'Removed product page remains accessible');
  console.log('PASS remove, empty state and retired product excluded from old carts');
  await navigate('/loja.html?q=relaxsound');
  check(await evaluate('Array.from(document.querySelectorAll(".store-item")).filter(card=>!card.hidden).length===1 && !document.getElementById("store-search-summary").hidden'),'Search did not filter products');
  await navigate('/loja.html?q=no-such-product');
  check(await evaluate('!document.getElementById("store-search-empty").hidden && Array.from(document.querySelectorAll(".store-item")).every(card=>card.hidden)'),'Search empty state missing');
  await navigate('/loja.html');
  check(await evaluate('document.querySelectorAll(".store-item").length===1 && Array.from(document.querySelectorAll(".store-item")).every(card=>!card.hidden) && !!document.getElementById("sobre-loja")'),'Store navigation or clear search failed');
  await evaluate('document.getElementById("store-search-query").value="relaxsound";document.querySelector(".store-search button").click()');
  await until('location.search.includes("relaxsound") && document.readyState==="complete"');
  check(await evaluate('Array.from(document.querySelectorAll(".store-item")).filter(card=>!card.hidden).length===1 && document.getElementById("store-search-query").value==="relaxsound"'),'Search form failed');
  console.log('PASS white header, search form, filtered products and empty state');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('/relaxsound.html');
  await evaluate('Promise.all(Array.from(document.querySelectorAll("main img")).map(async img=>{img.loading="eager";await img.decode();}))');
  const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync('relaxsound-preview.png',Buffer.from(shot.data,'base64'));
  check(errors.length===0,JSON.stringify(errors));console.log('PASS no browser exceptions');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Browser check ended'));}pending.clear();
  if(socket){try{await command('Browser.close');}catch{}socket.close();}
  if(browser)browser.kill();server.close();
});
