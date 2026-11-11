(() => {
  const toggle=document.querySelector('.nav-button');
  const nav=document.querySelector('nav');
  if(toggle && nav){toggle.addEventListener('click',()=>{const expanded=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',expanded?'true':'false');toggle.textContent=expanded?'Close':'Menu';});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.textContent='Menu';}));}
  const config=window.BUILTBYCAL||{};
  document.querySelectorAll('[data-link]').forEach(el=>{
    const key=el.getAttribute('data-link');const val=String(config[key]||'').trim();
    if(!val){el.hidden=true;return;}
    if(key==='email'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)){el.hidden=true;return;}el.href='mailto:'+val+'?subject='+encodeURIComponent('BuiltByCal — Website inquiry');el.textContent='Email Calvin ↗';el.title=val;}
    else if(val.startsWith('https://')){el.href=val;el.target='_blank';el.rel='noopener noreferrer';}else{el.hidden=true;}
  });
  const disabled=document.querySelector('.email-disabled');if(disabled)disabled.hidden=!!(config.email||'').trim();
  document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
})();
