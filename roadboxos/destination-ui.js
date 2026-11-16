export function destinationPayload(selection={}) {
  if (selection.type==='location') {
    const value=String(selection.location || '').trim();
    if (!value) throw new Error('Enter a destination location.');
    return {value};
  }
  if (!selection.id || !['road_box','kit'].includes(selection.type)) throw new Error('Select a destination from the search results.');
  return {targetType:selection.type,targetId:selection.id};
}

export function initDestinationPicker({api,esc,mediaThumbHtml,matchesSearchTokens}) {
  function card(row) {
    return `${mediaThumbHtml(row.primary_media_id,row.name,'destination-thumb')}<span><b>${esc(row.name)}</b><small>${esc(row.code)} · ${row.type==='kit'?'Physical Kit':'Container'}${row.description?' · '+esc(row.description):''}</small><small>${esc(row.location || 'Location not set')}</small></span>`;
  }
  async function mount(host,{selection={},onChange=()=>{},onSelected=()=>{},excludeId=null}={}) {
    host.innerHTML=`<div class="destination-picker"><label>Destination type<select data-destination-type><option value="container">Existing container / physical Kit</option><option value="location" ${selection.type==='location'?'selected':''}>Shop / loose location</option></select></label><div data-destination-container><label>Search destinations<input data-destination-search type="search" autocomplete="off" placeholder="Name, barcode, type or location"></label><div data-destination-selected></div><div data-destination-results class="destination-results" aria-live="polite">Loading destinations…</div></div><label data-destination-location-label>Destination location<input data-destination-location autocomplete="off" placeholder="Shelf / shop bench" value="${esc(selection.location || '')}"></label></div>`;
    const $=s=>host.querySelector(s),type=$('[data-destination-type]'),search=$('[data-destination-search]'),results=$('[data-destination-results]'),chosen=$('[data-destination-selected]');
    let current={...selection},rows=[];
    const update=value=>{current=value;onChange({...value});};
    function selected() {
      const row=rows.find(r=>r.id===current.id && r.type===current.type);
      chosen.innerHTML=row?`<div class="destination-chosen"><span class="destination-card">${card(row)}</span><button type="button" class="secondary compact" data-destination-clear>CHANGE</button></div>`:'';
      $('[data-destination-clear]')?.addEventListener('click',()=>{update({});selected();search.value='';render();search.focus();});
    }
    function render() {
      const query=search.value.trim();
      const matches=rows.filter(r=>r.id!==excludeId && matchesSearchTokens(query,[r.name,r.code,r.description,r.location,r.type==='kit'?'physical kit':'road box container rolling stock']));
      results.innerHTML=matches.slice(0,60).map(r=>`<button class="destination-card" type="button" data-destination-id="${esc(r.id)}" data-destination-kind="${esc(r.type)}">${card(r)}</button>`).join('')||'<p class="hint">No matching destinations.</p>';
      if (matches.length>60) results.insertAdjacentHTML('beforeend','<p class="hint">Type to narrow these destinations.</p>');
      results.querySelectorAll('[data-destination-id]').forEach(button=>button.addEventListener('click',()=>{
        const row=rows.find(r=>r.id===button.dataset.destinationId && r.type===button.dataset.destinationKind);
        update({type:row.type,id:row.id,name:row.name,code:row.code});selected();results.hidden=true;onSelected();
      }));
    }
    function syncType() {
      const location=type.value==='location';
      $('[data-destination-container]').hidden=location;
      $('[data-destination-location-label]').hidden=!location;
    }
    type.addEventListener('change',()=>{update(type.value==='location'?{type:'location',location:$('[data-destination-location]').value}:{});syncType();selected();results.hidden=false;render();});
    $('[data-destination-location]').addEventListener('input',e=>update({type:'location',location:e.target.value}));
    search.addEventListener('input',()=>{if(current.id){update({});selected();}results.hidden=false;render();});
    syncType();
    try {
      rows=await api('/api/move-destinations');
      if (current.id && !rows.some(r=>r.id===current.id && r.type===current.type)) update({});
      selected();render();results.hidden=!!current.id;
    } catch(error) { results.textContent=error.message; }
    return {payload:()=>destinationPayload(current)};
  }
  return {mount};
}
