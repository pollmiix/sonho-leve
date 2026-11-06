(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const summary=document.querySelector(".order-summary");
  const form=$('payment-form'), money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
  const receiptKey='vasco-pg-pix-v1', lockKey='vasco-pg-pix-attempt-v1';
  let cfg, payment, busy=false, locked=false, step=1;
  function validateFields(names,feedback){
    for(const name of names){const input=form.elements[name];if(!input.reportValidity()){input.focus();return false;}}
    const digits=value=>value.replace(/\D/g,'');
    if(names.includes('cpf')){
      const cpf=digits(form.elements.cpf.value),phone=digits(form.elements.phone.value);
      let valid=/^\d{11}$/.test(cpf)&&!(/^(\d)\1+$/.test(cpf));
      for(let n=9;valid&&n<11;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);const digit=(sum*10)%11;valid=(digit===10?0:digit)===Number(cpf[n]);}
      if(!valid||!/^\d{10,11}$/.test(phone)){$(feedback).textContent='Confira o CPF e o celular com DDD.';return false;}
    }
    if(names.includes('zipCode')&&!/^\d{8}$/.test(digits(form.elements.zipCode.value))){$(feedback).textContent='Informe um CEP com 8 números.';return false;}
    $(feedback).textContent='';return true;
  }
  function setStep(next,focus=true){
    step=next;
    $('identification-body').hidden=step!==1;
    $('edit-identification').hidden=step===1||!!payment||locked;
    $('delivery-step').classList.toggle('step-locked',step===1);
    $('delivery-body').hidden=step!==2;
    $('delivery-hint').hidden=step>=2;
    $('edit-delivery').hidden=step!==3||!!payment||locked;
    $('payment-step').classList.toggle('step-locked',step!==3);
    $('payment-body').hidden=step!==3;
    $('payment-hint').hidden=step===3;
    refresh();
    if(focus){const target=step===1?form.elements.name:step===2?form.elements.zipCode:$('generate-pix');target.focus({preventScroll:true});target.closest('.checkout-step').scrollIntoView({behavior:'smooth',block:'start'});}
  }
  function nextDelivery(){if(!cfg||payment||locked)return;if(validateFields(['name','email','cpf','phone'],'identification-feedback'))setStep(2);}
  function nextPayment(){if(!cfg||payment||locked)return;if(!validateFields(['name','email','cpf','phone'],'identification-feedback')){setStep(1);return;}if(validateFields(['zipCode','street','number','neighborhood','city','state'],'delivery-feedback'))setStep(3);}
  $('go-delivery').addEventListener('click',nextDelivery);
  $('go-payment').addEventListener('click',nextPayment);
  $('edit-identification').addEventListener('click',()=>{if(!payment&&!locked)setStep(1);});
  $('edit-delivery').addEventListener('click',()=>{if(!payment&&!locked)setStep(2);});
  const message=t=>{$('payment-message').textContent=t;};
  const cartItems=()=>window.ShopCart.read();
  const quantity=()=>window.ShopCart.count(cartItems());
  const subtotal=()=>window.ShopCart.total(cartItems());
  const fingerprint=items=>JSON.stringify(items.map(item=>({id:item.id,quantity:item.quantity,unitPrice:window.ShopProducts[item.id].price})).sort((a,b)=>a.id.localeCompare(b.id)));
  function matchesPrices(){return !!cfg&&cartItems().every(item=>cfg.products?.[item.id]?.price===window.ShopProducts[item.id].price);}
  async function api(url,options){
    const response=await fetch(url,{...options,cache:'no-store',signal:AbortSignal.timeout(20000)});
    let data;try{data=await response.json();}catch{throw Error('Pagamento indisponível. Verifique a configuração do servidor.');}
    if(!response.ok)throw Object.assign(Error(data.error || 'Pagamento indisponível.'),{status:response.status});return data;
  }
  function refresh(){
    $('generate-pix').disabled=step!==3 || !cfg || !quantity() || !matchesPrices() || busy || locked || !!payment;
    $('generate-pix').hidden=!!payment;
    $('generate-pix').textContent=busy&&!payment?'GERANDO PIX…':'GERAR PIX';
    if(payment)$('payment-body').hidden=true;
    $('go-delivery').disabled=!cfg||busy||locked||!!payment;
    $('go-payment').disabled=!cfg||busy||locked||!!payment;
    summary.querySelectorAll('.shop-line-controls').forEach(controls=>{
      const input=controls.querySelector('input'),count=Number(input.value),disabled=busy||locked||!!payment;
      input.disabled=disabled;
      controls.querySelectorAll('button').forEach((button,index)=>{button.disabled=disabled||(index===0&&count<=1)||(index===1&&count>=10);});
    });
    const mismatch=payment&&payment.cartFingerprint!==fingerprint(cartItems());
    summary.querySelector('[data-cart-total]').textContent=mismatch?'Pedido anterior':money(subtotal());
    const panel=document.querySelector('[data-shop-lines]')?.closest('.cart-panel');
    if(panel)panel.hidden=!!mismatch;
    if(cfg){$('payment-shipping').textContent=money(cfg.shipping);$('payment-total').textContent=money(payment?payment.amount:subtotal()+cfg.shipping);}
    if(cfg&&!matchesPrices()&&!payment)message('Os preços foram atualizados. Recarregue a página antes de continuar.');
  }
  const statusText={PENDING:'Aguardando pagamento. Consulte novamente após pagar.',PAID:'Pagamento confirmado pela BlackCat. Guarde a referência da transação.',CANCELLED:'Cobrança cancelada. Consulte o vendedor.',REFUNDED:'Pagamento reembolsado.',EXPIRED:'Cobrança expirada. Consulte o vendedor.',REJECTED:'Pagamento recusado. Consulte o vendedor.'};
  function showPayment(){
    $('pix-result').hidden=false;$('pix-code').value=payment.code;
    $('pix-amount').textContent=money(payment.amount);
    $('payment-reference').textContent='Referência: '+payment.id+' · '+money(payment.amount);
    $('payment-fields').disabled=false;
    form.querySelectorAll('#identification-step input,#identification-step button,#delivery-step input,#delivery-step select,#delivery-step button').forEach(control=>{control.disabled=true;});
    setStep(3,false);
    try{
      window.qrcode.stringToBytes=window.qrcode.stringToBytesFuncs['UTF-8'];
      const qr=window.qrcode(0,'M');qr.addData(payment.code,'Byte');qr.make();
      $('pix-qrcode').innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true,title:'QR Code para pagamento PIX'});
      $('pix-qrcode').hidden=false;$('pix-qr-error').hidden=true;
    }catch{
      $('pix-qrcode').replaceChildren();$('pix-qrcode').hidden=true;
      $('pix-qr-error').textContent='Não foi possível exibir o QR Code. Use o PIX copia e cola abaixo para pagar a mesma cobrança.';$('pix-qr-error').hidden=false;
    }
    requestAnimationFrame(()=>$('pix-result').scrollIntoView({behavior:'smooth',block:'start'}));
    message(payment.cartFingerprint===fingerprint(cartItems())?'Cobrança recuperada. Clique em Consultar pagamento para verificar o status atual.':'Esta aba contém uma cobrança de um pedido anterior. O valor exibido pertence àquela cobrança, não ao carrinho atual. Consulte o pagamento ou fale com o vendedor antes de gerar outro PIX.');refresh();
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!cfg || !matchesPrices() || busy || locked || payment || !quantity())return;
    if(step===1){nextDelivery();return;}
    if(step===2){nextPayment();return;}
    if(!validateFields(['name','email','cpf','phone'],'identification-feedback')){setStep(1);return;}
    if(!validateFields(['zipCode','street','number','neighborhood','city','state'],'delivery-feedback')){setStep(2);return;}
    const submittedItems=cartItems();
    const values=Object.fromEntries(new FormData(form)), digits=v=>v.replace(/\D/g,'');
    const customer={name:values.name.trim(),email:values.email.trim(),phone:digits(values.phone),cpf:digits(values.cpf)};
    const shipping=Object.fromEntries(['street','number','complement','neighborhood','city','state','zipCode'].map(k=>[k,values[k].trim()]));shipping.zipCode=digits(shipping.zipCode);
    if(!/^\d{10,11}$/.test(customer.phone) || !/^\d{11}$/.test(customer.cpf) || !/^\d{8}$/.test(shipping.zipCode)){message('Confira telefone com DDD, CPF e CEP.');return;}
    try{sessionStorage.setItem(lockKey,'pending');}catch{message('Permita o armazenamento desta aba para gerar o PIX com segurança.');return;}
    busy=true;locked=true;refresh();message('Gerando PIX. Aguarde sem fechar esta página.');
    try{
      payment=await api('/api/blackcat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:submittedItems,customer,shipping})});
      payment.cartFingerprint=fingerprint(submittedItems);
      try{sessionStorage.setItem(receiptKey,JSON.stringify(payment));}catch{}
      form.reset();showPayment();message(statusText[payment.status] || 'Consulte o pagamento.');
    }catch(error){
      if(error.status>=400 && error.status<500){locked=false;try{sessionStorage.removeItem(lockKey);}catch{}message(error.message);}
      else message(error.message+' Consulte o vendedor antes de gerar outro PIX.');
    }
    finally{busy=false;refresh();}
  });
  $('copy-pix').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('pix-code').value);message('Código copiado. Confira o recebedor e o valor no banco.');}catch{$('pix-code').select();message('Selecione e copie o código acima.');}});
  $('check-payment').addEventListener('click',async()=>{
    if(!payment || busy)return;busy=true;$('check-payment').disabled=true;
    try{const result=await api('/api/blackcat?action=status&receipt='+encodeURIComponent(payment.receipt));message(statusText[result.status] || 'Consulte o vendedor.');}
    catch(error){message(error.message);}finally{busy=false;$('check-payment').disabled=false;}
  });
  window.addEventListener('storage',refresh);
  window.addEventListener('shopcartchange',refresh);
  window.addEventListener('pageshow',()=>{form.reset();if(!payment&&!locked)setStep(1,false);refresh();});
  window.addEventListener('pagehide',()=>form.reset());
  (async()=>{
    try{
      cfg=await api('/api/blackcat?action=config');
      $('payment-fields').disabled=false;
      for(const state of cfg.states){const option=document.createElement('option');option.value=state;option.textContent=state;form.elements.state.append(option);}
      $('payment-coverage').textContent='Estados atendidos: '+cfg.states.join(', ')+'. Frete fixo por pedido: '+money(cfg.shipping)+'.';
      document.querySelector('footer p').textContent='Confira os produtos, as cores e o prazo de entrega com o vendedor antes de pagar.';
      message('Confira o total e preencha seus dados para gerar o PIX.');
      try{locked=!!sessionStorage.getItem(lockKey);const saved=JSON.parse(sessionStorage.getItem(receiptKey));if(saved?.receipt && saved?.code){payment=saved;showPayment();}else if(locked)message('Existe uma tentativa de cobrança nesta aba. Consulte o vendedor antes de tentar novamente.');}catch{}
    }catch(error){message(error.message);}
    refresh();
  })();
})();
