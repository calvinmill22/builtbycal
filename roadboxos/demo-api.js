import { filterRecoveryRecords, recoveryReport, resupplyReport } from './purchasing-reports.js';

let snapshotPromise;
let snapshot;

async function loadSnapshot() {
  snapshotPromise ??= fetch(new URL('./demo-data.json', import.meta.url)).then((response) => {
    if (!response.ok) throw new Error('RoadBoxOS sample data could not be loaded.');
    return response.json();
  });
  snapshot = await snapshotPromise;
}

const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' }
});

const queryFields = [
  'id', 'name', 'nickname', 'title', 'label', 'barcode', 'code', 'code_value', 'kit_code',
  'generic_code', 'item_code', 'category', 'manufacturer', 'manufacturer_part_number', 'serial_number',
  'job_number', 'effective_job_number', 'show_name', 'current_location', 'location', 'home_location',
  'department', 'order_number', 'notes'
];

function matchQuery(row, query) {
  const searchable = queryFields.map((key) => row[key] ?? '').join(' ').toLowerCase();
  return query.toLowerCase().trim().split(/\s+/).every((term) => searchable.includes(term));
}

function recoveryFor(params) {
  const records = filterRecoveryRecords(snapshot.reads['/api/recovery'].records, params);
  const active = records.filter((row) => row.status !== 'void');
  const pending = active.filter((row) => row.kind === 'return' && row.status !== 'credited');
  const credited = active.filter((row) => row.status === 'credited');
  const losses = active.filter((row) => row.kind === 'loss');
  const total = (rows, key) => rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
  return {
    records,
    summary: {
      pending_count: pending.length,
      pending_value_cents: total(pending, 'estimated_value_cents'),
      pending_unknown_count: pending.filter((row) => row.estimated_value_cents == null).length,
      confirmed_credit_cents: total(credited, 'actual_credit_cents'),
      credited_count: credited.length,
      loss_count: losses.length,
      loss_value_cents: total(losses, 'estimated_value_cents'),
      loss_unknown_count: losses.filter((row) => row.estimated_value_cents == null).length
    }
  };
}

export async function demoFetch(input, options = {}) {
  const { pathname, searchParams } = new URL(input, 'https://builtbycal.com');
  const method = (options.method ?? 'GET').toUpperCase();
  if (method === 'POST' && pathname === '/api/scan') {
    await loadSnapshot();
    const barcode = String(JSON.parse(options.body ?? '{}').barcode ?? '').trim();
    if (!barcode) return reply({ error: 'Barcode is required.' }, 400);
    return reply(Object.hasOwn(snapshot.scans, barcode) ? snapshot.scans[barcode] : { found: false });
  }
  if (method !== 'GET') return reply({ error: 'The RoadBoxOS public demo is read-only.' }, 401);

  await loadSnapshot();
  if (pathname === '/api/recovery') return reply(recoveryFor(searchParams));
  if (!Object.hasOwn(snapshot.reads, pathname)) return reply({ error: 'Demo record not found.' }, 404);

  const data = snapshot.reads[pathname];
  const query = searchParams.get('q');
  return reply(query && Array.isArray(data) ? data.filter((row) => matchQuery(row, query)) : data);
}

export function bindDemoReports() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || !snapshot) return;
    const { pathname, searchParams } = new URL(link.href);
    const order = pathname.match(/^\/api\/resupply\/([^/]+)\/export$/);
    if (pathname !== '/api/recovery/export' && !order) return;

    const format = searchParams.get('format') ?? 'print';
    let content;
    let filename;
    if (order) {
      const row = snapshot.reads['/api/resupply/' + order[1]];
      if (!row) return;
      content = resupplyReport(row, format, searchParams.get('group') ?? 'vendor');
      filename = row.order_number;
    } else {
      const { records, summary } = recoveryFor(searchParams);
      content = recoveryReport(records, summary, format);
      filename = 'roadboxos-sample-recovery';
    }

    event.preventDefault();
    const types = { print: 'text/html', csv: 'text/csv', xls: 'application/vnd.ms-excel' };
    const url = URL.createObjectURL(new Blob([content], { type: (types[format] ?? 'text/plain') + ';charset=utf-8' }));
    if (format === 'print') {
      window.open(url, '_blank', 'noopener');
    } else {
      const download = document.createElement('a');
      download.href = url;
      download.download = filename + '.' + format;
      download.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, { capture: true });
}
