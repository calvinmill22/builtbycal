import { demoFetch, bindDemoReports } from './demo-api.js';
import {initDestinationPicker,destinationPayload} from './destination-ui.js';
import {sourceCardHtml,readProcurementSources,bindProcurementSources} from './procurement-ui.js';
import {catalogHitHtml,valueSummaryHtml,zoneValueHtml} from './inventory-ui.js';
import {initPackingUi} from './packing-ui.js';
import { initRollingStockUi } from './rolling-stock-ui.js';
import { initPurchasingUi } from './purchasing-ui.js';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

migrateLegacyPreferences();

const state = {
  mode: 'lookup',
  currentAsset: null,
  contextValue: '',
  moveDestination: {},
  audio: null,
  auth: { authenticated: false, canWrite: false, user: null },
  config: { showLanes: [], deploymentTypes: [] },
  shows: [],
  people: [],
  departments: [],
  roadBoxes: [],
  catalogItems: [],
  generatedCodes: [],
  kits: [],
  assetsCache: [],
  workboxStandardSummary: null,
  checkoutContainerId: localStorage.getItem('roadboxosCheckoutContainerId') || '',
  checkoutTargetType: localStorage.getItem('roadboxosCheckoutTargetType') || 'show',
  checkoutShowId: localStorage.getItem('roadboxosCheckoutShowId') || '',
  checkoutDeploymentId: localStorage.getItem('roadboxosCheckoutDeploymentId') || '',
  checkoutPersonId: localStorage.getItem('roadboxosCheckoutPersonId') || '',
  checkoutDepartmentId: localStorage.getItem('roadboxosCheckoutDepartmentId') || '',
  checkoutRoadBoxId: localStorage.getItem('roadboxosCheckoutRoadBoxId') || '',
  checkoutKitAssetId: localStorage.getItem('roadboxosCheckoutKitAssetId') || '',
  checkoutPurpose: localStorage.getItem('roadboxosCheckoutPurpose') || '',
  currentShow: null,
  currentLedger: null,
  currentRoadBox: null,
  currentWorkboxCheck: null,
  workboxView: { sessionId: null, openZoneIds: [], scrollTop: 0, focusSlotId: null },
  commissionContext: null,
  familySwapContext: null,
  kitPlacementContext: null,
  currentKit: null,
  currentCatalogItem: null,
  kitReconcileSessionId: null,
  kitReconcileKitAssetId: null,
  printCodes: [],
  selectedPrintCodeIds: new Set(),
  billingDocuments: [],
  currentBilling: null,
  opsDashboard: null
};

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
}[c]));

function migrateLegacyPreferences() {
  const suffixes = [
    'CheckoutContainerId', 'CheckoutTargetType', 'CheckoutShowId', 'CheckoutDeploymentId',
    'CheckoutPersonId', 'CheckoutDepartmentId', 'CheckoutRoadBoxId', 'CheckoutKitAssetId',
    'CheckoutPurpose', 'LastCategory', 'LastLocation', 'LastAssetType', 'LastPlacementType',
    'LastRoadBoxId'
  ];
  for (const suffix of suffixes) {
    const legacyKey = `atomic${suffix}`;
    const value = localStorage.getItem(legacyKey);
    if (value === null) continue;
    const currentKey = `roadboxos${suffix}`;
    if (localStorage.getItem(currentKey) === null) localStorage.setItem(currentKey, value);
    localStorage.removeItem(legacyKey);
  }
}

function moneyInputValue(cents) {
  if (cents === undefined || cents === null || cents === '') return '';
  const amount = Number(cents) / 100;
  return Number.isFinite(amount) ? amount.toFixed(2) : '';
}
function moneyDisplay(cents, currency = 'USD') {
  if (cents === undefined || cents === null || cents === '') return '—';
  const amount = Number(cents) / 100;
  if (!Number.isFinite(amount)) return '—';
  try { return new Intl.NumberFormat('en-US', { style:'currency', currency:currency || 'USD' }).format(amount); }
  catch { return `$${amount.toFixed(2)}`; }
}

function matchesSearchTokens(query, values) {
  const tokens = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = values.map((v) => String(v ?? '')).join(' ').toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

async function api(url, options = {}) {
  const response = await demoFetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new ApiError(data.error || `Request failed: ${response.status}`, response.status, data.code);
    if (error.code === 'AUTH_REQUIRED') showLogin();
    throw error;
  }
  return data;
}

function beep(kind = 'ok') {
  try {
    state.audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = state.audio;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = kind === 'ok' ? 880 : 210;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + (kind === 'ok' ? 0.06 : 0.15));
  } catch {}
}

function setScanStatus(label, cls = 'ready') {
  const node = $('#scanStatus');
  if (!node) return;
  node.textContent = label;
  node.className = `scan-status ${cls}`;
}

function flash(message, kind = 'success') {
  const node = $('#flash');
  node.textContent = message;
  node.className = `flash ${kind}`;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => node.classList.add('hidden'), 3500);
}

function focusScanner() {
  if (!$('#loginModal').classList.contains('hidden')) return;
  if (!$('#showModal').classList.contains('hidden')) return;
  if (!$('#ledgerModal').classList.contains('hidden')) return;
  if (!$('#roadBoxModal').classList.contains('hidden')) return;
  if (!$('#workboxCheckModal').classList.contains('hidden')) return;
  if (!$('#workboxCommissionModal').classList.contains('hidden')) return;
  if (!$('#workboxFamilyModal').classList.contains('hidden')) return;
  if (!$('#workboxKitModal').classList.contains('hidden')) return;
  if (!$('#kitModal').classList.contains('hidden')) return;
  if (!$('#catalogModal').classList.contains('hidden')) return;
  if (!$('#billingModal').classList.contains('hidden')) return;
  if (!$('#purchasingModal').classList.contains('hidden')) return;
  if (!$('#packingModal').classList.contains('hidden')) return;
  setTimeout(() => $('#barcodeInput')?.focus(), 30);
}

function statusLabel(status) {
  return ({ available: 'Available', allocated: 'Checked Out', in_repair: 'In Repair', lost: 'Lost', retired: 'Retired' })[status] || status;
}

function laneLabel(status) {
  return ({
    award: 'Award', design: 'Design', fabricate: 'Fabricate', tech: 'Tech', pack: 'Pack',
    stage_load: 'Stage / Load', outbound: 'Outbound', on_site: 'On-Site', inbound: 'Inbound',
    reprocess: 'Reprocess', reconciliation: 'Reconciliation', reset: 'Reset'
  })[status] || status;
}

function deploymentTypeLabel(type) {
  return ({
    main_show: 'Main Show', site_survey: 'Site Survey', onsite_add: 'On-Site Add', notes: 'Notes',
    extended_strike: 'Extended Strike', post_show: 'Post-Show', other: 'Other'
  })[type] || type;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function detailsPairs(asset) {
  const rows = [
    ['Barcode', asset.barcode], ['Category', asset.category || '—'], ['Serial', asset.serial_number || '—'],
    ['Manufacturer', asset.manufacturer || '—'], ['Model / Part #', asset.manufacturer_part_number || '—'],
    ['Family Unit', asset.unit_number ? `Unit ${String(asset.unit_number).padStart(2, '0')}` : '—'], ['Nickname', asset.nickname || '—']
  ];
  if (asset.kit_id || asset.asset_type === 'kit') {
    rows.push(['Kit Standard', asset.kit_definition_name ? `${asset.kit_definition_name}${asset.kit_definition_code ? ` · ${asset.kit_definition_code}` : ''}` : 'Physical Kit']);
    rows.push(['Kit Instance', asset.kit_unit_number ? `Kit ${String(asset.kit_unit_number).padStart(2,'0')}` : '—']);
  }
  rows.push(['Location', asset.location || '—'], ['Custodian / Assignment', asset.custodian || '—'], ['Updated', formatTime(asset.updated_at)]);
  return rows;
}

function mediaUrl(id) { return `/media/${encodeURIComponent(id)}`; }

function mediaThumbHtml(id, alt = '', className = 'record-thumb') {
  if (!id) return `<div class="${className} media-placeholder">NO PHOTO</div>`;
  return `<img class="${className}" src="${mediaUrl(id)}" alt="${esc(alt)}" loading="lazy" />`;
}

function mediaGalleryHtml(entityType, entityId, photos = [], options = {}) {
  const personPrivate = entityType === 'person';
  if (personPrivate && !state.auth.authenticated) {
    return `<section class="show-detail-section media-section"><h3>Profile Photo</h3><div class="media-private-note">People photos are optional and only visible to logged-in operators.</div></section>`;
  }
  const sorted = [...(photos || [])];
  const primary = sorted.find((photo) => Number(photo.is_primary) === 1) || sorted[0] || null;
  const hero = primary
    ? `<div class="media-hero"><img src="${mediaUrl(primary.id)}" alt="${esc(primary.caption || options.label || 'Photo')}" /></div>`
    : `<div class="media-hero media-hero-empty"><span>NO PHOTO YET</span></div>`;
  const cards = sorted.length ? `<div class="media-thumb-grid">${sorted.map((photo, index) => `
    <article class="media-photo-card ${Number(photo.is_primary) === 1 ? 'primary-photo' : ''}" data-media-photo-id="${esc(photo.id)}">
      <button type="button" class="media-photo-open" data-media-open="${esc(photo.id)}" title="Open full size">
        <img src="${mediaUrl(photo.id)}" alt="${esc(photo.caption || photo.original_filename || 'Photo')}" loading="lazy" />
      </button>
      <div class="media-photo-meta">
        ${Number(photo.is_primary) === 1 ? '<span class="media-primary-badge">PRIMARY</span>' : ''}
        <small>${esc(photo.original_filename || 'photo')} · ${Math.max(1, Math.round(Number(photo.byte_size || 0) / 1024))} KB</small>
        ${state.auth.authenticated ? `<input data-media-caption="${esc(photo.id)}" value="${esc(photo.caption || '')}" placeholder="Caption / note" />` : `<div class="media-caption">${esc(photo.caption || '')}</div>`}
      </div>
      ${state.auth.authenticated ? `<div class="media-card-actions">
        <button class="secondary compact" type="button" data-media-save-caption="${esc(photo.id)}">SAVE</button>
        ${Number(photo.is_primary) === 1 ? '' : `<button class="secondary compact" type="button" data-media-primary="${esc(photo.id)}">PRIMARY</button>`}
        <button class="secondary compact" type="button" data-media-move="${esc(photo.id)}" data-direction="left" ${index === 0 ? 'disabled' : ''}>←</button>
        <button class="secondary compact" type="button" data-media-move="${esc(photo.id)}" data-direction="right" ${index === sorted.length - 1 ? 'disabled' : ''}>→</button>
        <button class="danger-btn compact" type="button" data-media-delete="${esc(photo.id)}">DELETE</button>
      </div>` : ''}
    </article>`).join('')}</div>` : '<div class="show-section-empty">No photos attached yet.</div>';

  const upload = state.auth.authenticated ? `
    <div class="media-dropzone" data-media-dropzone>
      <input class="hidden" type="file" data-media-file-input accept="image/jpeg,image/png,image/webp,image/gif" multiple />
      <input class="hidden" type="file" data-media-camera-input accept="image/*" capture="environment" />
      <div><b>Drop photos here</b><small>JPG, PNG, WEBP or GIF · up to 12 MB each</small></div>
      <div class="button-row">
        <button class="secondary compact" type="button" data-media-pick>CHOOSE PHOTOS</button>
        <button class="secondary compact" type="button" data-media-camera>TAKE PHOTO</button>
      </div>
    </div>` : '';

  return `<section class="show-detail-section media-section" data-media-gallery data-entity-type="${esc(entityType)}" data-entity-id="${esc(entityId)}">
    <div class="media-section-head"><h3>${esc(options.title || 'Photos')} · ${sorted.length}</h3>${primary ? `<span class="hint">Primary: ${esc(primary.caption || primary.original_filename || 'photo')}</span>` : ''}</div>
    ${hero}
    ${cards}
    ${upload}
  </section>`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Unable to read image.'));
    reader.readAsDataURL(file);
  });
}

async function uploadMediaFiles(entityType, entityId, files, refreshFn) {
  if (!requireLoginUi()) return;
  const list = [...(files || [])].filter((file) => file?.type?.startsWith('image/'));
  if (!list.length) return;
  for (const file of list) {
    if (file.size > 12 * 1024 * 1024) {
      flash(`${file.name} is larger than 12 MB.`, 'error');
      continue;
    }
    try {
      flash(`Uploading ${file.name}…`);
      const dataBase64 = await fileToBase64(file);
      await api('/api/media', {
        method: 'POST',
        body: JSON.stringify({
          entityType, entityId, filename: file.name, mimeType: file.type, dataBase64
        })
      });
    } catch (error) {
      flash(`${file.name}: ${error.message}`, 'error');
    }
  }
  await refreshFn();
  flash(`${list.length} photo${list.length === 1 ? '' : 's'} attached.`);
}

async function openCameraCapture(entityType, entityId, refreshFn) {
  if (!requireLoginUi()) return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
  } catch (error) {
    const reason = error?.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access for RoadBoxOS and try again.'
      : `Camera unavailable: ${error?.message || 'No usable camera was found.'}`;
    flash(reason, 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'camera-capture-overlay';
  overlay.innerHTML = `<div class="camera-capture-panel">
    <div class="camera-capture-head"><div><div class="eyebrow">LIVE CAMERA</div><h2>Take Photo</h2></div><button class="secondary compact" type="button" data-camera-close>CANCEL</button></div>
    <video data-camera-video autoplay playsinline muted></video>
    <div class="camera-capture-actions"><button class="primary" type="button" data-camera-shutter>CAPTURE PHOTO</button></div>
    <div class="hint">Uses the browser camera directly. Your browser may ask for camera permission the first time.</div>
  </div>`;
  document.body.appendChild(overlay);
  const video = overlay.querySelector('[data-camera-video]');
  video.srcObject = stream;

  const stop = () => {
    stream?.getTracks?.().forEach((track) => track.stop());
    overlay.remove();
  };
  overlay.querySelector('[data-camera-close]').addEventListener('click', stop);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) stop(); });
  overlay.querySelector('[data-camera-shutter]').addEventListener('click', async () => {
    if (!video.videoWidth || !video.videoHeight) {
      flash('Camera is still starting. Try the shutter again in a moment.', 'error');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) {
      flash('Unable to capture the camera frame.', 'error');
      return;
    }
    const filename = `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    const file = new File([blob], filename, { type: 'image/jpeg', lastModified: Date.now() });
    stop();
    await uploadMediaFiles(entityType, entityId, [file], refreshFn);
  });
}

function bindMediaGallery(entityType, entityId, refreshFn) {
  const gallery = $$('[data-media-gallery]').find((node) => node.dataset.entityType === entityType && node.dataset.entityId === entityId);
  if (!gallery) return;
  const input = gallery.querySelector('[data-media-file-input]');
  const camera = gallery.querySelector('[data-media-camera-input]');
  gallery.querySelector('[data-media-pick]')?.addEventListener('click', () => input?.click());
  gallery.querySelector('[data-media-camera]')?.addEventListener('click', async () => {
    if (navigator.mediaDevices?.getUserMedia) {
      await openCameraCapture(entityType, entityId, refreshFn);
    } else {
      flash('Direct camera capture is not available in this browser. Falling back to the device photo picker.', 'error');
      camera?.click();
    }
  });
  input?.addEventListener('change', async () => { await uploadMediaFiles(entityType, entityId, input.files, refreshFn); input.value = ''; });
  camera?.addEventListener('change', async () => { await uploadMediaFiles(entityType, entityId, camera.files, refreshFn); camera.value = ''; });

  const drop = gallery.querySelector('[data-media-dropzone]');
  for (const eventName of ['dragenter','dragover']) drop?.addEventListener(eventName, (event) => {
    event.preventDefault(); drop.classList.add('dragging');
  });
  for (const eventName of ['dragleave','drop']) drop?.addEventListener(eventName, (event) => {
    event.preventDefault(); drop.classList.remove('dragging');
  });
  drop?.addEventListener('drop', async (event) => {
    await uploadMediaFiles(entityType, entityId, event.dataTransfer?.files, refreshFn);
  });

  gallery.querySelectorAll('[data-media-open]').forEach((button) => button.addEventListener('click', () => {
    window.open(mediaUrl(button.dataset.mediaOpen), '_blank', 'noopener');
  }));
  gallery.querySelectorAll('[data-media-save-caption]').forEach((button) => button.addEventListener('click', async () => {
    const field = gallery.querySelector(`[data-media-caption="${button.dataset.mediaSaveCaption}"]`);
    try {
      await api(`/api/media/${button.dataset.mediaSaveCaption}`, { method: 'PATCH', body: JSON.stringify({ caption: field?.value || '' }) });
      await refreshFn(); flash('Photo caption saved.');
    } catch (error) { flash(error.message, 'error'); }
  }));
  gallery.querySelectorAll('[data-media-primary]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/api/media/${button.dataset.mediaPrimary}`, { method: 'PATCH', body: JSON.stringify({ isPrimary: true }) });
      await refreshFn(); flash('Primary photo updated.');
    } catch (error) { flash(error.message, 'error'); }
  }));
  gallery.querySelectorAll('[data-media-move]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/api/media/${button.dataset.mediaMove}/move`, { method: 'POST', body: JSON.stringify({ direction: button.dataset.direction }) });
      await refreshFn();
    } catch (error) { flash(error.message, 'error'); }
  }));
  gallery.querySelectorAll('[data-media-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Delete this photo? The image file will also be removed from RoadBoxOS media storage.')) return;
    try {
      await api(`/api/media/${button.dataset.mediaDelete}`, { method: 'DELETE', body: '{}' });
      await refreshFn(); flash('Photo deleted.');
    } catch (error) { flash(error.message, 'error'); }
  }));
}


function showLogin() { alert('This public demo is read-only.'); }

function hideLogin() { $('#loginModal').classList.add('hidden'); focusScanner(); }

function requireLoginUi() {
  if (state.auth.authenticated) return true;
  showLogin();
  flash('Log in to make changes.', 'error');
  return false;
}

function updateAuthUi() {
  purchasingUi.onAuth();
  const loggedIn = state.auth.authenticated;
  const identity = $('#authIdentity');
  identity.classList.toggle('read-only', !loggedIn);
  identity.classList.toggle('authenticated', loggedIn);
  $('#authUser').textContent = loggedIn ? state.auth.user : 'Read-only';
  $('#authRole').textContent = loggedIn ? 'Changes enabled' : 'Viewing only';
  $('#authButton').textContent = loggedIn ? 'Log Out' : 'Log In';
  $('#readOnlyBanner').classList.toggle('hidden', loggedIn);
  $$('.mode').forEach((button) => {
    const locked = !loggedIn && button.dataset.mode !== 'lookup';
    button.classList.toggle('locked', locked);
    button.setAttribute('aria-disabled', locked ? 'true' : 'false');
    button.title = locked ? 'Log in to use this mode' : '';
  });
  if (!loggedIn && state.mode !== 'lookup') setMode('lookup');
  if (state.currentAsset) renderAsset(state.currentAsset);
  if (state.currentShow && !$('#showModal').classList.contains('hidden')) renderShowDetail(state.currentShow);
  if (state.currentLedger && !$('#ledgerModal').classList.contains('hidden')) renderLedgerDetail(state.currentLedger.type, state.currentLedger.data);
  if (state.currentRoadBox && !$('#roadBoxModal').classList.contains('hidden')) renderRoadBoxDetail(state.currentRoadBox);
  if (state.currentCatalogItem && !$('#catalogModal').classList.contains('hidden')) renderCatalogDetail(state.currentCatalogItem);
  if ($('#view-ledgers')?.classList.contains('active')) refreshLedgers().catch(() => {});
  $$('[data-auth-download]').forEach((backupLink) => {
    backupLink.classList.toggle('locked', !loggedIn);
    backupLink.title = loggedIn ? 'Download backup' : 'Log in to download backups';
  });
}

async function refreshAuth() { state.auth = await api('/api/auth'); updateAuthUi(); }

function inheritedAssetPhotoHtml(asset) {
  const photos = asset.inherited_photos || [];
  if (!photos.length) return '';
  const primary = photos.find((p) => Number(p.is_primary) === 1) || photos[0];
  return `<section class="show-detail-section inherited-photo-section"><div class="section-heading-row"><h3>Family Photo</h3><span class="show-mini-pill">INHERITED</span></div><div class="inherited-photo-card"><img src="${mediaUrl(primary.id)}" alt="${esc(asset.catalog_family_name || asset.name)}" /><div><b>${esc(asset.catalog_family_name || 'Catalog family')}</b><small>This serialized child has no item-specific photo, so Quartermaster is showing the generic family image.</small></div></div></section>`;
}

function physicalKitContentsHtml(asset) {
  const contents = asset.kit_contents;
  if (!contents) return '';
  const serialized = contents.serialized || [];
  const catalog = contents.catalog || [];
  const rows = [
    ...serialized.map((row) => `<div class="kit-content-row"><span class="show-mini-pill">ASSET</span><div><b>${esc(row.asset_name)}</b><small>${esc(row.asset_barcode)}${row.catalog_family_name ? ` · ${esc(row.catalog_family_name)}` : ''}</small></div><button class="secondary compact" type="button" data-open-kit-child="${esc(row.asset_id)}">OPEN</button></div>`),
    ...catalog.map((row) => `<div class="kit-content-row"><span class="show-mini-pill">QTY</span><div><b>${esc(row.catalog_name)}</b><small>${Number(row.quantity)-Number(row.quantity_returned)} ${esc(row.unit || 'each')} · ${esc(row.generic_code || '')}</small></div></div>`)
  ];
  return `<section class="show-detail-section physical-kit-contents"><div class="section-heading-row"><h3>Physical Kit Contents</h3><span class="show-mini-pill">${serialized.length} serialized · ${contents.catalog_units || 0} generic</span></div>${rows.length ? `<div class="kit-content-list">${rows.join('')}</div>` : '<div class="show-section-empty">This physical Kit is empty. Use PACK TO THIS KIT, then scan its child items.</div>'}</section>`;
}


function kitStatePill(stateName) {
  const label = stateName === 'green' ? 'READY' : stateName === 'yellow' ? 'SPARE AVAILABLE' : 'MISSING';
  return `<span class="kit-recon-pill kit-recon-${esc(stateName)}">${label}</span>`;
}

function physicalKitStandardHtml(asset) {
  const standard = asset.kit_standard;
  const reconciliation = asset.kit_reconciliation;
  if (!standard) return '';

  let rowsHtml = '';
  let headingStatus = '';
  if (reconciliation && reconciliation.status === 'active') {
    const summary = reconciliation.summary || {};
    headingStatus = `<span class="show-mini-pill">${summary.green || 0} green · ${summary.yellow || 0} yellow · ${summary.red || 0} red</span>`;
    rowsHtml = (reconciliation.lines || []).map((line) => {
      const title = line.expected_asset_name || line.catalog_name || line.label;
      const detail = line.line_type === 'catalog'
        ? `${line.verified_quantity}/${line.expected_quantity} ${line.unit || 'each'} verified`
        : line.expected_asset_barcode
          ? `${line.expected_asset_barcode} · original unit expected`
          : `${line.verified_quantity}/${line.expected_quantity} fulfilled`;
      const availability = line.state === 'yellow' ? ` · ${line.spare_available} shelf spare${Number(line.spare_available)===1?'':'s'} available` : line.state === 'red' && Number(line.missing_quantity) > 0 ? ' · no ready substitute in this family' : '';
      return `<div class="kit-recon-row kit-recon-row-${esc(line.state)}">${kitStatePill(line.state)}<div><b>${esc(title)}</b><small>${esc(detail + availability)}${line.line_role === 'extra' ? ' · EXTRA / non-standard resident' : ''}</small></div></div>`;
    }).join('');
  } else {
    const summary = standard.summary || {};
    headingStatus = `<span class="show-mini-pill">${summary.filled_units || 0}/${summary.expected_units || 0} standard units</span>`;
    rowsHtml = (standard.rows || []).map((row) => {
      const resident = (row.resident_assets || []).map((a) => a.asset_name).join(', ');
      const detail = `${row.current_quantity}/${row.expected_quantity} ${row.unit || 'each'} present${resident ? ` · ${resident}` : ''}${row.state === 'yellow' ? ` · ${row.spare_available} shelf spare${Number(row.spare_available)===1?'':'s'}` : ''}`;
      return `<div class="kit-recon-row kit-recon-row-${esc(row.state)}">${kitStatePill(row.state)}<div><b>${esc(row.label)}</b><small>${esc(detail)}</small></div></div>`;
    }).join('');
    for (const extra of standard.extras?.serialized || []) {
      rowsHtml += `<div class="kit-recon-row kit-recon-row-extra"><span class="show-mini-pill">EXTRA</span><div><b>${esc(extra.asset_name)}</b><small>${esc(extra.asset_barcode)} · lives in this Kit but is not part of the saved Kit standard</small></div></div>`;
    }
  }

  const sessionButtons = !state.auth.authenticated ? '' : reconciliation?.status === 'active'
    ? `<div class="button-row kit-recon-actions">
        <button class="primary" type="button" data-reconcile-kit="${esc(asset.id)}" data-session-id="${esc(reconciliation.id)}">RECONCILE CONTENTS</button>
        <button class="${reconciliation.summary?.all_green ? 'primary' : 'danger-btn'}" type="button" data-finish-kit-reconciliation="${esc(reconciliation.id)}">${reconciliation.summary?.all_green ? 'COMPLETE KIT CHECK-IN' : 'SUBMIT FOR RECONCILIATION'}</button>
      </div>`
    : `<div class="button-row kit-recon-actions"><button class="secondary" type="button" data-start-kit-reconciliation="${esc(asset.id)}">START / RESTART CONTENT CHECK</button></div>`;

  const sessionNote = reconciliation
    ? `<div class="kit-recon-session-note"><b>${reconciliation.status === 'active' ? 'RETURN RECONCILIATION ACTIVE' : `LAST RECONCILIATION: ${String(reconciliation.status).toUpperCase()}`}</b><span>${reconciliation.status === 'active' ? 'Scan the exact units that came home. Green = verified original/fulfilled; yellow = missing but a family spare is on the shelf; red = missing with no ready substitute.' : `Started ${formatTime(reconciliation.started_at)}`}</span></div>`
    : `<div class="kit-recon-session-note"><b>KIT STANDARD</b><span>These are the saved requirements compared against the units that currently live in this physical Kit.</span></div>`;

  return `<section class="show-detail-section physical-kit-standard"><div class="section-heading-row"><h3>Kit Standard & Return Status</h3>${headingStatus}</div>${sessionNote}<div class="kit-recon-list">${rowsHtml || '<div class="show-section-empty">No Kit standard children have been defined yet.</div>'}</div>${sessionButtons}</section>`;
}

function renderAsset(asset) {
  state.currentAsset = asset;
  const clone = $('#assetCardTemplate').content.cloneNode(true);
  clone.querySelector('.asset-kicker').textContent = asset.barcode;
  clone.querySelector('.asset-name').textContent = asset.name;
  const pill = clone.querySelector('.status-pill');
  pill.textContent = statusLabel(asset.status);
  pill.classList.add(`status-${asset.status}`);
  clone.querySelector('.asset-meta').innerHTML = detailsPairs(asset).map(([k,v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  const mediaHost = clone.querySelector('.asset-media-host');
  if (mediaHost) mediaHost.innerHTML = `${inheritedAssetPhotoHtml(asset)}${mediaGalleryHtml('asset', asset.id, asset.photos || [], { title: 'Asset Photos', label: asset.name })}${codePreviewHtml(asset.barcode, asset.name)}${asset.kit_id || asset.asset_type === 'kit' ? physicalKitStandardHtml(asset) : ''}${physicalKitContentsHtml(asset)}`;
  const actions = clone.querySelector('.asset-actions');
  if (!state.auth.authenticated) {
    actions.innerHTML = `<div class="readonly-actions"><span>Read-only. Log in to change this asset.</span><button class="secondary" type="button" data-open-login>Log In</button></div>`;
  } else {
    if (asset.kit_id && !['retired','lost','in_repair'].includes(asset.status)) actions.innerHTML += `<button class="primary" type="button" data-use-physical-kit="${esc(asset.id)}">PACK TO THIS KIT</button>`;
    if (asset.status === 'available') actions.innerHTML += `<button class="secondary" data-action-ui="checkout">Check Out</button>`;
    if (asset.active_assignment?.assignment_type === 'kit') actions.innerHTML += `<button class="secondary" data-remove-from-kit="${esc(asset.id)}">REMOVE FROM KIT</button>`;
    else if (asset.status === 'allocated' || asset.status === 'lost') actions.innerHTML += `<button class="secondary" data-quick-action="checkin">Check In</button>`;
    if (asset.status !== 'retired') actions.innerHTML += `<button class="secondary" data-action-ui="move">Move</button>`;
    if (!['in_repair','retired'].includes(asset.status)) actions.innerHTML += `<button class="secondary" data-quick-action="repair">Repair</button>`;
    if (asset.status === 'in_repair') actions.innerHTML += `<button class="secondary" data-quick-action="available">Return Available</button>`;
    if (asset.status !== 'lost' && asset.status !== 'retired') actions.innerHTML += `<button class="danger-btn" data-quick-action="lost">Mark Lost</button>`;
    if (asset.status !== 'retired') actions.innerHTML += `<button class="danger-btn" data-quick-action="retire">Retire</button>`;
  }
  $('#result').replaceChildren(clone);
  bindAssetActions(); bindLoginTriggers(); bindCodePrintButtons($('#result'));
  $('[data-use-physical-kit]')?.addEventListener('click', async (event) => {
    state.checkoutTargetType = 'kit';
    state.checkoutKitAssetId = event.currentTarget.dataset.usePhysicalKit;
    localStorage.setItem('roadboxosCheckoutTargetType','kit');
    localStorage.setItem('roadboxosCheckoutKitAssetId',state.checkoutKitAssetId);
    if (!state.assetsCache.some((row)=>row.id===asset.id)) state.assetsCache.push(asset);
    await setMode('checkout');
    flash(`Packing scans into ${asset.name}.`);
  });

  $('[data-remove-from-kit]')?.addEventListener('click', async () => {
    if (!confirm(`Remove ${asset.name} from its physical Kit? This is an unpack/remove action, not a return verification.`)) return;
    try {
      const updated = await api(`/api/assets/${asset.id}/action`, { method:'POST', body:JSON.stringify({ action:'checkin', forceKitRemoval:true }) });
      renderAsset(updated); await refreshAssets(false); await refreshKits(false); flash(`${asset.name} removed from Kit and returned to available inventory.`);
    } catch (error) { alert(error.message); }
  });
  $('[data-start-kit-reconciliation]')?.addEventListener('click', async () => {
    try {
      await api(`/api/assets/${asset.id}/kit-reconciliation/start`, { method:'POST', body:'{}' });
      const fresh = await api(`/api/assets/${asset.id}`); renderAsset(fresh); flash(`Return reconciliation started for ${asset.name}.`);
    } catch (error) { alert(error.message); }
  });
  $('[data-reconcile-kit]')?.addEventListener('click', async (event) => {
    state.kitReconcileSessionId = event.currentTarget.dataset.sessionId;
    state.kitReconcileKitAssetId = asset.id;
    await setMode('kitreconcile');
    flash(`Kit reconciliation scanner armed for ${asset.name}. Scan the original child units that returned.`);
  });
  $('[data-finish-kit-reconciliation]')?.addEventListener('click', async (event) => {
    const recon = asset.kit_reconciliation;
    const incomplete = recon && !recon.summary?.all_green;
    if (incomplete && !confirm(`Submit ${asset.name} for reconciliation with ${recon.summary?.unresolved_lines || 0} unresolved line(s)?`)) return;
    try {
      const finished = await api(`/api/kit-reconciliations/${event.currentTarget.dataset.finishKitReconciliation}/finish`, { method:'POST', body:'{}' });
      state.kitReconcileSessionId = null; state.kitReconcileKitAssetId = null;
      await setMode('lookup');
      const fresh = await api(`/api/assets/${asset.id}`); renderAsset(fresh);
      flash(finished.status === 'completed' ? `${asset.name}: contents verified. Kit check-in complete.` : `${asset.name}: submitted for reconciliation.`);
    } catch (error) { alert(error.message); }
  });

  $$('[data-open-kit-child]').forEach((button)=>button.addEventListener('click', async ()=>{
    const child = await api(`/api/assets/${button.dataset.openKitChild}`); renderAsset(child);
  }));
  bindMediaGallery('asset', asset.id, async () => {
    const fresh = await api(`/api/assets/${asset.id}`);
    renderAsset(fresh);
    await refreshAssets(false);
  });
}


function renderRoadBoxScan(box) {
  state.currentAsset = null;
  const assignment = box.activeAssignment;
  const assignmentText = assignment
    ? `${assignment.job_number} · ${assignment.show_name}${assignment.deployment_name ? ` · ${assignment.deployment_name}` : ''}`
    : 'Not currently deployed';
  const cover = box.photos?.find((p) => Number(p.is_primary) === 1) || box.photos?.[0];
  $('#result').innerHTML = `<article class="asset-card road-box-scan-card">
    ${cover ? `<div class="scan-cover"><img src="${mediaUrl(cover.id)}" alt="${esc(box.name)}" /></div>` : ''}
    <div class="asset-card-top">
      <div><div class="asset-kicker">${esc(box.barcode || box.code)}</div><h3 class="asset-name">${esc(box.code)} · ${esc(box.name)}</h3></div>
      <span class="status-pill status-${esc(box.status)}">${esc(statusLabel(box.status))}</span>
    </div>
    <dl class="asset-meta">
      <div><dt>Type</dt><dd>${esc(box.box_type || 'Road Box')}</dd></div>
      <div><dt>Location</dt><dd>${esc(box.location || '—')}</dd></div>
      <div><dt>Contents</dt><dd>${(box.packedContents||[]).reduce((n,g)=>n+g.quantity,0)} total units · ${(box.packedContents||[]).length} item types</dd></div>
      <div><dt>Deployment</dt><dd>${esc(assignmentText)}</dd></div>
    </dl>
    ${packingUi.contentsHtml(box)}<div class="asset-actions"><button id="openScannedRoadBox" class="secondary" type="button">OPEN ROAD BOX</button>${state.auth.authenticated ? '<button id="useScannedRoadBox" class="primary" type="button">PACK TO THIS CONTAINER</button><button id="openScannedPacking" class="primary" type="button">OPEN LIVE PACKING</button>' : ''}</div>
  </article>`;
  $('#openScannedPacking')?.addEventListener('click',()=>packingUi.open({containerId:box.id}));
  $('#openScannedRoadBox')?.addEventListener('click', () => openRoadBox(box.id));
  $('#useScannedRoadBox')?.addEventListener('click', async () => {
    state.checkoutTargetType = 'road_box';
    state.checkoutRoadBoxId = box.id;
    localStorage.setItem('roadboxosCheckoutTargetType', 'road_box');
    localStorage.setItem('roadboxosCheckoutRoadBoxId', box.id);
    await setMode('checkout');
    flash(`Packing scans into ${box.code} · ${box.name}`);
  });
}

function roadBoxSelectOptions(selectedId = '') {
  const boxes = [...(state.roadBoxes || [])].sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true }));
  return boxes.map((box) => `<option value="${esc(box.id)}" ${box.id === selectedId ? 'selected' : ''}>${esc(box.code)} · ${esc(box.name)}${box.status !== 'available' ? ` · ${esc(statusLabel(box.status))}` : ''}</option>`).join('');
}

function startingPlacementHtml({ placementType = 'location', location = '', roadBoxId = '' } = {}) {
  const hasBoxes = (state.roadBoxes || []).length > 0;
  const type = placementType === 'road_box' && hasBoxes ? 'road_box' : 'location';
  return `<label>Starting placement<select name="startingPlacementType" data-starting-placement>
    <option value="location" ${type === 'location' ? 'selected' : ''}>Shop / loose location</option>
    <option value="road_box" ${type === 'road_box' ? 'selected' : ''} ${hasBoxes ? '' : 'disabled'}>Road Box / container${hasBoxes ? '' : ' (create one first)'}</option>
  </select></label>
  <label data-starting-location class="${type === 'location' ? '' : 'hidden'}">Starting location<input name="location" value="${esc(location)}" autocomplete="off" placeholder="Road Support / Shelf A3" /></label>
  <label data-starting-roadbox class="${type === 'road_box' ? '' : 'hidden'}">Starting Road Box<select name="initialRoadBoxId"><option value="">Choose a Road Box…</option>${roadBoxSelectOptions(roadBoxId)}</select></label>`;
}

function bindStartingPlacement(form) {
  if (!form) return;
  const selector = form.querySelector('[data-starting-placement]');
  const sync = () => {
    const roadBox = selector?.value === 'road_box';
    form.querySelector('[data-starting-location]')?.classList.toggle('hidden', roadBox);
    form.querySelector('[data-starting-roadbox]')?.classList.toggle('hidden', !roadBox);
    const roadBoxSelect = form.querySelector('[name="initialRoadBoxId"]');
    if (roadBoxSelect) roadBoxSelect.required = roadBox;
  };
  selector?.addEventListener('change', sync);
  sync();
}

function renderUnknown(barcode) {
  state.currentAsset = null;
  if (!state.auth.authenticated) {
    $('#result').innerHTML = `<div class="register-wrap readonly-unknown"><div class="eyebrow">UNKNOWN BARCODE</div><h2>${esc(barcode)} is not registered.</h2><p class="hint">You are in read-only mode. Log in before creating a new asset record.</p><div class="button-row"><button class="primary" type="button" data-open-login>LOG IN TO REGISTER</button></div></div>`;
    bindLoginTriggers(); focusScanner(); return;
  }
  const lastCategory = localStorage.getItem('roadboxosLastCategory') || '';
  const lastLocation = localStorage.getItem('roadboxosLastLocation') || '';
  const lastType = localStorage.getItem('roadboxosLastAssetType') || 'asset';
  const lastPlacementType = localStorage.getItem('roadboxosLastPlacementType') || 'location';
  const lastRoadBoxId = localStorage.getItem('roadboxosLastRoadBoxId') || '';
  $('#result').innerHTML = `<div class="register-wrap">
    <div class="eyebrow">UNKNOWN BARCODE</div><h2>Register ${esc(barcode)}</h2>
    <p class="hint">Add the minimum useful identity, then keep scanning.</p>
    <form id="registerForm" class="register-form">
      <label>Barcode<input name="barcode" value="${esc(barcode)}" readonly /></label>
      <label>Asset name *<input name="name" required autocomplete="off" placeholder="e.g. Fluke 87V #3" /></label>
      <label>Category<input name="category" value="${esc(lastCategory)}" autocomplete="off" placeholder="Meter, Drill, Road Box…" /></label>
      <label>Serial number<input name="serialNumber" autocomplete="off" /></label>
      ${startingPlacementHtml({ placementType: lastPlacementType, location: lastLocation, roadBoxId: lastRoadBoxId })}
      <label>Type<select name="assetType"><option value="asset" ${lastType === 'asset' ? 'selected' : ''}>Asset</option><option value="upright_caddy" ${lastType === 'upright_caddy' ? 'selected' : ''}>Upright Caddy</option><option value="kit" ${lastType === 'kit' ? 'selected' : ''}>Kit</option></select></label>
      <label>Catalog family<select name="catalogItemId"><option value="">No family / standalone asset</option>${state.catalogItems.filter((i) => ['serialized','hybrid'].includes(i.tracking_mode)).map((i) => `<option value="${esc(i.id)}">${esc(i.name)} · ${esc(i.item_code)}</option>`).join('')}</select></label>
      <label class="wide">Notes<textarea name="notes" rows="2"></textarea></label>
      <div class="wide button-row"><button class="primary" type="submit">REGISTER ASSET</button><button class="secondary" type="button" id="registerRoadBoxInstead">REGISTER AS ROAD BOX</button><button class="secondary" type="button" id="cancelRegister">Cancel</button></div>
    </form></div>`;
  bindStartingPlacement($('#registerForm'));
  $('#registerForm').addEventListener('submit', onRegister);
  $('#registerRoadBoxInstead').addEventListener('click', () => {
    $('#result').innerHTML = '';
    openNewRoadBox(barcode);
  });
  $('#cancelRegister').addEventListener('click', () => { $('#result').innerHTML = ''; focusScanner(); });
  $('#registerForm [name="name"]').focus();
}

function bindLoginTriggers() {
  $$('[data-open-login]').forEach((button) => {
    if (button.dataset.loginBound === '1') return;
    button.dataset.loginBound = '1'; button.addEventListener('click', showLogin);
  });
}

function bindAssetActions() {
  $$('[data-quick-action]').forEach((button) => button.addEventListener('click', async () => {
    if (!requireLoginUi()) return;
    const action = button.dataset.quickAction;
    if (['lost','retire'].includes(action) && !confirm(`${action === 'lost' ? 'Mark lost' : 'Retire'} ${state.currentAsset.name}?`)) return;
    await runAction(state.currentAsset, action);
  }));
  $$('[data-action-ui]').forEach((button) => button.addEventListener('click', async () => {
    if (!requireLoginUi()) return;
    const action = button.dataset.actionUi;
    if (action === 'checkout') {
      await setMode('checkout');
      flash('Choose Show, Person, Department, or Road Box above, then scan this asset again to check it out.');
      return;
    }
    const actions = $('.asset-actions');
    $('#inlineActionForm')?.remove();
    actions.insertAdjacentHTML('beforeend', `<form class="action-form move-action-form" id="inlineActionForm"><div id="inlineDestinationPicker"></div><button class="primary" type="submit">MOVE</button></form>`);
    let picker;
    $('#inlineActionForm').addEventListener('submit', async (e) => { e.preventDefault(); try {if(!picker)throw new Error('Wait for the destinations to load.');const payload=picker.payload();await runAction(state.currentAsset,action,payload.value || null,payload);}catch(error){flash(error.message,'error');} });
    picker=await destinationPicker.mount($('#inlineDestinationPicker'),{excludeId:state.currentAsset.id});
  }));
}

async function runAction(asset, action, value = null, context = {}) {
  if (!requireLoginUi()) return;
  try {
    setScanStatus('WRITING', 'busy');
    const updated = await api(`/api/assets/${asset.id}/action`, { method: 'POST', body: JSON.stringify({ action, value, ...context }) });
    beep('ok'); renderAsset(updated);
    flash(`${updated.name}: ${statusLabel(updated.status)}${action === 'move' ? ` → ${context.targetId?updated.custodian:updated.location}` : ''}`);
    setScanStatus('READY', 'ready'); await refreshStats(); await refreshShows(false); await refreshLedgers(false); if(action==='move') await Promise.all([refreshRoadBoxes(false),refreshAssets(false)]);
  } catch (error) {
    beep('bad'); flash(error.message, 'error'); setScanStatus('ERROR', 'error');
  } finally { if (!document.querySelector('.destination-picker input:focus')) focusScanner(); }
}

async function onRegister(event) {
  event.preventDefault(); if (!requireLoginUi()) return;
  const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries());
  localStorage.setItem('roadboxosLastCategory', body.category || '');
  localStorage.setItem('roadboxosLastLocation', body.startingPlacementType === 'location' ? (body.location || '') : '');
  localStorage.setItem('roadboxosLastPlacementType', body.startingPlacementType || 'location');
  localStorage.setItem('roadboxosLastRoadBoxId', body.startingPlacementType === 'road_box' ? (body.initialRoadBoxId || '') : '');
  localStorage.setItem('roadboxosLastAssetType', body.assetType || 'asset');
  if (body.startingPlacementType !== 'road_box') body.initialRoadBoxId = '';
  if (body.startingPlacementType === 'road_box') body.location = '';
  try {
    setScanStatus('WRITING', 'busy');
    const asset = await api('/api/assets', { method: 'POST', body: JSON.stringify(body) });
    renderAsset(asset); beep('ok'); flash(`${asset.name} registered by ${state.auth.user}.`); setScanStatus('READY', 'ready'); await refreshStats(); focusScanner();
  } catch (error) { beep('bad'); flash(error.message, 'error'); setScanStatus('ERROR', 'error'); }
}

async function onScan(event) {
  event.preventDefault();
  const input = $('#barcodeInput');
  const barcode = input.value.trim();
  if (!barcode) return;
  input.value = '';
  setScanStatus('SCAN', 'busy');

  try {
    const result = await api('/api/scan', { method: 'POST', body: JSON.stringify({ barcode }) });
    if (!result.found) {
      beep('bad');
      flash(`Unknown barcode: ${barcode}`, 'error');
      setScanStatus('UNKNOWN', 'error');
      renderUnknown(barcode);
      return;
    }


    if (state.mode === 'kitreconcile') {
      if (!state.kitReconcileSessionId || !state.kitReconcileKitAssetId) throw new Error('Choose a physical Kit reconciliation session first.');
      let quantity = 1;
      if (result.kind === 'catalog_item') {
        const raw = prompt(`How many ${result.catalogItem.unit || 'each'} of ${result.catalogItem.name} physically returned in the Kit?`, '1');
        if (raw === null) { setScanStatus('READY','ready'); return; }
        quantity = Number(raw);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantity must be greater than zero.');
      } else if (result.kind !== 'asset') {
        throw new Error('Kit reconciliation expects serialized child assets or generic Catalog family codes.');
      }
      const verified = await api(`/api/kit-reconciliations/${state.kitReconcileSessionId}/scan`, {
        method:'POST',
        body:JSON.stringify({ barcode, quantity })
      });
      const freshKit = await api(`/api/assets/${state.kitReconcileKitAssetId}`);
      renderAsset(freshKit);
      beep('ok');
      flash(verified.message || 'Kit return item verified.');
      setScanStatus('READY','ready');
      await refreshStats();
      await refreshAssets(false);
      await refreshCatalog(false);
      await refreshKits(false);
      return;
    }


    if (result.kind === 'catalog_item') {
      let item = result.catalogItem;
      if (state.mode === 'lookup') {
        renderCatalogScan(item);
        flash(`${item.name} catalog family found.`);
      } else {
        if (!requireLoginUi()) { renderCatalogScan(item); return; }
        if (state.mode === 'checkout') {
          if (item.tracking_mode === 'serialized') {
            renderCatalogScan(item);
            throw new Error(`${item.name} is serialized. Scan the QR/barcode on the individual tool, not the family code.`);
          }
          const qtyRaw = prompt(`${item.tracking_mode === 'quantity' ? 'Issue quantity' : 'Add generic / reconciliation quantity'} for ${item.name} (${item.unit})`, '1');
          if (qtyRaw === null) { setScanStatus('READY', 'ready'); renderCatalogScan(item); return; }
          const quantity = Number(qtyRaw);
          if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantity must be greater than zero.');
          item = await api(`/api/catalog-items/${item.id}/issue`, { method: 'POST', body: JSON.stringify({ ...checkoutTargetPayload(), quantity }) });
          flash(`${item.name}: ${quantity} ${item.unit} ${item.tracking_mode === 'quantity' ? 'issued' : 'added as generic line'} → ${checkoutTargetLabel()}`);
        } else if (state.mode === 'checkin') {
          if (item.tracking_mode === 'serialized') {
            renderCatalogScan(item);
            throw new Error(`${item.name} is serialized. Scan the individual child asset to check it in.`);
          }
          const active = item.activeAssignments || [];
          if (!active.length) throw new Error(`${item.name} has no active generic / quantity assignments.`);
          let assignmentId = active.length === 1 ? active[0].id : '';
          if (active.length > 1) {
            const choices = active.map((a, i) => `${i+1}. ${a.label} — ${Number(a.quantity)-Number(a.quantity_returned)} ${item.unit} remaining`).join('\n');
            const pick = prompt(`Multiple active assignments for ${item.name}. Choose one:\n${choices}`, '1');
            if (pick === null) { setScanStatus('READY', 'ready'); renderCatalogScan(item); return; }
            const idx = Number(pick) - 1;
            if (!Number.isInteger(idx) || !active[idx]) throw new Error('Invalid assignment selection.');
            assignmentId = active[idx].id;
          }
          const assignment = active.find((a) => a.id === assignmentId);
          const remaining = Number(assignment.quantity) - Number(assignment.quantity_returned);
          const qtyRaw = prompt(`Return quantity for ${item.name} from ${assignment.label} (${item.unit})`, String(remaining));
          if (qtyRaw === null) { setScanStatus('READY', 'ready'); renderCatalogScan(item); return; }
          const quantity = Number(qtyRaw);
          item = await api(`/api/catalog-items/${item.id}/return`, { method: 'POST', body: JSON.stringify({ assignmentId, quantity }) });
          flash(`${item.name}: returned ${quantity} ${item.unit}.`);
        } else if (state.mode === 'move') {
          throw new Error('Catalog family codes describe an item type, not one physical object. Change its home location in Catalog instead.');
        }
        renderCatalogScan(item);
      }
      beep('ok');
      setScanStatus('READY', 'ready');
      await refreshStats();
      await refreshCatalog(false);
await refreshKits(false);
await refreshPrintCodes(false);
      await refreshShows(false);
await refreshBilling(false);
      await refreshRoadBoxes(false);
      return;
    }

    if (result.kind === 'kit') {
      renderKitScan(result.kit);
      if (state.mode !== 'lookup') {
        throw new Error('AQK identifies the reusable Kit definition. Create or scan an AQA physical Kit instance to move/check it out.');
      }
      beep('ok');
      flash(`${result.kit.name} Kit found.`);
      setScanStatus('READY', 'ready');
      return;
    }

    if (result.kind === 'road_box') {
      let box = result.roadBox;
      if (state.mode === 'lookup') {
        renderRoadBoxScan(box);
        flash(`${box.code} · ${box.name} found.`);
      } else {
        if (!requireLoginUi()) { renderRoadBoxScan(box); return; }

        if (state.mode === 'checkout') {
          if (state.checkoutTargetType === 'show') {
            if (!state.checkoutShowId) throw new Error('Choose a show / job before scanning a Road Box.');
            const tree=await api(`/api/road-boxes/${box.id}/packing`);
            await api(`/api/road-boxes/${tree.rootId}/assign`, {method:'POST',body:JSON.stringify({showId:state.checkoutShowId,deploymentId:state.checkoutDeploymentId||null})});
            box=await api(`/api/road-boxes/${box.id}`);
            state.checkoutContainerId=box.id;localStorage.setItem('roadboxosCheckoutContainerId',box.id);
            flash(`${box.code}: selected for packing; deployed to ${box.activeAssignment?.job_number || 'show'}${box.activeAssignment?.deployment_name ? ` · ${box.activeAssignment.deployment_name}` : ''}`);
          } else if (state.checkoutTargetType === 'road_box') {
            state.checkoutRoadBoxId = box.id;
            localStorage.setItem('roadboxosCheckoutRoadBoxId', box.id);
            renderModeContext();
            flash(`Packing target changed to ${box.code} · ${box.name}. Scan tools next.`);
          } else {
            throw new Error('Rolling Stock can be deployed to a Show / Deployment. Choose Show / Job checkout mode first.');
          }
        } else if (state.mode === 'checkin') {
          box = await api(`/api/road-boxes/${box.id}/return`, { method: 'POST', body: '{}' });
          flash(`${box.code}: returned from deployment. Packed contents remain in the box until individually unpacked/check-in.`);
        } else if (state.mode === 'move') {
          const destination=destinationPayload(state.moveDestination);
          if (destination.targetType) {
            if (destination.targetType!=='road_box') throw new Error('A Rolling Stock container can attach to another container. Choose a container destination.');
            await api(`/api/road-boxes/${destination.targetId}/attach`,{method:'POST',body:JSON.stringify({childId:box.id})});
            box=await api(`/api/road-boxes/${box.id}`);
          } else box=await api(`/api/road-boxes/${box.id}`,{method:'PATCH',body:JSON.stringify({location:destination.value})});
          flash(`${box.code}: moved → ${state.moveDestination.name || box.location}`);
        }
        renderRoadBoxScan(box);
      }

      beep('ok');
      setScanStatus('READY', 'ready');
      await refreshStats();
      await refreshShows(false);
      await refreshRoadBoxes(false);
      return;
    }

    let asset = result.asset;
    const actionMap = { checkout: 'checkout', checkin: 'checkin', move: 'move' };
    if (state.mode !== 'lookup') {
      if (!requireLoginUi()) { renderAsset(asset); return; }
      const action = actionMap[state.mode];
      let body = { action, value: null };

      if (state.mode === 'checkout') {
        body.targetType = state.checkoutTargetType;
        if (state.checkoutTargetType === 'show') {
          if (!state.checkoutShowId) throw new Error('Choose a show / job for checkout.');
          body.targetId = state.checkoutShowId;
          body.showId = state.checkoutShowId;
          body.deploymentId = state.checkoutDeploymentId || null;
          body.containerId=state.checkoutContainerId||null;
        } else if (state.checkoutTargetType === 'person') {
          if (!state.checkoutPersonId) throw new Error('Choose a person for checkout.');
          body.targetId = state.checkoutPersonId;
          body.personId = state.checkoutPersonId;
          body.purpose = state.checkoutPurpose || null;
        } else if (state.checkoutTargetType === 'department') {
          if (!state.checkoutDepartmentId) throw new Error('Choose a department for checkout.');
          body.targetId = state.checkoutDepartmentId;
          body.departmentId = state.checkoutDepartmentId;
          body.purpose = state.checkoutPurpose || null;
        } else if (state.checkoutTargetType === 'road_box') {
          if (!state.checkoutRoadBoxId) throw new Error('Choose a Road Box for packing.');
          body.targetId = state.checkoutRoadBoxId;
          body.roadBoxId = state.checkoutRoadBoxId;
          body.purpose = state.checkoutPurpose || null;
        } else if (state.checkoutTargetType === 'kit') {
          if (!state.checkoutKitAssetId) throw new Error('Choose a physical Kit for packing.');
          body.targetId = state.checkoutKitAssetId;
          body.kitAssetId = state.checkoutKitAssetId;
          body.purpose = state.checkoutPurpose || null;
        } else {
          throw new Error('Choose a checkout target.');
        }
      } else if (state.mode === 'move') {
        Object.assign(body,destinationPayload(state.moveDestination));
      }

      asset = await api(`/api/assets/${asset.id}/action`, { method: 'POST', body: JSON.stringify(body) });
      const suffix = state.mode === 'checkout' ? ` → ${asset.custodian}` : state.mode === 'move' ? ` → ${body.targetId?asset.custodian:asset.location}` : '';
      flash(`${asset.name}: ${state.mode.replace('checkin','checked in').replace('checkout','checked out')}${suffix}`);
    } else {
      flash(`${asset.name} found.`);
    }

    renderAsset(asset);
    beep('ok');
    setScanStatus('READY', 'ready');
    await refreshStats();
    await refreshShows(false);
    await refreshLedgers(false);
    await refreshRoadBoxes(false);
  } catch (error) {
    beep('bad');
    flash(error.message, 'error');
    setScanStatus('ERROR', 'error');
  } finally {
    if(state.mode==='checkout'){const id=state.checkoutTargetType==='road_box'?state.checkoutRoadBoxId:state.checkoutTargetType==='show'?state.checkoutContainerId:null;if(id)try{const box=await api(`/api/road-boxes/${id}`);$('#stationPackingContents').innerHTML=`<h3>Packing into ${esc(box.code)} · ${esc(box.name)}</h3>${packingUi.contentsHtml(box)}`;}catch{}else $('#stationPackingContents').innerHTML='';}
    if (!$('#registerForm')) focusScanner();
  }
}


async function populateDeploymentSelector(showId) {
  const select = $('#checkoutDeployment');
  if (!select) return;
  if (!showId) {
    select.innerHTML = '<option value="">Choose a show first</option>';
    select.disabled = true;
    return;
  }
  try {
    const show = await api(`/api/shows/${showId}`);
    select.disabled = false;
    select.innerHTML = `<option value="">General / whole show</option>${show.deployments.map((d) => `<option value="${esc(d.id)}" ${d.id === state.checkoutDeploymentId ? 'selected' : ''}>${esc(deploymentTypeLabel(d.deployment_type))} — ${esc(d.name)}</option>`).join('')}`;
    if (state.checkoutDeploymentId && !show.deployments.some((d) => d.id === state.checkoutDeploymentId)) {
      state.checkoutDeploymentId = '';
      localStorage.removeItem('roadboxosCheckoutDeploymentId');
    }
  } catch {
    select.innerHTML = '<option value="">Unable to load deployments</option>';
  }
}

function checkoutTargetLabel() {
  if (state.checkoutTargetType === 'show') {
    const show = state.shows.find((s) => s.id === state.checkoutShowId);
    return show ? `${show.job_number} · ${show.name}` : 'Show / Job';
  }
  if (state.checkoutTargetType === 'person') {
    return state.people.find((p) => p.id === state.checkoutPersonId)?.name || 'Person';
  }
  if (state.checkoutTargetType === 'department') {
    return state.departments.find((d) => d.id === state.checkoutDepartmentId)?.name || 'Department';
  }
  if (state.checkoutTargetType === 'road_box') {
    const box = state.roadBoxes.find((b) => b.id === state.checkoutRoadBoxId);
    return box ? `${box.code} · ${box.name}` : 'Road Box';
  }
  if (state.checkoutTargetType === 'kit') {
    return state.assetsCache.find((a) => a.id === state.checkoutKitAssetId)?.name || 'Physical Kit';
  }
  return 'Checkout target';
}

function renderModeContext() {
  const ctx = $('#modeContext');
  if (state.mode === 'checkout') {
    const showOptions = state.shows.map((s) => `<option value="${esc(s.id)}" ${s.id === state.checkoutShowId ? 'selected' : ''}>${esc(s.job_number)} — ${esc(s.name)} [${esc(laneLabel(s.status))}]</option>`).join('');
    const peopleOptions = state.people.filter((p) => Number(p.active) === 1).map((p) => `<option value="${esc(p.id)}" ${p.id === state.checkoutPersonId ? 'selected' : ''}>${esc(p.name)}${p.department_name ? ` — ${esc(p.department_name)}` : ''}</option>`).join('');
    const departmentOptions = state.departments.map((d) => `<option value="${esc(d.id)}" ${d.id === state.checkoutDepartmentId ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
    const roadBoxOptions = state.roadBoxes.filter((b) => !['retired','lost','in_repair'].includes(b.status)).map((b) => `<option value="${esc(b.id)}" ${b.id === state.checkoutRoadBoxId ? 'selected' : ''}>${esc(b.code)} — ${esc(b.name)}${b.job_number ? ` [${esc(b.job_number)}${b.deployment_name ? ` · ${esc(b.deployment_name)}` : ''}]` : ''}</option>`).join('');
    const physicalKitOptions = state.assetsCache.filter((a) => a.kit_id && !['retired','lost','in_repair'].includes(a.status)).sort((a,b)=>a.name.localeCompare(b.name)).map((a)=>`<option value="${esc(a.id)}" ${a.id===state.checkoutKitAssetId?'selected':''}>${esc(a.name)} — ${esc(a.barcode)}${a.custodian ? ` [${esc(a.custodian)}]` : ''}</option>`).join('');
    const targetType = state.checkoutTargetType;

    ctx.classList.remove('hidden');
    ctx.innerHTML = `<div class="checkout-context structured-checkout">
      <div class="checkout-label">Assign scans to</div>
      <select id="checkoutTargetType">
        <option value="show" ${targetType === 'show' ? 'selected' : ''}>Show / Job</option>
        <option value="person" ${targetType === 'person' ? 'selected' : ''}>Person</option>
        <option value="department" ${targetType === 'department' ? 'selected' : ''}>Department</option>
        <option value="road_box" ${targetType === 'road_box' ? 'selected' : ''}>Road Box / Container</option>
        <option value="kit" ${targetType === 'kit' ? 'selected' : ''}>Physical Kit / Bag</option>
      </select>

      <div class="checkout-target-fields ${targetType === 'show' ? '' : 'hidden'}" id="checkoutShowFields">
        <select id="checkoutShow"><option value="">Choose show / job…</option>${showOptions}</select>
        <select id="checkoutDeployment"><option value="">General / whole show</option></select>
        <label>Physical container (optional)<select id="checkoutShowContainer"><option value="">No container / loose show inventory</option>${roadBoxOptions}</select></label>
        <small>Scan a container to select it; following item scans go into that bin. A show assignment alone leaves items loose.</small>
        <button class="secondary compact" id="stationBuildStack" type="button">BUILD / PACK SHOW STACK</button>
      </div>

      <div class="checkout-target-fields ${targetType === 'person' ? '' : 'hidden'}" id="checkoutPersonFields">
        <select id="checkoutPerson"><option value="">Choose person…</option>${peopleOptions}</select>
        <input id="checkoutPurposePerson" placeholder="Purpose / internal task (optional)" autocomplete="off" value="${esc(state.checkoutPurpose)}" />
      </div>

      <div class="checkout-target-fields ${targetType === 'department' ? '' : 'hidden'}" id="checkoutDepartmentFields">
        <select id="checkoutDepartment"><option value="">Choose department…</option>${departmentOptions}</select>
        <input id="checkoutPurposeDepartment" placeholder="Purpose / internal task (optional)" autocomplete="off" value="${esc(state.checkoutPurpose)}" />
      </div>

      <div class="checkout-target-fields ${targetType === 'road_box' ? '' : 'hidden'}" id="checkoutRoadBoxFields">
        <select id="checkoutRoadBox"><option value="">Choose Road Box…</option>${roadBoxOptions}</select>
        <input id="checkoutPurposeRoadBox" placeholder="Packing note / purpose (optional)" autocomplete="off" value="${esc(state.checkoutPurpose)}" />
      </div>

      <div class="checkout-target-fields ${targetType === 'kit' ? '' : 'hidden'}" id="checkoutKitFields">
        <select id="checkoutKitAsset"><option value="">Choose physical Kit…</option>${physicalKitOptions}</select>
        <input id="checkoutPurposeKit" placeholder="Kit packing note / purpose (optional)" autocomplete="off" value="${esc(state.checkoutPurpose)}" />
      </div>
    </div>`;

    $('#checkoutShowContainer').value=state.checkoutContainerId;
    $('#checkoutShowContainer').onchange=e=>{state.checkoutContainerId=e.target.value;localStorage.setItem('roadboxosCheckoutContainerId',state.checkoutContainerId);focusScanner();};
    $('#stationBuildStack').onclick=()=>packingUi.open({showId:state.checkoutShowId,deploymentId:state.checkoutDeploymentId,containerId:state.checkoutContainerId});
    $('#checkoutTargetType').addEventListener('change', async (e) => {
      state.checkoutTargetType = e.target.value;
      localStorage.setItem('roadboxosCheckoutTargetType', state.checkoutTargetType);
      renderModeContext();
      focusScanner();
    });

    $('#checkoutShow')?.addEventListener('change', async (e) => {
      state.checkoutShowId = e.target.value;
      state.checkoutContainerId='';localStorage.removeItem('roadboxosCheckoutContainerId');
      $('#checkoutShowContainer').value='';
      state.checkoutDeploymentId = '';
      if (state.checkoutShowId) localStorage.setItem('roadboxosCheckoutShowId', state.checkoutShowId);
      else localStorage.removeItem('roadboxosCheckoutShowId');
      localStorage.removeItem('roadboxosCheckoutDeploymentId');
      await populateDeploymentSelector(state.checkoutShowId);
      focusScanner();
    });

    $('#checkoutDeployment')?.addEventListener('change', (e) => {
      state.checkoutDeploymentId = e.target.value;
      state.checkoutContainerId='';localStorage.removeItem('roadboxosCheckoutContainerId');$('#checkoutShowContainer').value='';
      if (state.checkoutDeploymentId) localStorage.setItem('roadboxosCheckoutDeploymentId', state.checkoutDeploymentId);
      else localStorage.removeItem('roadboxosCheckoutDeploymentId');
      focusScanner();
    });

    $('#checkoutPerson')?.addEventListener('change', (e) => {
      state.checkoutPersonId = e.target.value;
      if (state.checkoutPersonId) localStorage.setItem('roadboxosCheckoutPersonId', state.checkoutPersonId);
      else localStorage.removeItem('roadboxosCheckoutPersonId');
      focusScanner();
    });

    $('#checkoutDepartment')?.addEventListener('change', (e) => {
      state.checkoutDepartmentId = e.target.value;
      if (state.checkoutDepartmentId) localStorage.setItem('roadboxosCheckoutDepartmentId', state.checkoutDepartmentId);
      else localStorage.removeItem('roadboxosCheckoutDepartmentId');
      focusScanner();
    });

    $('#checkoutRoadBox')?.addEventListener('change', (e) => {
      state.checkoutRoadBoxId = e.target.value;
      if (state.checkoutRoadBoxId) localStorage.setItem('roadboxosCheckoutRoadBoxId', state.checkoutRoadBoxId);
      else localStorage.removeItem('roadboxosCheckoutRoadBoxId');
      focusScanner();
    });
    $('#checkoutKitAsset')?.addEventListener('change', (e) => {
      state.checkoutKitAssetId = e.target.value;
      if (state.checkoutKitAssetId) localStorage.setItem('roadboxosCheckoutKitAssetId', state.checkoutKitAssetId);
      else localStorage.removeItem('roadboxosCheckoutKitAssetId');
      focusScanner();
    });

    const purposeHandler = (e) => {
      state.checkoutPurpose = e.target.value.trim();
      if (state.checkoutPurpose) localStorage.setItem('roadboxosCheckoutPurpose', state.checkoutPurpose);
      else localStorage.removeItem('roadboxosCheckoutPurpose');
    };
    $('#checkoutPurposePerson')?.addEventListener('input', purposeHandler);
    $('#checkoutPurposeDepartment')?.addEventListener('input', purposeHandler);
    $('#checkoutPurposeRoadBox')?.addEventListener('input', purposeHandler);
    $('#checkoutPurposeKit')?.addEventListener('input', purposeHandler);

    if (targetType === 'show') populateDeploymentSelector(state.checkoutShowId);
  } else if (state.mode === 'kitreconcile') {
    ctx.classList.remove('hidden');
    const kitName = state.currentAsset?.id === state.kitReconcileKitAssetId ? state.currentAsset.name : 'Physical Kit';
    ctx.innerHTML = `<div class="kit-reconcile-mode-context"><div><b>KIT RETURN RECONCILIATION</b><span>${esc(kitName)} · scan original resident units without unpacking them from the Kit.</span></div><button id="exitKitReconcileMode" class="secondary compact" type="button">EXIT TO LOOKUP</button></div>`;
    $('#exitKitReconcileMode')?.addEventListener('click', async () => { state.kitReconcileSessionId=null;state.kitReconcileKitAssetId=null;await setMode('lookup'); });
  } else if (state.mode === 'move') {
    ctx.classList.remove('hidden');
    ctx.innerHTML = '<div class="move-context"><b>Move scans to</b><div id="modeDestinationPicker"></div></div>';
    void destinationPicker.mount($('#modeDestinationPicker'),{selection:state.moveDestination,onChange:value=>{state.moveDestination=value;},onSelected:focusScanner});
  } else {
    ctx.classList.add('hidden');
    ctx.innerHTML = '';
    if (state.mode !== 'checkout') state.contextValue = '';
  }
}

async function setMode(mode) {
  if (mode !== 'lookup' && !state.auth.authenticated) { showLogin(); flash('Log in to use checkout, check-in, move, or Kit reconciliation mode.', 'error'); return; }
  state.mode = mode;
  $$('.mode').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  if (mode === 'checkout') {
    if (!state.shows.length) await refreshShows(false);
    if (!state.people.length && !state.departments.length) await refreshLedgers(false);
    if (!state.roadBoxes.length) await refreshRoadBoxes(false);
  }
  renderModeContext(); focusScanner();
}

async function refreshStats() {
  const d = await api('/api/dashboard');
  const cards = [
    ['Total Assets', d.total], ['Available', d.byStatus.available || 0], ['Checked Out', d.byStatus.allocated || 0],
    ['Repair', d.byStatus.in_repair || 0], ['Active Shows', d.activeShows || 0], ['Outstanding', d.outstandingAssignments || 0],
    ['Internal Out', d.internalOutstanding || 0], ['Physical Kits', d.physicalKits || 0], ['Catalog Families', d.catalogItems || 0], ['Generic Out', d.genericOut || 0], ['Rolling Stock', d.roadBoxes || 0],
    ['Boxes Deployed', d.deployedRoadBoxes || 0], ['Reconciliation', d.reconciliationShows || 0]
  ];
  $('#stats').innerHTML = cards.map(([label, value]) => `<div class="stat"><span>${esc(label)}</span><b>${value}</b></div>`).join('');
}

async function refreshAssets(render = true) {
  const query = render ? ($('#assetSearch')?.value || '').trim() : '';
  const assets = await api(`/api/assets?q=${encodeURIComponent(query)}`);
  state.assetsCache = assets;
  if (!render) return assets;
  if (!assets.length) { $('#assetTableWrap').innerHTML = '<div class="empty">No assets found.</div>'; return assets; }
  $('#assetTableWrap').innerHTML = `<div style="overflow:auto"><table class="asset-table"><thead><tr><th>Photo</th><th>Barcode</th><th>Name</th><th>Status</th><th>Location</th><th>Custodian / Show</th><th>Serial</th></tr></thead><tbody>${assets.map((a) => `<tr data-asset-id="${esc(a.id)}"><td>${mediaThumbHtml(a.primary_media_id, a.name, 'table-thumb')}${Number(a.primary_media_inherited)===1?'<div class="hint">family</div>':''}</td><td class="mono">${esc(a.barcode)}</td><td><b>${esc(a.name)}</b><div class="hint">${esc([a.category, a.manufacturer, a.manufacturer_part_number].filter(Boolean).join(' · '))}</div></td><td><span class="status-pill status-${esc(a.status)}">${esc(statusLabel(a.status))}</span></td><td>${esc(a.location || '—')}</td><td>${esc(a.custodian || '—')}</td><td class="mono">${esc(a.serial_number || '—')}</td></tr>`).join('')}</tbody></table></div>`;
  $$('#assetTableWrap tbody tr').forEach((row) => row.addEventListener('click', async () => {
    const asset = await api(`/api/assets/${row.dataset.assetId}`); switchView('scan'); renderAsset(asset); focusScanner();
  }));
  return assets;
}

async function refreshHistory() {
  const events = await api('/api/events?limit=200');
  $('#historyList').innerHTML = events.length ? events.map((e) => `<div class="history-item"><div class="history-time">${esc(formatTime(e.created_at))}<br>${esc(e.actor || '')}</div><div><div><span class="history-type">${esc(e.event_type)}</span>${e.asset_name ? ` · <b>${esc(e.asset_name)}</b> <span class="mono">${esc(e.asset_barcode || '')}</span>` : ''}</div><div class="history-detail">${esc(JSON.stringify(e.details))}</div></div></div>`).join('') : '<div class="empty">No history yet.</div>';
}

function showCardHtml(show) {
  const dateLabel = show.show_date ? `Show ${formatDate(show.show_date)}` : show.ship_date ? `Ship ${formatDate(show.ship_date)}` : 'Date TBD';
  return `<button class="show-card" data-show-id="${esc(show.id)}">
    <div class="show-card-title">${esc(show.name)}</div>
    <div class="show-card-job">JOB ${esc(show.job_number)}</div>
    <div class="show-card-meta">
      <div>${esc(dateLabel)}</div>
      ${show.location ? `<div><strong>${esc(show.location)}</strong></div>` : ''}
      ${show.client ? `<div>${esc(show.client)}</div>` : ''}
    </div>
    <div class="show-card-pills">
      ${show.deployment_count ? `<span class="show-mini-pill">${show.deployment_count} deployment${show.deployment_count === 1 ? '' : 's'}</span>` : ''}
      ${show.road_boxes_out ? `<span class="show-mini-pill">${show.road_boxes_out} box${show.road_boxes_out === 1 ? '' : 'es'}</span>` : ''}
      ${show.catalog_units_out ? `<span class="show-mini-pill">${show.catalog_units_out} generic</span>` : ''}
      ${show.assets_out ? `<span class="show-mini-pill outstanding">${show.assets_out} tool${show.assets_out === 1 ? '' : 's'} out</span>` : ''}
      ${show.assets_lost ? `<span class="show-mini-pill lost">${show.assets_lost} lost</span>` : ''}
      ${show.billing_count ? `<span class="show-mini-pill">${show.billing_count} reconciliation${show.billing_count===1?'':'s'} · ${esc(moneyDisplay(show.billing_total_cents,'USD'))}</span>` : ''}
      ${show.risk_level ? `<span class="show-mini-pill risk">${esc(show.risk_level)}</span>` : ''}
    </div>
  </button>`;
}

function renderShowBoard() {
  const lanes = state.config.showLanes.length ? state.config.showLanes : ['award','design','fabricate','tech','pack','stage_load','outbound','on_site','inbound','reprocess','reconciliation','reset'];
  const query = ($('#showSearch')?.value || '').trim().toLowerCase();
  const visibleShows = query ? state.shows.filter((s) => [s.job_number, s.name, s.client, s.location].some((v) => String(v || '').toLowerCase().includes(query))) : state.shows;
  $('#showBoard').innerHTML = lanes.map((lane) => {
    const shows = visibleShows.filter((s) => s.status === lane);
    return `<section class="show-lane"><div class="show-lane-head"><span>${esc(laneLabel(lane))}</span><span class="show-lane-count">${shows.length}</span></div><div class="show-lane-body">${shows.length ? shows.map(showCardHtml).join('') : '<div class="show-empty-lane">No jobs</div>'}</div></section>`;
  }).join('');
  $$('.show-card').forEach((card) => card.addEventListener('click', () => openShow(card.dataset.showId)));
}

async function refreshShows(render = true) {
  state.shows = await api('/api/shows');
  if (render && $('#showBoard')) renderShowBoard();
  if (state.mode === 'checkout' && $('#modeContext')) renderModeContext();
  return state.shows;
}

function openShowModal() { $('#showModal').classList.remove('hidden'); }
function closeShowModal() { $('#showModal').classList.add('hidden'); state.currentShow = null; focusScanner(); }

function newShowFormHtml() {
  const laneOptions = state.config.showLanes.map((lane) => `<option value="${esc(lane)}">${esc(laneLabel(lane))}</option>`).join('');
  return `<form id="newShowForm" class="show-form">
    <label>Job number *<input name="jobNumber" required autocomplete="off" placeholder="26190" /></label>
    <label class="span-2">Show / project name *<input name="name" required autocomplete="off" placeholder="iHeart Vegas" /></label>
    <label>Client<input name="client" autocomplete="off" /></label>
    <label>Status<select name="status">${laneOptions}</select></label>
    <label>Location<input name="location" autocomplete="off" /></label>
    <label>Ship date<input name="shipDate" type="date" /></label>
    <label>Show date<input name="showDate" type="date" /></label>
    <label>Return date<input name="returnDate" type="date" /></label>
    <label>Risk level<input name="riskLevel" placeholder="Normal / Watch / At Risk" /></label>
    <label class="wide">Notes<textarea name="notes" rows="3"></textarea></label>
    <div class="wide button-row"><button class="primary" type="submit">CREATE SHOW</button><button class="secondary" type="button" data-close-show-modal>Cancel</button></div>
  </form>`;
}

function openNewShow() {
  if (!requireLoginUi()) return;
  state.currentShow = null;
  $('#showModalEyebrow').textContent = 'NEW SHOW / JOB';
  $('#showModalTitle').textContent = 'Create a parent job';
  $('#showModalBody').innerHTML = newShowFormHtml();
  openShowModal(); bindShowModalClose();
  $('#newShowForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      const created = await api('/api/shows', { method: 'POST', body: JSON.stringify(body) });
      state.currentShow = created; await refreshShows(); await refreshStats(); renderShowDetail(created); flash(`${created.job_number} · ${created.name} created.`);
    } catch (error) { alert(error.message); }
  });
  $('#newShowForm [name="jobNumber"]').focus();
}

function bindShowModalClose() { $$('[data-close-show-modal]').forEach((node) => node.addEventListener('click', closeShowModal)); }

async function openShow(id) {
  try {
    await refreshRoadBoxes(false);
    state.currentShow = await api(`/api/shows/${id}`);
    renderShowDetail(state.currentShow); openShowModal();
  } catch (error) { flash(error.message, 'error'); }
}

function showMetaForm(show) {
  const laneOptions = state.config.showLanes.map((lane) => `<option value="${esc(lane)}" ${show.status === lane ? 'selected' : ''}>${esc(laneLabel(lane))}</option>`).join('');
  return `<form id="showMetaForm" class="show-form ${state.auth.authenticated ? '' : 'readonly-lock'}">
    <label>Job number<input name="jobNumber" value="${esc(show.job_number)}" required /></label>
    <label class="span-2">Show / project<input name="name" value="${esc(show.name)}" required /></label>
    <label>Client<input name="client" value="${esc(show.client || '')}" /></label>
    <label>Status<select name="status">${laneOptions}</select></label>
    <label>Location<input name="location" value="${esc(show.location || '')}" /></label>
    <label>Ship date<input name="shipDate" type="date" value="${esc(show.ship_date || '')}" /></label>
    <label>Show date<input name="showDate" type="date" value="${esc(show.show_date || '')}" /></label>
    <label>Return date<input name="returnDate" type="date" value="${esc(show.return_date || '')}" /></label>
    <label>Risk level<input name="riskLevel" value="${esc(show.risk_level || '')}" /></label>
    <label class="wide">Parent notes<textarea name="notes" rows="2">${esc(show.parent_notes || '')}</textarea></label>
    ${state.auth.authenticated ? '<div class="wide button-row"><button class="primary" type="submit">SAVE SHOW</button></div>' : ''}
  </form>`;
}

function deploymentListHtml(show) {
  if (!show.deployments.length) return '<div class="show-section-empty">No deployments yet. The parent job can exist before any field movement is planned.</div>';
  return `<div class="deployment-list">${show.deployments.map((d) => `<div class="deployment-card">
    <div class="deployment-card-top"><div><div class="deployment-type">${esc(deploymentTypeLabel(d.deployment_type))}</div><b>${esc(d.name)}</b></div><div class="button-row"><span class="show-mini-pill">${esc(d.status)}</span>${d.road_box_count ? `<span class="show-mini-pill">${d.road_box_count} box${d.road_box_count === 1 ? '' : 'es'}</span>` : ''}</div></div>
    <div class="deployment-meta">${d.scheduled_start ? `Start ${esc(formatDate(d.scheduled_start))}` : 'Start TBD'}${d.scheduled_end ? ` · End ${esc(formatDate(d.scheduled_end))}` : ''}${d.location ? ` · ${esc(d.location)}` : ''}</div>
    ${d.notes ? `<div class="hint">${esc(d.notes)}</div>` : ''}
  </div>`).join('')}</div>`;
}

function deploymentFormHtml() {
  if (!state.auth.authenticated) return '<div class="show-section-empty">Log in to add a deployment.</div>';
  const typeOptions = state.config.deploymentTypes.map((type) => `<option value="${esc(type)}">${esc(deploymentTypeLabel(type))}</option>`).join('');
  return `<form id="deploymentForm" class="deployment-form">
    <label>Deployment name<input name="name" required placeholder="Main show / Site survey / Add #1…" /></label>
    <label>Type<select name="deploymentType">${typeOptions}</select></label>
    <label>Start<input name="scheduledStart" type="date" /></label>
    <label>End<input name="scheduledEnd" type="date" /></label>
    <label class="wide">Location<input name="location" /></label>
    <label class="wide">Notes<textarea name="notes" rows="2"></textarea></label>
    <div class="wide"><button class="secondary" type="submit">+ ADD DEPLOYMENT</button></div>
  </form>`;
}

function assignmentListHtml(show) {
  if (!show.activeAssets.length) return '<div class="show-section-empty">No tools are currently checked out to this job.</div>';
  return `<div class="assignment-list">${show.activeAssets.map((a) => `<div class="assignment-row"><span class="mono">${esc(a.barcode)}</span><div><b>${esc(a.asset_name)}</b><small>${esc(a.deployment_name || 'General show assignment')}${a.assignment_source === 'road_box' ? ` · via ${esc(a.road_box_code || 'Road Box')}` : ''}${a.asset_status === 'lost' ? ' · LOST' : ''}</small></div><span class="show-mini-pill ${a.asset_status === 'lost' ? 'lost' : 'outstanding'}">${esc(statusLabel(a.asset_status))}</span></div>`).join('')}</div>`;
}


function showCatalogAssignmentsHtml(show) {
  const rows = show.catalogAssignments || [];
  if (!rows.length) return '<div class="show-section-empty">No generic inventory / consumable lines are currently outstanding.</div>';
  return `<div class="assignment-list">${rows.map((a) => {
    const remaining = Number(a.quantity) - Number(a.quantity_returned);
    return `<div class="assignment-row"><span class="mono">${esc(a.generic_code)}</span><div><b>${esc(a.item_name)}</b><small>${esc(a.deployment_name || 'General show assignment')}${a.assignment_source === 'road_box' ? ` · via ${esc(a.road_box_code || 'Road Box')}` : ''} · ${remaining} ${esc(a.unit)} remaining${Number(a.affects_stock) ? ' · stock tracked' : ' · generic / bill line'}</small></div><span class="show-mini-pill outstanding">${remaining} ${esc(a.unit)}</span></div>`;
  }).join('')}</div>`;
}

function showRoadBoxesHtml(show) {
  const list = show.roadBoxes?.length
    ? `<div class="deployment-list">${show.roadBoxes.map((box) => `<div class="deployment-card road-box-show-row">
        <div class="deployment-card-top">
          <div><div class="deployment-type">${esc(box.code)}</div><b>${esc(box.name)}</b></div>
          <div class="button-row"><span class="show-mini-pill">${box.total_contents_count ?? box.contents_count ?? 0} item${Number(box.contents_count) === 1 ? '' : 's'}</span>${box.contents_lost ? `<span class="show-mini-pill lost">${box.contents_lost} lost</span>` : ''}</div>
        </div>
        <div class="deployment-meta">${esc(box.deployment_name || 'General / whole show')}${box.box_type ? ` · ${esc(box.box_type)}` : ''}</div>
        ${packingUi.contentsHtml(box)}<div class="button-row"><button class="primary compact" type="button" data-pack-show-container="${esc(box.id)}">PACK THIS BIN</button><button class="secondary compact" type="button" data-open-road-box="${esc(box.id)}">OPEN BOX</button>${state.auth.authenticated ? `<button class="secondary compact" type="button" data-return-road-box="${esc(box.id)}">RETURN BOX</button>` : ''}</div>
      </div>`).join('')}</div>`
    : '<div class="show-section-empty">No Rolling Stock are currently deployed to this job.</div>';

  if (!state.auth.authenticated) return list;

  const available = state.roadBoxes.filter((b) => !b.parent_container_id && !b.active_show_id && !['retired','lost','in_repair'].includes(b.status) && (!/packout/i.test(b.box_type||'') || /rolling.*base/i.test(b.box_type||'')));
  const boxOptions = available.map((b) => `<option value="${esc(b.id)}">${esc(b.code)} — ${esc(b.name)} (${b.contents_count || 0} packed)</option>`).join('');
  const depOptions = show.deployments.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  const form = available.length
    ? `<form id="assignRoadBoxForm" class="deployment-form">
        <label class="span-2">Road Box<select name="roadBoxId" required><option value="">Choose box…</option>${boxOptions}</select></label>
        <label class="span-2">Deployment<select name="deploymentId"><option value="">General / whole show</option>${depOptions}</select></label>
        <div class="wide"><button class="secondary" type="submit">+ ASSIGN ROAD BOX</button></div>
      </form>`
    : '<div class="show-section-empty">No undeployed Rolling Stock are available to assign.</div>';
  return `<div class="button-row"><button class="primary" id="buildShowPacking" type="button">BUILD / PACK CONTAINERS FOR THIS SHOW</button></div>`+list+form;
}

function notesHtml(show) {
  const list = show.notes?.length ? show.notes.map((n) => `<div class="show-note"><div class="show-note-head">${esc(formatTime(n.created_at))} · ${esc(n.actor || '')}${n.deployment_name ? ` · ${esc(n.deployment_name)}` : ''}</div><div>${esc(n.body)}</div></div>`).join('') : '<div class="show-section-empty">No operational notes yet.</div>';
  const depOptions = show.deployments.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  const form = state.auth.authenticated ? `<form id="showNoteForm" class="note-form"><label>Attach to<select name="deploymentId"><option value="">Whole show / job</option>${depOptions}</select></label><label>Operational note<textarea name="body" rows="2" required placeholder="On-site add requested, notes run, truck delayed, extra strike…"></textarea></label><button class="secondary" type="submit">ADD NOTE</button></form>` : '';
  return list + form;
}

function renderShowDetail(show) {
  state.currentShow = show;
  $('#showModalEyebrow').textContent = `JOB ${show.job_number} · ${laneLabel(show.status).toUpperCase()}`;
  $('#showModalTitle').textContent = show.name;
  $('#showModalBody').innerHTML = `<div class="show-detail-grid">
    <div>
      <section class="show-detail-section"><h3>Parent Job</h3>${showMetaForm(show)}</section>
      <section class="show-detail-section"><div class="button-row" style="justify-content:space-between;align-items:center"><h3>Deployments</h3>${state.auth.authenticated ? `<button id="useShowScanner" class="primary" type="button">USE JOB IN SCANNER</button>` : ''}</div>${deploymentListHtml(show)}${deploymentFormHtml()}</section>
      <section class="show-detail-section"><h3>Rolling Stock deployed · ${show.roadBoxes?.length || 0}</h3>${showRoadBoxesHtml(show)}</section>
      <section class="show-detail-section"><h3>Tools currently outstanding · ${show.activeAssets.length}</h3>${assignmentListHtml(show)}</section>
      <section class="show-detail-section"><h3>Consumables / Generic Lines · ${show.catalogAssignments?.length || 0}</h3>${showCatalogAssignmentsHtml(show)}</section>
    </div>
    <div>
      <section class="show-detail-section"><div class="section-heading-row"><h3>Reconciliation Requests · ${show.billingDocuments?.length || 0}</h3>${state.auth.authenticated ? `<button id="newBillForShow" class="secondary compact" type="button">+ RECONCILIATION</button>` : ''}</div>${show.billingDocuments?.length ? show.billingDocuments.map((b)=>`<button class="billing-show-link" type="button" data-show-billing-id="${esc(b.id)}"><b>${esc(b.bill_number)}</b><span>${esc(b.title)}</span><em>${esc(moneyDisplay(b.total_cents,'USD'))}</em></button>`).join('') : '<div class="show-section-empty">No reconciliation requests linked yet.</div>'}</section>
      ${purchasingUi.showSections(show)}
      <section class="show-detail-section"><h3>Operational Notes</h3>${notesHtml(show)}</section>
      <section class="show-detail-section"><h3>Recent Job Activity</h3>${show.events.length ? show.events.slice(0,20).map((e) => `<div class="show-note"><div class="show-note-head">${esc(formatTime(e.created_at))} · ${esc(e.actor || '')}</div><div><span class="history-type">${esc(e.event_type)}</span>${e.deployment_name ? ` · ${esc(e.deployment_name)}` : ''}</div></div>`).join('') : '<div class="show-section-empty">No activity yet.</div>'}</section>
    </div>
  </div>`;
  bindShowModalClose();
  purchasingUi.bindShow(show);
  $('#buildShowPacking')?.addEventListener('click',()=>{closeShowModal();packingUi.open({showId:show.id});});
  $$('[data-pack-show-container]').forEach(b=>b.onclick=()=>{const unit=show.roadBoxes.find(x=>x.id===b.dataset.packShowContainer);closeShowModal();packingUi.open({showId:show.id,deploymentId:unit?.deployment_id||'',containerId:b.dataset.packShowContainer});});
  $$('[data-show-billing-id]').forEach((button)=>button.addEventListener('click',async()=>{closeShowModal();switchView('billing');await openBillingDocument(button.dataset.showBillingId);}));
  $('#newBillForShow')?.addEventListener('click',()=>{closeShowModal();openNewBilling();setTimeout(()=>{const select=$('#newBillingForm select[name="showId"]');if(select)select.value=show.id;},20);});
  if (!state.auth.authenticated) {
    $$('[data-open-road-box]').forEach((button) => button.addEventListener('click', () => {
      closeShowModal();
      openRoadBox(button.dataset.openRoadBox);
    }));
  }
  if (state.auth.authenticated) {
    $('#showMetaForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(event.currentTarget).entries());
        state.currentShow = await api(`/api/shows/${show.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        await refreshShows(); await refreshStats(); renderShowDetail(state.currentShow); flash(`${state.currentShow.job_number} updated.`);
      } catch (error) { alert(error.message); }
    });
    $('#deploymentForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(event.currentTarget).entries());
        await api(`/api/shows/${show.id}/deployments`, { method: 'POST', body: JSON.stringify(body) });
        state.currentShow = await api(`/api/shows/${show.id}`); await refreshShows(); renderShowDetail(state.currentShow); flash('Deployment added.');
      } catch (error) { alert(error.message); }
    });
    $('#showNoteForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(event.currentTarget).entries());
        await api(`/api/shows/${show.id}/notes`, { method: 'POST', body: JSON.stringify(body) });
        state.currentShow = await api(`/api/shows/${show.id}`); renderShowDetail(state.currentShow); flash('Note added.');
      } catch (error) { alert(error.message); }
    });
    $('#assignRoadBoxForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(event.currentTarget).entries());
        if (!body.roadBoxId) throw new Error('Choose a Road Box.');
        await api(`/api/road-boxes/${body.roadBoxId}/assign`, {
          method: 'POST',
          body: JSON.stringify({ showId: show.id, deploymentId: body.deploymentId || null })
        });
        await refreshRoadBoxes(false);
        state.currentShow = await api(`/api/shows/${show.id}`);
        await refreshShows();
        renderShowDetail(state.currentShow);
        flash('Road Box assigned to deployment.');
      } catch (error) { alert(error.message); }
    });

    $$('[data-return-road-box]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Return this Road Box from the job? Packed tools will stay assigned to the box until unpacked/check-in.')) return;
      try {
        await api(`/api/road-boxes/${button.dataset.returnRoadBox}/return`, { method: 'POST', body: '{}' });
        await refreshRoadBoxes(false);
        state.currentShow = await api(`/api/shows/${show.id}`);
        await refreshShows();
        renderShowDetail(state.currentShow);
        flash('Road Box returned from deployment.');
      } catch (error) { alert(error.message); }
    }));

    $$('[data-open-road-box]').forEach((button) => button.addEventListener('click', () => {
      closeShowModal();
      openRoadBox(button.dataset.openRoadBox);
    }));

    $('#useShowScanner')?.addEventListener('click', async () => {
      state.checkoutTargetType = 'show';
      state.checkoutShowId = show.id; state.checkoutDeploymentId = '';
      localStorage.setItem('roadboxosCheckoutTargetType', 'show');
      localStorage.setItem('roadboxosCheckoutShowId', show.id); localStorage.removeItem('roadboxosCheckoutDeploymentId');
      closeShowModal(); switchView('scan'); await setMode('checkout'); flash(`Checkout target: ${show.job_number} · ${show.name}`);
    });
  }
}


function roadBoxCardHtml(box) {
  const deployed = box.job_number
    ? `${box.job_number} · ${box.show_name}${box.deployment_name ? ` · ${box.deployment_name}` : ''}`
    : 'Not deployed';
  const readiness = Number(box.readiness_percent ?? 100);
  const currentLocation = box.effective_current_location || box.current_location || box.location || 'Location not set';
  return `<button class="road-box-card" data-road-box-id="${esc(box.id)}">
    <div class="record-card-with-photo">${mediaThumbHtml(box.primary_media_id, box.name, 'record-thumb road-box-thumb')}<div class="record-card-body">
    <div class="road-box-card-top"><div><div class="deployment-type">${esc(box.code)}</div><b>${esc(box.name)}</b></div><span class="status-pill status-${esc(box.status)}">${esc(statusLabel(box.status))}</span></div>
    <div class="road-box-card-meta">${box.box_type ? `<div>${esc(box.box_type)}${box.model?' · '+esc(box.model):''}${box.size_label?' · '+esc(box.size_label):''}</div>` : ''}${box.parent_container_name?`<div>Attached to ${esc(box.parent_container_name)}</div>`:''}${box.attached_count?`<div>${box.attached_count} attached units</div>`:''}<div>${esc(currentLocation)}</div><div>${esc(deployed)}</div>${box.condition_summary ? `<div>${esc(box.condition_summary)}</div>` : ''}</div>
    ${valueSummaryHtml(box,{esc,moneyDisplay},true)}<div class="road-box-readiness-line"><span>READINESS</span><b>${readiness}%</b></div>
    <div class="road-box-readiness-track"><span style="width:${Math.max(0,Math.min(100,readiness))}%"></span></div>
    <div class="show-card-pills"><span class="show-mini-pill">${box.total_contents_count ?? box.contents_count ?? 0} total units</span>${Number(box.catalog_units_count || 0) ? `<span class="show-mini-pill">${Number(box.catalog_units_count || 0)} units</span>` : ''}${Number(box.standard_required_units || 0) ? `<span class="show-mini-pill">${Math.round((Number(box.standard_filled_units || 0) / Math.max(1, Number(box.standard_required_units || 0))) * 100)}% manifest</span>` : ''}${Number(box.outstanding_item_count || 0) ? `<span class="show-mini-pill lost">${Number(box.outstanding_item_count)} outstanding</span>` : ''}${box.job_number ? `<span class="show-mini-pill outstanding">JOB ${esc(box.job_number)}</span>` : ''}</div>
    </div></div>
  </button>`;
}

function renderRoadBoxList() {
  const query = ($('#roadBoxSearch')?.value || '').trim().toLowerCase();
  const boxes = query
    ? state.roadBoxes.filter((b) => [b.code, b.name, b.barcode, b.box_type, b.current_location, b.home_location, b.location, b.condition_summary, b.manufacturer,b.model,b.size_label,b.parent_container_name, b.job_number, b.show_name, b.deployment_name].some((v) => String(v || '').toLowerCase().includes(query)))
    : state.roadBoxes;
  $('#roadBoxList').innerHTML = boxes.length ? boxes.map(roadBoxCardHtml).join('') : '<div class="empty">No Rolling Stock yet.</div>';
  $$('[data-road-box-id]').forEach((card) => card.addEventListener('click', () => openRoadBox(card.dataset.roadBoxId)));
}

async function refreshRoadBoxes(render = true) {
  state.roadBoxes = await api('/api/road-boxes');
  if (render && $('#roadBoxList')) renderRoadBoxList();
  if (state.mode === 'checkout' && $('#modeContext')) renderModeContext();
  return state.roadBoxes;
}

function openRoadBoxModal() { $('#roadBoxModal').classList.remove('hidden'); }
function closeRoadBoxModal() { $('#roadBoxModal').classList.add('hidden'); state.currentRoadBox = null; focusScanner(); }
function bindRoadBoxModalClose() { $$('[data-close-road-box-modal]').forEach((node) => node.addEventListener('click', closeRoadBoxModal)); }

const destinationPicker = initDestinationPicker({api,esc,mediaThumbHtml,matchesSearchTokens});

const packingUi = initPackingUi({api,esc,state,flash,onChanged:async()=>{await Promise.all([refreshRoadBoxes(false),refreshShows(false),refreshCatalog(false),refreshAssets(false),refreshStats()]);},scanBarcode:async code=>{$('#barcodeInput').value=code;await onScan({preventDefault(){}});}});

const rollingStockUi = initRollingStockUi({api,esc,state,render:renderRoadBoxDetail,refresh:refreshRoadBoxes,flash,matchesSearchTokens,mediaThumbHtml,moneyDisplay});

function roadBoxEditFormHtml(box) {
  const active = Boolean(box.activeAssignment);
  const states = active ? ['allocated','in_repair','lost'] : ['available','in_repair','lost','retired'];
  return `<form id="roadBoxEditForm" class="show-form ${state.auth.authenticated ? '' : 'readonly-lock'}">
    <label>Code *<input name="code" required value="${esc(box.code)}" /></label>
    <label class="span-2">Name *<input name="name" required value="${esc(box.name)}" /></label>
    <label>QR / Barcode<input name="barcode" value="${esc(box.barcode || '')}" placeholder="Auto-generated if blank" /></label>
    <label>Container type<input name="boxType" list="containerTypes" value="${esc(box.box_type || '')}" placeholder="Tool box, Cable box, Upright caddy…" /></label>
    <datalist id="containerTypes"><option>Road Box</option><option>Milwaukee Packout rolling base</option><option>Milwaukee Packout bin</option><option>Milwaukee Packout drawers</option><option>Milwaukee Packout organizer</option><option>Pelican</option><option>Other</option></datalist>
    <label>Manufacturer<input name="manufacturer" value="${esc(box.manufacturer||'')}" /></label><label>Model<input name="model" value="${esc(box.model||'')}" /></label><label>Size / configuration<input name="sizeLabel" value="${esc(box.size_label||'')}" placeholder="1510 / Large / Lid organizer" /></label>
    <label>Container state<select name="status">${states.map((v) => `<option value="${v}" ${box.status === v ? 'selected' : ''}>${esc(statusLabel(v))}</option>`).join('')}</select></label>
    <label class="span-2">Home location<input name="homeLocation" value="${esc(box.home_location || '')}" placeholder="Road Support / Bay A" /></label>
    <label class="span-2">Current location<input name="currentLocation" value="${esc(box.current_location || box.location || '')}" placeholder="Where the box physically is now" /></label>
    <label class="wide">Identity / container notes<textarea name="notes" rows="2">${esc(box.notes || '')}</textarea></label>
    ${state.auth.authenticated ? '<div class="wide button-row"><button class="primary" type="submit">SAVE CONTAINER IDENTITY</button><button id="useRoadBoxScanner" class="secondary" type="button">PACK TO THIS CONTAINER</button><button id="openContainerPacking" class="primary" type="button">OPEN LIVE PACKING</button></div>' : ''}
  </form>`;
}

function roadBoxContentsHtml(box) {
  if (!box.contents?.length) return '<div class="show-section-empty">This container has no serialized contents.</div>';
  return `<div class="assignment-list">${box.contents.map((a) => `<div class="assignment-row">
    <span class="mono">${esc(a.barcode)}</span>
    <div class="rolling-stock-item"><div class="rolling-stock-item-photo">${mediaThumbHtml(a.primary_media_id,a.asset_name,'workbox-item-thumb')}</div><div class="workbox-slot-main"><b>${esc(a.asset_name)}</b><small>${esc(a.category || '')}${a.purpose ? ` · ${esc(a.purpose)}` : ''}</small></div></div>
    <div class="button-row"><span class="show-mini-pill ${a.asset_status === 'lost' ? 'lost' : 'outstanding'}">${esc(statusLabel(a.asset_status))}</span>${state.auth.authenticated ? `<button class="secondary compact" type="button" data-unpack-asset="${esc(a.asset_id)}">CHECK IN</button>` : ''}</div>
  </div>`).join('')}</div>`;
}


function roadBoxCatalogContentsHtml(box) {return packingUi.contentsHtml(box);}

function manifestQtyLabel(slot) {
  return slot.quantity_label && String(slot.quantity_label).toLowerCase() !== 'unspecified'
    ? slot.quantity_label
    : String(slot.expected_quantity || 1);
}

function workboxSessionDisplayLabel(session, uppercase = false) {
  let label;
  if ((session?.session_mode || 'operational') === 'commissioning') label = 'Commissioning';
  else label = session?.session_type === 'check_in' ? 'Check In / Reconcile' : 'Check Out / Verify';
  return uppercase ? label.toUpperCase() : label;
}

function workboxSlotDisplayLabel(slot) {
  return slot.expected_asset_name || slot.expected_label || 'Unnamed slot';
}

function workboxSlotRowHtml(slot, { session = null, editable = false } = {}) {
  const full = Number(slot.missing_quantity || 0) <= 1e-9;
  const missing = Number(slot.missing_quantity || 0);
  const label = workboxSlotDisplayLabel(slot);
  const fillNames = (slot.fills || []).map((f) => f.asset_name || f.catalog_name || f.barcode || f.generic_code).filter(Boolean);
  const commissioningMode = slot.expected_asset_id ? 'specific_asset' : (slot.tracking_mode === 'quantity' ? 'quantity' : 'serialized');
  const actionLabel = commissioningMode === 'quantity' ? 'LOG FOUND QTY' : commissioningMode === 'specific_asset' ? 'PACK ASSET' : 'LABEL NEXT';
  const canAct = state.auth.authenticated && !full && (!session || session.status === 'active');
  const commissionButton = canAct
    ? `<button class="primary compact" type="button" data-commission-workbox-slot="${esc(slot.id)}" data-commission-mode="${commissioningMode}" data-slot-label="${esc(label)}" data-slot-missing="${missing}">${actionLabel}</button>`
    : '';
  const familyPrint = state.auth.authenticated && slot.generic_code ? `<button class="secondary compact" type="button" data-print-family-code="${esc(slot.generic_code)}" data-family-label="${esc(slot.catalog_name || label)}">FAMILY QR</button>` : '';
  const swap = state.auth.authenticated && !slot.expected_asset_id ? `<button class="secondary compact" type="button" data-swap-workbox-family="${esc(slot.id)}" data-slot-label="${esc(label)}" data-slot-family-id="${esc(slot.catalog_item_id || '')}">SWAP FAMILY</button>` : '';
  const edit = editable && state.auth.authenticated ? `<button class="secondary compact slot-edit-btn" type="button" data-edit-workbox-slot="${esc(slot.id)}" data-slot-label="${esc(label)}" data-slot-qty="${Number(slot.expected_quantity || 1)}">EDIT</button>` : '';
  const sourceMeta = session
    ? `${fillNames.map(esc).join(' · ') || 'empty'}${slot.catalog_name ? ` · ${esc(slot.catalog_name)}` : ''}${slot.expected_asset_barcode ? ` · specific ${esc(slot.expected_asset_barcode)}` : ''}`
    : `${esc(slot.quantity_rule === 'minimum' ? 'minimum target' : slot.quantity_rule === 'presence' ? 'presence / assortment' : 'target')}${slot.source_page ? ` · page ${esc(slot.source_page)}` : ''}${slot.catalog_name ? ` · linked: ${esc(slot.catalog_name)} · ${esc(slot.generic_code || '')}` : ''}${slot.expected_asset_barcode ? ` · specific: ${esc(slot.expected_asset_barcode)}` : ''}`;
  return `<div class="workbox-slot ${full ? 'slot-complete' : 'slot-missing'}" data-workbox-slot-id="${esc(slot.id)}">
    <div class="workbox-slot-qty">${esc(manifestQtyLabel(slot))}</div>
    <div class="workbox-slot-item">${mediaThumbHtml(slot.primary_media_id,label,'workbox-item-thumb')}<div class="workbox-slot-main"><b>${esc(label)}</b><small>${sourceMeta}</small>${!session && fillNames.length ? `<div class="workbox-fill-names">${fillNames.map(esc).join(' · ')}</div>` : ''}</div></div>
    <div class="workbox-slot-count"><b>${Number(slot.filled_quantity || 0)}/${Number(slot.expected_quantity || 0)}</b>${(!session || session.status === 'active') ? `<span>${full ? 'READY' : `${missing} MISSING`}</span>` : ''}<div class="slot-action-stack">${commissionButton}${familyPrint}${swap}${edit}${editable?rollingStockUi.slotActions(slot):''}</div></div>
  </div>`;
}

function groupedWorkboxZoneHtml(zone, { session = null, editable = false, allowAddKit = false } = {}) {
  const pieces = [];
  const seen = new Set();
  for (const slot of zone.slots || []) {
    if (!slot.kit_instance_id) {
      pieces.push(workboxSlotRowHtml(slot, { session, editable }));
      continue;
    }
    if (seen.has(slot.kit_instance_id)) continue;
    seen.add(slot.kit_instance_id);
    const children = zone.slots.filter((x) => x.kit_instance_id === slot.kit_instance_id);
    const complete = children.filter((x) => Number(x.missing_quantity || 0) <= 1e-9).length;
    pieces.push(`<div class="workbox-kit-group" data-kit-instance-id="${esc(slot.kit_instance_id)}">
      <div class="workbox-kit-head"><div><span class="eyebrow">NESTED KIT</span><b>${esc(slot.kit_instance_label || slot.kit_name || 'Kit')}</b><small>${esc(slot.kit_name || '')}${slot.kit_name && slot.kit_instance_label && slot.kit_name !== slot.kit_instance_label ? ' · ' + esc(slot.kit_name) : ''} · ${complete}/${children.length} child lines ready</small></div>${editable && state.auth.authenticated ? `<button class="secondary compact" type="button" data-edit-container-kit="${esc(slot.kit_instance_id)}">EDIT KIT / MOVE</button><button class="secondary compact" type="button" data-remove-workbox-kit="${esc(slot.kit_instance_id)}">REMOVE KIT</button>` : ''}</div>
      <div class="workbox-slot-list kit-child-list">${children.map((child) => workboxSlotRowHtml(child, { session, editable })).join('')}</div>
    </div>`);
  }
  if (allowAddKit && state.auth.authenticated) pieces.push(`<div class="workbox-zone-kit-action"><button class="secondary compact" type="button" data-add-kit-zone="${esc(zone.id)}" data-zone-name="${esc(zone.name)}">+ ADD KIT TO ${esc(zone.name).toUpperCase()}</button></div>`);
  return pieces.join('');
}

function roadBoxStandardManifestHtml(box) {
  const manifest = box.standardManifest;
  if (!manifest?.zones?.length) {
    return state.auth.authenticated
      ? '<div class="show-section-empty">This container starts empty. Add a zone above, then add slots or a generic kit.</div>'
      : '<div class="show-section-empty">No zones configured yet.</div>';
  }
  const s = manifest.summary || {};
  const outstanding = box.outstandingItems || [];
  const progress = Math.max(0, Math.min(100, Number(s.completionPercent || 0)));
  const controls = state.auth.authenticated ? `<div class="button-row workbox-actions">
    ${box.activeCheckSession
      ? `<button class="primary" id="resumeWorkboxCheck" type="button">RESUME ${esc(workboxSessionDisplayLabel(box.activeCheckSession, true))}</button>`
      : `<button class="primary" id="startWorkboxCommission" type="button">COMMISSION / INITIAL BUILD</button><button class="secondary" id="startWorkboxCheckout" type="button">CHECK OUT / VERIFY WORKBOX</button><button class="secondary" id="startWorkboxCheckin" type="button">CHECK IN / RECONCILE WORKBOX</button>`}
  </div>` : '';
  const zones = manifest.zones.map((zone, zi) => `<details class="workbox-zone" data-zone-id="${esc(zone.id)}" ${zi < 2 ? 'open' : ''}>
    <summary><b>${esc(zone.name)}</b><span>${zone.slots.filter((x)=>Number(x.missing_quantity||0)<=0).length}/${zone.slots.length} lines complete</span></summary>
    ${zoneValueHtml(box.valuation?.zones.find(v=>v.id===zone.id),{esc,moneyDisplay})}${rollingStockUi.zoneActions(zone)}<div class="workbox-slot-list">${groupedWorkboxZoneHtml(zone, { editable:true, allowAddKit:true })}</div>${mediaGalleryHtml('road_box_zone',zone.id,zone.photos||[],{title:zone.name+' photos',label:zone.name})}
  </details>`).join('');
  const outHtml = outstanding.length ? `<div class="workbox-outstanding"><h4>OPEN OUTSTANDING ITEMS · ${outstanding.length}</h4>${outstanding.slice(0,40).map((o)=>`<div class="outstanding-row"><div><b>${esc(o.label)}</b><small>${esc(o.zone_name || '')}${o.barcode ? ` · ${esc(o.barcode)}` : ''}</small></div><span class="show-mini-pill lost">${Number(o.missing_quantity || 0)} OUT</span></div>`).join('')}</div>` : '';
  return `<div class="workbox-manifest-summary">
      <div><span>STANDARD MANIFEST</span><b>${Number(s.filledUnits || 0)} / ${Number(s.requiredUnits || 0)} units</b></div>
      <div><span>LINE ITEMS</span><b>${Number(s.completeSlots || 0)} / ${Number(s.slotCount || 0)}</b></div>
      <div><span>COMPLETENESS</span><b>${progress}%</b></div>
      <div><span>OUTSTANDING</span><b>${outstanding.length}</b></div>
      <div><span>DB EXPECTATIONS</span><b>${Number(s.expectedUnitRows || s.requiredUnits || 0)}</b></div>
    </div>
    <div class="road-box-readiness-track large workbox-progress"><span style="width:${progress}%"></span></div>
    ${controls}
    <div class="workbox-source-note">Your pack list: zones contain editable requirements; nested kits expand into their child slots. Scan matching inventory to track fulfillment.</div>
    ${outHtml}
    <div class="workbox-zones">${zones}</div>`;
}

function openWorkboxCheckModal() { $('#workboxCheckModal').classList.remove('hidden'); }
function closeWorkboxCheckModal() {
  $('#workboxCheckModal').classList.add('hidden');
  state.currentWorkboxCheck = null;
  if (state.currentRoadBox) setTimeout(() => $('#roadBoxModalBody button')?.focus(), 20);
}
function bindWorkboxCheckClose() {
  $$('[data-close-workbox-check]').forEach((node) => node.onclick = closeWorkboxCheckModal);
}


function closeWorkboxCommissionModal() {
  $('#workboxCommissionModal').classList.add('hidden');
  state.commissionContext = null;
}

function openWorkboxCommissionModal(button) {
  if (!requireLoginUi()) return;
  const roadBoxId = state.currentWorkboxCheck?.road_box_id || state.currentRoadBox?.id;
  if (!roadBoxId) return alert('Open a Road Box first.');
  const slotId = button.dataset.commissionWorkboxSlot;
  const mode = button.dataset.commissionMode || 'serialized';
  const label = button.dataset.slotLabel || 'this slot';
  const missing = Math.max(1, Number(button.dataset.slotMissing || 1));
  state.commissionContext = { roadBoxId, slotId, mode, label, missing };
  $('#workboxCommissionTitle').textContent = mode === 'quantity' ? `Fill ${label}` : mode === 'specific_asset' ? `Pack Existing · ${label}` : `Label Next · ${label}`;
  $('#workboxCommissionBody').innerHTML = mode === 'quantity'
    ? `<form id="workboxCommissionForm" class="form-grid">
        <div class="span-2 workbox-action-summary"><b>${esc(label)}</b><small>${missing} still needed. This records newly counted inventory already in the container. To move existing shelf stock, use the scan-to-slot form.</small></div>
        <label>Quantity physically present<input id="commissionQuantity" name="quantity" type="number" min="0.01" step="0.01" max="${missing}" value="${missing}" required /></label>
        <div class="span-2 button-row"><button class="primary" type="submit">SAVE QUANTITY</button><button class="secondary" type="button" data-close-workbox-commission>Cancel</button></div>
      </form>`
    : mode === 'specific_asset'
      ? `<form id="workboxCommissionForm" class="form-grid"><div class="span-2 workbox-action-summary"><b>${esc(label)}</b><small>This Kit requires this exact serialized asset. Quartermaster will pack the existing asset into the Road Box and satisfy this child slot.</small></div><div class="span-2 button-row"><button class="primary" type="submit">PACK EXPECTED ASSET</button><button class="secondary" type="button" data-close-workbox-commission>Cancel</button></div></form>`
      : `<form id="workboxCommissionForm" class="form-grid">
        <div class="span-2 workbox-action-summary"><b>${esc(label)}</b><small>${missing} still needed. Leave the asset ID blank to generate the next AQA code automatically.</small></div>
        <label class="span-2">Existing Barcode / Asset ID<input id="commissionBarcode" name="barcode" autocomplete="off" placeholder="Blank = auto-generate AQA" /></label>
        <label>Manufacturer serial<input id="commissionSerial" name="serialNumber" autocomplete="off" placeholder="Optional" /></label>
        <label>Nickname<input id="commissionNickname" name="nickname" autocomplete="off" placeholder="Optional" /></label>
        <label class="check-row span-2"><input id="commissionPrintLabel" type="checkbox" checked /> Print the new label after saving</label>
        <div class="span-2 button-row"><button class="primary" type="submit">SAVE ITEM${missing > 1 ? ' + NEXT SLOT UNIT' : ''}</button><button class="secondary" type="button" data-close-workbox-commission>Cancel</button></div>
      </form>`;
  $('#workboxCommissionModal').classList.remove('hidden');
  $$('[data-close-workbox-commission]').forEach((node) => node.onclick = closeWorkboxCommissionModal);
  setTimeout(() => (mode === 'quantity' ? $('#commissionQuantity') : mode === 'specific_asset' ? $('#workboxCommissionForm button[type=submit]') : $('#commissionBarcode'))?.focus(), 30);

  $('#workboxCommissionForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ctx = state.commissionContext;
    if (!ctx) return;
    let body;
    if (ctx.mode === 'quantity') {
      const quantity = Number($('#commissionQuantity')?.value || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return alert('Quantity must be greater than zero.');
      body = { mode:'quantity', quantity };
    } else if (ctx.mode === 'specific_asset') {
      body = { mode:'specific_asset' };
    } else {
      body = {
        mode:'serialized',
        barcode:$('#commissionBarcode')?.value.trim() || null,
        serialNumber:$('#commissionSerial')?.value.trim() || null,
        nickname:$('#commissionNickname')?.value.trim() || null
      };
    }
    const shouldPrint = ctx.mode === 'serialized' && Boolean($('#commissionPrintLabel')?.checked);
    try {
      const result = await api(`/api/road-boxes/${ctx.roadBoxId}/slots/${ctx.slotId}/commission`, { method:'POST', body:JSON.stringify(body) });
      state.workboxView.focusSlotId = ctx.slotId;
      closeWorkboxCommissionModal();
      await refreshCatalog(false);
      await refreshPrintCodes(false);
      if ((result.mode === 'serialized' || result.mode === 'specific_asset') && result.asset) {
        flash(`${result.asset.name} ${result.mode === 'specific_asset' ? 'packed' : 'commissioned'} into ${state.currentRoadBox?.code || 'Road Box'} · ${result.asset.barcode}.`);
      } else if (result.catalogItem) {
        flash(`${result.quantity} × ${result.catalogItem.name} commissioned into the box.`);
      }
      if (result.checkSession) {
        renderWorkboxCheck(result.checkSession);
      } else {
        const fresh = await api(`/api/road-boxes/${ctx.roadBoxId}`);
        state.currentRoadBox = fresh;
        renderRoadBoxDetail(fresh);
        await refreshRoadBoxes(false);
      }
      if (shouldPrint && result.asset) setTimeout(() => printGeneratedLabel(result.asset.barcode, result.asset.name), 80);
    } catch (error) { alert(error.message); }
  });
}

async function openWorkboxFamilyModal(button) {
  if (!requireLoginUi()) return;
  const roadBoxId = state.currentWorkboxCheck?.road_box_id || state.currentRoadBox?.id;
  if (!roadBoxId) return alert('Open a Road Box first.');
  if (!state.catalogItems?.length) await refreshCatalog(false);
  const slotId = button.dataset.swapWorkboxFamily;
  const slotLabel = button.dataset.slotLabel || 'Workbox slot';
  const currentFamilyId = button.dataset.slotFamilyId || '';
  state.familySwapContext = { roadBoxId, slotId, slotLabel, currentFamilyId };
  const options = [...state.catalogItems].sort((a,b)=>String(a.name).localeCompare(String(b.name))).map((item) => {
    const availability = item.tracking_mode === 'quantity'
      ? `${Number(item.quantity_on_hand || 0)} ${item.unit || 'ea'} in stock`
      : `${Number(item.serialized_available || 0)}/${Number(item.serialized_count || 0)} serialized available`;
    const provisional = item.standardization_status === 'provisional' ? ' · PROVISIONAL' : '';
    return `<option value="${esc(item.id)}" ${item.id === currentFamilyId ? 'selected' : ''}>${esc(item.name)} · ${esc(item.tracking_mode)} · ${esc(availability)}${provisional}</option>`;
  }).join('');
  $('#workboxFamilyTitle').textContent = `Swap Family · ${slotLabel}`;
  $('#workboxFamilyBody').innerHTML = `<form id="workboxFamilyForm" class="form-grid">
    <div class="span-2 workbox-action-summary"><b>Current standard slot: ${esc(slotLabel)}</b><small>Pick the actual Catalog family this box uses. This changes only this Road Box slot; the historical source label remains preserved.</small></div>
    <label class="span-2">Catalog family<select id="workboxFamilySelect" required><option value="">Choose a family…</option>${options}</select></label>
    <label class="check-row span-2"><input id="workboxUseFamilyName" type="checkbox" checked /> Replace the displayed slot name with the selected family name</label>
    <div class="span-2 button-row"><button class="primary" type="submit">SWAP FAMILY</button><button class="secondary" type="button" data-close-workbox-family>Cancel</button></div>
  </form>`;
  $('#workboxFamilyModal').classList.remove('hidden');
  $$('[data-close-workbox-family]').forEach((node) => node.onclick = () => { $('#workboxFamilyModal').classList.add('hidden'); state.familySwapContext = null; });
  setTimeout(()=>$('#workboxFamilySelect')?.focus(),30);
  $('#workboxFamilyForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ctx = state.familySwapContext;
    if (!ctx) return;
    const catalogItemId = $('#workboxFamilySelect')?.value;
    const family = state.catalogItems.find((item)=>item.id === catalogItemId);
    if (!family) return alert('Choose a Catalog family.');
    const useFamilyName = Boolean($('#workboxUseFamilyName')?.checked);
    try {
      await api(`/api/road-boxes/${ctx.roadBoxId}/slots/${ctx.slotId}`, { method:'PATCH', body:JSON.stringify({
        catalogItemId,
        expectedLabel: useFamilyName ? family.name : ctx.slotLabel
      }) });
      state.workboxView.focusSlotId = ctx.slotId;
      $('#workboxFamilyModal').classList.add('hidden');
      state.familySwapContext = null;
      if (state.currentWorkboxCheck?.id) {
        const updated = await api(`/api/workbox-check-sessions/${state.currentWorkboxCheck.id}`);
        renderWorkboxCheck(updated);
      } else {
        const fresh = await api(`/api/road-boxes/${ctx.roadBoxId}`);
        state.currentRoadBox = fresh;
        renderRoadBoxDetail(fresh);
      }
      flash(`Slot now uses ${family.name}.`);
    } catch (error) { alert(error.message); }
  });
}


function closeWorkboxKitModal() {
  $('#workboxKitModal').classList.add('hidden');
  state.kitPlacementContext = null;
}

async function refreshCurrentRoadBoxAfterKitChange(roadBoxId) {
  const fresh = await api(`/api/road-boxes/${roadBoxId}`);
  state.currentRoadBox = fresh;
  if (state.currentWorkboxCheck?.id) {
    const session = await api(`/api/workbox-check-sessions/${state.currentWorkboxCheck.id}`);
    renderWorkboxCheck(session);
  }
  renderRoadBoxDetail(fresh);
  await refreshRoadBoxes(false);
}

async function openWorkboxKitModal(button) {
  if (!requireLoginUi()) return;
  const roadBoxId = state.currentWorkboxCheck?.road_box_id || state.currentRoadBox?.id;
  if (!roadBoxId) return alert('Open a Road Box first.');
  if (!state.kits?.length) await refreshKits(false);
  const zoneId = button.dataset.addKitZone;
  const zoneName = button.dataset.zoneName || 'Zone';
  const activeKits = state.kits.filter((kit) => Number(kit.active) === 1 && Number(kit.member_count || 0) > 0);
  state.kitPlacementContext = { roadBoxId, zoneId, zoneName };
  $('#workboxKitTitle').textContent = `Add Kit · ${zoneName}`;
  $('#workboxKitBody').innerHTML = `<form id="workboxKitForm" class="form-grid">
    <div class="span-2 workbox-action-summary"><b>${esc(zoneName)}</b><small>Select a saved Kit. Its children become nested Workbox slots inside this zone, so normal commissioning/check-in/reconciliation works without a second tracking system.</small></div>
    <label class="span-2">Kit<select id="workboxKitSelect" required><option value="">Choose a saved Kit…</option>${activeKits.map((kit)=>`<option value="${esc(kit.id)}">${esc(kit.name)} · ${Number(kit.member_count||0)} child lines · ${Number(kit.physical_instance_count||0)} physical</option>`).join('')}</select></label>
    <label class="span-2">Instance label (optional)<input id="workboxKitInstanceLabel" placeholder="Blank = use Kit name" /></label>
    <div class="span-2 button-row"><button class="primary" type="submit">ADD KIT TO ZONE</button><button class="secondary" type="button" data-close-workbox-kit>Cancel</button></div>
  </form>`;
  $('#workboxKitModal').classList.remove('hidden');
  $$('[data-close-workbox-kit]').forEach((node)=>node.onclick=closeWorkboxKitModal);
  setTimeout(()=>$('#workboxKitSelect')?.focus(),30);
  $('#workboxKitForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ctx = state.kitPlacementContext;
    if (!ctx) return;
    const kitId = $('#workboxKitSelect')?.value;
    if (!kitId) return alert('Choose a Kit.');
    try {
      await api(`/api/road-boxes/${ctx.roadBoxId}/zones/${ctx.zoneId}/kits`, { method:'POST', body:JSON.stringify({ kitId, instanceLabel:$('#workboxKitInstanceLabel')?.value.trim() || null }) });
      closeWorkboxKitModal();
      await refreshCurrentRoadBoxAfterKitChange(ctx.roadBoxId);
      flash(`Kit added to ${ctx.zoneName}.`);
    } catch (error) { alert(error.message); }
  });
}

async function removeWorkboxKitInstance(instanceId) {
  if (!requireLoginUi()) return;
  if (!confirm('Remove this Kit from the Road Box standard? This is blocked if any child slot still contains commissioned inventory.')) return;
  const roadBoxId = state.currentWorkboxCheck?.road_box_id || state.currentRoadBox?.id;
  try {
    await api(`/api/road-box-kit-instances/${instanceId}`, { method:'DELETE' });
    if (roadBoxId) await refreshCurrentRoadBoxAfterKitChange(roadBoxId);
    flash('Kit removed from the Road Box standard.');
  } catch (error) { alert(error.message); }
}

function bindWorkboxCommissionActions(scope = document) {
  scope.querySelectorAll?.('[data-commission-workbox-slot]').forEach((button) => {
    if (button.dataset.commissionBound === '1') return;
    button.dataset.commissionBound = '1';
    button.addEventListener('click', () => openWorkboxCommissionModal(button));
  });
  scope.querySelectorAll?.('[data-swap-workbox-family]').forEach((button) => {
    if (button.dataset.familySwapBound === '1') return;
    button.dataset.familySwapBound = '1';
    button.addEventListener('click', () => openWorkboxFamilyModal(button));
  });
  scope.querySelectorAll?.('[data-print-family-code]').forEach((button) => {
    if (button.dataset.familyPrintBound === '1') return;
    button.dataset.familyPrintBound = '1';
    button.addEventListener('click', () => printGeneratedLabel(button.dataset.printFamilyCode, button.dataset.familyLabel || button.dataset.printFamilyCode, 'qr'));
  });
  scope.querySelectorAll?.('[data-add-kit-zone]').forEach((button) => {
    if (button.dataset.kitAddBound === '1') return;
    button.dataset.kitAddBound = '1';
    button.addEventListener('click', () => openWorkboxKitModal(button));
  });
  scope.querySelectorAll?.('[data-remove-workbox-kit]').forEach((button) => {
    if (button.dataset.kitRemoveBound === '1') return;
    button.dataset.kitRemoveBound = '1';
    button.addEventListener('click', () => removeWorkboxKitInstance(button.dataset.removeWorkboxKit));
  });
}

function workboxCheckScanRowHtml(scan, session) {
  const detail = scan.details || {};
  const label = scan.live_entity_name || detail.assetName || detail.catalogName || scan.barcode;
  const cls = scan.result === 'matched' || scan.result === 'resolved_outstanding' ? 'ok' : scan.result === 'duplicate' ? 'warn' : 'bad';
  let manual = '';
  if (scan.result === 'unmatched' && scan.entity_id) {
    const options = (session.manifest?.zones || []).flatMap((z) => z.slots.filter((slot)=>Number(slot.missing_quantity||0)>0).map((slot)=>`<option value="${esc(slot.id)}">${esc(z.name)} — ${esc(slot.expected_label)} (${Number(slot.filled_quantity||0)}/${Number(slot.expected_quantity||0)})</option>`)).join('');
    manual = options ? `<div class="manual-slot-match"><select data-manual-slot-for="${esc(scan.id)}"><option value="">Choose the slot this belongs in…</option>${options}</select><button type="button" class="secondary compact" data-manual-match="${esc(scan.id)}" data-barcode="${esc(scan.barcode)}">MATCH TO SLOT</button></div>` : '';
  }
  return `<div class="workbox-scan-row scan-${cls}">
    <span class="mono">${esc(scan.barcode)}</span>
    <div><b>${esc(label)}</b><small>${scan.zone_name ? `${esc(scan.zone_name)} · ` : ''}${scan.slot_label ? esc(scan.slot_label) : esc(detail.message || scan.result)}</small>${manual}</div>
    <span class="show-mini-pill ${cls === 'ok' ? '' : cls === 'warn' ? 'outstanding' : 'lost'}">${esc(String(scan.result || '').replaceAll('_',' ').toUpperCase())}</span>
  </div>`;
}

function captureWorkboxViewState(sessionId) {
  if (state.workboxView.sessionId !== sessionId) return;
  const modal = $('#workboxCheckModal');
  if (!modal || modal.classList.contains('hidden')) return;
  const card = modal.querySelector('.workbox-check-card');
  state.workboxView.scrollTop = card?.scrollTop || 0;
  state.workboxView.openZoneIds = [...modal.querySelectorAll('details.workbox-zone[open][data-zone-id]')].map((d)=>d.dataset.zoneId);
}

function restoreWorkboxViewState(sessionId) {
  if (state.workboxView.sessionId !== sessionId) return;
  const modal = $('#workboxCheckModal');
  const card = modal?.querySelector('.workbox-check-card');
  if (state.workboxView.openZoneIds.length) {
    for (const detail of modal?.querySelectorAll('details.workbox-zone[data-zone-id]') || []) {
      detail.open = state.workboxView.openZoneIds.includes(detail.dataset.zoneId);
    }
  }
  const focusSlotId = state.workboxView.focusSlotId;
  if (focusSlotId) {
    const target = modal?.querySelector(`[data-workbox-slot-id="${CSS.escape(focusSlotId)}"]`);
    if (target) {
      const detail = target.closest('details.workbox-zone');
      if (detail) detail.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block:'center', behavior:'auto' }));
    }
    state.workboxView.focusSlotId = null;
  } else if (card) {
    requestAnimationFrame(() => { card.scrollTop = state.workboxView.scrollTop || 0; });
  }
}

function renderWorkboxCheck(session) {
  captureWorkboxViewState(session.id);
  if (state.workboxView.sessionId !== session.id) {
    const savedUi = session.summary?.uiState || {};
    state.workboxView = {
      sessionId:session.id,
      openZoneIds:Array.isArray(savedUi.openZoneIds) ? savedUi.openZoneIds : [],
      scrollTop:Number(savedUi.scrollTop || 0),
      focusSlotId:state.workboxView.focusSlotId
    };
  }
  state.currentWorkboxCheck = session;
  const typeLabel = workboxSessionDisplayLabel(session, true);
  $('#workboxCheckEyebrow').textContent = `${typeLabel} · ${session.road_box_code}`;
  $('#workboxCheckTitle').textContent = session.road_box_name;
  const s = session.manifest?.summary || {};
  const lastScans = [...(session.scans || [])].reverse().slice(0, 15);
  const zones = (session.manifest?.zones || []).map((zone, zi) => {
    const shouldOpen = state.workboxView.openZoneIds.length ? state.workboxView.openZoneIds.includes(zone.id) : zi === 0;
    return `<details class="workbox-zone compact-zone" data-zone-id="${esc(zone.id)}" ${shouldOpen ? 'open' : ''}><summary><b>${esc(zone.name)}</b><span>${zone.slots.filter((x)=>Number(x.missing_quantity||0)<=0).length}/${zone.slots.length}</span></summary><div class="workbox-slot-list">${groupedWorkboxZoneHtml(zone, { session, editable:false, allowAddKit:false })}</div></details>`;
  }).join('');
  const outstanding = session.outstanding || [];
  $('#workboxCheckBody').innerHTML = `<div class="workbox-session-layout">
    <div>
      <div class="workbox-session-sticky">
        <div class="workbox-manifest-summary">
          <div><span>FILLED</span><b>${Number(s.filledUnits||0)} / ${Number(s.requiredUnits||0)}</b></div>
          <div><span>COMPLETE</span><b>${Number(s.completionPercent||0)}%</b></div>
          <div><span>SCANS</span><b>${(session.scans||[]).length}</b></div>
          <div><span>OUTSTANDING</span><b>${outstanding.length}</b></div>
        </div>
        ${session.status === 'active' ? `<form id="workboxScanForm" class="workbox-scan-form">
          <label class="span-2">Scan barcode / QR<input id="workboxBarcodeInput" name="barcode" autocomplete="off" autofocus placeholder="Scanner types here + Enter" /></label>
          <label>Qty<input id="workboxScanQty" name="quantity" type="number" min="0.01" step="0.01" value="1" /></label>
          <button class="primary" type="submit">SCAN</button>
        </form>
        <div class="hint">Serialized tools: scan each physical tag. Quantity items: set Qty, then scan the family QR.</div>
        <div class="button-row workbox-complete-buttons"><button id="completeWorkboxCheck" class="primary" type="button">${(session.session_mode||'operational')==='commissioning' ? 'FINISH COMMISSIONING' : `COMPLETE ${typeLabel}`}</button><button id="saveWorkboxCheck" class="secondary" type="button">SAVE & CLOSE</button><button id="cancelWorkboxCheck" class="secondary" type="button">CANCEL SESSION</button></div>${session.last_saved_at ? `<div class="hint">Last saved ${esc(formatTime(session.last_saved_at))}${session.last_saved_by ? ` by ${esc(session.last_saved_by)}`:''}</div>`:''}` : `<div class="show-section-empty"><b>SESSION COMPLETE</b><br>${esc(formatTime(session.completed_at))}</div>`}
      </div>
      <section class="show-detail-section"><h3>Recent Scans</h3>${lastScans.length ? `<div class="workbox-scan-list">${lastScans.map((scan)=>workboxCheckScanRowHtml(scan,session)).join('')}</div>` : '<div class="show-section-empty">Start scanning. Each code will be matched against the expected slots.</div>'}</section>
      ${outstanding.length ? `<section class="show-detail-section"><h3>Outstanding Items</h3><div class="workbox-scan-list">${outstanding.map((o)=>`<div class="outstanding-row"><div><b>${esc(o.label)}</b><small>${esc(o.zone_name||'')}${o.barcode ? ` · ${esc(o.barcode)}`:''}</small></div><span class="show-mini-pill lost">${Number(o.missing_quantity||0)} OUT</span></div>`).join('')}</div></section>`:''}
    </div>
    <div><section class="show-detail-section"><h3>Expected Slots by Zone</h3>${zones}</section></div>
  </div>`;
  bindWorkboxCheckClose();
  bindWorkboxCommissionActions($('#workboxCheckBody'));
  restoreWorkboxViewState(session.id);

  $('#workboxScanForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const barcode = $('#workboxBarcodeInput').value.trim();
    const quantity = Number($('#workboxScanQty').value || 1);
    if (!barcode) return;
    try {
      const updated = await api(`/api/workbox-check-sessions/${session.id}/scan`, { method:'POST', body:JSON.stringify({ barcode, quantity }) });
      beep('ok');
      renderWorkboxCheck(updated);
      setTimeout(()=>$('#workboxBarcodeInput')?.focus(),20);
    } catch (error) {
      beep('error'); alert(error.message); setTimeout(()=>$('#workboxBarcodeInput')?.focus(),20);
    }
  });

  $$('[data-manual-match]').forEach((button) => button.addEventListener('click', async () => {
    const select = $(`[data-manual-slot-for="${button.dataset.manualMatch}"]`);
    if (!select?.value) return alert('Choose a slot first.');
    try {
      const updated = await api(`/api/workbox-check-sessions/${session.id}/scan`, { method:'POST', body:JSON.stringify({ barcode:button.dataset.barcode, quantity:1, slotId:select.value, allowDuplicate:true }) });
      renderWorkboxCheck(updated);
      setTimeout(()=>$('#workboxBarcodeInput')?.focus(),20);
    } catch (error) { alert(error.message); }
  }));

  $('#saveWorkboxCheck')?.addEventListener('click', async () => {
    try {
      captureWorkboxViewState(session.id);
      await api(`/api/workbox-check-sessions/${session.id}/save`, { method:'POST', body:JSON.stringify({ uiState:{ openZoneIds:state.workboxView.openZoneIds, scrollTop:state.workboxView.scrollTop } }) });
      closeWorkboxCheckModal();
      if (state.currentRoadBox?.id) {
        state.currentRoadBox = await api(`/api/road-boxes/${state.currentRoadBox.id}`);
        renderRoadBoxDetail(state.currentRoadBox);
      }
      flash('Workbox session saved. Resume it whenever you are ready.');
    } catch (error) { alert(error.message); }
  });

  $('#completeWorkboxCheck')?.addEventListener('click', async () => {
    const action = (session.session_mode || 'operational') === 'commissioning'
      ? 'finish initial commissioning with the current standard/filled state (unfilled slots stay visible, but no fake missing assets are created)'
      : session.session_type === 'check_in' ? 'finish reconciliation and create the outstanding list for anything not scanned' : 'finish this outbound verification with the current shortages';
    if (!confirm(`Complete this workbox session and ${action}?`)) return;
    try {
      const updated = await api(`/api/workbox-check-sessions/${session.id}/complete`, { method:'POST', body:'{}' });
      renderWorkboxCheck(updated);
      await refreshRoadBoxes(false);
      if (state.currentRoadBox?.id) {
        state.currentRoadBox = await api(`/api/road-boxes/${state.currentRoadBox.id}`);
        renderRoadBoxDetail(state.currentRoadBox);
      }
      flash(`${typeLabel} completed.`);
    } catch (error) { alert(error.message); }
  });

  $('#cancelWorkboxCheck')?.addEventListener('click', async () => {
    if (!confirm('Cancel this workbox scan session? Scans already used to pack new items remain in the box.')) return;
    try {
      await api(`/api/workbox-check-sessions/${session.id}/cancel`, { method:'POST', body:'{}' });
      closeWorkboxCheckModal();
      if (state.currentRoadBox?.id) {
        state.currentRoadBox = await api(`/api/road-boxes/${state.currentRoadBox.id}`);
        renderRoadBoxDetail(state.currentRoadBox);
      }
    } catch (error) { alert(error.message); }
  });
}

async function startWorkboxCheck(box, type, sessionMode = 'operational') {
  if (!requireLoginUi()) return;
  try {
    const session = await api(`/api/road-boxes/${box.id}/check-sessions`, { method:'POST', body:JSON.stringify({ sessionType:type, sessionMode }) });
    renderWorkboxCheck(session);
    openWorkboxCheckModal();
    setTimeout(()=>$('#workboxBarcodeInput')?.focus(),50);
  } catch (error) { alert(error.message); }
}

async function resumeWorkboxCheck(box) {
  if (!box.activeCheckSession?.id) return;
  try {
    const session = await api(`/api/workbox-check-sessions/${box.activeCheckSession.id}`);
    renderWorkboxCheck(session); openWorkboxCheckModal(); setTimeout(()=>$('#workboxBarcodeInput')?.focus(),50);
  } catch (error) { alert(error.message); }
}


function roadBoxReadinessHtml(box) {
  const readiness = Number(box.readiness_percent ?? 100);
  const condition = box.condition_summary || 'No condition issue recorded';
  const last = box.last_inspected_at ? `${formatTime(box.last_inspected_at)}${box.last_inspected_by ? ` by ${esc(box.last_inspected_by)}` : ''}` : 'No formal inspection yet';
  return `<div class="road-box-readiness-panel">
    <div class="road-box-readiness-score"><span>READINESS</span><b>${readiness}%</b></div>
    <div class="road-box-readiness-track large"><span style="width:${Math.max(0,Math.min(100,readiness))}%"></span></div>
    <div class="road-box-condition"><small>CURRENT CONDITION</small><b>${esc(condition)}</b><span>${last}</span></div>
  </div>`;
}

function roadBoxInspectionHtml(box) {
  const history = box.inspections?.length
    ? `<div class="road-box-inspection-history">${box.inspections.slice(0,12).map((i) => `<div class="show-note"><div class="show-note-head">${esc(formatTime(i.inspected_at))} · ${esc(i.inspected_by || '')} · ${Number(i.readiness_percent)}%</div><div><b>${esc(i.condition_summary || 'No condition issue recorded')}</b>${i.notes ? `<br><small>${esc(i.notes)}</small>` : ''}</div></div>`).join('')}</div>`
    : '<div class="show-section-empty">No inspections logged yet.</div>';
  const form = state.auth.authenticated ? `<form id="roadBoxInspectionForm" class="show-form compact-form">
    <label>Readiness %<input name="readinessPercent" type="number" min="0" max="100" step="1" required value="${Number(box.readiness_percent ?? 100)}" /></label>
    <label class="span-2">Condition summary<input name="conditionSummary" value="${esc(box.condition_summary || '')}" placeholder="Ready / Needs hasp repair / Missing wheel…" /></label>
    <label class="wide">Inspection notes<textarea name="notes" rows="2" placeholder="What was checked, what needs attention, etc."></textarea></label>
    <div class="wide"><button class="primary" type="submit">LOG CONDITION / READINESS</button></div>
  </form>` : '';
  return `${roadBoxReadinessHtml(box)}${form}${history}`;
}

function roadBoxManifestHistoryHtml(box) {
  if (!box.manifestSnapshots?.length) return '<div class="show-section-empty">No frozen deployment manifests yet.</div>';
  return box.manifestSnapshots.slice(0,20).map((m) => `<div class="show-note"><div class="show-note-head">${esc(formatTime(m.created_at))} · ${esc(String(m.snapshot_type || '').toUpperCase())}</div><div><b>${Number(m.serialized_count || 0)} serialized</b> · ${Number(m.catalog_line_count || 0)} catalog lines · ${Number(m.catalog_unit_count || 0)} units${m.created_by ? ` · ${esc(m.created_by)}` : ''}</div></div>`).join('');
}

function roadBoxEventHistoryHtml(box) {
  if (!box.events?.length) return '<div class="show-section-empty">No container events recorded yet.</div>';
  return box.events.slice(0,40).map((e) => {
    const d = e.details || {};
    const subject = d.assetName || d.name || d.conditionSummary || d.jobNumber || d.currentLocation || '';
    return `<div class="show-note"><div class="show-note-head">${esc(formatTime(e.created_at))} · ${esc(e.actor || '')}</div><div><b>${esc(String(e.event_type || '').replaceAll('.', ' · '))}</b>${subject ? ` · ${esc(subject)}` : ''}</div></div>`;
  }).join('');
}

function roadBoxDeploymentHtml(box) {
  if (box.activeAssignment) {
    const a = box.activeAssignment;
    return `<div class="deployment-card">
      <div class="deployment-card-top"><div><div class="deployment-type">CURRENT DEPLOYMENT</div><b>${esc(a.job_number)} · ${esc(a.show_name)}</b></div><span class="show-mini-pill outstanding">DEPLOYED</span></div>
      <div class="deployment-meta">${esc(a.deployment_name || 'General / whole show')} · Assigned ${esc(formatTime(a.assigned_at))}${a.assigned_by ? ` by ${esc(a.assigned_by)}` : ''}</div>
      ${state.auth.authenticated ? '<div class="button-row"><button id="returnRoadBoxButton" class="secondary" type="button">RETURN BOX FROM JOB</button></div>' : ''}
    </div>`;
  }
  if (!state.auth.authenticated) return '<div class="show-section-empty">Not currently deployed.</div>';
  const showOptions = state.shows.filter((s) => s.status !== 'reset').map((s) => `<option value="${esc(s.id)}">${esc(s.job_number)} — ${esc(s.name)}</option>`).join('');
  return `<form id="roadBoxDeployForm" class="deployment-form">
    <label class="span-2">Show / Job<select id="roadBoxDeployShow" name="showId" required><option value="">Choose show / job…</option>${showOptions}</select></label>
    <label class="span-2">Deployment<select id="roadBoxDeployDeployment" name="deploymentId" disabled><option value="">Choose a show first</option></select></label>
    <div class="wide"><button class="primary" type="submit">DEPLOY ROAD BOX</button></div>
  </form>`;
}

function roadBoxHistoryHtml(box) {
  if (!box.assignmentHistory?.length) return '<div class="show-section-empty">No deployment history yet.</div>';
  return box.assignmentHistory.map((a) => `<div class="show-note"><div class="show-note-head">${esc(formatTime(a.assigned_at))} · ${esc(a.assigned_by || '')}</div><div><b>${esc(a.job_number)} · ${esc(a.show_name)}</b>${a.deployment_name ? ` · ${esc(a.deployment_name)}` : ''} · ${esc(a.status)}${a.returned_at ? ` · returned ${esc(formatTime(a.returned_at))}` : ''}</div></div>`).join('');
}

async function populateRoadBoxDeployments(showId) {
  const select = $('#roadBoxDeployDeployment');
  if (!select) return;
  if (!showId) {
    select.disabled = true;
    select.innerHTML = '<option value="">Choose a show first</option>';
    return;
  }
  try {
    const show = await api(`/api/shows/${showId}`);
    select.disabled = false;
    select.innerHTML = `<option value="">General / whole show</option>${show.deployments.map((d) => `<option value="${esc(d.id)}">${esc(deploymentTypeLabel(d.deployment_type))} — ${esc(d.name)}</option>`).join('')}`;
  } catch {
    select.disabled = true;
    select.innerHTML = '<option value="">Unable to load deployments</option>';
  }
}

function renderRoadBoxDetail(box) {
  state.currentRoadBox = box;
  $('#roadBoxModalEyebrow').textContent = box.activeAssignment
    ? `CONTAINER · JOB ${box.activeAssignment.job_number}`
    : `CONTAINER · ${String(box.status || 'available').toUpperCase().replaceAll('_',' ')}`;
  $('#roadBoxModalTitle').textContent = `${box.code} · ${box.name}`;
  $('#roadBoxModalBody').innerHTML = `<div class="show-detail-grid">
    <div>
      <section class="show-detail-section"><h3>Container Identity</h3>${roadBoxEditFormHtml(box)}</section>
      ${valueSummaryHtml(box,{esc,moneyDisplay})}${rollingStockUi.stack(box)}<section class="show-detail-section"><h3>Condition & Readiness</h3>${roadBoxInspectionHtml(box)}</section>
      <section class="show-detail-section workbox-standard-section"><h3>Zones & Pack List</h3>${rollingStockUi.toolbar(box)}${roadBoxStandardManifestHtml(box)}</section>
      <section class="show-detail-section"><h3>Current Serialized Contents · ${box.contents?.length || 0}</h3>${roadBoxContentsHtml(box)}</section>
      <section class="show-detail-section"><h3>All Current Contents · Totals by Item Type</h3>${roadBoxCatalogContentsHtml(box)}</section>
      <section class="show-detail-section"><h3>Container Event Ledger</h3>${roadBoxEventHistoryHtml(box)}</section>
    </div>
    <div>
      ${mediaGalleryHtml('road_box', box.id, box.photos || [], { title: 'Container Photos', label: `${box.code} · ${box.name}` })}
      ${box.barcode ? codePreviewHtml(box.barcode, `${box.code} · ${box.name}`) : ''}
      <section class="show-detail-section"><h3>Deployment</h3>${roadBoxDeploymentHtml(box)}</section>
      <section class="show-detail-section"><h3>Deployment History</h3>${roadBoxHistoryHtml(box)}</section>
      <section class="show-detail-section"><h3>Frozen Manifest Snapshots</h3>${roadBoxManifestHistoryHtml(box)}</section>
    </div>
  </div>`;
  bindRoadBoxModalClose();
  bindMediaGallery('road_box', box.id, async () => {
    const fresh = await api(`/api/road-boxes/${box.id}`);
    renderRoadBoxDetail(fresh);
    await refreshRoadBoxes();
  });
  for (const zone of box.standardManifest?.zones||[]) bindMediaGallery('road_box_zone',zone.id,async()=>{renderRoadBoxDetail(await api(`/api/road-boxes/${box.id}`));await refreshRoadBoxes(false);});
  rollingStockUi.bind(box,$('#roadBoxModalBody'));
  bindCodePrintButtons($('#roadBoxModalBody'));
  bindWorkboxCommissionActions($('#roadBoxModalBody'));
  $('#roadBoxModalBody').querySelector('#openContainerPacking')?.addEventListener('click',()=>{closeRoadBoxModal();packingUi.open({containerId:box.id});});
  if (state.workboxView.focusSlotId) {
    const target = $('#roadBoxModalBody')?.querySelector(`[data-workbox-slot-id="${CSS.escape(state.workboxView.focusSlotId)}"]`);
    if (target) {
      const detail = target.closest('details.workbox-zone');
      if (detail) detail.open = true;
      requestAnimationFrame(()=>target.scrollIntoView({ block:'center', behavior:'auto' }));
    }
    state.workboxView.focusSlotId = null;
  }

  if (!state.auth.authenticated) return;

  $('#startWorkboxCommission')?.addEventListener('click', () => startWorkboxCheck(box, 'check_out', 'commissioning'));
  $('#startWorkboxCheckout')?.addEventListener('click', () => startWorkboxCheck(box, 'check_out'));
  $('#startWorkboxCheckin')?.addEventListener('click', () => startWorkboxCheck(box, 'check_in'));
  $('#resumeWorkboxCheck')?.addEventListener('click', () => resumeWorkboxCheck(box));

  $('#roadBoxEditForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      const updated = await api(`/api/road-boxes/${box.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await refreshRoadBoxes();
      renderRoadBoxDetail(updated);
      flash(`${updated.code} updated.`);
    } catch (error) { alert(error.message); }
  });

  $('#roadBoxInspectionForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      body.readinessPercent = Number(body.readinessPercent);
      const updated = await api(`/api/road-boxes/${box.id}/inspection`, { method: 'POST', body: JSON.stringify(body) });
      await refreshRoadBoxes();
      renderRoadBoxDetail(updated);
      flash(`${updated.code} condition/readiness logged.`);
    } catch (error) { alert(error.message); }
  });

  $('#useRoadBoxScanner')?.addEventListener('click',()=>{closeRoadBoxModal();packingUi.open({containerId:box.id});});

  $('#roadBoxDeployShow')?.addEventListener('change', (event) => populateRoadBoxDeployments(event.target.value));

  $('#roadBoxDeployForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      const updated = await api(`/api/road-boxes/${box.id}/assign`, {
        method: 'POST', body: JSON.stringify({ showId: body.showId, deploymentId: body.deploymentId || null })
      });
      await refreshRoadBoxes();
      await refreshShows(false);
      renderRoadBoxDetail(updated);
      flash(`${updated.code} deployed. Departure manifest frozen.`);
    } catch (error) { alert(error.message); }
  });

  $('#returnRoadBoxButton')?.addEventListener('click', async () => {
    if (!confirm(`Return ${box.code} from its job? Packed contents will remain assigned to the box and a return manifest will be frozen.`)) return;
    try {
      const updated = await api(`/api/road-boxes/${box.id}/return`, { method: 'POST', body: '{}' });
      await refreshRoadBoxes();
      await refreshShows(false);
      renderRoadBoxDetail(updated);
      flash(`${updated.code} returned from deployment.`);
    } catch (error) { alert(error.message); }
  });

  $$('[data-unpack-asset]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/api/assets/${button.dataset.unpackAsset}/action`, { method: 'POST', body: JSON.stringify({ action: 'checkin' }) });
      const updated = await api(`/api/road-boxes/${box.id}`);
      await refreshStats();
      await refreshRoadBoxes(false);
      await refreshShows(false);
      renderRoadBoxDetail(updated);
      flash('Asset checked in and removed from Road Box.');
    } catch (error) { alert(error.message); }
  }));
}

async function openRoadBox(id) {
  try {
    state.currentRoadBox = await api(`/api/road-boxes/${id}`);
    renderRoadBoxDetail(state.currentRoadBox);
    openRoadBoxModal();
  } catch (error) { flash(error.message, 'error'); }
}

function newRoadBoxFormHtml(prefillBarcode = '') {
  return `<form id="newRoadBoxForm" class="show-form">
    <label>Code *<input name="code" required autocomplete="off" placeholder="RS-01" /></label>
    <label class="span-2">Name *<input name="name" required autocomplete="off" placeholder="Packout Base 1 / Pelican 1510" /></label>
    <label>QR / Barcode<input name="barcode" autocomplete="off" placeholder="Leave blank → auto-generate AQR code" value="${esc(prefillBarcode)}" /><small>${prefillBarcode ? 'Using the barcode/QR you scanned.' : 'RoadBoxOS will issue a permanent AQR-###### code automatically.'}</small></label>
    <label>Container type<select name="boxType"><option>Road Box</option><option>Milwaukee Packout rolling base</option><option>Milwaukee Packout bin</option><option>Milwaukee Packout drawers</option><option>Milwaukee Packout organizer</option><option>Pelican</option><option>Other</option></select></label><label>Manufacturer<input name="manufacturer" /></label><label>Model<input name="model" /></label><label>Size / configuration<input name="sizeLabel" placeholder="1510 / Large / Lid organizer" /></label>
    <label class="span-2">Home location<input name="homeLocation" placeholder="Road Support / Bay A" /></label>
    <label>Initial readiness %<input name="readinessPercent" type="number" min="0" max="100" value="100" /></label>
    <label class="span-2">Initial condition<input name="conditionSummary" placeholder="Ready / Needs hasp repair / etc." /></label>
    <label class="wide">Identity / container notes<textarea name="notes" rows="2"></textarea></label>
    <div class="wide button-row"><button class="primary" type="submit">CREATE CONTAINER</button><button class="secondary" type="button" data-close-road-box-modal>Cancel</button></div>
  </form>`;
}

function openNewRoadBox(prefillBarcode = '') {
  if (!requireLoginUi()) return;
  state.currentRoadBox = null;
  $('#roadBoxModalEyebrow').textContent = 'NEW CONTAINER';
  $('#roadBoxModalTitle').textContent = 'Create a trackable container';
  $('#roadBoxModalBody').innerHTML = newRoadBoxFormHtml(prefillBarcode);
  openRoadBoxModal();
  bindRoadBoxModalClose();
  $('#newRoadBoxForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      const created = await api('/api/road-boxes', { method: 'POST', body: JSON.stringify(body) });
      await refreshRoadBoxes();
      renderRoadBoxDetail(created);
      flash(`${created.code} · ${created.name} created.`);
    } catch (error) { alert(error.message); }
  });
  $('#newRoadBoxForm [name="code"]').focus();
}


function renderLedgerLists() {
  const query = ($('#ledgerSearch')?.value || '').trim().toLowerCase();
  const people = query
    ? state.people.filter((p) => [p.name, p.role, p.department_name].some((v) => String(v || '').toLowerCase().includes(query)))
    : state.people;
  const departments = query
    ? state.departments.filter((d) => [d.name, d.code].some((v) => String(v || '').toLowerCase().includes(query)))
    : state.departments;

  $('#peopleLedgerList').innerHTML = people.length ? people.map((p) => `<button class="ledger-card ${Number(p.active) === 1 ? '' : 'inactive'}" data-ledger-type="person" data-ledger-id="${esc(p.id)}">
    <div class="record-card-with-photo">${state.auth.authenticated ? mediaThumbHtml(p.primary_media_id, p.name, 'record-thumb person-thumb') : '<div class="record-thumb media-placeholder person-thumb">PRIVATE</div>'}<div class="record-card-body">
    <div class="ledger-card-top"><div><div class="ledger-card-title">${esc(p.name)}</div><div class="ledger-card-sub">${esc(p.department_name || 'No department')}${p.role ? ` · ${esc(p.role)}` : ''}</div></div>
      ${Number(p.active) === 1 ? '' : '<span class="show-mini-pill">Inactive</span>'}
    </div>
    <div class="ledger-card-bottom"><span>${p.assets_out || 0} tool${Number(p.assets_out) === 1 ? '' : 's'} out</span><span>Open ledger →</span></div>
    </div></div>
  </button>`).join('') : '<div class="empty">No people yet.</div>';

  $('#departmentLedgerList').innerHTML = departments.length ? departments.map((d) => `<button class="ledger-card" data-ledger-type="department" data-ledger-id="${esc(d.id)}">
    <div class="ledger-card-top"><div><div class="ledger-card-title">${esc(d.name)}</div><div class="ledger-card-sub">${d.code ? `${esc(d.code)} · ` : ''}${d.people_count || 0} people</div></div></div>
    <div class="ledger-card-bottom"><span>${d.assets_out || 0} tool${Number(d.assets_out) === 1 ? '' : 's'} out</span><span>Open ledger →</span></div>
  </button>`).join('') : '<div class="empty">No departments yet.</div>';

  $$('.ledger-card').forEach((card) => card.addEventListener('click', () => openLedger(card.dataset.ledgerType, card.dataset.ledgerId)));
}

async function refreshLedgers(render = true) {
  const [people, departments] = await Promise.all([api('/api/people'), api('/api/departments')]);
  state.people = people;
  state.departments = departments;
  if (render && $('#peopleLedgerList')) renderLedgerLists();
  if (state.mode === 'checkout' && $('#modeContext')) renderModeContext();
  return { people, departments };
}

function openLedgerModal() { $('#ledgerModal').classList.remove('hidden'); }
function closeLedgerModal() { $('#ledgerModal').classList.add('hidden'); state.currentLedger = null; focusScanner(); }
function bindLedgerModalClose() { $$('[data-close-ledger-modal]').forEach((node) => node.addEventListener('click', closeLedgerModal)); }

function internalAssignmentListHtml(activeAssets) {
  if (!activeAssets?.length) return '<div class="show-section-empty">Nothing is currently checked out on this ledger.</div>';
  return `<div class="assignment-list">${activeAssets.map((a) => `<div class="assignment-row">
    <span class="mono">${esc(a.barcode)}</span>
    <div><b>${esc(a.asset_name)}</b><small>${esc(a.purpose || 'No task note')}${a.checked_out_by ? ` · by ${esc(a.checked_out_by)}` : ''} · ${esc(formatTime(a.checked_out_at))}</small></div>
    <span class="show-mini-pill outstanding">${esc(statusLabel(a.asset_status))}</span>
  </div>`).join('')}</div>`;
}

function assignmentHistoryHtml(history) {
  if (!history?.length) return '<div class="show-section-empty">No checkout history yet.</div>';
  return `<div class="ledger-history">${history.map((a) => `<div class="show-note">
    <div class="show-note-head">${esc(formatTime(a.checked_out_at))} · ${esc(a.checked_out_by || '')}</div>
    <div><b>${esc(a.asset_name)}</b> <span class="mono">${esc(a.barcode)}</span> · ${esc(a.status === 'active' ? 'OUT' : 'RETURNED')}</div>
    <div class="hint">${esc(a.purpose || 'No task note')}${a.checked_in_at ? ` · Returned ${esc(formatTime(a.checked_in_at))} by ${esc(a.checked_in_by || '—')}` : ''}</div>
  </div>`).join('')}</div>`;
}

function personFormHtml(person) {
  const departmentOptions = state.departments.map((d) => `<option value="${esc(d.id)}" ${d.id === person.department_id ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  return `<form id="ledgerEditForm" class="show-form">
    <label class="span-2">Name *<input name="name" required value="${esc(person.name)}" /></label>
    <label>Department<select name="departmentId"><option value="">No department</option>${departmentOptions}</select></label>
    <label>Role / title<input name="role" value="${esc(person.role || '')}" /></label>
    <label>Status<select name="active"><option value="1" ${Number(person.active) === 1 ? 'selected' : ''}>Active</option><option value="0" ${Number(person.active) === 0 ? 'selected' : ''}>Inactive</option></select></label>
    <label class="wide">Notes<textarea name="notes" rows="2">${esc(person.notes || '')}</textarea></label>
    ${state.auth.authenticated ? '<div class="wide button-row"><button class="primary" type="submit">SAVE PERSON</button><button id="useLedgerScanner" class="secondary" type="button">USE IN SCANNER</button></div>' : ''}
  </form>`;
}

function departmentFormHtml(department) {
  return `<form id="ledgerEditForm" class="show-form">
    <label class="span-2">Department name *<input name="name" required value="${esc(department.name)}" /></label>
    <label>Code / abbreviation<input name="code" value="${esc(department.code || '')}" /></label>
    <label class="wide">Notes<textarea name="notes" rows="2">${esc(department.notes || '')}</textarea></label>
    ${state.auth.authenticated ? '<div class="wide button-row"><button class="primary" type="submit">SAVE DEPARTMENT</button><button id="useLedgerScanner" class="secondary" type="button">USE IN SCANNER</button></div>' : ''}
  </form>`;
}

function renderLedgerDetail(type, data) {
  state.currentLedger = { type, data };
  const isPerson = type === 'person';
  $('#ledgerModalEyebrow').textContent = isPerson ? 'PERSON LEDGER' : 'DEPARTMENT LEDGER';
  $('#ledgerModalTitle').textContent = data.name;
  const peopleSection = !isPerson && data.people?.length
    ? `<section class="show-detail-section"><h3>People in ${esc(data.name)}</h3><div class="ledger-people">${data.people.map((p) => `<button class="ledger-person-link" data-open-person="${esc(p.id)}">${esc(p.name)} <span>${p.assets_out || 0} out</span></button>`).join('')}</div></section>`
    : '';
  $('#ledgerModalBody').innerHTML = `<div class="show-detail-grid">
    <div>
      <section class="show-detail-section"><h3>${isPerson ? 'Person' : 'Department'}</h3>${isPerson ? personFormHtml(data) : departmentFormHtml(data)}</section>
      <section class="show-detail-section"><h3>Currently Checked Out · ${data.activeAssets?.length || 0}</h3>${internalAssignmentListHtml(data.activeAssets)}</section>
      ${peopleSection}
    </div>
    <div>
      ${isPerson ? mediaGalleryHtml('person', data.id, data.photos || [], { title: 'Profile Photo', label: data.name }) : ''}
      <section class="show-detail-section"><h3>Ledger History</h3>${assignmentHistoryHtml(data.assignmentHistory)}</section>
    </div>
  </div>`;
  bindLedgerModalClose();
  if (isPerson) bindMediaGallery('person', data.id, async () => {
    const fresh = await api(`/api/people/${data.id}`);
    renderLedgerDetail('person', fresh);
    await refreshLedgers();
  });

  $$('[data-open-person]').forEach((button) => button.addEventListener('click', () => openLedger('person', button.dataset.openPerson)));

  if (state.auth.authenticated) {
    $('#ledgerEditForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(event.currentTarget).entries());
        if (type === 'person') body.active = body.active === '1';
        const updated = await api(`/api/${type === 'person' ? 'people' : 'departments'}/${data.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        await refreshLedgers();
        renderLedgerDetail(type, updated);
        flash(`${updated.name} updated.`);
      } catch (error) { alert(error.message); }
    });
    $('#useLedgerScanner')?.addEventListener('click', async () => {
      state.checkoutTargetType = type;
      localStorage.setItem('roadboxosCheckoutTargetType', type);
      if (type === 'person') {
        state.checkoutPersonId = data.id;
        localStorage.setItem('roadboxosCheckoutPersonId', data.id);
      } else {
        state.checkoutDepartmentId = data.id;
        localStorage.setItem('roadboxosCheckoutDepartmentId', data.id);
      }
      closeLedgerModal();
      switchView('scan');
      await setMode('checkout');
      flash(`Checkout target: ${type === 'person' ? 'Person' : 'Department'} · ${data.name}`);
    });
  }
}

async function openLedger(type, id) {
  try {
    const data = await api(`/api/${type === 'person' ? 'people' : 'departments'}/${id}`);
    renderLedgerDetail(type, data);
    openLedgerModal();
  } catch (error) { flash(error.message, 'error'); }
}

function newDepartmentFormHtml() {
  return `<form id="newLedgerForm" class="show-form">
    <label class="span-2">Department name *<input name="name" required autocomplete="off" placeholder="Fabrication" /></label>
    <label>Code / abbreviation<input name="code" placeholder="FAB" /></label>
    <label class="wide">Notes<textarea name="notes" rows="2"></textarea></label>
    <div class="wide button-row"><button class="primary" type="submit">CREATE DEPARTMENT</button><button class="secondary" type="button" data-close-ledger-modal>Cancel</button></div>
  </form>`;
}

function newPersonFormHtml() {
  const departmentOptions = state.departments.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  return `<form id="newLedgerForm" class="show-form">
    <label class="span-2">Name *<input name="name" required autocomplete="off" placeholder="Alex Rivera" /></label>
    <label>Department<select name="departmentId"><option value="">No department</option>${departmentOptions}</select></label>
    <label>Role / title<input name="role" placeholder="Technician" /></label>
    <label class="wide">Notes<textarea name="notes" rows="2"></textarea></label>
    <div class="wide button-row"><button class="primary" type="submit">CREATE PERSON</button><button class="secondary" type="button" data-close-ledger-modal>Cancel</button></div>
  </form>`;
}

function openNewDepartment() {
  if (!requireLoginUi()) return;
  state.currentLedger = null;
  $('#ledgerModalEyebrow').textContent = 'NEW INTERNAL LEDGER';
  $('#ledgerModalTitle').textContent = 'Create Department';
  $('#ledgerModalBody').innerHTML = newDepartmentFormHtml();
  openLedgerModal();
  bindLedgerModalClose();
  $('#newLedgerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      const created = await api('/api/departments', { method: 'POST', body: JSON.stringify(body) });
      await refreshLedgers();
      renderLedgerDetail('department', created);
      flash(`${created.name} department created.`);
    } catch (error) { alert(error.message); }
  });
  $('#newLedgerForm [name="name"]').focus();
}

async function openNewPerson() {
  if (!requireLoginUi()) return;
  if (!state.departments.length) await refreshLedgers(false);
  state.currentLedger = null;
  $('#ledgerModalEyebrow').textContent = 'NEW INTERNAL LEDGER';
  $('#ledgerModalTitle').textContent = 'Create Person';
  $('#ledgerModalBody').innerHTML = newPersonFormHtml();
  openLedgerModal();
  bindLedgerModalClose();
  $('#newLedgerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      const created = await api('/api/people', { method: 'POST', body: JSON.stringify(body) });
      await refreshLedgers();
      renderLedgerDetail('person', created);
      flash(`${created.name} person ledger created.`);
    } catch (error) { alert(error.message); }
  });
  $('#newLedgerForm [name="name"]').focus();
}


function trackingModeLabel(mode) {
  return ({ serialized: 'Serialized', quantity: 'Quantity', hybrid: 'Hybrid' })[mode] || mode;
}

function checkoutTargetPayload() {
  const body = { targetType: state.checkoutTargetType, purpose: state.checkoutPurpose || null };
  if (state.checkoutTargetType === 'show') {
    if (!state.checkoutShowId) throw new Error('Choose a show / job for checkout.');
    body.targetId = state.checkoutShowId;
    body.showId = state.checkoutShowId;
    body.deploymentId = state.checkoutDeploymentId || null;
    body.containerId=state.checkoutContainerId||null;
  } else if (state.checkoutTargetType === 'person') {
    if (!state.checkoutPersonId) throw new Error('Choose a person for checkout.');
    body.targetId = state.checkoutPersonId;
    body.personId = state.checkoutPersonId;
  } else if (state.checkoutTargetType === 'department') {
    if (!state.checkoutDepartmentId) throw new Error('Choose a department for checkout.');
    body.targetId = state.checkoutDepartmentId;
    body.departmentId = state.checkoutDepartmentId;
  } else if (state.checkoutTargetType === 'road_box') {
    if (!state.checkoutRoadBoxId) throw new Error('Choose a Road Box for checkout.');
    body.targetId = state.checkoutRoadBoxId;
    body.roadBoxId = state.checkoutRoadBoxId;
  } else if (state.checkoutTargetType === 'kit') {
    if (!state.checkoutKitAssetId) throw new Error('Choose a physical Kit for packing.');
    body.targetId = state.checkoutKitAssetId;
    body.kitAssetId = state.checkoutKitAssetId;
  } else {
    throw new Error('Choose a checkout target.');
  }
  return body;
}

function codeRenderUrl(value, kind = 'qr', brand = true) {
  const file = encodeURIComponent(value) + '-' + kind + '-' + Number(brand) + '.svg';
  return new URL('./codes/' + file, import.meta.url).href;
}

function printGeneratedLabel(value, label = value, mode = 'combined') {
  const qr = `${codeRenderUrl(value, 'qr', true)}`;
  const barcode = `${codeRenderUrl(value, 'barcode', false)}`;
  const showQr = mode !== 'barcode';
  const showBarcode = mode !== 'qr';
  const grid = showQr && showBarcode ? 'grid-template-columns:1.08in 1fr' : 'grid-template-columns:1fr';
  const body = `<div class="label" style="${grid}">
    ${showQr ? `<img class="qr" src="${qr}">` : ''}
    <div><div class="name">${esc(label)}</div><div class="code">${esc(value)}</div>${showBarcode ? `<img class="bar" src="${barcode}">` : ''}<div class="brand">RoadBoxOS</div></div>
  </div>`;
  const frame = document.createElement('iframe');
  frame.className = 'print-frame';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><title>${esc(label)} · ${esc(value)}</title><style>
    @page{margin:.15in}body{font-family:Arial,sans-serif;margin:0;padding:12px;color:#111}.label{width:4in;min-height:1.45in;border:1px dashed #bbb;padding:.18in;display:grid;gap:.18in;align-items:center;box-sizing:border-box}.qr{width:1in;height:1in;margin:auto}.name{font-weight:800;font-size:18px;line-height:1.15;margin-bottom:8px}.code{font:700 14px monospace;margin:6px 0 10px}.bar{width:100%;height:.5625in;object-fit:contain}.brand{font-size:10px;letter-spacing:.14em;font-weight:800;margin-top:8px;color:#555}@media print{body{padding:0}.label{border:0}}</style></head><body>${body}</body></html>`);
  doc.close();
  let printStarted = false;
  const doPrint = () => {
    if (printStarted) return;
    printStarted = true;
    const images = [...doc.images];
    Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; })))
      .then(() => setTimeout(() => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); }
        catch (error) { flash(`Unable to open print dialog: ${error.message}`, 'error'); }
      }, 100));
  };
  frame.onload = doPrint;
  if (doc.readyState === 'complete') doPrint();
  setTimeout(() => frame.remove(), 120000);
}

function bindCodePrintButtons(scope = document) {
  scope.querySelectorAll?.('[data-print-label-mode]').forEach((button) => {
    if (button.dataset.printBound === '1') return;
    button.dataset.printBound = '1';
    button.addEventListener('click', () => printGeneratedLabel(button.dataset.codeValue, button.dataset.codeLabel, button.dataset.printLabelMode));
  });
}

function renderCatalogScan(item) {
  state.currentAsset = null;
  const serialized = Number(item.children?.length ?? item.serialized_count ?? 0);
  const genericOut = (item.activeAssignments || []).reduce((sum, a) => sum + Number(a.quantity || 0) - Number(a.quantity_returned || 0), 0);
  const cover = item.photos?.find((p) => Number(p.is_primary) === 1) || item.photos?.[0];
  $('#result').innerHTML = `<article class="asset-card scanned-catalog-card">
    ${cover ? `<div class="scan-cover"><img src="${mediaUrl(cover.id)}" alt="${esc(item.name)}" /></div>` : ''}
    <div class="asset-card-top"><div><div class="asset-kicker">${esc(item.generic_code)}</div><h3 class="asset-name">${esc(item.name)}</h3></div><span class="track-pill track-${esc(item.tracking_mode)}">${esc(trackingModeLabel(item.tracking_mode))}</span></div>
    <dl class="asset-meta">
      <div><dt>Catalog / Item Code</dt><dd class="mono">${esc(item.item_code)}</dd></div>
      <div><dt>Category</dt><dd>${esc(item.category || '—')}</dd></div>
      <div><dt>Unit</dt><dd>${esc(item.unit || 'each')}</dd></div>
      <div><dt>Stock on Hand</dt><dd>${item.tracking_mode === 'quantity' ? esc(item.quantity_on_hand) : 'N/A — child assets'}</dd></div>
      <div><dt>Serialized Children</dt><dd>${serialized}</dd></div>
      <div><dt>Generic / Quantity Out</dt><dd>${genericOut} ${esc(item.unit || 'each')}</dd></div>
    </dl>
    <div class="asset-actions"><button id="openScannedCatalog" class="secondary" type="button">OPEN CATALOG ITEM</button><button id="printScannedCatalog" class="secondary" type="button">PRINT LABEL</button></div>
  </article>`;
  $('#openScannedCatalog')?.addEventListener('click', () => openCatalogItem(item.id));
  $('#printScannedCatalog')?.addEventListener('click', () => printGeneratedLabel(item.generic_code, item.name));
}

function openCatalogModal() { $('#catalogModal').classList.remove('hidden'); }
function closeCatalogModal() { $('#catalogModal').classList.add('hidden'); state.currentCatalogItem = null; focusScanner(); }
function bindCatalogModalClose() { $$('[data-close-catalog-modal]').forEach((node) => node.addEventListener('click', closeCatalogModal)); }

function catalogCardHtml(item) {
  const stock = item.tracking_mode === 'quantity' ? `${item.quantity_on_hand} ${item.unit}` : `${item.serialized_count || 0} serialized`;
  return `<button class="catalog-card" data-catalog-id="${esc(item.id)}">
    <div class="record-card-with-photo">${mediaThumbHtml(item.primary_media_id, item.name, 'record-thumb catalog-thumb')}<div class="record-card-body">
    <div class="catalog-card-top"><div><div class="catalog-code">${esc(item.generic_code)} · ${esc(item.item_code)}</div><div class="catalog-name">${esc(item.name)}</div></div><div class="catalog-card-badges"><span class="track-pill track-${esc(item.tracking_mode)}">${esc(trackingModeLabel(item.tracking_mode))}</span>${item.standardization_status === 'provisional' ? '<span class="show-mini-pill outstanding">PROVISIONAL</span>' : ''}</div></div>
    <div class="catalog-meta"><div>Category<b>${esc(item.category || '—')}</b></div><div>Manufacturer<b>${esc(item.manufacturer || '—')}</b></div><div>Model / Part #<b>${esc(item.manufacturer_part_number || '—')}</b></div><div>Replacement Cost<b>${esc(moneyDisplay(item.replacement_cost_cents, item.currency || 'USD'))}</b></div><div>Available / Stock<b>${esc(stock)}</b></div><div>Generic Out<b>${esc(item.generic_out || 0)} ${esc(item.unit)}</b></div><div>Home<b>${esc(item.home_location || '—')}</b></div></div>
    </div></div>
  </button>`;
}

function renderCatalogLists() {
  const query = ($('#catalogSearch')?.value || '').trim().toLowerCase();
  const ws = state.workboxStandardSummary;
  if ($('#workboxStandardSummary')) {
    const perBox = ws?.perBox || [];
    const oneBox = perBox[0]?.expected_unit_rows || 0;
    $('#workboxStandardSummary').innerHTML = ws ? `<div><span>ROAD BOXES</span><b>${perBox.length}</b></div><div><span>EXPECTED / BOX</span><b>${oneBox}</b></div><div><span>EXPECTED UNIT ROWS</span><b>${ws.expectedUnitRows || 0}</b></div><div><span>STANDARDIZED</span><b>${ws.standardizedFamilies ?? Math.max(0,(ws.catalogFamilies||0)-(ws.provisionalFamilies||0))}</b></div><div><span>PROVISIONAL</span><b>${ws.provisionalFamilies || 0}</b></div>` : '';
  }
  const items = query ? state.catalogItems.filter((i) => matchesSearchTokens(query,[i.name,i.item_code,i.generic_code,i.category,i.manufacturer,i.manufacturer_part_number,i.home_location])) : state.catalogItems;
  const codes = query ? state.generatedCodes.filter((c) => matchesSearchTokens(query,[c.code_value,c.label,c.entity_type,c.entity_name])) : state.generatedCodes;
  $('#catalogItemList').innerHTML = items.length ? items.map(catalogCardHtml).join('') : '<div class="empty">No catalog families yet.</div>';
  $('#generatedCodeList').innerHTML = codes.length ? codes.slice(0, 500).map((c) => `<div class="code-row"><div><div class="mono">${esc(c.code_value)}</div><small>${esc(c.entity_name || c.label || 'Generated code')} · ${esc(c.entity_type.replaceAll('_',' '))} · ${esc(formatTime(c.created_at))}</small></div><div class="code-actions"><button class="secondary" data-code-qr="${esc(c.code_value)}" data-code-label="${esc(c.entity_name || c.label || c.code_value)}">QR</button><button class="secondary" data-code-print="${esc(c.code_value)}" data-code-label="${esc(c.entity_name || c.label || c.code_value)}">PRINT</button></div></div>`).join('') : '<div class="empty">No generated codes yet.</div>';
  $$('[data-catalog-id]').forEach((node) => node.addEventListener('click', () => openCatalogItem(node.dataset.catalogId)));
  $$('[data-code-print]').forEach((node) => node.addEventListener('click', () => printGeneratedLabel(node.dataset.codePrint, node.dataset.codeLabel)));
  $$('[data-code-qr]').forEach((node) => node.addEventListener('click', () => {
    $('#catalogModalEyebrow').textContent = 'GENERATED CODE';
    $('#catalogModalTitle').textContent = node.dataset.codeLabel;
    $('#catalogModalBody').innerHTML = codePreviewHtml(node.dataset.codeQr, node.dataset.codeLabel);
    openCatalogModal(); bindCatalogModalClose(); bindCodePrintButtons($('#catalogModalBody'));
  }));
}

async function refreshCatalog(render = true) {
  const [items, codes, workboxSummary] = await Promise.all([api('/api/catalog-items'), api('/api/codes'), api('/api/workbox-standard-summary')]);
  state.catalogItems = items;
  state.generatedCodes = codes;
  state.workboxStandardSummary = workboxSummary;
  if (render && $('#catalogItemList')) renderCatalogLists();
  return items;
}


function kitCardHtml(kit) {
  return `<button class="kit-card" data-kit-id="${esc(kit.id)}"><div class="kit-card-top"><div><span class="eyebrow">${esc(kit.kit_code)}</span><h3>${esc(kit.name)}</h3></div><span class="show-mini-pill">${Number(kit.member_count||0)} child lines</span></div><div class="kit-card-meta">${esc(kit.category || 'Uncategorized')} · ${Number(kit.expected_units||0)} expected units · ${Number(kit.active_instances||0)} box instance${Number(kit.active_instances||0)===1?'':'s'}</div></button>`;
}

function renderKitList() {
  const q = ($('#kitSearch')?.value || '').trim().toLowerCase();
  const rows = q ? state.kits.filter((kit)=>[kit.name,kit.kit_code,kit.category,kit.notes].some((v)=>String(v||'').toLowerCase().includes(q))) : state.kits;
  $('#kitList').innerHTML = rows.length ? rows.map(kitCardHtml).join('') : '<div class="empty">No Kits yet. Create one for a reusable nested pack like the M12 Tool Bag.</div>';
  $$('[data-kit-id]').forEach((node)=>node.addEventListener('click',()=>openKit(node.dataset.kitId)));
}

async function refreshKits(render = true) {
  state.kits = await api('/api/kits');
  if (render && $('#kitList')) renderKitList();
  return state.kits;
}

function openKitModal() { $('#kitModal').classList.remove('hidden'); }
function closeKitModal() { $('#kitModal').classList.add('hidden'); state.currentKit = null; }
function bindKitModalClose() { $$('[data-close-kit-modal]').forEach((node)=>node.onclick=closeKitModal); }

async function ensureKitBuilderData() {
  const jobs = [];
  if (!state.catalogItems?.length) jobs.push(refreshCatalog(false));
  if (!state.assetsCache?.length) jobs.push(api('/api/assets').then((rows)=>{ state.assetsCache=rows; }));
  if (jobs.length) await Promise.all(jobs);
}

function kitMemberRowsHtml(kit) {
  if (!kit.members?.length) return '<div class="show-section-empty">No child requirements yet.</div>';
  return `<div class="kit-member-list">${kit.members.map((m)=>`<div class="kit-member-row"><span class="show-mini-pill">${esc(m.member_type.replaceAll('_',' '))}</span><div><b>${esc(m.display_label || m.label)}</b><small>${Number(m.expected_quantity||1)} × expected${m.asset_barcode ? ` · ${esc(m.asset_barcode)}` : m.generic_code ? ` · ${esc(m.generic_code)}` : ''}${m.notes ? ` · ${esc(m.notes)}` : ''}</small></div>${state.auth.authenticated ? `<button class="secondary compact" type="button" data-remove-kit-member="${esc(m.id)}">REMOVE</button>`:''}</div>`).join('')}</div>`;
}

function kitInstancesHtml(kit) {
  if (!kit.instances?.length) return '<div class="show-section-empty">Not yet included in any Road Box standards.</div>';
  return kit.instances.map((x)=>`<div class="show-note"><div><b>${esc(x.road_box_code)} · ${esc(x.road_box_name)}</b><br><small>${esc(x.zone_name)} · ${esc(x.instance_label)}</small></div></div>`).join('');
}

function physicalKitInstancesHtml(kit) {
  const rows = kit.physicalInstances || [];
  if (!rows.length) return '<div class="show-section-empty">No physical Kit instances yet. Create one to get an AQA barcode that can move, hold contents, and be checked out.</div>';
  return `<div class="physical-kit-instance-list">${rows.map((a)=>`<div class="physical-kit-instance-row"><div><b>${esc(a.name)}</b><small>${esc(a.barcode)} · ${esc(statusLabel(a.status))} · ${Number(a.serialized_contents||0)} serialized / ${Number(a.catalog_units||0)} generic inside</small></div><div class="button-row"><button class="secondary compact" type="button" data-open-physical-kit="${esc(a.id)}">OPEN</button><button class="secondary compact" type="button" data-pack-physical-kit="${esc(a.id)}">PACK TO KIT</button><button class="secondary compact" type="button" data-print-label-mode="combined" data-code-value="${esc(a.barcode)}" data-code-label="${esc(a.name)}">PRINT</button></div></div>`).join('')}</div>`;
}

function renderKitDetail(kit) {
  state.currentKit = kit;
  $('#kitModalEyebrow').textContent = 'REUSABLE KIT STANDARD';
  $('#kitModalTitle').textContent = kit.name;
  const catalogOptions = [...state.catalogItems].sort((a,b)=>a.name.localeCompare(b.name)).map((item)=>`<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.generic_code)}</option>`).join('');
  const assetOptions = [...state.assetsCache].sort((a,b)=>a.name.localeCompare(b.name)).map((asset)=>`<option value="${esc(asset.id)}">${esc(asset.name)} · ${esc(asset.barcode)} · ${esc(statusLabel(asset.status))}</option>`).join('');
  const addMember = state.auth.authenticated ? `<form id="kitMemberForm" class="form-grid kit-member-form">
    <label>Child type<select id="kitMemberType" name="memberType"><option value="catalog_item">Catalog family / generic requirement</option><option value="asset">Specific serialized asset</option><option value="placeholder">Placeholder / not standardized yet</option></select></label>
    <label id="kitMemberCatalogWrap" class="span-2">Catalog family<select id="kitMemberCatalog" name="catalogItemId"><option value="">Choose family…</option>${catalogOptions}</select></label>
    <label id="kitMemberAssetWrap" class="span-2 hidden">Specific asset<select id="kitMemberAsset" name="assetId"><option value="">Choose asset…</option>${assetOptions}</select></label>
    <label id="kitMemberLabelWrap" class="span-2 hidden">Placeholder label<input id="kitMemberLabel" name="label" placeholder="M12 whatever / accessory pouch / etc." /></label>
    <label>Expected quantity<input id="kitMemberQty" name="expectedQuantity" type="number" min="0.01" step="0.01" value="1" /></label>
    <label class="span-2">Notes<input name="notes" placeholder="Optional packing note" /></label>
    <div class="span-2"><button class="primary" type="submit">ADD CHILD TO KIT</button></div>
  </form>` : '';
  $('#kitModalBody').innerHTML = `<div class="catalog-detail-grid"><div>
    <section class="show-detail-section"><h3>Kit Definition</h3><form id="kitEditForm" class="show-form ${state.auth.authenticated?'':'readonly-lock'}"><label class="span-2">Name<input name="name" value="${esc(kit.name)}" required /></label><label>Category<input name="category" value="${esc(kit.category||'')}" /></label><label class="wide">Notes<textarea name="notes" rows="3">${esc(kit.notes||'')}</textarea></label>${state.auth.authenticated?'<div class="wide"><button class="secondary" type="submit">SAVE KIT</button></div>':''}</form></section>
    <section class="show-detail-section"><h3>Child Requirements · ${kit.members?.length||0}</h3>${kitMemberRowsHtml(kit)}${addMember}</section>
    </div><div>${codePreviewHtml(kit.kit_code,kit.name)}<section class="show-detail-section"><div class="section-heading-row"><h3>Physical Kit Instances · ${(kit.physicalInstances||[]).length}</h3>${state.auth.authenticated?'<button id="createPhysicalKitButton" class="primary compact" type="button">+ CREATE PHYSICAL KIT</button>':''}</div>${physicalKitInstancesHtml(kit)}</section><section class="show-detail-section"><h3>Used In Rolling Stock</h3>${kitInstancesHtml(kit)}</section></div></div>`;
  bindKitModalClose();
  bindCodePrintButtons($('#kitModalBody'));
  if (!state.auth.authenticated) return;
  const setMemberType = () => {
    const type=$('#kitMemberType')?.value;
    $('#kitMemberCatalogWrap')?.classList.toggle('hidden', type!=='catalog_item');
    $('#kitMemberAssetWrap')?.classList.toggle('hidden', type!=='asset');
    $('#kitMemberLabelWrap')?.classList.toggle('hidden', type!=='placeholder');
    if ($('#kitMemberQty')) { $('#kitMemberQty').disabled = type==='asset'; if (type==='asset') $('#kitMemberQty').value='1'; }
  };
  $('#kitMemberType')?.addEventListener('change',setMemberType); setMemberType();
  $('#createPhysicalKitButton')?.addEventListener('click', async ()=>{
    const proposed = `${kit.name} · Kit ${String((kit.physicalInstances?.length||0)+1).padStart(2,'0')}`;
    const name = prompt('Physical Kit name (cancel to stop):', proposed);
    if (name === null) return;
    const location = prompt('Starting location (optional):', '') ?? '';
    try {
      const created = await api(`/api/kits/${kit.id}/instances`, { method:'POST', body:JSON.stringify({ name:name.trim() || proposed, location:location.trim() || null }) });
      await refreshAssets(false); await refreshKits(false);
      const updated = await api(`/api/kits/${kit.id}`); renderKitDetail(updated);
      flash(`${created.name} created · ${created.barcode}. This is the scannable physical Kit.`);
    } catch(error){ alert(error.message); }
  });
  $$('[data-open-physical-kit]').forEach((button)=>button.addEventListener('click',async()=>{ const asset=await api(`/api/assets/${button.dataset.openPhysicalKit}`); closeKitModal(); switchView('scan'); renderAsset(asset); }));
  $$('[data-pack-physical-kit]').forEach((button)=>button.addEventListener('click',async()=>{ state.checkoutTargetType='kit';state.checkoutKitAssetId=button.dataset.packPhysicalKit;localStorage.setItem('roadboxosCheckoutTargetType','kit');localStorage.setItem('roadboxosCheckoutKitAssetId',state.checkoutKitAssetId);closeKitModal();switchView('scan');await setMode('checkout');flash('Physical Kit selected. Scan child items to pack them into it.'); }));
  $('#kitEditForm')?.addEventListener('submit', async (event)=>{ event.preventDefault(); try { const body=Object.fromEntries(new FormData(event.currentTarget).entries()); const updated=await api(`/api/kits/${kit.id}`,{method:'PATCH',body:JSON.stringify(body)}); await refreshKits(false); renderKitDetail(updated); flash('Kit updated. Existing Road Box instances retain their current child slots; new instances use this saved definition.'); } catch(error){ alert(error.message); } });
  $('#kitMemberForm')?.addEventListener('submit', async (event)=>{ event.preventDefault(); try { const body=Object.fromEntries(new FormData(event.currentTarget).entries()); body.expectedQuantity=Number(body.expectedQuantity||1); if(body.memberType!=='catalog_item') body.catalogItemId=null; if(body.memberType!=='asset') body.assetId=null; if(body.memberType!=='placeholder') body.label=null; const updated=await api(`/api/kits/${kit.id}/members`,{method:'POST',body:JSON.stringify(body)}); await refreshKits(false); renderKitDetail(updated); flash('Kit child added.'); } catch(error){ alert(error.message); } });
  $$('[data-remove-kit-member]').forEach((button)=>button.addEventListener('click', async ()=>{ if(!confirm('Remove this child requirement from the reusable Kit definition? Existing Road Box instances keep the slots they already received.')) return; try { const updated=await api(`/api/kit-members/${button.dataset.removeKitMember}`,{method:'DELETE'}); await refreshKits(false); renderKitDetail(updated); } catch(error){ alert(error.message); } }));
}

async function openKit(id) {
  await ensureKitBuilderData();
  const kit = await api(`/api/kits/${id}`);
  renderKitDetail(kit); openKitModal();
}

async function openNewKit() {
  if (!requireLoginUi()) return;
  $('#kitModalEyebrow').textContent='NEW REUSABLE KIT'; $('#kitModalTitle').textContent='Create Kit';
  $('#kitModalBody').innerHTML=`<form id="newKitForm" class="show-form"><label class="span-2">Kit name *<input name="name" required autofocus placeholder="Milwaukee M12 Tool Bag" /></label><label>Category<input name="category" placeholder="Power Tool Kit" /></label><label class="wide">Notes<textarea name="notes" rows="3" placeholder="Reusable nested pack standard"></textarea></label><div class="wide"><button class="primary" type="submit">CREATE KIT</button></div></form>`;
  openKitModal(); bindKitModalClose();
  $('#newKitForm').addEventListener('submit',async(event)=>{event.preventDefault();try{const body=Object.fromEntries(new FormData(event.currentTarget).entries());const created=await api('/api/kits',{method:'POST',body:JSON.stringify(body)});await refreshKits(false);await ensureKitBuilderData();renderKitDetail(created);flash(`${created.name} created · ${created.kit_code}`);}catch(error){alert(error.message);}});
}

function renderKitScan(kit) {
  $('#result').innerHTML = `<article class="asset-card scanned-catalog-card"><div class="asset-card-top"><div><div class="asset-kicker">${esc(kit.kit_code)}</div><h3 class="asset-name">${esc(kit.name)}</h3></div><span class="track-pill">KIT</span></div><dl class="asset-meta"><div><dt>Children</dt><dd>${kit.members?.length||0} lines</dd></div><div><dt>Used In</dt><dd>${kit.instances?.length||0} Road Box standards</dd></div><div><dt>Physical</dt><dd>${kit.physicalInstances?.length||0} scannable Kit instance${(kit.physicalInstances?.length||0)===1?'':'s'}</dd></div></dl><div class="asset-actions"><button id="openScannedKit" class="secondary" type="button">OPEN KIT</button><button class="secondary" type="button" data-print-label-mode="combined" data-code-value="${esc(kit.kit_code)}" data-code-label="${esc(kit.name)}">PRINT KIT LABEL</button></div></article>`;
  $('#openScannedKit')?.addEventListener('click',()=>{switchView('kits');openKit(kit.id);});
  bindCodePrintButtons($('#result'));
}

function codePreviewHtml(value, label) {
  return `<section class="show-detail-section"><h3>Generated Label</h3><div class="code-preview-grid"><div class="code-preview"><img class="qr-preview" src="${codeRenderUrl(value,'qr',true)}"><div class="code-preview-caption">${esc(value)}</div></div><div class="code-preview"><img class="barcode-preview" src="${codeRenderUrl(value,'barcode',false)}"><div class="code-preview-caption">Code 128 · ${esc(value)}</div></div></div><div class="button-row" style="margin-top:12px"><button class="primary" type="button" data-print-label-mode="combined" data-code-value="${esc(value)}" data-code-label="${esc(label)}">PRINT QR + BARCODE</button><button class="secondary" type="button" data-print-label-mode="qr" data-code-value="${esc(value)}" data-code-label="${esc(label)}">PRINT QR</button><button class="secondary" type="button" data-print-label-mode="barcode" data-code-value="${esc(value)}" data-code-label="${esc(label)}">PRINT BARCODE</button></div></section>`;
}

function catalogAssignmentHtml(item) {
  const rows = item.assignments || [];
  if (!rows.length) return '<div class="show-section-empty">No generic / quantity ledger activity yet.</div>';
  return `<div class="catalog-assignment-list">${rows.map((a) => {
    const remaining = Number(a.quantity) - Number(a.quantity_returned);
    return `<div class="catalog-assignment-row"><span class="mono">${esc(a.assignment_type)}</span><div><b>${esc(a.label)}</b><small>${esc(a.purpose || '')}${a.status === 'active' ? ` · ${remaining} ${esc(item.unit)} remaining` : ` · returned ${formatTime(a.checked_in_at)}`}</small></div>${a.status === 'active' && state.auth.authenticated ? `<button class="secondary compact" data-return-catalog-assignment="${esc(a.id)}" data-remaining="${esc(remaining)}">RETURN</button>` : `<span class="status-pill ${a.status === 'active' ? 'status-allocated' : 'status-available'}">${esc(a.status)}</span>`}</div>`;
  }).join('')}</div>`;
}

function catalogChildrenHtml(item) {
  const children = item.children || [];
  if (!children.length) return '<div class="show-section-empty">No serialized child assets yet.</div>';
  return `<div class="catalog-child-list">${children.map((a) => `<div class="catalog-child-row"><span class="mono">${esc(a.barcode)}</span><div><b>${esc(a.name)}${a.nickname ? ` · “${esc(a.nickname)}”` : ''}</b><small>${esc(a.serial_number || 'No manufacturer serial')} · ${esc(statusLabel(a.status))}${a.custodian ? ` · ${esc(a.custodian)}` : a.location ? ` · ${esc(a.location)}` : ''}</small></div><button class="secondary compact" data-open-child-asset="${esc(a.id)}">OPEN</button></div>`).join('')}</div>`;
}

function catalogEditFormHtml(item) {
  const opts = ['serialized','quantity','hybrid'].map((m) => `<option value="${m}" ${item.tracking_mode === m ? 'selected' : ''}>${trackingModeLabel(m)}</option>`).join('');
  return `<form id="catalogEditForm" class="show-form ${state.auth.authenticated ? '' : 'readonly-lock'}">
    <label>Item / billing code<input name="itemCode" value="${esc(item.item_code)}" /></label><label class="span-2">Name<input name="name" required value="${esc(item.name)}" /></label>
    <label>Category<input name="category" value="${esc(item.category || '')}" /></label><label>Manufacturer / Brand<input name="manufacturer" value="${esc(item.manufacturer || '')}" placeholder="Milwaukee" /></label><label>Model / Catalog / Part #<input name="manufacturerPartNumber" value="${esc(item.manufacturer_part_number || '')}" placeholder="2953-20" /></label>
    <label>Tracking<select name="trackingMode">${opts}</select></label><label>Unit<input name="unit" value="${esc(item.unit || 'each')}" /></label>
    <label>Standardization<select name="standardizationStatus"><option value="manual" ${item.standardization_status !== 'provisional' ? 'selected' : ''}>Standardized / live</option><option value="provisional" ${item.standardization_status === 'provisional' ? 'selected' : ''}>Provisional placeholder</option></select></label>
    <label>Home location<input name="homeLocation" value="${esc(item.home_location || '')}" /></label><label>Min / Par Warning<input name="minQuantity" type="number" min="0" step="any" value="${esc(item.min_quantity ?? '')}" placeholder="Minimum desired" /></label><label>Max / Full Stock<input name="maxQuantity" type="number" min="0" step="any" value="${esc(item.max_quantity ?? '')}" placeholder="100% stock level" /></label><label>Billable<select name="billable"><option value="1" ${Number(item.billable) ? 'selected' : ''}>Yes</option><option value="0" ${!Number(item.billable) ? 'selected' : ''}>No</option></select></label>
    <label class="wide">Notes<textarea name="notes" rows="2">${esc(item.notes || '')}</textarea></label>${state.auth.authenticated ? '<div class="wide button-row"><button class="primary" type="submit">SAVE EVERYTHING</button><button id="duplicateCatalogItem" class="secondary" type="button">DUPLICATE / COPY</button></div>' : ''}
  </form>`;
}

function catalogProcurementHtml(item) {
  const disabled = state.auth.authenticated ? '' : 'disabled';
  const sourceCards=(item.procurementSources || []).filter(row=>row.vendor_name || row.url || row.price_cents!=null)
    .map((source,index)=>sourceCardHtml(source,index+1,{esc,moneyInputValue,canWrite:state.auth.authenticated})).join('');
  return `<form id="catalogProcurementForm" class="procurement-form">
    <div class="procurement-summary">
      <label>Replacement / Reconciliation Cost
        <div class="money-input-wrap"><span>$</span><input name="replacementCost" type="number" min="0" step="0.01" value="${esc(moneyInputValue(item.replacement_cost_cents))}" placeholder="0.00" ${disabled} /></div>
      </label>
      <div class="procurement-cost-readout"><span>Current internal cost</span><b>${esc(moneyDisplay(item.replacement_cost_cents, item.currency || 'USD'))}</b><small>This is the authoritative replacement/reconciliation value. Vendor prices below are references.</small></div>
    </div>
    <p class="hint" data-source-empty ${sourceCards?'hidden':''}>No procurement sources added.</p><div class="procurement-source-list" data-source-list>${sourceCards}</div>
    ${state.auth.authenticated?'<button type="button" class="secondary" data-add-source>+ ADD SOURCE</button>':''}
    ${state.auth.authenticated ? '<div class="button-row"><button class="secondary" type="submit">SAVE EVERYTHING</button></div>' : '<div class="hint">Login to edit procurement and cost data.</div>'}
  </form>`;
}

function renderCatalogDetail(item) {
  state.currentCatalogItem = item;
  $('#catalogModalEyebrow').textContent = 'INVENTORY FAMILY';
  $('#catalogModalTitle').textContent = item.name;
  const stockSection = item.tracking_mode === 'quantity' ? `<section class="show-detail-section"><div class="section-heading-row"><h3>Stock Readiness</h3>${item.stock_percent!==null&&item.stock_percent!==undefined?`<span class="readiness-pill readiness-${esc(item.stock_readiness||'ready')}">${esc(item.stock_percent)}%</span>`:''}</div><div class="stock-number">${esc(item.quantity_on_hand)} <small>${esc(item.unit)}</small></div><div class="hint">Min ${esc(item.min_quantity ?? '—')} · Max ${esc(item.max_quantity ?? '—')} ${esc(item.unit)}</div>${state.auth.authenticated ? `<form id="stockAdjustForm" class="catalog-inline-form"><label>Adjustment (+ receive / - correct)<input name="delta" type="number" step="any" required placeholder="+12" /></label><label>Note<input name="note" placeholder="New case received" /></label><button class="secondary" type="submit">ADJUST</button></form>` : ''}</section>` : '';
  const nextUnit = Math.max(0, ...(item.children || []).map((child) => Number(child.unit_number || 0))) + 1;
  const childCreate = ['serialized','hybrid'].includes(item.tracking_mode) && state.auth.authenticated ? `<form id="newCatalogChildForm" class="show-form"><div class="wide identity-preview"><b>New identity:</b> ${esc(item.name)} · Unit ${String(nextUnit).padStart(2,'0')} <span class="hint">· AQA code generated automatically</span></div><label>Serial number<input name="serialNumber" placeholder="Manufacturer serial, if present" /></label><label>Nickname (optional)<input name="nickname" placeholder="Only if people actually call this one something" /></label>${startingPlacementHtml({ placementType: 'location', location: item.home_location || '' })}<label class="wide">Notes<input name="notes" /></label><div class="wide button-row"><button class="primary" type="submit">CREATE UNIT ${String(nextUnit).padStart(2,'0')} + QR</button></div></form>` : '';
  $('#catalogModalBody').innerHTML = `<div class="catalog-detail-grid"><div><section class="show-detail-section"><h3>Family / Billing Record</h3>${catalogEditFormHtml(item)}</section><section class="show-detail-section"><div class="section-heading-row"><h3>Cost & Procurement</h3><span class="show-mini-pill">${esc(moneyDisplay(item.replacement_cost_cents, item.currency || 'USD'))}</span></div>${catalogProcurementHtml(item)}</section>${stockSection}<section class="show-detail-section"><h3>Generic / Quantity Ledger</h3>${catalogAssignmentHtml(item)}</section></div><div>${mediaGalleryHtml('catalog_item', item.id, item.photos || [], { title: 'Catalog / Model Photos', label: item.name })}${codePreviewHtml(item.generic_code,item.name)}<section class="show-detail-section"><div class="section-heading-row"><h3>Family Label Batch</h3><button id="catalogFamilyBatchButton" class="secondary compact" type="button">GENERIC + CHILDREN → PRINT CODES</button></div><div class="hint">Loads this family code and every serialized child into Print Codes so you can choose QR/barcode, size, titles, print sheet, or SVG ZIP.</div></section><section class="show-detail-section"><h3>Serialized Children · ${item.children?.length || 0}</h3>${catalogChildrenHtml(item)}${childCreate}</section></div></div>`;
  bindCatalogModalClose();
  bindMediaGallery('catalog_item', item.id, async () => {
    const fresh = await api(`/api/catalog-items/${item.id}`);
    renderCatalogDetail(fresh);
    await refreshCatalog();
  });
  bindCodePrintButtons($('#catalogModalBody'));
  $('#catalogFamilyBatchButton')?.addEventListener('click', async () => {
    await refreshPrintCodes(false);
    const wanted = new Set([`catalog_item:${item.id}`,...((item.children || []).map((child) => `asset:${child.id}`))]);
    state.selectedPrintCodeIds = new Set((state.printCodes || []).filter((row) => wanted.has(row.id)).map((row) => row.id));
    closeCatalogModal();
    switchView('printcodes');
    if ($('#printScope')) $('#printScope').value = 'custom';
    if ($('#printCodeSearch')) $('#printCodeSearch').value = '';
    renderPrintCodes();
    flash(`Loaded ${state.selectedPrintCodeIds.size} labels for ${item.name}: family + serialized children.`);
  });
  bindProcurementSources($('#catalogProcurementForm'),{esc,moneyInputValue,canWrite:state.auth.authenticated});
  bindStartingPlacement($('#newCatalogChildForm'));
  $$('[data-open-child-asset]').forEach((button) => button.addEventListener('click', async () => { const asset = await api(`/api/assets/${button.dataset.openChildAsset}`); closeCatalogModal(); switchView('scan'); renderAsset(asset); }));
  if (state.auth.authenticated) {
    const saveCatalogEverything = async (event) => {
      event?.preventDefault();
      try {
        const editForm=$('#catalogEditForm'); const procurementForm=$('#catalogProcurementForm');
        const editData=Object.fromEntries(new FormData(editForm).entries());
        await api(`/api/catalog-items/${item.id}`, { method:'PATCH', body:JSON.stringify(editData) });
        const data=Object.fromEntries(new FormData(procurementForm).entries());
        const sources=readProcurementSources(procurementForm);
        const updated=await api(`/api/catalog-items/${item.id}/procurement`,{method:'PATCH',body:JSON.stringify({replacementCost:data.replacementCost||'',currency:item.currency || 'USD',sources})});
        await refreshCatalog(); renderCatalogDetail(updated); flash(`${updated.name}: family + procurement saved.`);
      } catch(error){alert(error.message);}
    };
    $('#catalogProcurementForm')?.addEventListener('submit', saveCatalogEverything);
    $('#catalogEditForm')?.addEventListener('submit', saveCatalogEverything);
    $('#duplicateCatalogItem')?.addEventListener('click', async()=>{
      const name=prompt('Name for duplicated family:', `${item.name} COPY`); if(name===null)return;
      try{const created=await api(`/api/catalog-items/${item.id}/duplicate`,{method:'POST',body:JSON.stringify({name})});await refreshCatalog();renderCatalogDetail(created);flash(`Duplicated ${item.name} → ${created.name}.`);}catch(error){alert(error.message);}
    });
    $('#stockAdjustForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { const body = Object.fromEntries(new FormData(event.currentTarget).entries()); body.delta = Number(body.delta); const updated = await api(`/api/catalog-items/${item.id}/stock`, { method:'POST', body:JSON.stringify(body) }); await refreshCatalog(); renderCatalogDetail(updated); flash(`${updated.name}: stock adjusted.`); } catch (error) { alert(error.message); }
    });
    $('#newCatalogChildForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { const body = Object.fromEntries(new FormData(event.currentTarget).entries()); if (body.startingPlacementType !== 'road_box') body.initialRoadBoxId = ''; if (body.startingPlacementType === 'road_box') body.location = ''; const child = await api(`/api/catalog-items/${item.id}/assets`, { method:'POST', body:JSON.stringify(body) }); const updated = await api(`/api/catalog-items/${item.id}`); await refreshCatalog(); renderCatalogDetail(updated); flash(`${child.name} created with ${child.barcode}.`); } catch (error) { alert(error.message); }
    });
    $$('[data-return-catalog-assignment]').forEach((button) => button.addEventListener('click', async () => {
      const remaining = Number(button.dataset.remaining);
      const qty = prompt(`Return how many ${item.unit}?`, String(remaining)); if (qty === null) return;
      try { const updated = await api(`/api/catalog-items/${item.id}/return`, { method:'POST', body:JSON.stringify({ assignmentId: button.dataset.returnCatalogAssignment, quantity:Number(qty) }) }); await refreshCatalog(); renderCatalogDetail(updated); flash(`${item.name}: return recorded.`); } catch (error) { alert(error.message); }
    }));
  }
}

async function openCatalogItem(id) {
  try { const item = await api(`/api/catalog-items/${id}`); renderCatalogDetail(item); openCatalogModal(); } catch (error) { flash(error.message,'error'); }
}

function newCatalogItemFormHtml() {
  return `<form id="newCatalogItemForm" class="show-form">
    <label class="span-2">Item / family name *<input name="name" required autofocus placeholder="M18 FUEL Gen 4 Impact Driver / M18 XC 5.0 Battery" /></label>
    <label>Item / billing code<input name="itemCode" placeholder="Optional house SKU" /></label>
    <label>Category<input name="category" placeholder="Power Tools / Batteries / Tape" /></label>
    <label>Manufacturer / Brand<input name="manufacturer" placeholder="Milwaukee" /></label>
    <label>Model / Catalog / Part #<input name="manufacturerPartNumber" placeholder="2953-20" /></label>
    <label>Tracking<select name="trackingMode"><option value="serialized">Serialized family</option><option value="quantity">Quantity / consumable</option><option value="hybrid">Hybrid: children + generic lines</option></select></label>
    <label>Unit<input name="unit" value="each" placeholder="each / roll / box / case" /></label>
    <label>Starting quantity<input name="quantityOnHand" type="number" step="any" value="0" /></label>
    <label>Home location<input name="homeLocation" /></label>
    <label>Replacement / Reconciliation Cost<input name="replacementCost" type="number" min="0" step="0.01" placeholder="179.00" /></label>
    <label>Billable<select name="billable"><option value="1">Yes</option><option value="0">No</option></select></label>
    <label class="wide">Notes<textarea name="notes" rows="3"></textarea></label>
    <div class="wide button-row"><button class="primary" type="submit">CREATE ITEM + BRANDED QR</button><button class="secondary" type="button" data-close-catalog-modal>Cancel</button></div>
  </form>`;
}

function openNewCatalogItem() {
  if (!requireLoginUi()) return;
  $('#catalogModalEyebrow').textContent = 'NEW INVENTORY FAMILY'; $('#catalogModalTitle').textContent = 'Register item + generate code'; $('#catalogModalBody').innerHTML = newCatalogItemFormHtml(); openCatalogModal(); bindCatalogModalClose();
  $('#newCatalogItemForm').addEventListener('submit', async (event) => { event.preventDefault(); try { const body = Object.fromEntries(new FormData(event.currentTarget).entries()); body.quantityOnHand = Number(body.quantityOnHand || 0); body.billable = body.billable === '1'; const created = await api('/api/catalog-items',{method:'POST',body:JSON.stringify(body)}); await refreshCatalog(); renderCatalogDetail(created); flash(`${created.name} created · ${created.generic_code}`); } catch (error) { alert(error.message); } });
}

function openNewStandaloneCode() {
  if (!requireLoginUi()) return;
  $('#catalogModalEyebrow').textContent = 'CODE REGISTRY'; $('#catalogModalTitle').textContent = 'Generate standalone code'; $('#catalogModalBody').innerHTML = `<form id="newStandaloneCodeForm" class="show-form"><label class="span-2">Label *<input name="label" required autofocus placeholder="Shelf A3 / Spare Case / Temporary ID" /></label><label>Prefix<input name="prefix" value="AQX" maxlength="8" /></label><div class="wide button-row"><button class="primary" type="submit">GENERATE CODE</button><button class="secondary" type="button" data-close-catalog-modal>Cancel</button></div></form>`; openCatalogModal(); bindCatalogModalClose();
  $('#newStandaloneCodeForm').addEventListener('submit', async (event) => { event.preventDefault(); try { const body=Object.fromEntries(new FormData(event.currentTarget).entries()); const row=await api('/api/codes',{method:'POST',body:JSON.stringify(body)}); await refreshCatalog(); $('#catalogModalTitle').textContent=row.label || row.code_value; $('#catalogModalBody').innerHTML=codePreviewHtml(row.code_value,row.label || row.code_value); bindCodePrintButtons($('#catalogModalBody')); flash(`Generated ${row.code_value}.`); } catch(error){ alert(error.message); } });
}



async function refreshReconciliationInventory(){await Promise.all([refreshCatalog(false),refreshAssets(false),refreshRoadBoxes(false),refreshShows(false),refreshStats()]);renderBillingList();}
function billingStatusLabel(status) {
  return ({ draft:'Draft', ready:'Ready for Purchasing', sent:'Sent to Purchasing', closed:'Closed', void:'Void' })[status] || status;
}
function openBillingModal() { $('#billingModal').classList.remove('hidden'); }
function closeBillingModal() { $('#billingModal').classList.add('hidden'); focusScanner(); }
function bindBillingModalClose() { $$('[data-close-billing-modal]').forEach((node) => node.addEventListener('click', closeBillingModal)); }
function billingShowOptions(selected = '') {
  const rows=[...(state.shows||[])].sort((a,b)=>String(a.job_number).localeCompare(String(b.job_number),undefined,{numeric:true}));
  return `<option value="">Unassigned / historical</option>`+rows.map((show)=>`<option value="${esc(show.id)}" ${show.id===selected?'selected':''}>${esc(show.job_number)} · ${esc(show.name)}${show.client?` · ${esc(show.client)}`:''}</option>`).join('');
}
function renderBillingList(){
  const host=$('#billingList');if(!host)return;const q=($('#billingSearch')?.value||'').trim();
  const rows=(state.billingDocuments||[]).filter((row)=>matchesSearchTokens(q,[row.bill_number,row.title,row.external_invoice_number,row.job_number,row.show_name,row.show_client,row.status]));
  host.innerHTML=rows.length?rows.map((row)=>`<button class="billing-list-card ${state.currentBilling?.id===row.id?'active':''}" data-billing-open="${esc(row.id)}" type="button"><div><b>${esc(row.bill_number)}</b><span class="show-mini-pill">${esc(billingStatusLabel(row.status))}</span></div><strong>${esc(row.title)}</strong><small>${row.job_number?`${esc(row.job_number)} · ${esc(row.show_name||'')}`:'Unassigned historical reconciliation'} · ${Number(row.line_count||0)} lines</small><em>${esc(moneyDisplay(row.total_cents,row.currency||'USD'))}</em></button>`).join(''):'<div class="empty">No reconciliation requests match.</div>';
  $$('[data-billing-open]').forEach((node)=>node.addEventListener('click',()=>openBillingDocument(node.dataset.billingOpen)));
}
async function refreshBilling(render=true){state.billingDocuments=await api('/api/show-billing');if(render)renderBillingList();return state.billingDocuments;}
async function openBillingDocument(id){state.currentBilling=await api(`/api/show-billing/${encodeURIComponent(id)}`);renderBillingList();renderBillingDetail();}
function billingCatalogMatches(query){return (state.catalogItems||[]).filter((row)=>matchesSearchTokens(query,[row.name,row.generic_code,row.item_code,row.category,row.manufacturer,row.manufacturer_part_number])).slice(0,60);}
function billingLineRowHtml(line){
  const linked=line.catalog_item_id?`<span class="billing-linked">LIVE CATALOG · ${esc(line.current_catalog_code||line.code_snapshot||'')}</span>`:line.asset_id?'<span class="billing-linked">SERIALIZED ASSET</span>':'<span class="billing-unlinked">MANUAL / UNLINKED</span>';
  const desc=line.effective_description||line.description;const price=line.effective_unit_price_cents??line.unit_price_cents;const live=Boolean(line.catalog_item_id&&line.price_mode!=='manual');
  const procurement=line.primary_procurement_url?`<a href="${esc(line.primary_procurement_url)}" target="_blank" rel="noopener">${esc(line.primary_vendor||'Procurement link')} ↗</a>`:'<span class="hint">No procurement link</span>';
  const receive=Number(line.received_quantity||0);const complete=receive>=Number(line.quantity||0);
  return `<tr data-billing-line="${esc(line.id)}"><td>${mediaThumbHtml(line.primary_media_id,desc,'billing-line-thumb')}<div class="billing-line-desc">${linked}<input data-bl-description value="${esc(desc)}" ${line.catalog_item_id?'title="Current Catalog name; rename the family to change everywhere"':''}/><small>${procurement}</small></div></td><td><input data-bl-qty type="number" min="0.001" step="any" value="${esc(line.quantity)}" /></td><td><input data-bl-unit value="${esc(line.effective_unit||line.unit||'each')}" /></td><td><input data-bl-price type="number" min="0" step="0.01" value="${esc(moneyInputValue(price))}" ${live?'disabled':''}/>${line.catalog_item_id?`<label class="mini-check"><input data-bl-manual-price type="checkbox" ${live?'':'checked'}/> override</label>`:''}</td><td class="money-cell">${esc(moneyDisplay(line.line_total_cents,line.currency||'USD'))}</td><td><input data-bl-notes value="${esc(line.notes||'')}" placeholder="Line note" /></td><td><div class="receive-state ${complete?'received':''}">${receive}/${line.quantity} received</div>${!line.asset_id&&line.catalog_item_id?`<small class="hint">${esc(line.stock_deducted_quantity||0)} deducted from pool</small>`:''}<div class="billing-line-actions"><button class="secondary compact" data-billing-line-save="${esc(line.id)}" type="button">SAVE</button>${state.auth.authenticated&&!complete?`<button class="secondary compact" data-billing-line-receive="${esc(line.id)}" data-remaining="${esc(line.remaining_to_receive)}" type="button">RECEIVE</button>`:''}${state.auth.authenticated?`<button class="secondary compact" data-billing-receipt-edit="${esc(line.id)}" type="button">EDIT RECEIVED</button>`:''}${!line.catalog_item_id&&!line.asset_id?`<button class="secondary compact" data-billing-line-catalogize="${esc(line.id)}" type="button">CREATE FAMILY</button>`:''}<button class="danger-btn compact" data-billing-line-delete="${esc(line.id)}" type="button">DELETE</button></div></td></tr>`;
}
function renderBillingCatalogResults(query=''){
  const host=$('#billingCatalogResults');if(!host)return;const q=String(query||'').trim();if(!q){host.innerHTML='<div class="hint">Search the Catalog without leaving this reconciliation.</div>';return;}
  const rows=billingCatalogMatches(q);host.innerHTML=rows.length?rows.map(row=>catalogHitHtml(row,{esc,moneyDisplay,mediaThumbHtml},'data-billing-add-catalog')).join(''):'<div class="empty">No Catalog family found. Add a manual line, then CREATE FAMILY.</div>';
  $$('[data-billing-add-catalog]').forEach((button)=>button.addEventListener('click',async()=>{const query=$('#billingCatalogSearch')?.value||q;const y=window.scrollY;try{state.currentBilling=await api(`/api/show-billing/${encodeURIComponent(state.currentBilling.id)}/lines`,{method:'POST',body:JSON.stringify({catalogItemId:button.dataset.billingAddCatalog,quantity:1})});await refreshBilling(false);await refreshReconciliationInventory();renderBillingDetail({catalogQuery:query,scrollY:y});flash('Item added to reconciliation.');}catch(error){alert(error.message);}}));
}
function renderBillingDetail(opts={}){
  const host=$('#billingDetail');if(!host)return;const bill=state.currentBilling;if(!bill){host.innerHTML='<div class="empty">Choose a reconciliation or create one to begin.</div>';return;}const canWrite=state.auth.authenticated;
  const received=bill.lines.reduce((s,l)=>s+Math.min(Number(l.received_quantity||0),Number(l.quantity||0)),0);const requested=bill.lines.reduce((s,l)=>s+Number(l.quantity||0),0);
  host.innerHTML=`<div class="billing-detail-head"><div><div class="eyebrow">RECONCILIATION ID · ${esc(bill.bill_number)}</div><h2>${esc(bill.title)}</h2><div class="billing-show-ref">${bill.job_number?`<button class="link-button" type="button" id="billingOpenShow">${esc(bill.job_number)} · ${esc(bill.show_name||'')}</button>`:'No Show linked yet'}</div></div><div class="billing-total"><span>REPLACEMENT TOTAL</span><b>${esc(moneyDisplay(bill.total_cents,'USD'))}</b><small>${received}/${requested} units received</small></div></div>
  <div class="button-row billing-top-actions"><button id="billingPrint" class="secondary" type="button">PRINT / SAVE PDF</button><button id="billingCsv" class="secondary" type="button">EXPORT CSV</button><button id="billingXls" class="secondary" type="button">EXPORT EXCEL</button></div>
  <form id="billingMetaForm" class="show-form billing-meta-form"><label>Show / Job<select name="showId" ${canWrite?'':'disabled'}>${billingShowOptions(bill.show_id||'')}</select></label><label class="span-2">Title<input name="title" value="${esc(bill.title)}" ${canWrite?'':'disabled'}/></label><label>External reference<input name="externalInvoiceNumber" value="${esc(bill.external_invoice_number||'')}" ${canWrite?'':'disabled'}/></label><label>Request date<input type="date" name="billDate" value="${esc(bill.bill_date||'')}" ${canWrite?'':'disabled'}/></label><label>Status<select name="status" ${canWrite?'':'disabled'}>${['draft','ready','sent','closed','void'].map((v)=>`<option value="${v}" ${bill.status===v?'selected':''}>${billingStatusLabel(v)}</option>`).join('')}</select></label><label class="wide">Source / handwritten notes<textarea name="sourceNotes" rows="3" ${canWrite?'':'disabled'}>${esc(bill.source_notes||'')}</textarea></label>${canWrite?'<div class="wide button-row"><button class="primary" type="submit">SAVE RECONCILIATION</button></div>':''}</form>
  <section class="show-detail-section billing-add-section"><div class="section-heading-row"><h3>Add Missing Items</h3><span class="show-mini-pill">${bill.line_count} lines</span></div>${canWrite?`<form id="billingScanForm" class="billing-scan-form"><label>Scan QR / Barcode<input id="billingBarcode" autocomplete="off" placeholder="Scan AQA / AQI code + Enter" /></label><label>Qty<input name="quantity" type="number" min="0.001" step="any" value="1" /></label><button class="primary" type="submit">SCAN + ADD</button></form><label class="billing-family-search">Search Catalog<input id="billingCatalogSearch" placeholder="3/8 socket 9/16 / m18 drill / AQI-…" /></label><div id="billingCatalogResults" class="billing-catalog-results"></div><p class="hint">New missing-item entries deduct recorded pool stock down to zero. RECEIVE adds the delivered quantity to inventory. Scan individual serialized codes to mark exact units lost; serialized replacements receive new barcodes. Link manual lines to a family before receiving stock.</p><details class="billing-manual"><summary>Manual / handwritten line not in Catalog yet</summary><form id="billingManualForm" class="show-form"><label class="span-2">Description *<input name="description" required /></label><label>Qty<input name="quantity" type="number" min="0.001" step="any" value="1" /></label><label>Unit<input name="unit" value="each" /></label><label>Unit price<input name="unitPrice" type="number" min="0" step="0.01" value="0.00" /></label><label class="span-2">Source text<input name="sourceText" /></label><div class="wide button-row"><button class="primary" type="submit">ADD MANUAL LINE</button></div></form></details>`:'<div class="readonly-banner"><b>READ ONLY</b><span>Log in to edit reconciliation lines.</span></div>'}</section>
  <section class="show-detail-section"><h3>Missing Tools Reconciliation</h3>${bill.lines.length?`<div class="billing-table-wrap"><table class="billing-table"><thead><tr><th>Item / Procurement</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th><th>Notes</th><th>Receiving</th></tr></thead><tbody>${bill.lines.map(billingLineRowHtml).join('')}</tbody><tfoot><tr><td colspan="4">TOTAL REPLACEMENT COST</td><td>${esc(moneyDisplay(bill.total_cents,'USD'))}</td><td colspan="2"></td></tr></tfoot></table></div>`:'<div class="empty">No reconciliation lines yet.</div>'}</section>`;
  $('#billingOpenShow')?.addEventListener('click',()=>{switchView('shows');openShow(bill.show_id);});$('#billingPrint')?.addEventListener('click',printCurrentBill);$('#billingCsv')?.addEventListener('click',exportCurrentBillCsv);$('#billingXls')?.addEventListener('click',exportCurrentBillXls);
  $('#billingMetaForm')?.addEventListener('submit',async(e)=>{e.preventDefault();try{state.currentBilling=await api(`/api/show-billing/${bill.id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget).entries()))});await refreshShows(false);await refreshBilling(false);await refreshReconciliationInventory();renderBillingDetail();flash('Reconciliation saved.');}catch(error){alert(error.message);}});
  $('#billingScanForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const q=$('#billingCatalogSearch')?.value||'';const y=window.scrollY;try{const fd=new FormData(e.currentTarget);state.currentBilling=await api(`/api/show-billing/${bill.id}/scan`,{method:'POST',body:JSON.stringify({barcode:$('#billingBarcode').value.trim(),quantity:Number(fd.get('quantity')||1)})});await refreshBilling(false);await refreshReconciliationInventory();renderBillingDetail({catalogQuery:q,scrollY:y});beep('ok');}catch(error){beep('error');alert(error.message);}});
  $('#billingCatalogSearch')?.addEventListener('input',(e)=>renderBillingCatalogResults(e.target.value));
  $('#billingManualForm')?.addEventListener('submit',async(e)=>{e.preventDefault();try{const body=Object.fromEntries(new FormData(e.currentTarget).entries());body.quantity=Number(body.quantity||1);state.currentBilling=await api(`/api/show-billing/${bill.id}/lines`,{method:'POST',body:JSON.stringify(body)});await refreshBilling(false);await refreshReconciliationInventory();renderBillingDetail();flash('Manual line added.');}catch(error){alert(error.message);}});
  $$('[data-bl-manual-price]').forEach((cb)=>cb.addEventListener('change',()=>{const tr=cb.closest('tr');const price=tr.querySelector('[data-bl-price]');price.disabled=!cb.checked;}));
  $$('[data-billing-line-save]').forEach((button)=>button.addEventListener('click',async()=>{const tr=button.closest('tr');const manual=tr.querySelector('[data-bl-manual-price]')?.checked;const body={description:tr.querySelector('[data-bl-description]').value,quantity:Number(tr.querySelector('[data-bl-qty]').value),unit:tr.querySelector('[data-bl-unit]').value,notes:tr.querySelector('[data-bl-notes]').value};if(manual)body.unitPrice=tr.querySelector('[data-bl-price]').value;else if(tr.querySelector('[data-bl-manual-price]'))body.useLiveCatalogPrice=true;try{state.currentBilling=await api(`/api/show-billing-lines/${button.dataset.billingLineSave}`,{method:'PATCH',body:JSON.stringify(body)});await refreshBilling(false);await refreshReconciliationInventory();renderBillingDetail();flash('Line saved.');}catch(error){alert(error.message);}}));
  $$('[data-billing-line-receive]').forEach((button)=>button.addEventListener('click',async()=>{const remaining=Number(button.dataset.remaining||0);const qty=prompt('Quantity received:',String(remaining));if(qty===null)return;try{state.currentBilling=await api(`/api/show-billing-lines/${button.dataset.billingLineReceive}/receive`,{method:'POST',body:JSON.stringify({quantity:Number(qty)})});await refreshBilling(false);await refreshReconciliationInventory();renderBillingDetail();flash('Received quantity added to inventory.');}catch(error){alert(error.message);}}));
  $$('[data-billing-receipt-edit]').forEach(button=>button.addEventListener('click',()=>openBillingReceiptCorrection(button.dataset.billingReceiptEdit)));
  $$('[data-billing-line-delete]').forEach((button)=>button.addEventListener('click',async()=>{if(!confirm('Remove this line from the reconciliation?'))return;try{state.currentBilling=await api(`/api/show-billing-lines/${button.dataset.billingLineDelete}`,{method:'DELETE'});await refreshBilling(false);await refreshReconciliationInventory();renderBillingDetail();}catch(error){alert(error.message);}}));
  $$('[data-billing-line-catalogize]').forEach((button)=>button.addEventListener('click',()=>openBillingCatalogize(button.dataset.billingLineCatalogize)));
  const q=opts.catalogQuery||'';if(q&&$('#billingCatalogSearch')){$('#billingCatalogSearch').value=q;renderBillingCatalogResults(q);}if(opts.scrollY!==undefined)setTimeout(()=>window.scrollTo({top:opts.scrollY}),0);
}
function openBillingReceiptCorrection(lineId) {
  if (!requireLoginUi()) return;
  const line=state.currentBilling.lines.find(row=>row.id===lineId);if(!line)return;
  $('#billingModalEyebrow').textContent='CORRECT RECEIPT';$('#billingModalTitle').textContent=line.effective_description || line.description;
  $('#billingModalBody').innerHTML=`<form id="billingReceiptCorrection" class="show-form"><label>Total actually received<input name="receivedQuantity" type="number" min="0" max="${esc(line.quantity)}" step="any" value="${esc(line.received_quantity || 0)}" required></label><label>Correction note<input name="note" placeholder="Count corrected after delivery"></label><p class="hint wide">Enter the corrected total, including earlier deliveries. This reverses recorded inventory receipts when lowering the count. Return or unpack replacement units that are already in use first.</p><button class="primary">SAVE RECEIVED TOTAL</button></form>`;
  openBillingModal();bindBillingModalClose();
  $('#billingReceiptCorrection').addEventListener('submit',async event=>{event.preventDefault();try{
    state.currentBilling=await api(`/api/show-billing-lines/${lineId}/receive`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))});
    closeBillingModal();await refreshBilling(false);await refreshReconciliationInventory();renderBillingDetail();flash('Received total corrected.');
  }catch(error){alert(error.message);}});
}
function openNewBilling(){if(!requireLoginUi())return;$('#billingModalEyebrow').textContent='NEW MISSING TOOLS RECONCILIATION';$('#billingModalTitle').textContent='Create reconciliation request';$('#billingModalBody').innerHTML=`<form id="newBillingForm" class="show-form"><label class="span-2">Show / Job<select name="showId">${billingShowOptions('')}</select></label><label class="span-2">Title<input name="title" placeholder="Target Together 2026 · Missing Tools Reconciliation" /></label><label>External reference<input name="externalInvoiceNumber" /></label><label>Date<input type="date" name="billDate" value="${new Date().toISOString().slice(0,10)}" /></label><label class="wide">Source / handwritten notes<textarea name="sourceNotes" rows="7"></textarea></label><div class="wide button-row"><button class="primary" type="submit">CREATE RECONCILIATION</button><button class="secondary" type="button" id="billingCreateShow">+ CREATE SHOW FIRST</button></div></form>`;openBillingModal();bindBillingModalClose();$('#billingCreateShow').addEventListener('click',()=>{closeBillingModal();openNewShow();});$('#newBillingForm').addEventListener('submit',async(e)=>{e.preventDefault();try{const created=await api('/api/show-billing',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget).entries()))});closeBillingModal();await refreshBilling(false);await refreshReconciliationInventory();state.currentBilling=created;renderBillingList();renderBillingDetail();flash(`${created.bill_number} created.`);}catch(error){alert(error.message);}});}
function openBillingCatalogize(lineId){if(!requireLoginUi())return;const line=state.currentBilling?.lines?.find(r=>r.id===lineId);if(!line)return;$('#billingModalEyebrow').textContent='CATALOG GAP';$('#billingModalTitle').textContent='Create family from reconciliation line';$('#billingModalBody').innerHTML=`<form id="billingCatalogizeForm" class="show-form"><label class="span-2">Family name *<input name="name" value="${esc(line.description)}" required /></label><label>Category<input name="category" /></label><label>Manufacturer<input name="manufacturer" /></label><label>Model / Part #<input name="manufacturerPartNumber" /></label><label>Tracking<select name="trackingMode"><option value="quantity">Quantity</option><option value="hybrid">Hybrid</option><option value="serialized">Serialized</option></select></label><label>Unit<input name="unit" value="${esc(line.unit||'each')}" /></label><label>Replacement cost<input name="replacementCost" type="number" min="0" step="0.01" value="${esc(moneyInputValue(line.unit_price_cents))}" /></label><label class="check-label"><input name="provisional" type="checkbox" value="1" checked /> Keep provisional</label><div class="wide button-row"><button class="primary" type="submit">CREATE FAMILY + LINK LINE</button></div></form>`;openBillingModal();bindBillingModalClose();$('#billingCatalogizeForm').addEventListener('submit',async(e)=>{e.preventDefault();try{const fd=new FormData(e.currentTarget);const body=Object.fromEntries(fd.entries());body.provisional=fd.has('provisional');const result=await api(`/api/show-billing-lines/${lineId}/catalog`,{method:'POST',body:JSON.stringify(body)});state.currentBilling=result.billing;closeBillingModal();await refreshCatalog(false);await refreshBilling(false);await refreshReconciliationInventory();renderBillingDetail();flash(`${result.catalogItem.name} created and linked.`);}catch(error){alert(error.message);}});}
async function logReconciliationExport(format){if(!state.auth.authenticated)return;try{state.currentBilling=await api(`/api/show-billing/${state.currentBilling.id}/export`,{method:'POST',body:JSON.stringify({format})});await refreshBilling(false);await refreshReconciliationInventory();}catch(error){console.warn(error);}}
function reconciliationGroupedRows(bill){const groups=new Map();for(const line of bill.lines){const vendor=line.primary_vendor||'Vendor Not Set';if(!groups.has(vendor))groups.set(vendor,[]);groups.get(vendor).push(line);}return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));}
async function printCurrentBill(){const bill=state.currentBilling;if(!bill)return;await logReconciliationExport('pdf_print');const groups=reconciliationGroupedRows(state.currentBilling);const body=groups.map(([vendor,lines])=>`<h2>${esc(vendor)}</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Procurement</th></tr></thead><tbody>${lines.map(l=>`<tr><td>${esc(l.effective_description||l.description)}</td><td>${esc(l.quantity)}</td><td>${esc(moneyDisplay(l.effective_unit_price_cents??l.unit_price_cents,l.currency))}</td><td>${esc(moneyDisplay(l.line_total_cents,l.currency))}</td><td>${l.primary_procurement_url?`<a href="${esc(l.primary_procurement_url)}">${esc(l.primary_vendor||'Open link')}</a>`:'—'}</td></tr>`).join('')}</tbody></table>`).join('');const frame=document.createElement('iframe');frame.className='print-frame';document.body.appendChild(frame);const doc=frame.contentDocument;doc.open();doc.write(`<!doctype html><html><head><title>${esc(bill.job_number||bill.bill_number)} Missing Tools Reconciliation</title><style>@page{margin:.35in}body{font-family:Arial;color:#111;font-size:10pt}h1{margin:0}h2{margin:18px 0 5px;font-size:13pt}table{border-collapse:collapse;width:100%}th,td{padding:5px;border-bottom:1px solid #ddd;text-align:left}th:nth-child(2),td:nth-child(2),th:nth-child(3),td:nth-child(3),th:nth-child(4),td:nth-child(4){text-align:right}.total{font-size:16pt;font-weight:800;text-align:right;margin-top:18px}a{color:#0645ad}.meta{margin:4px 0 14px;color:#444}</style></head><body><h1>Missing Tools Reconciliation</h1><div class="meta">${bill.job_number?`${esc(bill.job_number)} · ${esc(bill.show_name||'')}`:esc(bill.title)} · ${esc(bill.bill_date||'')}</div>${body}<div class="total">Total Replacement Cost: ${esc(moneyDisplay(bill.total_cents,'USD'))}</div></body></html>`);doc.close();frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};setTimeout(()=>frame.remove(),120000);}
async function exportCurrentBillCsv(){const bill=state.currentBilling;if(!bill)return;await logReconciliationExport('csv');const b=state.currentBilling;const quote=(v)=>`"${String(v??'').replaceAll('"','""')}"`;const lines=[['Job Number','Show','Vendor','Description','Code','Qty','Unit','Unit Price','Line Total','Procurement Link','Qty Received','Notes'],...b.lines.sort((a,c)=>String(a.primary_vendor||'').localeCompare(String(c.primary_vendor||''))).map(l=>[b.job_number||'',b.show_name||'',l.primary_vendor||'',l.effective_description||l.description,l.current_catalog_code||l.code_snapshot||'',l.quantity,l.effective_unit||l.unit,(Number((l.effective_unit_price_cents ?? l.unit_price_cents) || 0)/100).toFixed(2),(Number(l.line_total_cents||0)/100).toFixed(2),l.primary_procurement_url||'',l.received_quantity||0,l.notes||'']),['','','','','','','','TOTAL',(Number(b.total_cents||0)/100).toFixed(2),'','','']];const blob=new Blob([lines.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${b.job_number||b.bill_number}-missing-tools-reconciliation.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),3000);}
async function exportCurrentBillXls(){const bill=state.currentBilling;if(!bill)return;await logReconciliationExport('excel');const b=state.currentBilling;const rows=b.lines.sort((a,c)=>String(a.primary_vendor||'').localeCompare(String(c.primary_vendor||''))).map(l=>`<tr><td>${esc(l.primary_vendor||'')}</td><td>${esc(l.effective_description||l.description)}</td><td>${esc(l.quantity)}</td><td>${esc(moneyInputValue(l.effective_unit_price_cents??l.unit_price_cents))}</td><td>${esc(moneyInputValue(l.line_total_cents))}</td><td>${l.primary_procurement_url?`<a href="${esc(l.primary_procurement_url)}">${esc(l.primary_procurement_url)}</a>`:''}</td><td>${esc(l.received_quantity||0)}</td></tr>`).join('');const html=`<html><head><meta charset="utf-8"></head><body><h2>Missing Tools Reconciliation · ${esc(b.job_number||'')} ${esc(b.show_name||'')}</h2><table border="1"><tr><th>Vendor</th><th>Item</th><th>Qty</th><th>Unit Price</th><th>Line Total</th><th>Procurement Link</th><th>Received</th></tr>${rows}<tr><td colspan="4"><b>TOTAL</b></td><td><b>${esc(moneyInputValue(b.total_cents))}</b></td><td colspan="2"></td></tr></table></body></html>`;const blob=new Blob([html],{type:'application/vnd.ms-excel'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${b.job_number||b.bill_number}-missing-tools-reconciliation.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),3000);}

const PRINT_CODE_SIZE_PRESETS = {
  small: { qrIn: 0.5625, barcodeHeightIn: 0.31640625 },
  medium: { qrIn: 1.0, barcodeHeightIn: 0.5625 },
  large: { qrIn: 2.75, barcodeHeightIn: 0.84375 }
};

function printCodeAssociationLabel(a) {
  if (!a?.road_box_id) return '';
  return `${a.road_box_code || ''} ${a.road_box_name || ''}${a.zone_name ? ` · ${a.zone_name}` : ''}`.trim();
}

function printCodeAssociations(row) {
  return Array.isArray(row.associations) ? row.associations : [];
}

function selectedPrintRows() {
  const ids = state.selectedPrintCodeIds || new Set();
  return (state.printCodes || []).filter((row) => ids.has(row.id));
}

function filteredPrintRows() {
  const scope = $('#printScope')?.value || 'all';
  const roadBoxId = $('#printRoadBox')?.value || '';
  const zoneId = $('#printZone')?.value || '';
  const entityType = $('#printEntityType')?.value || '';
  const query = ($('#printCodeSearch')?.value || '').trim().toLowerCase();
  return (state.printCodes || []).filter((row) => {
    if (Number(row.active) === 0) return false;
    if (entityType && row.entity_type !== entityType) return false;
    const assoc = printCodeAssociations(row);
    if (scope === 'road_box' && (!roadBoxId || !assoc.some((a) => a.road_box_id === roadBoxId))) return false;
    if (scope === 'zone' && (!roadBoxId || !zoneId || !assoc.some((a) => a.road_box_id === roadBoxId && a.zone_id === zoneId))) return false;
    if (query && !matchesSearchTokens(query,[row.code_value,row.label,row.entity_type,row.category,row.tracking_mode,...assoc.flatMap((a) => [a.road_box_code,a.road_box_name,a.zone_name,a.slot_label])])) return false;
    return true;
  });
}

function updatePrintCodeFilterOptions() {
  const scope = $('#printScope')?.value || 'all';
  const roadBox = $('#printRoadBox');
  const zone = $('#printZone');
  if (!roadBox || !zone) return;
  const oldBox = roadBox.value;
  const oldZone = zone.value;
  const boxMap = new Map();
  for (const row of state.printCodes || []) for (const a of printCodeAssociations(row)) if (a.road_box_id) boxMap.set(a.road_box_id, `${a.road_box_code || ''} · ${a.road_box_name || ''}`);
  const boxOptions = [...boxMap.entries()].sort((a,b) => a[1].localeCompare(b[1],undefined,{numeric:true,sensitivity:'base'}));
  roadBox.innerHTML = `<option value="">${scope === 'all' || scope === 'custom' ? 'All boxes' : 'Choose box…'}</option>` + boxOptions.map(([id,label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('');
  if ([...roadBox.options].some((o) => o.value === oldBox)) roadBox.value = oldBox;
  else if ((scope === 'road_box' || scope === 'zone') && boxOptions.length) roadBox.value = boxOptions[0][0];
  const chosenBox = roadBox.value;
  const zoneMap = new Map();
  for (const row of state.printCodes || []) for (const a of printCodeAssociations(row)) if (a.zone_id && (!chosenBox || a.road_box_id === chosenBox)) zoneMap.set(a.zone_id, a.zone_name || 'Zone');
  const zoneOptions = [...zoneMap.entries()].sort((a,b) => a[1].localeCompare(b[1],undefined,{numeric:true,sensitivity:'base'}));
  zone.innerHTML = `<option value="">${scope === 'zone' ? 'Choose zone…' : 'All zones'}</option>` + zoneOptions.map(([id,label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('');
  if ([...zone.options].some((o) => o.value === oldZone)) zone.value = oldZone;
  else if (scope === 'zone' && zoneOptions.length) zone.value = zoneOptions[0][0];
  $('#printRoadBoxWrap')?.classList.toggle('muted-control', scope === 'all' || scope === 'custom');
  $('#printZoneWrap')?.classList.toggle('muted-control', scope !== 'zone');
}

function renderPrintCodes() {
  updatePrintCodeFilterOptions();
  const rows = filteredPrintRows();
  const selected = state.selectedPrintCodeIds || new Set();
  if ($('#printSelectionCount')) $('#printSelectionCount').textContent = `${selected.size} selected`;
  const byType = Object.fromEntries(['asset','catalog_item','road_box','kit','standalone'].map((type) => [type, rows.filter((r) => r.entity_type === type).length]));
  if ($('#printCodesSummary')) $('#printCodesSummary').innerHTML = `<div><b>${rows.length}</b><span>matching codes</span></div><div><b>${byType.asset}</b><span>assets</span></div><div><b>${byType.catalog_item}</b><span>catalog</span></div><div><b>${byType.road_box}</b><span>boxes</span></div><div><b>${byType.kit}</b><span>kits</span></div><div><b>${byType.standalone}</b><span>standalone</span></div>`;
  if (!$('#printCodesList')) return;
  $('#printCodesList').innerHTML = rows.length ? rows.map((row) => {
    const associations = [...new Set(printCodeAssociations(row).map(printCodeAssociationLabel).filter(Boolean))];
    const assocText = associations.length ? `${associations.slice(0,3).join(' · ')}${associations.length > 3 ? ` · +${associations.length-3} more` : ''}` : 'No Road Box / zone association';
    return `<label class="print-code-row"><input type="checkbox" data-print-code-id="${esc(row.id)}" ${selected.has(row.id) ? 'checked' : ''}/><div class="print-code-main"><div><b>${esc(row.label || row.code_value)}</b><span class="mono">${esc(row.code_value)}</span></div><small>${esc(row.entity_type.replaceAll('_',' '))} · ${esc(assocText)}</small></div><div class="print-code-mini"><img src="${codeRenderUrl(row.code_value,'qr',true)}" alt=""/></div></label>`;
  }).join('') : '<div class="empty">No codes match these filters.</div>';
  $$('[data-print-code-id]').forEach((checkbox) => checkbox.addEventListener('change', () => {
    state.selectedPrintCodeIds ||= new Set();
    if (checkbox.checked) state.selectedPrintCodeIds.add(checkbox.dataset.printCodeId); else state.selectedPrintCodeIds.delete(checkbox.dataset.printCodeId);
    $('#printSelectionCount').textContent = `${state.selectedPrintCodeIds.size} selected`;
  }));
}

async function refreshPrintCodes(render = true) {
  state.printCodes = await api('/api/print-codes');
  state.selectedPrintCodeIds ||= new Set();
  const valid = new Set(state.printCodes.map((r) => r.id));
  state.selectedPrintCodeIds = new Set([...state.selectedPrintCodeIds].filter((id) => valid.has(id)));
  if (render) renderPrintCodes();
  return state.printCodes;
}

function printCodeSheet() {
  const rows = selectedPrintRows();
  if (!rows.length) return flash('Select at least one code first.', 'error');
  const kind = $('#printCodeKind').value;
  const sizeName = $('#printCodeSize').value;
  const includeTitle = $('#printIncludeTitle').checked;
  const preset = PRINT_CODE_SIZE_PRESETS[sizeName] || PRINT_CODE_SIZE_PRESETS.medium;
  const labels = rows.map((row) => {
    const title = includeTitle ? `<div class="label-title">${esc(row.label || row.code_value)}</div>` : '';
    const qr = kind !== 'barcode' ? `<div class="qr-wrap"><img class="qr" src="${codeRenderUrl(row.code_value,'qr',true)}">${kind === 'qr' ? `<div class="human-code">${esc(row.code_value)}</div>` : ''}</div>` : '';
    const bar = kind !== 'qr' ? `<img class="bar" src="${codeRenderUrl(row.code_value,'barcode',false)}">` : '';
    return `<div class="batch-label size-${esc(sizeName)} kind-${esc(kind)}">${title}<div class="label-glyphs">${qr}${bar}</div></div>`;
  }).join('');
  const frame = document.createElement('iframe');
  frame.className = 'print-frame'; frame.setAttribute('aria-hidden','true'); document.body.appendChild(frame);
  const doc = frame.contentDocument; doc.open();
  doc.write(`<!doctype html><html><head><title>RoadBoxOS · ${rows.length} labels</title><style>@page{margin:.25in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:.05in;color:#111}.sheet{display:flex;flex-wrap:wrap;gap:.12in;align-items:flex-start}.batch-label{border:1px dashed #bbb;padding:.06in;display:flex;flex-direction:column;align-items:center;justify-content:center;break-inside:avoid;page-break-inside:avoid;background:#fff;max-width:100%}.label-title{font-weight:800;text-align:center;line-height:1.1;margin-bottom:.04in;max-width:4.5in}.label-glyphs{display:flex;gap:.08in;align-items:center;justify-content:center}.qr{display:block;width:${preset.qrIn}in;height:${preset.qrIn}in}.bar{display:block;height:${preset.barcodeHeightIn}in;width:auto;max-width:6.8in}.human-code{font-family:monospace;font-weight:700;font-size:8pt;text-align:center;margin-top:.02in}.size-small .label-title{font-size:7pt}.size-medium .label-title{font-size:10pt}.size-large .label-title{font-size:16pt}.kind-qr .label-glyphs,.kind-barcode .label-glyphs{gap:0}@media print{body{padding:0}.batch-label{border:0}}</style></head><body><div class="sheet">${labels}</div></body></html>`);
  doc.close();
  let fired=false; const fire=()=>{if(fired)return;fired=true;Promise.all([...doc.images].map((img)=>img.complete?Promise.resolve():new Promise((r)=>{img.onload=r;img.onerror=r;}))).then(()=>setTimeout(()=>{frame.contentWindow.focus();frame.contentWindow.print();},120));};
  frame.onload=fire; if(doc.readyState==='complete') fire(); setTimeout(()=>frame.remove(),120000);
}

async function exportCodeZip() {
  const rows = selectedPrintRows();
  if (!rows.length) return flash('Select at least one code first.', 'error');
  if (!state.auth.authenticated) { showLogin(); return flash('Log in before exporting code files.', 'error'); }
  const scope = $('#printScope').value;
  const body = { ids:rows.map((r)=>r.id), kind:$('#printCodeKind').value, sizeName:$('#printCodeSize').value, includeTitle:$('#printIncludeTitle').checked, organization:$('#printZipOrganization').value,
    roadBoxId:(scope==='road_box'||scope==='zone')?$('#printRoadBox').value:'', zoneId:scope==='zone'?$('#printZone').value:'' };
  const response = await fetch('/api/code-export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (response.status === 401) { showLogin(); return; }
  if (!response.ok) { const data=await response.json().catch(()=>({})); return flash(data.error || 'Code export failed.', 'error'); }
  const blob = await response.blob();
  const cd = response.headers.get('content-disposition') || '';
  const filename = (cd.match(/filename="([^"]+)"/) || [])[1] || 'roadboxos-code-export.zip';
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  flash(`Exported ${rows.length} selected code records.`);
}

async function refreshOpsDashboard(){
  state.opsDashboard=await api('/api/dashboard');const d=state.opsDashboard;const host=$('#opsDashboard');if(!host)return;
  const stock=(d.stockReadiness||[]);const frequent=[...(d.frequent||[])];
  host.innerHTML=`<div class="ops-kpis"><div><span>Live Reconciliation Value</span><b>${moneyDisplay(d.billingTotalCents||0)}</b><small>${d.draftBills||0} active drafts/ready</small></div><div><span>Catalog</span><b>${d.standardizedFamilies||0} standardized</b><small>${d.provisionalFamilies||0} provisional</small></div><div><span>Rolling Stock</span><b>${d.roadBoxes||0}</b><small>${d.deployedRoadBoxes||0} deployed</small></div></div>
  <div class="ops-kpis"><div><span>Pending Return Estimates</span><b>${moneyDisplay(d.recovery?.pending_value_cents||0)}</b><small>${d.recovery?.pending_count||0} returns · ${d.recovery?.pending_unknown_count||0} unknown values</small></div><div><span>Confirmed Return Credits</span><b>${moneyDisplay(d.recovery?.confirmed_credit_cents||0)}</b><small>${d.recovery?.credited_count||0} credited records</small></div><div><span>Material / Non-returnable Losses</span><b>${moneyDisplay(d.recovery?.loss_value_cents||0)}</b><small>${d.recovery?.loss_count||0} records · ${d.recovery?.loss_unknown_count||0} unknown values</small></div></div>
  <div class="ops-columns"><section class="panel"><h3>Consumables Readiness</h3>${stock.length?stock.slice(0,30).map(r=>`<div class="ops-row"><span class="readiness-dot ${esc(r.readiness)}"></span><div><b>${esc(r.name)}</b><small>${esc(r.quantity_on_hand)} / ${esc(r.max_quantity)} · min ${esc(r.min_quantity??'—')}</small></div><strong>${esc(r.pct)}%</strong></div>`).join(''):'<div class="empty">Set Min/Max on quantity families to populate readiness.</div>'}</section><section class="panel"><h3>Rolling Stock Readiness</h3>${(d.roadBoxReadiness||[]).map(r=>`<div class="ops-row"><span class="readiness-dot ${Number(r.readiness_percent)<20?'critical':Number(r.readiness_percent)<50?'warning':'ready'}"></span><div><b>${esc(r.code)} · ${esc(r.name)}</b><small>${esc(r.condition_summary||r.current_location||'')}</small></div><strong>${esc(r.readiness_percent)}%</strong></div>`).join('')}</section><section class="panel"><h3>Frequent Fliers</h3>${frequent.slice(0,20).map(r=>`<div class="ops-row"><div><b>${esc(r.item)}</b><small>${esc(r.reconciliations||0)} reconciliations · ${esc(r.qty||0)} units/packs</small></div><strong>${moneyDisplay(r.value_cents||0)}</strong></div>`).join('')}</section></div>`;
}
function exportMasterCatalogBook(){
  const rows=[...(state.catalogItems||[])].sort((a,b)=>String(a.category||'Uncategorized').localeCompare(String(b.category||'Uncategorized'))||a.name.localeCompare(b.name));
  const items=rows.map(r=>`<article><div class="book-img">${r.primary_media_id?`<img src="/media/${encodeURIComponent(r.primary_media_id)}">`:''}</div><div class="book-body"><div class="cat">${esc(r.category||'Uncategorized')}</div><h3>${esc(r.name)}</h3><small>${esc([r.manufacturer,r.manufacturer_part_number].filter(Boolean).join(' · '))}</small><img class="book-barcode" src="${codeRenderUrl(r.generic_code,'barcode',false)}"><div class="mono">${esc(r.generic_code)}</div></div></article>`).join('');
  const frame=document.createElement('iframe');frame.className='print-frame';document.body.appendChild(frame);const doc=frame.contentDocument;doc.open();doc.write(`<!doctype html><html><head><style>@page{margin:.25in}body{font-family:Arial;margin:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}article{break-inside:avoid;border:1px solid #bbb;padding:7px;display:grid;grid-template-columns:.9in 1fr;gap:7px;min-height:1.15in}.book-img img{width:.85in;height:.85in;object-fit:contain}.book-body h3{font-size:10pt;margin:2px 0}.cat{font-size:7pt;text-transform:uppercase;color:#555}.book-barcode{max-width:2.25in;height:.34in;object-fit:fill}.mono{font-family:monospace;font-size:7pt}small{font-size:7pt}</style></head><body><div class="grid">${items}</div></body></html>`);doc.close();frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};setTimeout(()=>frame.remove(),120000);
}

function switchView(view) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  if (view === 'scan') focusScanner();
  if (view === 'dashboard') refreshOpsDashboard();
  if (view === 'shows') refreshShows();
  if (view === 'billing') refreshBilling();
  if (['resupply','recovery'].includes(view)) purchasingUi.enter(view).catch(e=>alert(e.message));
  if (view === 'roadboxes') refreshRoadBoxes();
  if (view === 'ledgers') refreshLedgers();
  if (view === 'catalog') refreshCatalog();
  if (view === 'kits') refreshKits();
  if (view === 'printcodes') refreshPrintCodes();
  if (view === 'assets') refreshAssets();
  if (view === 'history') refreshHistory();
}

async function onLogin(event) {
  event.preventDefault();
  const username = $('#loginUsername').value.trim(); const password = $('#loginPassword').value; const errorNode = $('#loginError');
  errorNode.classList.add('hidden');
  try {
    state.auth = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    $('#loginPassword').value = ''; updateAuthUi(); hideLogin(); flash(`Logged in as ${state.auth.user}. Changes enabled.`);
  } catch (error) { errorNode.textContent = error.message; errorNode.classList.remove('hidden'); $('#loginPassword').select(); }
}

async function onAuthButton() {
  if (!state.auth.authenticated) { showLogin(); return; }
  try {
    state.auth = await api('/api/logout', { method: 'POST', body: '{}' });
    await setMode('lookup'); updateAuthUi(); flash('Logged out. RoadBoxOS is now read-only.'); showLogin();
  } catch (error) { flash(error.message, 'error'); }
}

$('#scanForm').addEventListener('submit', onScan);
$$('.mode').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
$$('.tab').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#refreshAssets').addEventListener('click', refreshAssets);
$('#refreshHistory').addEventListener('click', refreshHistory);
$('#refreshPrintCodes')?.addEventListener('click', refreshPrintCodes);
$('#refreshShows').addEventListener('click', refreshShows);
$('#refreshBilling')?.addEventListener('click', refreshBilling);
$('#refreshOpsDashboard')?.addEventListener('click', refreshOpsDashboard);
$('#newBillingButton')?.addEventListener('click', openNewBilling);
$('#refreshRoadBoxes').addEventListener('click', refreshRoadBoxes);
$('#refreshLedgers').addEventListener('click', refreshLedgers);
$('#newShowButton').addEventListener('click', openNewShow);
$('#newRoadBoxButton').addEventListener('click', () => openNewRoadBox());
$('#newPersonButton').addEventListener('click', openNewPerson);
$('#newDepartmentButton').addEventListener('click', openNewDepartment);
$('#refreshCatalog').addEventListener('click', refreshCatalog);
$('#refreshKits')?.addEventListener('click', refreshKits);
$('#newKitButton')?.addEventListener('click', openNewKit);
$('#newCatalogItemButton').addEventListener('click', openNewCatalogItem);
$('#newStandaloneCodeButton').addEventListener('click', openNewStandaloneCode);
const masterBookButton=document.createElement('button');masterBookButton.className='secondary';masterBookButton.type='button';masterBookButton.textContent='PRINT MASTER BOOK';masterBookButton.addEventListener('click',async()=>{await refreshCatalog(false);exportMasterCatalogBook();});$('#newStandaloneCodeButton').parentElement?.appendChild(masterBookButton);
$('#loginForm').addEventListener('submit', onLogin);
$('#continueReadOnly').addEventListener('click', hideLogin);
$('#authButton').addEventListener('click', onAuthButton);
$$('[data-auth-download]').forEach((link) => link.addEventListener('click', (event) => {
  if (state.auth.authenticated) return;
  event.preventDefault();
  showLogin();
  flash('Log in before downloading backups.', 'error');
}));
let searchTimer;
$('#assetSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(refreshAssets, 180); });
$('#showSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderShowBoard, 120); });
$('#billingSearch')?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderBillingList, 120); });
$('#roadBoxSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderRoadBoxList, 120); });
$('#ledgerSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderLedgerLists, 120); });
$('#catalogSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderCatalogLists, 120); });
$('#kitSearch')?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderKitList, 120); });
$('#printScope')?.addEventListener('change', renderPrintCodes);
$('#printRoadBox')?.addEventListener('change', renderPrintCodes);
$('#printZone')?.addEventListener('change', renderPrintCodes);
$('#printEntityType')?.addEventListener('change', renderPrintCodes);
$('#printCodeSearch')?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderPrintCodes, 120); });
$('#selectFilteredCodes')?.addEventListener('click', () => { state.selectedPrintCodeIds ||= new Set(); for (const row of filteredPrintRows()) state.selectedPrintCodeIds.add(row.id); renderPrintCodes(); });
$('#clearSelectedCodes')?.addEventListener('click', () => { state.selectedPrintCodeIds = new Set(); renderPrintCodes(); });
$('#printSelectedCodes')?.addEventListener('click', printCodeSheet);
$('#exportSelectedCodes')?.addEventListener('click', exportCodeZip);

bindLoginTriggers(); bindShowModalClose(); bindRoadBoxModalClose(); bindLedgerModalClose(); bindCatalogModalClose(); bindKitModalClose(); bindBillingModalClose();

document.addEventListener('click', (event) => {
  const interactive = event.target.closest('input, textarea, select, button, a, form');
  if (!interactive && $('#view-scan').classList.contains('active') && !$('#registerForm')) focusScanner();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#showModal').classList.contains('hidden')) return closeShowModal();
  if (event.key === 'Escape' && !$('#roadBoxModal').classList.contains('hidden')) return closeRoadBoxModal();
  if (event.key === 'Escape' && !$('#ledgerModal').classList.contains('hidden')) return closeLedgerModal();
  if (event.key === 'Escape' && !$('#catalogModal').classList.contains('hidden')) return closeCatalogModal();
  if (event.key === 'Escape' && !$('#billingModal').classList.contains('hidden')) return closeBillingModal();
  if (event.key === 'Escape' && !$('#kitModal').classList.contains('hidden')) return closeKitModal();
  if(event.key==='Escape'&&!$('#packingModal').classList.contains('hidden'))return packingUi.close();
  if (event.key === 'Escape' && !$('#workboxKitModal').classList.contains('hidden')) return closeWorkboxKitModal();
  if (event.key === 'Escape' && !$('#loginModal').classList.contains('hidden') && !state.auth.authenticated) hideLogin();
});

const purchasingUi = initPurchasingUi({state,api,esc,moneyDisplay,moneyInputValue,matchesSearchTokens,requireLoginUi,refreshCatalog,refreshShows,switchView,openShow,closeShowModal,beep,mediaThumbHtml});

state.config = await api('/api/config');
await refreshAuth();
await refreshStats();
await refreshShows(false);
await refreshRoadBoxes(false);
await refreshLedgers(false);
await refreshCatalog(false);
await refreshAssets(false);
await refreshPrintCodes(false);
await setMode('lookup');
focusScanner();
bindDemoReports();
$('[data-demo-scan]').forEach((button) => {
  button.addEventListener('click', () => {
    $('#barcodeInput').value = button.dataset.demoScan;
    $('#scanForm').requestSubmit();
  });
});

packingUi.bindStation();
$('#openStationPacking').addEventListener('click',()=>packingUi.open({showId:state.checkoutTargetType==='show'?state.checkoutShowId:'',deploymentId:state.checkoutDeploymentId,containerId:state.checkoutTargetType==='road_box'?state.checkoutRoadBoxId:state.checkoutContainerId}));
