/* Starloomer Signal Sweep v0.1.1 browser adapter.
   Original Signal Sweep frontend and encounter tables, with device-local crew,
   signal data, XP and location discoveries. Does not use the live shared CORE. */
(() => {
  'use strict';
  const KEY = 'starloomer-space-ace-local-v1';
  const realFetch = window.fetch.bind(window);
  const SIGNALS = [
    { key:'distress', name:'DRIFTED DISTRESS BEACON',difficulty:8,description:'Weak distress traffic is wandering across the band. The timestamp is old enough to be legally inconvenient.',unlock:['junkrun_mv_you_had_one_job','MV You Had One Job','A derelict freighter located from decaying distress telemetry.'] },
    { key:'pirate',name:'PIRATE NUMBERS STATION',difficulty:11,description:'A calm voice is reading numbers into deep space over a carrier that technically does not exist.',unlock:['junkrun_pirate_relay_116b','Pirate Relay 116-B','An unregistered relay found by triangulating a pirate broadcast.'] },
    { key:'transponder',name:'LOST CARGO TRANSPONDER',difficulty:7,description:'A cargo transponder is repeating a manifest checksum from somewhere beyond its filed route.',unlock:['junkrun_hulk_h23','Unregistered Cargo Hulk H-23','A drifting cargo hulk located from an overdue transponder ping.'] },
    { key:'moon',name:'PERFECTLY NORMAL LUNAR BEACON',difficulty:13,description:'A beacon identifies a moon as perfectly normal with such insistence that Science has become concerned.',unlock:['junkrun_normal_moon','Perfectly Normal Moon // Door Site','A lunar site centered on one extremely abnormal door.'] }
  ];
  const OPTIONS = [
    {id:'science', label:'ANALYZE MODULATION',skill:'science',mod:-1},
    {id:'tech',label:'STABILIZE / TRACE CARRIER',skill:'tech',mod:0},
    {id:'luck',label:'RIDE THE DRIFT MANUALLY',skill:'luck',mod:1}
  ];
  let memory={pilots:{},events:[],nextId:1,runs:{},world_unlocks:[]};
  try{const m=JSON.parse(window.localStorage.getItem(KEY)||'null');if(m&&m.pilots)memory={...memory,...m,runs:{}};}catch(_){/* Private context: in-memory session */}
  function save(){try{const {runs,...safe}=memory;localStorage.setItem(KEY,JSON.stringify(safe));}catch(_){}}
  function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})}
  function error(msg,status=400){return reply({detail:msg},status)}
  function norm(s){return String(s||'').trim().replace(/\s+/g,' ').slice(0,32)}
  function pilot(raw){const callsign=norm(raw);if(!callsign)throw Error('Please enter a callsign');const key=callsign.toLowerCase();
    if(!memory.pilots[key])memory.pilots[key]={id:memory.nextId++,callsign,level:1,xp:0,credits:0,tech:6,combat:6,science:6,luck:6,unspent_stat_points:0,scrap:0,electronics:0,weird_junk:0,signal_data:0,stats:{runs:0,best_score:0,best_combo:0,total_pickups:0,total_hits:0,survivals:0}};
    const p=memory.pilots[key];if(!p.signal_stats)p.signal_stats={sweeps:0,discoveries:0};if(!('signal_data' in p))p.signal_data=0;save();return p;}
  function chance(p,signal,opt){return Math.max(.2,Math.min(.9,.56+((Number(p[opt.skill]||5)-(signal.difficulty+opt.mod))*.035)));}
  function decorate(p,state){if(!state)return null;return {...state,options:OPTIONS.map(opt=>({...opt,effective_skill:p[opt.skill],success_chance:+chance(p,state,opt).toFixed(3)}))}}
  function payload(p){return {crew:p,effective_stats:{tech:p.tech,combat:p.combat,science:p.science,luck:p.luck},resources:{scrap:p.scrap,electronics:p.electronics,weird_junk:p.weird_junk,signal_data:p.signal_data},pending_sweep:decorate(p,p.pending_sweep),signal_stats:p.signal_stats,world_unlocks:memory.world_unlocks,station_metrics:[]}}
  function awardXP(p,xp){p.xp+=xp;while(p.xp>=100+(p.level-1)*75){p.xp-=100+(p.level-1)*75;p.level++;if(p.level>=10)p.unspent_stat_points++;}}
  function record(p,summary){memory.events.unshift({id:Date.now(),callsign:p.callsign,event_type:'signal_sweep',summary});memory.events=memory.events.slice(0,24);}
  function rand(min,max){return min+Math.floor(Math.random()*(max-min+1));}
  window.fetch=async(resource,opts={})=>{
    const url=String(resource instanceof Request?resource.url:resource);
    if(!url.startsWith('/api/'))return realFetch(resource,opts);
    try{
      const body=opts.body?JSON.parse(opts.body):{};
      if(url==='/api/crew'&&opts.method==='POST')return reply(payload(pilot(body.callsign)));
      if(url==='/api/sweep/start'&&opts.method==='POST'){
        const p=pilot(body.callsign);
        if(!p.pending_sweep){const t=SIGNALS[rand(0,SIGNALS.length-1)];p.pending_sweep={...t,options:OPTIONS};save();}
        return reply({pending_sweep:decorate(p,p.pending_sweep)});
      }
      if(url==='/api/sweep/resolve'&&opts.method==='POST'){
        const p=pilot(body.callsign),st=p.pending_sweep;
        if(!st)return error('No active sweep',409);
        const opt=OPTIONS.find(o=>o.id===body.option_id);if(!opt)return error('Invalid receiver control',400);
        const success=Math.random()<=chance(p,st,opt),xp=success?rand(30,55):rand(10,20),signal=success?rand(5,10):rand(1,3),credits=success?rand(5,18):0;
        awardXP(p,xp);p.signal_data+=signal;p.credits+=credits;p.signal_stats.sweeps++;
        let unlocked=null;
        const unlock=st.unlock;
        if(success&&unlock&&!memory.world_unlocks.some(x=>x.unlock_key===unlock[0])){
          unlocked={name:unlock[1]};p.signal_stats.discoveries++;
          memory.world_unlocks.push({unlock_key:unlock[0],name:unlock[1],description:unlock[2],unlock_type:'junkrun_location',source_game:'signal_sweep'});
        }
        const broadcast=`SIGNAL SWEEP // ${p.callsign.toUpperCase()}\n${st.name}\n${opt.label}\n+${xp} XP // +${signal} Signal Data`+(unlocked?`\nNEW JUNK RUN LOCATION: ${unlocked.name}`:'');
        record(p,`${p.callsign} resolved ${st.name}: +${xp} XP, +${signal} Signal Data (local browser)`);
        p.pending_sweep=null;save();
        return reply({...payload(p),broadcast_text:broadcast,unlocked});
      }
      return error('Unknown local API route',404);
    }catch(e){return error(String(e&&e.message||'Unexpected receiver error'));}
  };
})();