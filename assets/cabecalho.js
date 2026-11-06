(() => {
  'use strict';
  const query=(new URLSearchParams(location.search).get('q')||'').trim().slice(0,100);
  const search=document.getElementById('store-search-query');
  if(search)search.value=query;
  const current=location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.store-header-nav a').forEach(link=>{if(link.getAttribute('href')===current)link.setAttribute('aria-current','page');});
  const cards=[...document.querySelectorAll('.store-item')];
  if(!cards.length)return;
  const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  let count=0;
  cards.forEach(card=>{const text=normalize(card.textContent);const visible=terms.every(term=>text.includes(term));card.hidden=!visible;if(visible)count++;});
  const status=document.getElementById('store-search-summary');
  if(query&&status){status.hidden=false;status.textContent=count+' produto'+(count===1?'':'s')+' encontrado'+(count===1?'':'s')+' para “'+query+'”.';}
  const empty=document.getElementById('store-search-empty');
  if(empty)empty.hidden=count!==0;
})();
