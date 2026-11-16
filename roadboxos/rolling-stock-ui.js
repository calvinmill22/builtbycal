// Rolling stock builder shares the existing manifest, photo and checkout systems.
import {catalogHitHtml,catalogInfoHtml} from './inventory-ui.js';
export function initRollingStockUi({api,esc,state,render,refresh,flash,matchesSearchTokens,mediaThumbHtml,moneyDisplay}) {
  const write=()=>state.auth.authenticated;
  const options=(rows,value,label)=>rows.map(r=>`<option value="${esc(r.id)}" ${r.id===value?'selected':''}>${esc(label(r))}</option>`).join('');
  const zones=box=>box.standardManifest?.zones||[];
  function toolbar(box) {
    return `<div class="container-builder"><p>Create zones for shelves, drawers, lids, or trays. Add existing catalog requirements or a generic kit, then pack inventory into its slots.</p>${write()?`<div class="button-row"><button class="primary" data-builder="zone">+ ADD ZONE</button></div><div id="containerEditor"></div>${!box.activeCheckSession?`<form id="containerPackForm" class="show-form"><label class="span-2">Scan inventory into this container (slot optional)<input name="barcode" autocomplete="off" placeholder="Scan serialized barcode or family QR" required></label><label>Quantity<input name="quantity" type="number" step="any" min="0.0001" value="1" required></label><label>Placement<select name="slotId"><option value="">Auto-match slots; extras are unslotted</option><option value="none">No slot / loose contents</option>${zones(box).flatMap(z=>z.slots.filter(s=>s.missing_quantity>0).map(s=>`<option value="${esc(s.id)}">${esc(z.name)} · ${esc(s.expected_label)} (${s.missing_quantity} needed)</option>`)).join('')}</select></label><div class="wide"><button class="primary">PACK SCANNED INVENTORY</button><span id="containerPackMessage" role="status"></span></div></form>`:'<p>Finish the active check session before packing. Layout changes still require a shop return.</p>'}`:''}</div>`;
  }
  function zoneActions(zone) {return write()?`<div class="button-row"><button class="secondary compact" data-builder="slot" data-zone="${esc(zone.id)}">+ ADD SLOT</button><button class="secondary compact" data-builder="zone" data-zone="${esc(zone.id)}">EDIT ZONE</button><button class="secondary compact" data-delete-zone="${esc(zone.id)}">REMOVE EMPTY ZONE</button></div>${zone.notes?`<p>${esc(zone.notes)}</p>`:''}`:'';}
  function slotActions(slot) {return write()?`${!slot.kit_instance_id?`<button class="secondary compact" data-delete-slot="${esc(slot.id)}">REMOVE SLOT</button>`:''}${(slot.fills||[]).map(f=>`<button class="secondary compact" data-unpack-fill="${esc(f.id)}">UNPACK ${esc(f.asset_name||f.catalog_name||'inventory')} · ${f.quantity}</button>`).join('')}`:'';}
  function stack(box) {
    return `<section class="show-detail-section"><h3>Attached Rolling Stock</h3>${box.parentContainer?`<p>Attached to <button class="secondary compact" data-open-container="${esc(box.parentContainer.id)}">${esc(box.parentContainer.code)} · ${esc(box.parentContainer.name)}</button>${write()&&!box.activeAssignment?'<button class="secondary compact" data-detach-container>DETACH THIS UNIT</button>':''}</p>`:'<p>This container can carry other serialized units. Deploying it includes all attached units.</p>'}${(box.attachedContainers||[]).map(c=>`<div class="assignment-row"><button class="secondary" data-open-container="${esc(c.id)}">${esc(c.code)} · ${esc(c.name)}</button><small>${esc(c.box_type||'Container')} · ${esc(c.barcode)} · ${esc(c.status)}</small>${write()&&!box.activeAssignment?`<button class="secondary compact" data-detach-child="${esc(c.id)}">DETACH</button>`:''}</div>`).join('')}${box.stackMembers?.length?`<p>${box.stackMembers.length} attached units in this stack. Each retains its own zones and contents.</p>`:''}${write()&&!box.activeAssignment?'<button class="primary" data-builder="attach">+ ATTACH UNIT</button>':''}${box.activeAssignment&&box.parentContainer?'<p>Return this unit separately to detach it into available rolling stock.</p>':''}</section>`;
  }
  async function bind(box,host) {
    const request=async(path,method,body={})=>{const result=await api(path,{method,body:JSON.stringify(body)});const fresh=await api(`/api/road-boxes/${box.id}`);render(fresh);await refresh(false);return result;};
    const attempt=fn=>async event=>{try{await fn(event);}catch(error){alert(error.message);}};
    const base=`/api/road-boxes/${box.id}`;
    host.querySelectorAll('[data-open-container]').forEach(b=>b.onclick=attempt(async()=>render(await api(`/api/road-boxes/${b.dataset.openContainer}`))));
    host.querySelector('[data-detach-container]')?.addEventListener('click',attempt(()=>request(`${base}/detach`,'POST')));
    host.querySelectorAll('[data-detach-child]').forEach(b=>b.onclick=attempt(()=>request(`/api/road-boxes/${b.dataset.detachChild}/detach`,'POST')));
    host.querySelectorAll('[data-delete-zone]').forEach(b=>b.onclick=attempt(async()=>{if(confirm('Remove this empty zone?'))await request(`${base}/zones/${b.dataset.deleteZone}`,'DELETE');}));
    host.querySelectorAll('[data-delete-slot]').forEach(b=>b.onclick=attempt(async()=>{if(confirm('Remove this unpacked slot requirement?'))await request(`${base}/slots/${b.dataset.deleteSlot}`,'DELETE');}));
    host.querySelectorAll('[data-unpack-fill]').forEach(b=>b.onclick=attempt(async()=>{if(confirm('Unpack this inventory back into shop stock?'))await request(`${base}/fills/${b.dataset.unpackFill}/unpack`,'POST');}));
    host.querySelector('#containerPackForm')?.addEventListener('submit',async e=>{
      e.preventDefault();const form=e.currentTarget,body=Object.fromEntries(new FormData(form)),barcode=body.barcode;
      try{await request(`${base}/pack`,'POST',body);const input=document.querySelector('#containerPackForm [name="barcode"]');input?.focus();flash(`${barcode} packed; container totals updated.`);}catch(error){const status=form.querySelector('#containerPackMessage');status.textContent=error.message;status.className='error';form.querySelector('[name="barcode"]').select();}
    });
    const edit=async(kind,zoneId,slotId,kitId)=>{
      const editor=host.querySelector('#containerEditor');if(!editor)return;
      let path,method,html,title,catalogs=[],assets=[];
      const zone=zones(box).find(z=>z.id===zoneId),slot=zones(box).flatMap(z=>z.slots).find(s=>s.id===slotId);
      const zoneSelect=(selected)=>`<label>Zone<select name="zoneId">${options(zones(box),selected,r=>r.name)}</select></label>`;
      if(kind==='zone') {title=zone?'Edit zone':'Add zone';path=`${base}/zones${zone?'/'+zone.id:''}`;method=zone?'PATCH':'POST';html=`<label>Zone name *<input name="name" required value="${esc(zone?.name||'')}" placeholder="Top zone / Lid organizer / Drawer 1"></label><label>Display order<input type="number" name="sortOrder" value="${zone?.sort_order??((zones(box).length+1)*10)}"></label><label class="wide">Notes<textarea name="notes">${esc(zone?.notes||'')}</textarea></label>`;}
      else if(kind==='attach'){title='Attach a rolling stock unit';path=`${base}/attach`;method='POST';const rows=await api('/api/road-boxes');const excluded=new Set([box.id,...(box.stackMembers||[]).map(r=>r.id)]);html=`<label class="wide">Available unit<select name="childId" required><option value="">Choose an existing container</option>${options(rows.filter(r=>r.status==='available'&&!r.parent_container_id&&!excluded.has(r.id)),null,r=>`${r.code} · ${r.name} · ${r.box_type||'Container'}`)}</select><small>Create the unit in Rolling Stock first. Its own barcode and contents stay with it.</small></label>`;}
      else if(kind==='kit'){const row=zones(box).flatMap(z=>z.slots).find(s=>s.kit_instance_id===kitId);title='Edit kit placement';path=`${base}/kits/${kitId}`;method='PATCH';html=`<label>Kit label<input name="instanceLabel" required value="${esc(row?.kit_instance_label||row?.kit_name||'')}"></label>${zoneSelect(row?.zone_id)}`;}
      else {title=slot?'Edit slot':'Add catalog / asset slot';path=slot?`${base}/slots/${slot.id}`:`${base}/zones/${zoneId}/slots`;method=slot?'PATCH':'POST';catalogs=await api('/api/catalog-items');assets=slot?[]:await api('/api/assets');html=`${slot?zoneSelect(slot.zone_id):''}<label class="span-2">Search catalog<input id="containerCatalogSearch" placeholder="Name, category, barcode, or part number"></label><input type="hidden" id="containerCatalogSelect" name="catalogItemId" value="${esc(slot?.catalog_item_id||'')}" ${slot?.expected_asset_id?'disabled':''}><div class="wide" id="containerCatalogChosen"></div><div class="wide billing-catalog-results" id="containerCatalogResults"></div>${!slot?`<label class="wide">Or require a specific serialized unit<select name="expectedAssetId" id="containerAssetSelect"><option value="">Any matching unit from the family</option>${options(assets,null,r=>`${r.name} · ${r.barcode}`)}</select></label>`:''}<label class="span-2">Slot / expected item label<input name="expectedLabel" value="${esc(slot?.expected_label||'')}" placeholder="Defaults to inventory name"></label><label>Target quantity<input type="number" min="0.0001" step="any" name="expectedQuantity" value="${slot?.expected_quantity??1}" required></label><label class="wide">Placement notes<textarea name="notes">${esc(slot?.notes||'')}</textarea></label>`;
      }
      editor.innerHTML=`<section class="show-detail-section"><h3>${title}</h3><form id="containerBuildForm" class="show-form">${html}<div class="wide button-row"><button class="primary">SAVE</button><button class="secondary" type="button" id="cancelContainerEdit">CANCEL</button><span id="containerEditError" role="alert"></span></div></form></section>`;
      editor.querySelector('#cancelContainerEdit').onclick=()=>editor.replaceChildren();
      const select=editor.querySelector('#containerCatalogSelect'),search=editor.querySelector('#containerCatalogSearch');
      if(search&&select){
        const chosen=editor.querySelector('#containerCatalogChosen'),results=editor.querySelector('#containerCatalogResults');
        let previousDefault=catalogs.find(c=>c.id===select.value)?.name||'';
        const showChosen=()=>{const row=catalogs.find(c=>c.id===select.value);chosen.innerHTML=row?`<div class="container-catalog-chosen">${mediaThumbHtml(row.primary_media_id,row.name,'billing-catalog-thumb')}<div><small>SELECTED FAMILY</small>${catalogInfoHtml(row,{esc,moneyDisplay})}</div>${!slot?.expected_asset_id?'<button class="secondary compact" type="button" id="clearContainerCatalog">CLEAR</button>':''}</div>`:'<p class="hint">Choose a family from the results below, or select a specific serialized unit.</p>';chosen.querySelector('#clearContainerCatalog')?.addEventListener('click',()=>{select.value='';showChosen();});};
        const renderMatches=()=>{if(slot?.expected_asset_id){search.disabled=true;results.innerHTML='<p class="hint">This slot is fixed to a specific serialized unit.</p>';return;}
          const q=search.value.trim();if(!q){results.innerHTML='<p class="hint">Type item names, codes, categories or part numbers. All words can match in any order.</p>';return;}
          const rows=catalogs.filter(c=>matchesSearchTokens(q,[c.name,c.generic_code,c.item_code,c.category,c.manufacturer,c.manufacturer_part_number,c.home_location])).slice(0,60);
          results.innerHTML=rows.map(c=>catalogHitHtml(c,{esc,moneyDisplay,mediaThumbHtml},'data-select-container-catalog','SELECT')).join('')||'<div class="empty">No Catalog family matches these words.</div>';
          results.querySelectorAll('[data-select-container-catalog]').forEach(button=>button.addEventListener('click',()=>{
            const row=catalogs.find(c=>c.id===button.dataset.selectContainerCatalog);select.value=row.id;
            const assetSelect=editor.querySelector('#containerAssetSelect');if(assetSelect)assetSelect.value='';
            const label=editor.querySelector('[name="expectedLabel"]');if(!label.value||label.value===previousDefault)label.value=row.name;previousDefault=row.name;
            showChosen();editor.querySelector('[name="expectedQuantity"]').focus();
          }));
        };
        search.addEventListener('input',renderMatches);showChosen();renderMatches();
        editor.querySelector('#containerAssetSelect')?.addEventListener('change',e=>{if(e.target.value){select.value='';editor.querySelector('[name="expectedQuantity"]').value='1';const row=assets.find(a=>a.id===e.target.value);const label=editor.querySelector('[name="expectedLabel"]');if(!label.value||label.value===previousDefault)label.value=row?.name||'';}showChosen();});
      }
      editor.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const body=Object.fromEntries(new FormData(e.currentTarget));if(kind==='slot'&&!slot&&!body.catalogItemId&&!body.expectedAssetId)throw new Error('Choose a Catalog family or a specific serialized unit from the search results.');await request(path,method,body);flash(`${title} saved.`);}catch(error){editor.querySelector('#containerEditError').textContent=error.message;}};
      editor.scrollIntoView({block:'nearest'});editor.querySelector('input,select')?.focus();
    };
    host.querySelectorAll('[data-builder]').forEach(b=>b.onclick=attempt(()=>edit(b.dataset.builder,b.dataset.zone)));
    host.querySelectorAll('[data-edit-workbox-slot]').forEach(b=>b.onclick=attempt(()=>edit('slot',null,b.dataset.editWorkboxSlot)));
    host.querySelectorAll('[data-edit-container-kit]').forEach(b=>b.onclick=attempt(()=>edit('kit',null,null,b.dataset.editContainerKit)));
  }
  return {toolbar,zoneActions,slotActions,stack,bind};
}
