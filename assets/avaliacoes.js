(() => {
  'use strict';
  const $=id=>document.getElementById(id),dialog=$('review-dialog'),form=$('review-form');
  if(!dialog||!form)return;
  const key='sonho-leve-relaxsound-review-draft-v1';
  const reviews=(window.ShopReviews||[]).filter(review=>review&&typeof review.name==='string'&&typeof review.comment==='string'&&Number.isInteger(review.rating)&&review.rating>=1&&review.rating<=5&&(!review.date||Number.isFinite(Date.parse(review.date))));
  const count=reviews.length;
  const supplied=window.ShopReviewSummary?.counts;
  const distribution=Object.fromEntries([1,2,3,4,5].map(rating=>[rating,reviews.filter(review=>review.rating===rating).length]));
  if(supplied&&[1,2,3,4,5].every(rating=>Number.isInteger(supplied[rating])&&supplied[rating]>=0))for(const rating of [1,2,3,4,5])distribution[rating]=supplied[rating];
  const total=Object.values(distribution).reduce((sum,amount)=>sum+amount,0);
  if(total){
    const average=Object.entries(distribution).reduce((sum,[rating,amount])=>sum+Number(rating)*amount,0)/total;
    $('reviews-average').textContent=average.toFixed(1);
    $('reviews-stars').style.setProperty('--rating-fill',(average/5*100)+'%');
    $('reviews-stars').setAttribute('aria-label','Nota média '+average.toFixed(1)+' de 5');
    $('reviews-count').textContent='A partir de '+total+(total===1?' Avaliação':' Avaliações');
    for(let rating=1;rating<=5;rating++){const amount=distribution[rating];$('review-count-'+rating).textContent=String(amount);$('review-bar-'+rating).style.width=(amount/total*100)+'%';}
  }
  $('reviews-sort').disabled=count<2;
  function render(){
    if(!count)return;
    const order=$('reviews-sort').value;
    const sorted=reviews.slice().sort((a,b)=>order==='highest'?b.rating-a.rating:order==='lowest'?a.rating-b.rating:(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
    const fragment=document.createDocumentFragment();
    sorted.forEach(review=>{
      const article=document.createElement('article');article.className='customer-review';
      const heading=document.createElement('h3');heading.textContent=review.name;
      const rating=document.createElement('p');rating.className='published-stars';rating.textContent='★'.repeat(review.rating)+'☆'.repeat(5-review.rating);rating.setAttribute('aria-label',review.rating+' de 5 estrelas');
      const comment=document.createElement('p');comment.className='review-comment';comment.textContent=review.comment;
      article.append(heading,rating,comment);
      if(typeof review.image==='string'&&/^assets\/avaliacoes\/[a-zA-Z0-9_.-]+\.(png|jpe?g|webp)$/.test(review.image)){const image=document.createElement('img');image.src=review.image;image.alt='Foto enviada com a avaliação de '+review.name;image.loading='lazy';if(Number.isInteger(review.imageWidth)&&review.imageWidth>0&&Number.isInteger(review.imageHeight)&&review.imageHeight>0){image.width=review.imageWidth;image.height=review.imageHeight;}article.append(image);}
      if(review.date){const date=document.createElement('time');date.dateTime=review.date;date.textContent=new Date(review.date+'T12:00:00').toLocaleDateString('pt-BR');article.append(date);}
      fragment.append(article);
    });
    $('reviews-list').replaceChildren(fragment);
  }
  $('reviews-sort').addEventListener('change',render);render();
  $('open-review').addEventListener('click',()=>{
    try{const draft=JSON.parse(localStorage.getItem(key));if(draft){form.elements.name.value=draft.name||'';form.elements.comment.value=draft.comment||'';if([1,2,3,4,5].includes(draft.rating))form.elements.rating.value=String(draft.rating);}}catch{}
    dialog.showModal();
  });
  $('close-review').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const draft={name:form.elements.name.value.trim(),rating:Number(form.elements.rating.value),comment:form.elements.comment.value.trim()};
    if(draft.name.length<1||draft.comment.length<10){$('review-save-message').textContent='Preencha o nome e escreva pelo menos 10 caracteres sobre sua experiência.';return;}
    try{localStorage.setItem(key,JSON.stringify(draft));$('review-draft-status').textContent='Seu rascunho está salvo neste navegador. Ainda não publicado.';$('review-save-message').textContent='Rascunho salvo neste navegador. Ainda não publicado.';dialog.close();}catch{$('review-save-message').textContent='Não foi possível salvar. Confira as permissões de armazenamento do navegador.';}
  });
})();
