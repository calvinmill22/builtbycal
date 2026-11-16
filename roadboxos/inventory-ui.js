export function catalogInfoHtml(item,{esc,moneyDisplay}) {
  const stock=item.tracking_mode==='serialized'
    ? `${item.serialized_available ?? 0} serialized units available`
    : `${item.quantity_on_hand ?? 0} ${item.unit || 'each'} in pool`;
  return `<b>${esc(item.name)}</b><small>${esc([item.manufacturer,item.manufacturer_part_number,item.generic_code].filter(Boolean).join(' · '))}</small><small>${esc([item.category,item.tracking_mode,stock].filter(Boolean).join(' · '))}</small><span>${item.replacement_cost_cents==null?'Price not set':esc(moneyDisplay(item.replacement_cost_cents,item.currency || 'USD'))}</span>`;
}
export function catalogHitHtml(item,helpers,actionAttribute,actionLabel='ADD') {
  return `<div class="billing-catalog-hit">${helpers.mediaThumbHtml(item.primary_media_id,item.name,'billing-catalog-thumb')}<div>${catalogInfoHtml(item,helpers)}</div><button class="primary compact" type="button" ${actionAttribute}="${helpers.esc(item.id)}">${actionLabel}</button></div>`;
}
export function valueText(value,moneyDisplay) {
  if (!value) return '—';
  const totals=Object.entries(value.currencies || {}).sort(([a],[b])=>a.localeCompare(b));
  const text=totals.length?totals.map(([currency,cents])=>moneyDisplay(cents,currency)).join(' + '):(value.unpricedQuantity?'Price not set':moneyDisplay(0));
  return text+(value.unpricedQuantity&&totals.length?' + unpriced items':'');
}
export function valueSummaryHtml(box,{esc,moneyDisplay},compact=false) {
  const v=box.valuation;if(!v)return '';
  const cell=(label,value)=>`<div><span>${label}</span><b>${esc(valueText(value,moneyDisplay))}</b>${value.unpricedQuantity?`<small>${esc(value.unpricedQuantity)} units without a price</small>`:''}</div>`;
  if(compact)return `<div class="container-card-values"><span>Packed: <b>${esc(valueText(v.packed,moneyDisplay))}</b></span><span>Pack-list target: <b>${esc(valueText(v.target,moneyDisplay))}</b></span></div>`;
  return `<section class="show-detail-section container-value-section"><h3>Contents replacement value</h3><div class="container-value-grid">${cell('PACKED CONTENTS',v.packed)}${cell('PACK-LIST TARGET',v.target)}${v.unslotted.unitCount?cell('WITHOUT A ZONE',v.unslotted):''}${box.stackMembers?.length&&box.stackValuation?cell('WHOLE STACK · PACKED',box.stackValuation.packed)+cell('WHOLE STACK · TARGET',box.stackValuation.target):''}</div><p class="hint">Live Catalog replacement costs, excluding the container itself. Packed contents include physical Kit children. Target values use configured slot quantities. Unpriced items are listed; currencies are shown separately.</p></section>`;
}
export function zoneValueHtml(zoneValue,{esc,moneyDisplay}) {
  if(!zoneValue)return '';
  return `<div class="container-zone-values"><span>Packed: <b>${esc(valueText(zoneValue.packed,moneyDisplay))}</b></span><span>Pack-list target: <b>${esc(valueText(zoneValue.target,moneyDisplay))}</b></span></div>`;
}
