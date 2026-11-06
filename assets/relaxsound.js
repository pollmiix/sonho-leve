(() => {
  'use strict';
  const color=document.getElementById('product-color'),quantity=document.getElementById('quantity'),main=document.getElementById('main-product-image');
  const thumbs=[...document.querySelectorAll('.gallery-thumb')];
  function selectImage(src,alt){main.src=src;main.alt=alt;thumbs.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.src===src)));}
  thumbs.forEach(button=>button.addEventListener('click',()=>selectImage(button.dataset.src,button.dataset.alt)));
  function update(){
    let n=Number(quantity.value);n=Number.isFinite(n)?Math.max(1,Math.min(10,Math.floor(n))):1;quantity.value=String(n);
    const product=window.ShopProducts[color.value];
    document.getElementById('subtotal').textContent=window.ShopCart.money(product.price*n);
    document.getElementById('decrease').disabled=n===1;document.getElementById('increase').disabled=n===10;
  }
  const requested=new URLSearchParams(location.search).get('cor');
  if(requested==='cinza')color.value='relaxsound-cinza';
  function changeColor(){const product=window.ShopProducts[color.value];selectImage(product.image,product.name+' · '+product.variant);document.getElementById('selected-color-name').textContent=product.variant;document.querySelectorAll('.color-swatch').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.color===color.value)));update();}
  document.querySelectorAll('.color-swatch').forEach(button=>button.addEventListener('click',()=>{color.value=button.dataset.color;color.dispatchEvent(new Event('change'));}));
  color.addEventListener('change',changeColor);quantity.addEventListener('change',update);
  document.getElementById('decrease').addEventListener('click',()=>{quantity.value=Number(quantity.value)-1;update();});
  document.getElementById('increase').addEventListener('click',()=>{quantity.value=Number(quantity.value)+1;update();});
  main.addEventListener('click',()=>{document.getElementById('zoom-image').src=main.src;document.getElementById('zoom-image').alt=main.alt;document.getElementById('image-dialog').showModal();});
  document.getElementById('close-image').addEventListener('click',()=>document.getElementById('image-dialog').close());
  changeColor();
})();
