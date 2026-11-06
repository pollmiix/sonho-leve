(() => {
  'use strict';
  const original=document.getElementById('add-to-cart');
  const panel=document.querySelector('.product-info');
  const quantity=document.getElementById('quantity');
  const color=document.getElementById('product-color');
  if(!original||!panel||!quantity||!color)return;
  const bar=document.createElement('aside');bar.className='sticky-purchase';bar.hidden=true;bar.setAttribute('aria-label','Compra rápida do produto');
  const inner=document.createElement('div');inner.className='sticky-purchase-inner';
  const details=document.createElement('div');details.className='sticky-purchase-details';
  const price=document.createElement('strong');price.id='sticky-purchase-total';
  const choice=document.createElement('span');choice.id='sticky-purchase-choice';
  details.append(price,choice);
  const buy=document.createElement('button');buy.id='sticky-buy';buy.type='button';buy.textContent='COMPRAR AGORA';
  const feedback=document.createElement('p');feedback.className='sticky-purchase-feedback';feedback.setAttribute('role','status');
  inner.append(details,buy,feedback);bar.append(inner);document.body.append(bar);
  let frame;
  function update(){
    frame=undefined;
    const product=window.ShopProducts[color.value];
    const count=Math.max(1,Math.min(10,Math.floor(Number(quantity.value)||1)));
    price.textContent=window.ShopCart.money(product.price*count);
    choice.textContent=product.variant+' · '+count+(count===1?' unidade':' unidades');
    const rect=original.getBoundingClientRect();
    const visible=rect.top>=0&&rect.bottom<=window.innerHeight;
    bar.hidden=window.scrollY<140||visible||!!document.querySelector('dialog[open]');
    document.body.classList.toggle('has-sticky-purchase',!bar.hidden);
  }
  function schedule(){if(frame===undefined)frame=requestAnimationFrame(update);}
  function measure(){
    panel.style.setProperty('--purchase-sticky-top',Math.min(20,window.innerHeight-panel.offsetHeight-20)+'px');
    schedule();
  }
  buy.addEventListener('click',()=>{feedback.textContent='';original.click();feedback.textContent=document.getElementById('cart-message')?.textContent||'';});
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',measure);
  window.addEventListener('pageshow',measure);
  quantity.addEventListener('input',schedule);quantity.addEventListener('change',schedule);color.addEventListener('change',schedule);
  panel.addEventListener('click',schedule);
  document.addEventListener('toggle',schedule,true);document.addEventListener('close',schedule,true);
  new ResizeObserver(measure).observe(panel);
  measure();update();
})();
