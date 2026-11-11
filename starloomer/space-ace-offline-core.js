/* Starloomer Space Ace browser adapter.
   It preserves the original Canvas game, supplying a local-browser equivalent
   of its /api/crew, /api/run/start, /api/run/finish, and /api/events endpoints.
   No network traffic, shared server database, or authentication is used. */
(() => {
  'use strict';
  const realFetch = window.fetch.bind(window);
  const STORAGE_KEY = 'starloomer-space-ace-local-v1';
  const START_STATS = { tech: 6, combat: 6, science: 6, luck: 6 };
  let memory = { pilots: {}, events: [], nextId: 1, runs: {} };
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object' && saved.pilots && saved.events) memory = { ...memory, ...saved, runs: {} };
  } catch (_) { /* Private browsing: use in-memory state. */ }
  function save() {
    try {
      const { runs, ...durable } = memory;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(durable));
    } catch (_) { /* Browsers may disable local storage. A session still works. */ }
  }
  function reply(payload, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  }
  function fail(message, status = 400) { return reply({ detail: message }, status); }
  function clean(name) { return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 32); }
  function pilot(name) {
    const callsign = clean(name);
    if (!callsign) throw Error('Enter a pilot callsign to begin.');
    const key = callsign.toLowerCase();
    if (!memory.pilots[key]) {
      const crew = { id: memory.nextId++, callsign, level: 1, xp: 0, credits: 0,
        ...START_STATS, unspent_stat_points: 0, scrap: 0, electronics: 0, weird_junk: 0,
        signal_data: 0, stats: { runs: 0, best_score: 0, best_combo: 0,
          total_pickups: 0, total_hits: 0, survivals: 0 } };
      memory.pilots[key] = crew;
      save();
    }
    return memory.pilots[key];
  }
  function payload(p) {
    return {
      crew: p,
      effective_stats: { tech:p.tech, combat:p.combat, science:p.science, luck:p.luck },
      resources: { scrap:p.scrap, electronics:p.electronics, weird_junk:p.weird_junk, signal_data:p.signal_data },
      space_ace_stats: p.stats,
      station_metrics: [], achievements: [], run_seconds: 75,
      xp_to_next_level: 100 + (p.level - 1) * 75
    };
  }
  function addEvent(p, summary) {
    memory.events.unshift({ id: Date.now(), callsign: p.callsign,
      event_type: 'space_ace', summary: summary.slice(0, 210) });
    memory.events = memory.events.slice(0, 24);
  }
  function xpReward(score, maxCombo, survived) {
    return 12 + Math.min(85, Math.floor(score / 650)) + (survived ? 12 : 0) + (maxCombo >= 8 ? 6 : 0);
  }
  function bank(body) {
    const p = pilot(body.callsign);
    const id = String(body.run_token || '');
    const session = memory.runs[id];
    if (!session || session.callsign.toLowerCase() !== p.callsign.toLowerCase()) {
      return fail('Run not found. Start a new flight.', 404);
    }
    delete memory.runs[id];
    const score = Math.max(0, Math.min(5000000, Math.floor(Number(body.score) || 0)));
    const combo = Math.max(1, Math.min(100, Math.floor(Number(body.max_combo) || 1)));
    const survived = !!body.survived;
    const earned = {
      xp: xpReward(score, combo, survived),
      credits: Math.min(1000, Math.max(0, Math.floor(Number(body.cargo_credits) || 0))) + (survived ? 10 : 0),
      scrap: Math.min(80, Math.max(0, Math.floor(Number(body.scrap) || 0))),
      electronics: Math.min(50, Math.max(0, Math.floor(Number(body.electronics) || 0))),
      weird_junk: Math.min(30, Math.max(0, Math.floor(Number(body.weird_junk) || 0))),
      signal_data: Math.min(30, Math.max(0, Math.floor(Number(body.signal_data) || 0)))
    };
    p.credits += earned.credits;
    for (const kind of ['scrap','electronics','weird_junk','signal_data']) p[kind] += earned[kind];
    p.xp += earned.xp;
    const oldLevel = p.level;
    let pts = 0;
    while (p.xp >= 100 + (p.level - 1) * 75) {
      p.xp -= 100 + (p.level - 1) * 75;
      p.level++;
      if (p.level >= 10) { p.unspent_stat_points++; pts++; }
    }
    p.stats.runs++;
    p.stats.best_score = Math.max(p.stats.best_score, score);
    p.stats.best_combo = Math.max(p.stats.best_combo, combo);
    p.stats.total_pickups += Math.max(0, Math.floor(Number(body.collected_count) || 0));
    p.stats.total_hits += Math.max(0, Math.floor(Number(body.hits) || 0));
    if (survived) p.stats.survivals++;
    addEvent(p, `${p.callsign} completed a Space Ace flight: ${score.toLocaleString()} points, +${earned.xp} XP, +${earned.credits} credits (browser pilot).`);
    save();
    return reply({ ok:true, banked:earned, level_up:p.level>oldLevel, stat_points_earned:pts, ...payload(p) });
  }
  window.fetch = async (resource, options = {}) => {
    const url = String(resource instanceof Request ? resource.url : resource);
    if (!url.startsWith('/api/')) return realFetch(resource, options);
    try {
      const body = options.body ? JSON.parse(options.body) : {};
      if (url === '/api/crew' && options.method === 'POST') return reply(payload(pilot(body.callsign)));
      if (url === '/api/run/start' && options.method === 'POST') {
        const p = pilot(body.callsign);
        const id = `browser-ace-${Date.now()}-${Math.floor(Math.random()*1e9)}`;
        memory.runs[id] = { callsign:p.callsign, createdAt:Date.now() };
        const seed = 100000 + Math.floor(Math.random()*999899999);
        return reply({ ok:true, run_token:id, seed, run_seconds:75, ...payload(p), assists:{
          magnet_radius:Math.max(8,Math.min(42,8+(p.tech-5)*2)),
          extra_shields:p.combat>=12?1:0,
          sensor_range:Math.max(100,Math.min(260,110+(p.science-5)*12)),
          rare_bonus:Math.max(0,Math.min(.1,(p.luck-5)*.008)) } });
      }
      if (url === '/api/run/finish' && options.method === 'POST') return bank(body);
      if (url.startsWith('/api/events')) return reply({ events: memory.events.slice(0,12) });
      return fail('Unknown local API route', 404);
    } catch (e) { return fail(String(e && e.message || 'Unexpected game error')); }
  };
})();