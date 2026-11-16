export function sourceCardHtml(source,position,{esc,moneyInputValue,canWrite}) {
  const disabled=canWrite?'':'disabled';
  const link=source.url?`<a class="secondary compact procurement-open-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">OPEN LINK ↗</a>`:'';
  return `<div class="procurement-source-card" data-procurement-source="${esc(source.id || '')}">
    <div class="section-heading-row"><h4 data-source-heading>Source ${position}</h4><div class="button-row">${link}${canWrite?'<button type="button" class="secondary compact" data-remove-source>REMOVE</button>':''}</div></div>
    <div class="procurement-source-grid">
      <label>Vendor / Source<input data-source-vendor value="${esc(source.vendor_name || '')}" placeholder="Vendor name" ${disabled}></label>
      <label>Source price<input data-source-price type="number" min="0" step="0.01" value="${esc(moneyInputValue(source.price_cents))}" placeholder="179.00" ${disabled}></label>
      <label class="wide">Procurement URL<input data-source-url type="url" value="${esc(source.url || '')}" placeholder="https://…" ${disabled}></label>
    </div></div>`;
}
export function readProcurementSources(form) {
  return [...form.querySelectorAll('[data-procurement-source]')].map(row=>({id:row.dataset.procurementSource,
    vendorName:row.querySelector('[data-source-vendor]').value,url:row.querySelector('[data-source-url]').value,price:row.querySelector('[data-source-price]').value}));
}
export function bindProcurementSources(form,helpers) {
  const list=form.querySelector('[data-source-list]'),empty=form.querySelector('[data-source-empty]');
  function sync() {
    const rows=[...list.querySelectorAll('[data-procurement-source]')];
    empty.hidden=rows.length>0;
    rows.forEach((row,index)=>row.querySelector('[data-source-heading]').textContent=`Source ${index+1}${index===0?' · Primary':''}`);
  }
  function bindRemove(row) {row.querySelector('[data-remove-source]')?.addEventListener('click',()=>{row.remove();sync();});}
  list.querySelectorAll('[data-procurement-source]').forEach(bindRemove);
  form.querySelector('[data-add-source]')?.addEventListener('click',()=>{
    list.insertAdjacentHTML('beforeend',sourceCardHtml({},list.children.length+1,helpers));
    const row=list.lastElementChild;bindRemove(row);sync();row.querySelector('[data-source-vendor]').focus();
  });
  sync();
}
