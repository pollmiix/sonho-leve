(() => {
  'use strict';
  const products=window.ShopProducts, key='vasco-pg-shop-cart-v2', legacyKey='vasco-pg-fan-cart-v1';
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
  const valid=n=>Number.isInteger(n)&&n>=1&&n<=10;
  function read(){
    try {
      const raw=localStorage.getItem(key);
      if(raw!==null){const data=JSON.parse(raw);if(!Array.isArray(data))return [];const seen=new Set();return data.filter(item=>item&&typeof item.id==='string'&&Object.hasOwn(products,item.id)&&valid(item.quantity)&&!seen.has(item.id)&&(seen.add(item.id),true)).map(({id,quantity})=>({id,quantity}));}
      return [];
    } catch {return [];}
  }
  const total=items=>items.reduce((sum,item)=>sum+products[item.id].price*item.quantity,0);
  const count=items=>items.reduce((sum,item)=>sum+item.quantity,0);
  function notice(message){const element=document.getElementById('cart-message');if(element)element.textContent=message;}
  function save(items){
    try{localStorage.setItem(key,JSON.stringify(items));localStorage.removeItem(legacyKey);render();window.dispatchEvent(new Event('shopcartchange'));return true;}
    catch{notice('Não foi possível salvar o carrinho. Permita o armazenamento deste site e tente novamente.');return false;}
  }
  function setQuantity(id,quantity){
    if(!Object.hasOwn(products,id)||!Number.isInteger(quantity)||quantity<0||quantity>10){notice('Escolha uma quantidade inteira entre 1 e 10.');render();return false;}
    const items=read();
    const index=items.findIndex(item=>item.id===id);
    if(index>=0){if(quantity)items[index].quantity=quantity;else items.splice(index,1);}
    else if(quantity)items.push({id,quantity});
    return save(items);
  }
  function lines(items,editable){
    const fragment=document.createDocumentFragment();
    items.forEach(item=>{
      const product=products[item.id],row=document.createElement('article');row.className='shop-cart-row';
      const picture=document.createElement('img');picture.src=product.image;picture.alt=product.name+' · '+product.variant;picture.width=104;picture.height=104;
      const info=document.createElement('div');info.className='shop-cart-info';
      const link=document.createElement('a');link.href=product.href;link.textContent=product.name;
      const variant=document.createElement('p');variant.textContent=product.variant;
      const price=document.createElement('p');price.textContent=money(product.price)+' por unidade';
      info.append(link,variant,price);
      const amount=document.createElement('strong');amount.className='shop-line-total';amount.textContent=money(item.quantity*product.price);
      row.append(picture,info,amount);
      if(editable){
        const controls=document.createElement('div');controls.className='shop-line-controls';
        const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.disabled=item.quantity===1;minus.setAttribute('aria-label','Diminuir quantidade de '+product.name+' '+product.variant);minus.addEventListener('click',()=>setQuantity(item.id,item.quantity-1));
        const input=document.createElement('input');input.type='number';input.min='1';input.max='10';input.step='1';input.value=String(item.quantity);input.setAttribute('aria-label','Quantidade de '+product.name+' '+product.variant);input.addEventListener('change',()=>setQuantity(item.id,Number(input.value)));
        const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.disabled=item.quantity===10;plus.setAttribute('aria-label','Aumentar quantidade de '+product.name+' '+product.variant);plus.addEventListener('click',()=>setQuantity(item.id,item.quantity+1));
        const remove=document.createElement('button');remove.type='button';remove.className='shop-remove';remove.textContent='Remover';remove.addEventListener('click',()=>{if(setQuantity(item.id,0))notice('Produto removido do carrinho.');});
        controls.append(minus,input,plus,remove);row.append(controls);
      }else{const units=document.createElement('p');units.className='shop-line-units';units.textContent='Quantidade: '+item.quantity;info.append(units);}
      fragment.append(row);
    });return fragment;
  }
  function render(){
    const items=read(),units=count(items);
    document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=String(units));
    document.querySelectorAll('[data-cart-total]').forEach(el=>el.textContent=money(total(items)));
    document.querySelectorAll('[data-cart-content]').forEach(el=>el.hidden=!units);
    document.querySelectorAll('[data-cart-empty]').forEach(el=>el.hidden=!!units);
    document.querySelectorAll('[data-shop-lines]').forEach(el=>el.replaceChildren(lines(items,el.dataset.shopLines==='editable')));
  }
  document.getElementById('add-to-cart')?.addEventListener('click',()=>{
    const input=document.getElementById('quantity'),quantity=Number(input?.value);
    const id=document.getElementById('product-color')?.value||document.body.dataset.productId||'ventilador';
    if(!Object.hasOwn(products,id)||!valid(quantity)){notice('Escolha um produto e uma quantidade entre 1 e 10.');return;}
    const previous=read().find(item=>item.id===id)?.quantity||0;
    if(previous+quantity>10){notice('O limite é de 10 unidades por produto e cor. Ajuste a quantidade no carrinho.');return;}
    if(setQuantity(id,previous+quantity))location.assign('carrinho-loja.html');
  });
  window.ShopCart=Object.freeze({read,total,count,render,products,money,setQuantity});
  window.addEventListener('storage',event=>{if([key,legacyKey,null].includes(event.key)){render();window.dispatchEvent(new Event('shopcartchange'));}});
  window.addEventListener('pageshow',render);
  render();
})();
