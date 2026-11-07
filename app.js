/* League Hub — live site. Reads everything from Supabase; no sample data. */
const CFG = window.LEAGUE_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sb = null;
let T = {}, TIDS = [], SLUG = {}, P = {}, SQUAD = {}, FX = [], FXI = {}, SPONSORS = [], MEDIA = [], SUSP = [], SEASON = null, LEAGUE = null;

/* ---------- data ---------- */
async function load() {
  const lg = await sb.from('leagues').select('*').eq('slug', CFG.league).single();
  if (lg.error) throw lg.error; LEAGUE = lg.data;
  const se = await sb.from('seasons').select('*').eq('league_id', LEAGUE.id).eq('is_current', true).order('starts_on', {ascending:false}).limit(1).single();
  if (se.error) throw se.error; SEASON = se.data;
  const [t, f] = await Promise.all([
    sb.from('teams').select('*').eq('season_id', SEASON.id).order('name'),
    sb.from('fixtures').select('*').eq('season_id', SEASON.id).order('kickoff')
  ]);
  if (t.error) throw t.error; if (f.error) throw f.error;
  T = {}; SLUG = {};
  t.data.forEach(x => { T[x.id] = {id:x.id, slug:x.slug, name:x.name, short:x.short_name, c1:x.color_primary||'#6b7280', c2:x.color_secondary||'#d1d5db', todo:!x.colors_confirmed, rep:x.rep_name, email:x.rep_email, formation:x.formation, badge:x.badge_url}; SLUG[x.slug] = x.id; });
  TIDS = Object.keys(T);
  const fids = f.data.map(x => x.id);
  const [p, g, sp, md, cd, su] = await Promise.all([
    sb.from('public_players').select('*').in('team_id', TIDS).eq('active', true).order('sort'),
    fids.length ? sb.from('goals').select('*').in('fixture_id', fids) : {data:[]},
    sb.from('sponsors').select('*').eq('season_id', SEASON.id).order('sort'),
    sb.from('media').select('*').order('created_at', {ascending:false}).limit(300),
    fids.length ? sb.from('cards').select('*').in('fixture_id', fids) : {data:[]},
    sb.from('suspensions').select('*').eq('season_id', SEASON.id).order('created_at')
  ]);
  P = {}; SQUAD = {}; TIDS.forEach(id => SQUAD[id] = []);
  (p.data||[]).forEach(x => { P[x.id] = {id:x.id, team:x.team_id, name:x.name, hidden:!x.name, pos:x.position||'', slot:x.lineup_slot, ph:!!x.is_placeholder}; SQUAD[x.team_id].push(x.id); });
  FX = f.data.map(x => ({id:x.id, code:x.code, week:x.week, stage:x.stage, date:new Date(x.kickoff), home:x.home_team_id, away:x.away_team_id, status:x.status, hs:x.home_goals, as:x.away_goals, goals:[], cards:[]}));
  FXI = Object.fromEntries(FX.map(x => [x.code, x]));
  const byId = Object.fromEntries(FX.map(x => [x.id, x]));
  (g.data||[]).forEach(x => byId[x.fixture_id] && byId[x.fixture_id].goals.push({t:x.team_id, s:x.scorer_id, a:x.assist_id}));
  (cd.data||[]).forEach(x => byId[x.fixture_id] && byId[x.fixture_id].cards.push({t:x.team_id, p:x.player_id, c:x.color}));
  SPONSORS = sp.data || []; MEDIA = md.data || []; SUSP = su.data || [];
}

/* ---------- league logic ---------- */
function table() {
  const rows = {}; TIDS.forEach(t => rows[t] = {t, gp:0, w:0, d:0, l:0, gf:0, ga:0, pts:0, form:[]});
  const W = SEASON.points_win, D = SEASON.points_draw;
  const fin = FX.filter(f => f.status === 'final' && f.stage === 'regular').sort((a,b) => a.date - b.date);
  fin.forEach(f => { const h = rows[f.home], a = rows[f.away]; if (!h || !a) return;
    h.gp++; a.gp++; h.gf += f.hs; h.ga += f.as; a.gf += f.as; a.ga += f.hs;
    if (f.hs > f.as) { h.w++; a.l++; h.pts += W; h.form.push('W'); a.form.push('L'); }
    else if (f.hs < f.as) { a.w++; h.l++; a.pts += W; h.form.push('L'); a.form.push('W'); }
    else { h.d++; a.d++; h.pts += D; a.pts += D; h.form.push('D'); a.form.push('D'); } });
  const arr = Object.values(rows); arr.forEach(r => r.gd = r.gf - r.ga);
  arr.sort((x,y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || h2h(y.t, x.t, fin) || T[x.t].name.localeCompare(T[y.t].name));
  return arr;
}
function h2h(a, b, fin) { let pa = 0, pb = 0; fin.forEach(f => { const ab = f.home === a && f.away === b, ba = f.home === b && f.away === a; if (!ab && !ba) return;
  const ga = ab ? f.hs : f.as, gb = ab ? f.as : f.hs; if (ga > gb) pa += 3; else if (gb > ga) pb += 3; else { pa++; pb++; } }); return pa - pb; }
function leaders() { const m = {}, get = id => m[id] || (m[id] = {id, g:0, a:0});
  FX.forEach(f => { if (f.status !== 'final') return; f.goals.forEach(g => { if (g.s && P[g.s]) get(g.s).g++; if (g.a && P[g.a]) get(g.a).a++; }); });
  return Object.values(m); }
const SHAPE = ['GK','LCB','RCB','LW','LCM','RCM','RW','ST'];
/* ---------- discipline: bans come from cards (automatic) and from the admin (misconduct, longer reds) ---------- */
const RULES = Object.assign({redGames: 1, yellowLimit: 3, yellowGames: 1}, CFG.discipline || {});
const REASON = {red: 'Red card', misconduct: 'Misconduct', ban: 'League ban', other: 'Other'};
const gamesAfter = (t, d) => FX.filter(f => (f.home === t || f.away === t) && f.status !== 'postponed' && f.date > d).sort((a,b) => a.date - b.date);
function bans() {
  const out = [], byId = Object.fromEntries(FX.map(f => [f.id, f])), over = {}, yc = {};
  SUSP.forEach(s => { if (s.reason === 'red' && s.fixture_id) over[s.player_id + '|' + s.fixture_id] = s; });
  [...FX].sort((a,b) => a.date - b.date).forEach(f => f.cards.forEach(c => { if (!c.p || !P[c.p]) return;
    if (c.c === 'red') { const o = over[c.p + '|' + f.id]; if (o) o.used = true;
      out.push({id: o ? o.id : null, p: c.p, t: c.t, f, games: o ? o.games : RULES.redGames, why: 'Red card', kind: 'red', note: o && o.note, auto: !o}); }
    else { yc[c.p] = (yc[c.p] || 0) + 1;
      if (RULES.yellowLimit && yc[c.p] % RULES.yellowLimit === 0) out.push({p: c.p, t: c.t, f, games: RULES.yellowGames, why: `${yc[c.p]} yellow cards`, kind: 'yellow', auto: true}); }
  }));
  SUSP.forEach(s => { if (s.used || !P[s.player_id]) return;
    out.push({id: s.id, p: s.player_id, t: s.team_id, f: byId[s.fixture_id] || null, from: new Date(s.created_at), games: s.games, why: REASON[s.reason] || 'Other', kind: s.reason, note: s.note, auto: false}); });
  SUSP.forEach(s => delete s.used);
  out.forEach(x => { const g = gamesAfter(x.t, x.f ? x.f.date : x.from), done = g.filter(played).length;
    x.served = x.games == null ? done : Math.min(done, x.games); x.left = x.games == null ? Infinity : Math.max(0, x.games - done);
    x.misses = g.filter(f => !played(f)).slice(0, x.left === Infinity ? 99 : x.left); x.back = x.games == null ? null : g[x.games] || null; x.date = x.f ? x.f.date : x.from; });
  YC = yc; return out.sort((a,b) => b.date - a.date);
}
let YC = {};
const outFor = f => bans().filter(x => x.misses.some(m => m.id === f.id));
function lineup(t) { const sq = SQUAD[t] || []; const xi = SHAPE.map(s => sq.find(id => P[id].slot === s)).filter(Boolean); return {xi, rest: sq.filter(id => !xi.includes(id)), has: xi.length > 0}; }

/* ---------- helpers ---------- */
const lum = h => { const n = parseInt(h.slice(1), 16); return (.299*(n>>16&255) + .587*(n>>8&255) + .114*(n&255)) / 255; };
const crest = (t, c = '') => { const x = T[t]; if (!x) return ''; if (x.badge) return `<span class="crest badge ${c}" aria-hidden="true"><img src="${esc(x.badge)}" alt="" loading="lazy"></span>`; return `<span class="crest ${c}" style="--c1:${x.c1};--c2:${x.c2};color:${lum(x.c1) > .6 ? '#111' : '#fff'}" aria-hidden="true">${esc(x.short)}</span>`; };
const fmtDay = d => d.toLocaleDateString('en-CA', {weekday:'short', month:'short', day:'numeric', timeZone:'America/Vancouver'});
const fmtLong = d => d.toLocaleDateString('en-CA', {weekday:'long', month:'long', day:'numeric', timeZone:'America/Vancouver'});
const fmtTime = d => d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit', timeZone:'America/Vancouver'});
const pname = id => !id || !P[id] ? '<span class="hid">Unknown</span>' : P[id].hidden ? '<span class="hid">Name hidden</span>' : esc(P[id].name);
const ord = n => n + (['th','st','nd','rd'][(n % 100 - 20) % 10] || ['th','st','nd','rd'][n % 100] || 'th');
const curWeek = () => { const n = FX.filter(f => !played(f) && f.stage === 'regular').sort((a,b) => a.date - b.date)[0]; return n ? n.week : 20; };
const lastWeek = () => Math.max(0, ...FX.filter(f => f.status === 'final').map(f => f.week || 0));
const vKey = d => d.toLocaleDateString('en-CA', {timeZone:'America/Vancouver'});
function dayLabel(d) {
  const now = new Date(), k = vKey(d);
  if (k === vKey(now)) return 'Tonight';
  if (k === vKey(new Date(now.getTime() + 864e5))) return 'Tomorrow night';
  if (d - now < 6 * 864e5) return d.toLocaleDateString('en-CA', {weekday:'long', timeZone:'America/Vancouver'});
  return fmtDay(d);
}
const played = f => f.date < new Date();
let MYTEAM = null; try { MYTEAM = localStorage.getItem('myteam'); } catch (e) {}
const tname = t => T[t] ? esc(T[t].name) : 'TBD';
function pill(f) {
  if (f.status === 'final') return '<span class="tag final">Final</span>';
  if (f.status === 'postponed') return '<span class="tag loss">Postponed</span>';
  if (played(f)) return '<span class="tag pend">Result pending</span>';
  return '<span class="tag">Upcoming</span>';
}
function fxRow(f, showDay = true) {
  const mid = f.status === 'final' ? `<b class="sc">${f.hs}<i>–</i>${f.as}</b>` : `<span class="ko">${fmtTime(f.date)}</span>`;
  return `<a class="fx" href="#match-${f.code}"><span class="fx-team h"><span class="nm">${tname(f.home)}</span>${crest(f.home)}</span>${mid}<span class="fx-team">${crest(f.away)}<span class="nm">${tname(f.away)}</span></span>
  <span class="fx-meta">${showDay ? `<span>${fmtDay(f.date)}</span>` : ''}${f.week ? `<span>Wk ${f.week}</span>` : ''}${pill(f)}</span></a>`;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2800); }
const notFound = () => `<div class="sec"><h2>Page not found</h2><a href="#home">Back to home</a></div>`;
const empty = msg => `<div class="card pad muted">${msg}</div>`;

/* ---------- pitch drawing ---------- */
const FD = 'font-family="Saira Condensed, Arial Narrow, sans-serif"', FB = 'font-family="Figtree, system-ui, sans-serif"';
const ROWX = {1:[150], 2:[95,205], 3:[55,150,245], 4:[46,116,184,254]};
const LBL = {D:{1:['CB'],2:['LCB','RCB'],3:['LCB','CB','RCB'],4:['LB','LCB','RCB','RB']}, M:{1:['CM'],2:['LCM','RCM'],3:['LM','CM','RM'],4:['LW','LCM','RCM','RW']}, F:{1:['ST'],2:['LS','RS'],3:['LW','ST','RW']}};
function shape(t) { const f = String(T[t].formation || '2-4-1').split('-').map(Number); return f.length === 3 && f.every(n => n >= 1 && n <= 4) && f[0] + f[1] + f[2] === 7 ? f : [2,4,1]; }
function spots(t, full) {
  const [d, m, fw] = shape(t), Y = full ? {D:300, M:210, F:100} : {D:488, M:415, F:345}, out = [{l:'GK', x:150, y: full ? 378 : 552}];
  [['D',d],['M',m],['F',fw]].forEach(([k,n]) => ROWX[n].forEach((x,i) => out.push({l:LBL[k][n][i], x, y:Y[k] - (n === 4 && (i === 0 || i === 3) ? 14 : 0)})));
  return out;
}
function pitchLines(h) { return `<rect width="300" height="${h}" rx="10" fill="#2e7a3a"/><g fill="none" stroke="rgba(255,255,255,.65)" stroke-width="1.5"><rect x="12" y="12" width="276" height="${h-24}" rx="2"/><line x1="12" y1="${h/2}" x2="288" y2="${h/2}"/><circle cx="150" cy="${h/2}" r="34"/><rect x="80" y="12" width="140" height="52"/><rect x="80" y="${h-64}" width="140" height="52"/></g>`; }
function badge(x, y, e, n) { return `<circle cx="${x}" cy="${y}" r="9" fill="#fff"/><text x="${x}" y="${y+3.5}" text-anchor="middle" font-size="10">${e}</text>${n > 1 ? `<text x="${x+11}" y="${y-4}" font-size="11" font-weight="800" fill="#fff" ${FB}>${n}</text>` : ''}`; }
function dot(t, id, pos, x, y, m) { if (!id) return ''; const c = T[t], g = (m && m[id]) || {};
  let s = `<circle cx="${x}" cy="${y}" r="15" fill="${c.c1}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y+4}" text-anchor="middle" font-size="10" font-weight="700" fill="${lum(c.c1) > .6 ? '#111' : '#fff'}" ${FD}>${pos}</text><text x="${x}" y="${y+31}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" ${FB}>${P[id].hidden ? 'Hidden' : esc(P[id].name)}</text>`;
  if (g.g) s += badge(x+14, y-13, '⚽', g.g); if (g.a) s += badge(x-14, y-13, '👟', g.a); return s; }
function restList(t, ids, m) { return `<ul class="rest card">${ids.map(id => { const g = m[id] || {}; return `<li><span class="dotc" style="background:${T[t].c1}"></span><span class="nm">${pname(id)}</span><small>${P[id].pos}</small><span>${g.g ? `⚽${g.g > 1 ? g.g : ''}` : ''} ${g.a ? `👟${g.a > 1 ? g.a : ''}` : ''}</span></li>`; }).join('') || '<li class="muted">None</li>'}</ul>`; }
const SHIRT = 'M19 4 L8 9 L2 21 L11 26 L14 21 L14 53 L46 53 L46 21 L49 26 L58 21 L52 9 L41 4 Q30 13 19 4 Z';
const jersey = t => `<svg class="jersey" viewBox="0 0 60 56" aria-hidden="true"><path d="${SHIRT}" fill="${t.c1}" stroke="var(--line)" stroke-width="5" stroke-linejoin="round"/><path d="${SHIRT}" fill="${t.c1}" stroke="${t.c2}" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
function matchLineups(f) {
  const H = lineup(f.home), A = lineup(f.away); if (!H.has && !A.has) return '';
  const fin = f.status === 'final', m = {}, get = id => m[id] || (m[id] = {g:0, a:0});
  if (fin) f.goals.forEach(g => { if (g.s) get(g.s).g++; if (g.a) get(g.a).a++; });
  const sh = spots(f.home, false), sa = spots(f.away, false);
  const top = H.xi.map((p,i) => dot(f.home, p, sh[i].l, 300 - sh[i].x, 600 - sh[i].y, m)).join('');
  const bot = A.xi.map((p,i) => dot(f.away, p, sa[i].l, sa[i].x, sa[i].y, m)).join('');
  return `<section class="sec"><h2>${fin ? 'Lineups' : 'Probable lineups'}</h2><div class="lu card">
  <a class="lu-h" href="#team-${T[f.home].slug}">${crest(f.home)}<b>${tname(f.home)}</b><span class="tag">${esc(T[f.home].formation)}</span></a>
  <svg viewBox="0 0 300 600" role="img" aria-label="Lineups">${pitchLines(600)}${top}${bot}</svg>
  <a class="lu-h" href="#team-${T[f.away].slug}">${crest(f.away)}<b>${tname(f.away)}</b><span class="tag">${esc(T[f.away].formation)}</span></a></div>
  <h3>Subs</h3><div class="goals">${restList(f.home, H.rest, m)}${restList(f.away, A.rest, m)}</div>
  <p class="small muted">⚽ scored, 👟 assisted. Lineups show each team's usual formation.</p></section>`;
}
// Last 5: oldest on the left, newest on the right; unplayed slots stay as empty circles.
function formDots(form) {
  const last = form.slice(-5), pad = 5 - last.length, sym = {W:'✓', D:'–', L:'✕'}, word = {W:'Win', D:'Draw', L:'Loss'};
  return `<span class="l5" aria-label="Last 5: ${last.map(x => word[x]).join(', ') || 'no games yet'}">${'<i class="fm E"></i>'.repeat(pad)}${last.map(x => `<i class="fm ${x}">${sym[x]}</i>`).join('')}</span>`;
}
function tableHTML(rows, mini) {
  return `<div class="tbl"><table><thead><tr><th class="pos">#</th><th class="tm">Team</th><th>GP</th>${mini ? '' : '<th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th>'}<th>GD</th><th>Pts</th>${mini ? '' : '<th>Last 5</th>'}</tr></thead><tbody>
  ${rows.map((r,i) => `<tr><td class="pos">${i+1}</td><td class="tm"><a href="#team-${T[r.t].slug}">${crest(r.t)}<span class="nm">${tname(r.t)}</span></a></td><td>${r.gp}</td>
  ${mini ? '' : `<td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td>`}<td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td>
  ${mini ? '' : `<td>${formDots(r.form)}</td>`}</tr>`).join('')}
  </tbody></table></div>`;
}

/* ---------- public views ---------- */
const V = {};
V.home = () => {
  const next = FX.filter(f => f.status === 'scheduled' && !played(f)).sort((a,b) => a.date - b.date);
  const day = next[0], nd = day ? next.filter(f => vKey(f.date) === vKey(day.date)) : [];
  const past = FX.filter(f => played(f) && f.status !== 'postponed').sort((a,b) => b.date - a.date);
  // Latest results = the most recent week that has kicked off: Wed games appear at kickoff (pending until scored), Sat games join them.
  const lw = past.length ? past[0].week : null;
  const latest = past.filter(f => f.week === lw).sort((a,b) => a.date - b.date);
  const L = leaders().filter(x => !P[x.id].hidden);
  const g = [...L].sort((a,b) => b.g - a.g)[0], a = [...L].filter(x => x.a).sort((x,y) => y.a - x.a)[0];
  const ld = (k, n, x) => `<div class="card ld"><span class="k">${k}</span><span class="ld-n">${n}</span><span class="nm">${x ? pname(x.id) : '—'}</span><span class="small muted">${x ? tname(P[x.id].team) : 'After the first results'}</span></div>`;
  const mt = MYTEAM && T[MYTEAM] ? (() => { const fx = FX.filter(f => f.home === MYTEAM || f.away === MYTEAM);
    const nx = fx.filter(f => !played(f) && f.status !== 'postponed').sort((a,b) => a.date - b.date)[0], ls = fx.filter(f => f.status === 'final').sort((a,b) => b.date - a.date)[0];
    return `<section class="sec"><div class="sec-head"><h2>${tname(MYTEAM)}</h2><a href="#team-${T[MYTEAM].slug}">Team page →</a></div><div class="fxlist">${nx ? fxRow(nx) : ''}${ls ? fxRow(ls) : ''}</div></section>`; })() : '';
  const label = day ? dayLabel(day.date) : '';
  return `
  <section class="hero">${day ? `<p class="k">Matchday ${day.week || ''} · ${fmtDay(day.date)} · ${esc(LEAGUE.venue || '')}</p><h1>${label}${label.endsWith('night') || label === 'Tonight' ? "'s games" : label.includes(',') ? '' : "'s games"}</h1>` : `<h1>${esc(LEAGUE.name)}</h1>`}</section>
  ${nd.length ? `<div class="fxlist">${nd.map(f => fxRow(f, false)).join('')}</div>` : ''}
  ${mt}
  <section class="sec"><div class="sec-head"><h2>${lw ? `Week ${lw} results` : 'Latest results'}</h2><a href="#fixtures">All fixtures →</a></div>
    ${latest.length ? `<div class="fxlist">${latest.map(f => fxRow(f)).join('')}</div>` : empty('No games played yet.')}</section>
  <section class="sec"><div class="sec-head"><h2>Table</h2><a href="#table">Full table →</a></div>${tableHTML(table().slice(0, 4), true)}</section>
  ${MEDIA.some(x => x.kind === 'photo') ? `<section class="sec"><div class="sec-head"><h2>Latest photos</h2><a href="#gallery">Gallery →</a></div><div class="gal">${MEDIA.filter(x => x.kind === 'photo').slice(0, 4).map(mediaTile).join('')}</div></section>` : ''}
  <section class="sec"><div class="sec-head"><h2>Leaders</h2><a href="#stats">All stats →</a></div>
    <div class="lead2">${ld('Top scorer', g ? g.g : 0, g)}${ld('Most assists', a ? a.a : 0, a)}</div></section>
  <section class="sec"><h2>How a result goes live</h2>
    <div class="steps">
      <div class="card st"><span class="st-n">1</span><p><b>Captain reports.</b> Score and scorers from a private link, in about 30 seconds.</p></div>
      <div class="card st"><span class="st-n">2</span><p><b>Admin approves.</b> One tap checks it before it goes public.</p></div>
      <div class="card st"><span class="st-n">3</span><p><b>Everything updates.</b> Table, stats and team pages refresh on their own.</p></div>
    </div></section>
  <section class="sec"><span class="k">League partners</span><div class="partners">${kbCard()}${SPONSORS.map(sponsorCard).join('')}<a class="slot" href="#partners" style="text-decoration:none">Your business here · partner slots open</a></div></section>`;
};
const sponsorCard = s => `<a class="card" href="#partner-${s.id}">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="${esc(s.name)}" style="max-height:48px;object-fit:contain">` : `<b>${esc(s.name)}</b>`}<span>${esc(s.tier)} partner</span></a>`;

let fxWeek = null, fxTeam = 'all';
V.fixtures = () => {
  if (fxWeek === null) fxWeek = curWeek();
  const opts = `<option value="all">All teams</option>${TIDS.map(t => `<option value="${t}" ${fxTeam === t ? 'selected' : ''}>${tname(t)}</option>`).join('')}`;
  const weeks = [...new Set(FX.filter(f => f.week).map(f => f.week))].sort((a,b) => a - b);
  let body = '';
  if (fxTeam !== 'all') {
    const list = FX.filter(f => f.home === fxTeam || f.away === fxTeam).sort((a,b) => a.date - b.date);
    body = `<div class="fxlist">${list.map((f,i) => (i && f.date - list[i-1].date > 14 * 864e5 ? '<div class="brk">Holiday break</div>' : '') + fxRow(f)).join('')}</div>`;
  } else if (fxWeek === 'PO') {
    const po = FX.filter(f => f.stage !== 'regular');
    body = po.length ? `<div class="fxlist">${po.map(f => fxRow(f)).join('')}</div>` : `<div class="card pad" style="display:flex;flex-direction:column;gap:10px"><h3>Playoffs</h3>
      <p><b>P1 · Mar 17/20.</b> 1st v 8th, 2nd v 7th, 3rd v 6th, 4th v 5th.</p><p><b>P2 · Mar 24.</b> Winner 1v8 v Winner 4v5, Winner 2v7 v Winner 3v6.</p>
      <p><b>Final · Mar 27.</b> Winners of P2, plus a match between the P2 losers.</p><a href="#table">See the current playoff picture →</a></div>`;
  } else {
    const g = {}; FX.filter(f => f.week === fxWeek).sort((a,b) => a.date - b.date).forEach(f => { const k = fmtLong(f.date); (g[k] = g[k] || []).push(f); });
    body = Object.entries(g).map(([k, fs]) => `<div class="fxlist"><p class="day">${k}</p>${fs.map(f => fxRow(f, false)).join('')}</div>`).join('') || empty('No fixtures this week.');
  }
  return `<section class="sec"><h1>Fixtures</h1>
  <select class="sel" id="fx-team" data-act="fxteam" aria-label="Filter by team">${opts}</select>
  ${fxTeam === 'all' ? `<div class="chips" id="wk-chips">${weeks.map(w => `<button class="chip ${fxWeek === w ? 'on' : ''}" data-act="week" data-v="${w}">Wk ${w}</button>`).join('')}<button class="chip ${fxWeek === 'PO' ? 'on' : ''}" data-act="week" data-v="PO">Playoffs</button></div>` : ''}
  ${body}</section>`;
};
V.table = () => {
  const tb = table(), n = tb.length;
  const pairs = n >= 8 ? [[0,7],[1,6],[2,5],[3,4]] : [];
  return `<section class="sec"><h1>Table</h1>${tableHTML(tb, false)}
  <p class="small muted">${SEASON.points_win} points for a win, ${SEASON.points_draw} for a draw. Ties split by goal difference, then goals for, then head-to-head.</p></section>
  ${pairs.length ? `<section class="sec"><h2>Playoff picture</h2>
  <p class="small muted">All 8 teams make the playoffs, so the table decides the matchups. If the season ended today:</p>
  <div class="po-grid">${pairs.map(([x,y]) => `<div class="card po"><span class="k">P1 · ${x+1} v ${y+1}</span>
    <div>${crest(tb[x].t)}<span class="nm">${tname(tb[x].t)}</span><b>${x+1}</b></div><div>${crest(tb[y].t)}<span class="nm">${tname(tb[y].t)}</span><b>${y+1}</b></div></div>`).join('')}</div></section>` : ''}`;
};
let statTab = 'g';
V.stats = () => {
  const L = leaders(), top = [...L].filter(x => !P[x.id].hidden && x.g).sort((a,b) => b.g - a.g || b.a - a.a)[0];
  const list = [...L].filter(x => statTab === 'g' ? x.g > 0 : x.a > 0).sort((a,b) => statTab === 'g' ? b.g - a.g || b.a - a.a : b.a - a.a || b.g - a.g).slice(0, 20);
  return `<section class="sec"><h1>Stats</h1>
  ${top ? `<div class="gb"><div><p class="k">Golden Boot · after week ${lastWeek()}</p><h3>${esc(P[top.id].name)}</h3><p>${tname(P[top.id].team)}</p><p class="gb-sp">${SPONSORS.find(s => s.tier === 'headline') ? `Presented by <b>${esc(SPONSORS.find(s => s.tier === 'headline').name)}</b>` : 'KB Media weekly graphic'}</p></div><div class="gb-n">${top.g}<small>goals</small></div></div>` : ''}
  <div class="chips"><button class="chip ${statTab === 'g' ? 'on' : ''}" data-act="stat" data-v="g">Goals</button><button class="chip ${statTab === 'a' ? 'on' : ''}" data-act="stat" data-v="a">Assists</button><button class="chip ${statTab === 'c' ? 'on' : ''}" data-act="stat" data-v="c">Cards</button></div>
  ${statTab === 'c' ? discHTML() : list.length ? `<ol class="rank card">${list.map((x,i) => `<li><span class="rn">${i+1}</span><span class="who">${crest(P[x.id].team)}<span><b class="nm">${pname(x.id)}</b><small>${tname(P[x.id].team)} · ${statTab === 'g' ? x.a + ' assists' : x.g + ' goals'}</small></span></span><span class="v">${statTab === 'g' ? x.g : x.a}</span></li>`).join('')}</ol>` : empty('Stats appear once captains report scorers.')}
  <p class="small muted">"Name hidden" means the player opted out of public stats. Their goals still count for the team.</p></section>`;
};
function discHTML() {
  const m = {}; FX.forEach(f => f.cards.forEach(c => { if (!c.p || !P[c.p]) return; const r = m[c.p] || (m[c.p] = {id:c.p, y:0, r:0}); c.c === 'red' ? r.r++ : r.y++; }));
  const list = Object.values(m).sort((a,b) => b.r - a.r || b.y - a.y);
  if (!list.length) return empty('No cards yet. Cards come from the ref\'s match sheet.');
  return `<ol class="rank card">${list.map((x,i) => `<li><span class="rn">${i+1}</span><span class="who">${crest(P[x.id].team)}<span><b class="nm">${pname(x.id)}</b><small>${tname(P[x.id].team)}</small></span></span><span class="v" style="font-size:16px">${x.y ? `<i class="ci y"></i>${x.y}` : ''}${x.r ? `<i class="ci r"></i>${x.r}` : ''}</span></li>`).join('')}</ol>
  <p class="small muted">Cards lead to bans automatically. <a href="#suspensions">See who's suspended →</a></p>`;
}
const vs = (x, f) => `${fmtDay(f.date)} vs ${tname(f.home === x.t ? f.away : f.home)}`;
function banCard(x) {
  const total = x.games == null ? '' : `<span class="bar"><i style="width:${x.games ? Math.round(100 * x.served / x.games) : 100}%"></i></span><small class="muted">${x.served} of ${x.games} game${x.games === 1 ? '' : 's'} served</small>`;
  const miss = x.misses.length ? `<p class="small"><b>Misses:</b> ${x.misses.slice(0, 2).map(f => vs(x, f)).join(', ')}${x.misses.length > 2 ? ` +${x.misses.length - 2} more` : ''}</p>` : '';
  const back = x.games == null ? '<p class="small"><b>Back:</b> until further notice</p>' : x.back ? `<p class="small"><b>Back:</b> ${vs(x, x.back)}</p>` : '<p class="small"><b>Back:</b> next season</p>';
  return `<div class="card pad ban"><div class="row" style="gap:10px">${crest(x.t)}<span style="display:flex;flex-direction:column;min-width:0;flex:1"><b class="nm">${pname(x.p)}</b><small class="muted">${tname(x.t)}</small></span><span class="tag loss">${x.kind === 'yellow' ? '<i class="ci y"></i>' : x.kind === 'red' ? '<i class="ci r"></i>' : ''}${esc(x.why)}</span></div>
  ${total}${miss}${back}${x.note ? `<p class="small muted">${esc(x.note)}</p>` : ''}${x.f ? `<p class="small muted">From ${vs(x, x.f)}</p>` : ''}</div>`;
}
V.suspensions = () => {
  const all = bans(), now = all.filter(x => x.left > 0), past = all.filter(x => x.left === 0).slice(0, 12);
  const warn = RULES.yellowLimit > 1 ? Object.entries(YC).filter(([p, n]) => n % RULES.yellowLimit === RULES.yellowLimit - 1 && !now.some(x => x.p === p)) : [];
  return `<section class="sec"><h1>Suspensions</h1><p class="muted">Who's out, for how long, and when they're back. Updated from each game's match sheet.</p></section>
  <section class="sec"><h2>Suspended now (${now.length})</h2>${now.length ? `<div class="bans">${now.map(banCard).join('')}</div>` : empty('Nobody is suspended right now.')}</section>
  ${warn.length ? `<section class="sec"><h2>One yellow from a ban</h2><ol class="rank card">${warn.map(([p, n]) => `<li><span class="who">${crest(P[p].team)}<span><b class="nm">${pname(p)}</b><small>${tname(P[p].team)}</small></span></span><span class="v" style="font-size:16px"><i class="ci y"></i>${n}</span></li>`).join('')}</ol></section>` : ''}
  <section class="sec"><h2>How bans work</h2><div class="card pad" style="display:flex;flex-direction:column;gap:8px">
    <p><i class="ci r"></i><b>Red card:</b> at least ${RULES.redGames} game${RULES.redGames === 1 ? '' : 's'}. Serious incidents can mean more.</p>
    ${RULES.yellowLimit ? `<p><i class="ci y"></i><b>Every ${ord(RULES.yellowLimit)} yellow:</b> ${RULES.yellowGames} game${RULES.yellowGames === 1 ? '' : 's'}.</p>` : ''}
    <p><b>Referee abuse (zero tolerance):</b> 2–5 games for a first offence, 6–10 for a second, then removal from the centre.</p>
    <p class="small muted">A ban counts down one game each time the player's team plays. Postponed games don't count. The league has the final say on every ban.</p></div></section>
  ${past.length ? `<section class="sec"><h2>Served this season</h2><ol class="rank card">${past.map(x => `<li><span class="who">${crest(x.t)}<span><b class="nm">${pname(x.p)}</b><small>${esc(x.why)} · ${x.games} game${x.games === 1 ? '' : 's'}</small></span></span><span class="tag final">Served</span></li>`).join('')}</ol></section>` : ''}`;
};
const outList = (list, label) => list.length ? `<section class="sec"><h2>${label}</h2><ol class="rank card">${list.map(x => `<li><span class="who">${crest(x.t)}<span><b class="nm">${pname(x.p)}</b><small>${tname(x.t)} · ${esc(x.why)}${x.games == null ? ' · until further notice' : ` · ${x.left} game${x.left === 1 ? '' : 's'} left`}</small></span></span><a class="tag loss" href="#suspensions" style="text-decoration:none">Suspended</a></li>`).join('')}</ol></section>` : '';
V.teams = () => `<section class="sec"><h1>Teams</h1><div class="more">${TIDS.map(t => `<a class="card" href="#team-${T[t].slug}" style="flex-direction:row;align-items:center;gap:12px">${crest(t, 'md')}<b class="nm" style="font:700 18px var(--display);text-transform:uppercase">${tname(t)}</b></a>`).join('')}</div></section>`;
V.team = slug => {
  const id = SLUG[slug], t = T[id]; if (!t) return notFound();
  const tb = table(), pos = tb.findIndex(r => r.t === id) + 1, r = tb[pos-1], m = Object.fromEntries(leaders().map(x => [x.id, x]));
  const fx = FX.filter(f => f.home === id || f.away === id);
  const res = fx.filter(f => f.status === 'final').sort((a,b) => b.date - a.date), up = fx.filter(f => f.status !== 'final').sort((a,b) => a.date - b.date).slice(0, 3);
  const {xi, rest, has} = lineup(id);
  return `<section class="thead">${crest(id, 'lg')}<div><h1>${esc(t.name)}</h1><p class="muted">${r.gp ? `${ord(pos)} · ` : ''}${r.w}W ${r.d}D ${r.l}L · ${r.pts} pts</p>
  ${r.gp ? `<div style="margin-top:8px">${formDots(r.form)}</div>` : ''}
  <button class="btn ${MYTEAM === id ? '' : 'ghost'} sm" data-act="follow" data-v="${id}" style="margin-top:8px">${MYTEAM === id ? '★ My team' : '☆ Set as my team'}</button></div></section>
  <section class="tinfo">
    <div class="card pad kit">${jersey(t)}<div><span class="k">Kit</span><p>${t.todo ? 'Colours to confirm' : 'Home colours'}</p></div></div>
    <div class="card pad rep"><span class="k">Team rep</span>${t.rep ? `<b>${esc(t.rep)}</b>` : ''}${t.email ? `<span class="row" style="gap:8px"><span class="email">${esc(t.email)}</span><button class="btn ghost sm" data-act="copy" data-v="${esc(t.email)}">Copy</button></span>` : ''}</div>
  </section>
  <section class="sec"><div class="sec-head"><h2>Squad</h2><span class="tag">${esc(t.formation)}</span></div>
    ${has ? `<figure class="pitch"><svg viewBox="0 0 300 430" role="img" aria-label="${esc(t.name)} squad">${pitchLines(430)}${(() => { const sp = spots(id, true); return xi.map((p,i) => dot(id, p, sp[i].l, sp[i].x, sp[i].y, m)).join(''); })()}</svg></figure>
    <h3>Rest of squad</h3>${restList(id, rest, m)}` : (SQUAD[id].length ? restList(id, SQUAD[id], m) : empty('Squad coming soon. The team rep sends the names once and we keep them updated.'))}
    <p class="small muted">${SQUAD[id].some(p => P[p].ph) ? '<b>Sample names</b> until the team sends its roster. ' : ''}⚽ goals, 👟 assists this season. Any player can ask to hide their name.</p></section>
  ${outList(bans().filter(x => x.t === id && x.left > 0), 'Unavailable')}
  <section class="sec"><div class="sec-head"><h2>Next matches</h2><button class="btn ghost sm" data-act="ics" data-v="${id}">📅 Add to calendar</button></div>${up.length ? `<div class="fxlist">${up.map(f => fxRow(f)).join('')}</div>` : empty('Season finished.')}</section>
  ${teamMedia(id).length ? `<section class="sec"><div class="sec-head"><h2>Photos</h2><a href="#gallery">Gallery →</a></div><div class="gal">${teamMedia(id).slice(0, 4).map(mediaTile).join('')}</div></section>` : ''}
  <section class="sec"><h2>Results</h2>${res.length ? `<div class="fxlist">${res.map(f => fxRow(f)).join('')}</div>` : empty('No results yet.')}</section>`;
};
V.match = code => {
  const f = FXI[code]; if (!f || !T[f.home] || !T[f.away]) return notFound();
  const fin = f.status === 'final';
  const gl = t => f.goals.filter(x => x.t === t).map(x => `<li><b>${x.s ? pname(x.s) : '<span class="hid">Scorer not reported</span>'}</b>${x.a ? `<span class="as">${pname(x.a)} (Assist)</span>` : ''}</li>`).join('');
  const missing = t => fin && (t === f.home ? f.hs : f.as) > f.goals.filter(x => x.t === t).length;
  const cl = t => f.cards.filter(x => x.t === t).map(x => `<li><i class="ci ${x.c === 'red' ? 'r' : 'y'}" aria-label="${x.c} card"></i>${pname(x.p)}</li>`).join('');
  const cardsBlock = f.cards.length ? `<div class="scorers cards"><ul class="h">${cl(f.home)}</ul><span class="ball"><i class="ci big ${f.cards.some(x => x.c === 'yellow') ? 'y' : 'r'}"></i></span><ul>${cl(f.away)}</ul></div>` : '';
  const scorers = fin && (f.hs || f.as) ? `<div class="scorers"><ul class="h">${gl(f.home)}${missing(f.home) ? '<li class="hid">Scorers to come</li>' : ''}</ul><span class="ball" aria-label="Goals">⚽</span><ul>${gl(f.away)}${missing(f.away) ? '<li class="hid">Scorers to come</li>' : ''}</ul></div>` : '';
  const ph = MEDIA.filter(x => x.fixture_id === f.id);
  return `<section class="sec"><p class="k">${f.week ? `Week ${f.week} · ` : ''}${fmtDay(f.date)} · ${fmtTime(f.date)} · ${esc(LEAGUE.venue || '')}</p>
  <div class="card board"><a class="side" href="#team-${T[f.home].slug}" style="color:inherit;text-decoration:none">${crest(f.home, 'lg')}<span class="nm">${tname(f.home)}</span></a>
    ${fin ? `<div class="big-sc">${f.hs}<span>–</span>${f.as}</div>` : `<div class="big-ko">${fmtTime(f.date)}</div>`}
    <a class="side" href="#team-${T[f.away].slug}" style="color:inherit;text-decoration:none">${crest(f.away, 'lg')}<span class="nm">${tname(f.away)}</span></a>${scorers}${cardsBlock}</div>
  <div class="row" style="justify-content:center">${pill(f)}${fin ? `<button class="btn sm" data-act="card" data-v="${f.code}">Share score card</button>` : ''}<button class="btn ghost sm" data-act="share" data-v="${f.code}">Share link</button></div></section>
  ${!fin ? outList(outFor(f), 'Suspended for this game') : ''}
  ${matchLineups(f)}
  ${(() => { const hh = FX.filter(x => x.id !== f.id && ((x.home === f.home && x.away === f.away) || (x.home === f.away && x.away === f.home))).sort((a,b) => a.date - b.date);
    return hh.length ? `<section class="sec"><h2>Head-to-head this season</h2><div class="fxlist">${hh.map(x => fxRow(x)).join('')}</div></section>` : ''; })()}
  ${ph.length ? `<section class="sec"><h2>Photos & highlights</h2><div class="gal">${ph.map(mediaTile).join('')}</div></section>` : ''}`;
};
const IG = 'https://instagram.com/kbmedia.ca';
const LOGO = 'kbmedia-logo.png', LOGO_IMG = new Image(); LOGO_IMG.src = LOGO;
const kbCard = () => `<a class="card kb" href="#partner-kbmedia"><img src="kbmedia-logo-128.png" alt="KB Media logo" width="48" height="48"><span><span class="k">Media partner</span><b>KB Media</b><small>Match photos, highlights and this website</small></span></a>`;
const mLabel = x => { const f = FX.find(y => y.id === x.fixture_id); if (f) return `${T[f.home].short} ${f.status === 'final' ? f.hs + '–' + f.as : 'v'} ${T[f.away].short} · ${fmtDay(f.date)}`; return x.team_id && T[x.team_id] ? T[x.team_id].name : ''; };
const mediaTile = x => x.kind === 'photo'
  ? `<button class="ph" data-act="view" data-v="${x.id}" style="background:#1a2822 url('${esc(x.url)}') center/cover" aria-label="Open photo"><span>${esc(x.caption || '')}<small>${mLabel(x)}</small></span></button>`
  : `<a class="ph" href="${esc(x.url)}" target="_blank" rel="noopener" style="background:linear-gradient(135deg,#17734a,#13201a)"><span>▶ Highlights<small>${esc(x.caption || mLabel(x) || 'Watch on Instagram')}</small></span></a>`;
const teamMedia = id => MEDIA.filter(x => x.team_id === id || FX.some(f => f.id === x.fixture_id && (f.home === id || f.away === id)));
function viewPhoto(id) {
  const x = MEDIA.find(m => m.id === id); if (!x) return;
  const m = document.createElement('div'); m.className = 'modal viewer';
  m.innerHTML = `<div class="modal-in"><img src="${esc(x.url)}" alt="${esc(x.caption || 'Match photo')}" draggable="false">
    <p class="small">${esc(x.caption || '')} <span class="muted">${mLabel(x)}</span></p>
    <div class="row"><a class="btn" href="${IG}" target="_blank" rel="noopener">More on Instagram</a><button class="btn ghost" data-close>Close</button></div></div>`;
  m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) m.remove(); });
  document.body.appendChild(m);
}
V.gallery = () => {
  const hl = MEDIA.filter(x => x.kind === 'highlight'), ph = MEDIA.filter(x => x.kind === 'photo');
  return `<section class="sec"><p class="k row" style="gap:8px"><img src="kbmedia-logo-128.png" alt="" width="26" height="26">KB Media · Sports photography</p><h1>Gallery</h1>
  <p class="muted">Indoor league moments from KB Media. Tap a photo to see it bigger. For full-quality photos, team shoots or highlight reels, get in touch.</p>
  <div class="row">${CFG.booking ? `<a class="btn" href="${esc(CFG.booking)}" target="_blank" rel="noopener">Book a shoot</a><a class="btn ghost" href="${IG}" target="_blank" rel="noopener">Instagram</a>` : `<a class="btn" href="${IG}" target="_blank" rel="noopener">Follow on Instagram</a>`}${CFG.email ? `<span class="row" style="gap:8px"><span class="email">${esc(CFG.email)}</span><button class="btn ghost sm" data-act="copy" data-v="${esc(CFG.email)}">Copy email</button></span>` : ''}</div></section>
  ${hl.length ? `<section class="sec"><h2>Highlights</h2><div class="gal">${hl.map(mediaTile).join('')}</div></section>` : ''}
  <section class="sec"><h2>Photos</h2>${ph.length ? `<div class="gal">${ph.map(mediaTile).join('')}</div>` : empty('No photos yet. Check back during the season.')}
  <p class="small muted">All photos © KB Media, posted with player consent. Want one taken down? Message KB Media.</p></section>`;
};
V.partners = () => `<section class="sec"><h1>Partners</h1>
  <p>Players and their friends check this site every week for scores and stats. Partner money keeps the site free for players.</p>
  <div class="partners">${kbCard()}${SPONSORS.map(sponsorCard).join('')}</div>
  <div class="tiers">
    <div class="card tier"><span class="k">Headline partner</span><span class="pr">$250</span><span class="small muted">per season · 1 spot</span><ul><li>Logo on every page</li><li>"Presented by" on the weekly Golden Boot graphic</li><li>Mention in match highlight posts</li></ul></div>
    <div class="card tier"><span class="k">Matchday partner</span><span class="pr">$150</span><span class="small muted">per season · 2 spots</span><ul><li>Logo on fixtures and results</li><li>Link to your website</li></ul></div>
    <div class="card tier"><span class="k">Supporter</span><span class="pr">$100</span><span class="small muted">per season</span><ul><li>Logo on the partner wall</li><li>Link to your website</li></ul></div>
  </div><p class="small">Interested? <a href="https://instagram.com/kbmedia.ca" target="_blank" rel="noopener">Message KB Media on Instagram</a>.</p></section>`;
const KB = {name: 'KB Media', tier: 'Media partner',
  about: 'KB Media is a sports and portrait photography studio based in Vernon, run by a player in this league. It shoots soccer and baseball matchdays, team photos, portraits and events across the Okanagan.',
  role: ['Match photos and highlight reels from league games', 'Built and runs this website: results, the table, stats and suspensions', 'Weekly score cards and Golden Boot graphics for teams to share']};
V.partner = id => {
  const kb = id === 'kbmedia', s = kb ? null : SPONSORS.find(x => x.id === id); if (!kb && !s) return notFound();
  const name = kb ? KB.name : s.name, tier = kb ? KB.tier : `${s.tier[0].toUpperCase()}${s.tier.slice(1)} partner`;
  const about = kb ? KB.about : s.about, role = kb ? KB.role : String(s.role || '').split('\n').map(x => x.trim()).filter(Boolean);
  const logo = kb ? 'kbmedia-logo.png' : s.logo_url;
  const links = kb ? `${CFG.booking ? `<a class="btn" href="${esc(CFG.booking)}" target="_blank" rel="noopener">Book a shoot</a>` : ''}<a class="btn ghost" href="${IG}" target="_blank" rel="noopener">Instagram</a><a class="btn ghost" href="#gallery">League gallery</a>`
    : s.link_url ? `<a class="btn" href="${esc(s.link_url)}" target="_blank" rel="noopener">Visit website</a>` : '';
  return `<section class="sec"><a href="#partners" class="small">← All partners</a>
  <div class="card pad partner">${logo ? `<img src="${esc(logo)}" alt="${esc(name)} logo" width="96" height="96">` : ''}<div><span class="k">${esc(tier)}</span><h1>${esc(name)}</h1></div></div>
  ${about ? `<p>${esc(about)}</p>` : ''}
  ${role.length ? `<h2>How they support the league</h2><ul class="card pad ticks">${role.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
  <div class="row">${links}${kb && CFG.email ? `<span class="row" style="gap:8px"><span class="email">${esc(CFG.email)}</span><button class="btn ghost sm" data-act="copy" data-v="${esc(CFG.email)}">Copy email</button></span>` : ''}</div></section>
  <section class="sec"><div class="card pad"><p class="small">Want your business here? <a href="#partners">See partner options →</a></p></div></section>`;
};
V.info = () => `<section class="sec"><h1>League info</h1><div class="card pad" style="display:flex;flex-direction:column;gap:12px">
  <p><b>Where.</b> ${esc(LEAGUE.venue || '')} (Vernon Toyota Indoor Sports Centre).</p>
  <p><b>When.</b> One game a week. Wednesday 7:00 or 8:40 PM, Saturday 6:00 or 7:40 PM. Games are 1 hour 20 minutes.</p>
  <p><b>Season.</b> Oct 14 to Dec 19, then Jan 6 to Mar 13. Playoffs Mar 17/20 and 24, final Mar 27.</p>
  <p><b>Joining.</b> You must be on a team. Registration and waivers stay on the <a href="https://vernonsoccer.ca/content/adult-indoor-soccer" target="_blank" rel="noopener">official VISC page</a>.</p>
  <p><b>Privacy.</b> Any player can hide their name and stats. Photos go up only with consent.</p></div></section>`;
V.more = () => `<section class="sec"><h1>More</h1><div class="more">
  <a class="card" href="#teams"><b>Teams</b><span>Squads, form and kits</span></a>
  <a class="card" href="#gallery"><b>Gallery</b><span>Match photos by KB Media</span></a>
  <a class="card" href="#suspensions"><b>Suspensions</b><span>Who's out and when they're back</span></a>
  <a class="card" href="#partners"><b>Partners</b><span>Sponsor the league</span></a>
  <a class="card" href="#info"><b>League info</b><span>Times, format, privacy</span></a>
  <a class="card" href="#admin"><b>Admin</b><span>For the site admin</span></a></div></section>`;

/* ---------- captain form (private link: ?c=TOKEN) ---------- */
const TOKEN = new URLSearchParams(location.search).get('c');
let CAP = {ctx:null, err:null, fid:null, hs:0, as:0, sc:[], done:false, busy:false};
V.captain = () => {
  const head = `<section class="sec"><h1>Captain form</h1>`;
  if (!TOKEN) return head + empty('Open the private link your team got from the league admin.') + '</section>';
  if (CAP.err) return head + `<div class="callout pend">${esc(CAP.err)}</div></section>`;
  if (!CAP.ctx) return head + empty('Loading your team…') + '</section>';
  const c = CAP.ctx, team = c.team.id;
  if (CAP.done) return head + `<div class="card pad" style="display:flex;flex-direction:column;gap:12px"><p><b>Thanks, result sent.</b> It goes live once the admin approves it.</p><button class="btn ghost" data-act="cap-again">Report another match</button></div></section>`;
  const fixtures = c.fixtures || [];
  if (!fixtures.length) return head + `<p class="row">${crest(team)}<b>${esc(c.team.name)}</b></p>` + empty('Nothing to report right now. The form opens at kickoff and stays open for 3 weeks.') + '</section>';
  if (!fixtures.find(f => f.id === CAP.fid)) CAP.fid = fixtures[0].id;
  const f = fixtures.find(x => x.id === CAP.fid), home = f.home_team_id === team, mine = home ? CAP.hs : CAP.as;
  while (CAP.sc.length < mine) CAP.sc.push({s:'', a:''}); CAP.sc.length = mine;
  const pl = c.players || [];
  const po = `<option value="">Choose…</option>${pl.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}<option value="?">Not sure</option>`;
  const ao = `<option value="">No assist</option>${pl.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}`;
  const sel = (html, v) => v ? html.replace(`value="${v}"`, `value="${v}" selected`) : html;
  const side = (tid, k) => `<div class="steprow"><span class="lab">${crest(tid)}<span class="nm">${tname(tid)}</span></span><span class="stepper"><button data-act="cap-step" data-v="${k}:-1" aria-label="Minus one goal">−</button><output>${CAP[k]}</output><button data-act="cap-step" data-v="${k}:1" aria-label="Plus one goal">+</button></span></div>`;
  return head + `<p class="row">${crest(team)}<b>${esc(c.team.name)}</b></p>
  <span class="k">Match</span><div class="pick">${fixtures.map(o => { const opp = o.home_team_id === team ? o.away_team_id : o.home_team_id; return `<button class="${o.id === CAP.fid ? 'on' : ''}" data-act="cap-fx" data-v="${o.id}"><span style="display:flex;flex-direction:column;min-width:0"><b class="nm">${o.home_team_id === team ? 'vs' : 'at'} ${tname(opp)}</b><small class="muted">${fmtDay(new Date(o.kickoff))} · ${fmtTime(new Date(o.kickoff))}</small></span></button>`; }).join('')}</div>
  <span class="k">Final score</span><div class="card">${side(f.home_team_id, 'hs')}${side(f.away_team_id, 'as')}</div>
  ${mine ? `<span class="k">Your scorers</span><div class="card">${CAP.sc.map((x,i) => `<div class="grow"><b>Goal ${i+1}</b><select class="sel" id="cs-${i}" data-act="cap-s" data-v="${i}" aria-label="Scorer for goal ${i+1}">${sel(po, x.s)}</select><select class="sel" id="ca-${i}" data-act="cap-a" data-v="${i}" aria-label="Assist for goal ${i+1}">${sel(ao, x.a)}</select></div>`).join('')}</div>` : ''}
  <button class="btn block" id="cap-submit" data-act="cap-submit" ${CAP.sc.every(x => x.s) && !CAP.busy ? '' : 'disabled'}>${CAP.busy ? 'Sending…' : 'Send result'}</button>
  <p class="small muted">The other captain reports their own scorers. Nothing goes public until the admin approves it.</p></section>`;
};
async function capLoad() {
  if (!TOKEN || CAP.ctx || CAP.err) return;
  const r = await sb.rpc('captain_context', {p_token: TOKEN});
  if (r.error) CAP.err = /not valid|invalid input/i.test(r.error.message) ? 'This captain link is not valid. Ask the league admin for a new one.' : r.error.message;
  else CAP.ctx = r.data;
  render(false);
}

/* ---------- admin ---------- */
let ADM = {session:null, isAdmin:false, subs:[], tokens:[], names:{}, err:'', loaded:false, armed:null};
V.admin = () => {
  if (!ADM.loaded) return `<section class="sec"><h1>Admin</h1>${empty('Checking sign-in…')}</section>`;
  if (!ADM.session) return `<section class="sec"><h1>Admin sign in</h1><form class="card pad" id="login" style="display:flex;flex-direction:column;gap:10px">
    <label class="k" for="em">Email</label><input class="sel" id="em" type="email" autocomplete="username" required>
    <label class="k" for="pw">Password</label><input class="sel" id="pw" type="password" autocomplete="current-password" required>
    ${ADM.err ? `<p class="callout pend">${esc(ADM.err)}</p>` : ''}<button class="btn" type="submit">Sign in</button></form></section>`;
  if (!ADM.isAdmin) return `<section class="sec"><h1>Admin</h1>${empty('This account is not an admin.')}<button class="btn ghost" data-act="signout">Sign out</button></section>`;
  const nm = id => !id ? '<span class="hid">Not sure</span>' : esc(ADM.names[id] || 'Unknown');
  const byId = Object.fromEntries(FX.map(f => [f.id, f]));
  const subCard = s => { const f = byId[s.fixture_id]; if (!f) return ''; const same = f.status === 'final';
    return `<div class="card sub"><div class="line">${crest(f.home)}${esc(T[f.home].short)}<b class="sc">${s.home_goals}<i>–</i>${s.away_goals}</b>${esc(T[f.away].short)}${crest(f.away)}</div>
    <p class="small muted">Week ${f.week || '-'} · ${fmtDay(f.date)} · from ${tname(s.team_id)} captain · ${new Date(s.created_at).toLocaleString('en-CA', {timeZone:'America/Vancouver', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}</p>
    ${same && (f.hs !== s.home_goals || f.as !== s.away_goals) ? `<p class="callout pend small">Score differs from the approved ${f.hs}–${f.as}. Approving replaces it.</p>` : ''}
    <p class="small">${(s.goals || []).length ? s.goals.map(g => nm(g.scorer) + (g.assist ? ` (${nm(g.assist)})` : '')).join(', ') : 'No goals for ' + esc(T[s.team_id].short)}</p>
    <div class="acts"><button class="btn sm" data-act="approve" data-v="${s.id}">Approve</button><button class="btn ghost sm" data-act="reject" data-v="${s.id}">Reject</button></div></div>`; };
  const past = FX.filter(f => f.status !== 'final' && f.date < new Date()).sort((a,b) => b.date - a.date);
  const upcoming = FX.filter(f => f.status !== 'final' && f.date >= new Date()).sort((a,b) => a.date - b.date).slice(0, 8);
  const base = location.origin + location.pathname;
  return `<section class="sec"><div class="sec-head"><h1>Admin</h1><button class="btn ghost sm" data-act="signout">Sign out</button></div></section>
  <section class="sec"><h2>Waiting for approval (${ADM.subs.length})</h2>${ADM.subs.length ? ADM.subs.map(subCard).join('') : empty('All caught up.')}</section>
  ${sheetHTML()}
  ${suspAdminHTML()}
  <section class="sec"><h2>Upcoming fixtures</h2><div class="card">${upcoming.map(f => `<div class="adm-fx"><span><b>${esc(T[f.home].short)} v ${esc(T[f.away].short)}</b> <span class="muted">· ${fmtDay(f.date)} ${fmtTime(f.date)}</span> ${f.status === 'postponed' ? '<span class="tag loss">Postponed</span>' : ''}</span>
    <button class="btn ghost sm" data-act="postpone" data-v="${f.id}">${f.status === 'postponed' ? 'Restore' : 'Postpone'}</button></div>`).join('') || '<p class="pad muted">None.</p>'}</div></section>
  <section class="sec"><h2>Photos & highlights</h2><p class="small muted">Only post photos of players who agreed. Big photos are shrunk before upload.</p>
    <div class="card pad" style="display:flex;flex-direction:column;gap:10px">
      <label class="k" for="ph-fx">Match</label><select class="sel" id="ph-fx"><option value="">No match (gallery only)</option>${FX.filter(played).sort((a,b) => b.date - a.date).slice(0, 30).map(f => `<option value="${f.id}">${fmtDay(f.date)} · ${esc(T[f.home].short)} v ${esc(T[f.away].short)}</option>`).join('')}</select>
      <label class="k" for="ph-team">Team in the photo</label><select class="sel" id="ph-team"><option value="">No team / several teams</option>${TIDS.map(t => `<option value="${t}">${tname(t)}</option>`).join('')}</select>
      <label class="row small" style="gap:8px"><input type="checkbox" id="ph-wm" checked> Add a small "KB MEDIA" watermark</label>
      <label class="k" for="ph-files">Photos</label><input class="sel" id="ph-files" type="file" accept="image/*" multiple>
      <input class="sel" id="ph-cap" placeholder="Caption (optional)" maxlength="80">
      <button class="btn" data-act="upload">Upload photos</button>
      <label class="k" for="hl-url">Or a highlight link</label><input class="sel" id="hl-url" type="url" placeholder="https://instagram.com/…">
      <button class="btn ghost" data-act="highlight">Add highlight link</button>
    </div>
    ${MEDIA.length ? `<div class="card">${MEDIA.slice(0, 10).map(x => `<div class="adm-fx"><span class="small">${x.kind === 'photo' ? '📷' : '▶'} ${mLabel(x)} ${esc(x.caption || '')}</span><button class="btn ghost sm" data-act="delmedia" data-v="${x.id}">${ADM.armed === x.id ? 'Tap to confirm' : 'Remove'}</button></div>`).join('')}</div>` : ''}</section>
  <section class="sec"><h2>Captain links</h2><p class="small muted">Send each link only to that team's captain or rep. Anyone with a link can report results for that team, and you still approve everything.</p>
    <div class="card">${ADM.tokens.filter(x => T[x.team_id]).map(x => `<div class="adm-fx"><span class="row" style="gap:8px;min-width:0">${crest(x.team_id)}<b>${tname(x.team_id)}</b></span><button class="btn ghost sm" data-act="copy" data-v="${base}?c=${x.token}#captain">Copy link</button></div>`).join('')}</div></section>`;
};
/* match sheet: score, scorers, assists and cards for any played game */
function openSheet(fid) { const f = FX.find(x => x.id === fid);
  ADM.sheet = {fid, hs: f.hs, as: f.as, goals: f.goals.map(g => ({t:g.t, s:g.s || '', a:g.a || ''})), cards: f.cards.map(c => ({t:c.t, p:c.p || '', c:c.c}))}; }
function sheetHTML() {
  const list = FX.filter(played).sort((a,b) => b.date - a.date); if (!list.length) return '';
  if (!ADM.sheet || !list.find(f => f.id === ADM.sheet.fid)) openSheet((list.find(f => f.status !== 'final') || list[0]).id);
  const S = ADM.sheet, f = FX.find(x => x.id === S.fid);
  const nm = id => ADM.names[id] || (P[id] && P[id].name) || 'Unknown';
  const opts = (t, v, blank) => `<option value="">${blank}</option>` + (SQUAD[t] || []).map(id => `<option value="${id}" ${id === v ? 'selected' : ''}>${esc(nm(id))}</option>`).join('');
  const goalRows = t => S.goals.map((g,i) => g.t !== t ? '' : `<div class="grow4"><b>⚽</b><select class="sel" data-act="ms-gs" data-v="${i}" aria-label="Scorer">${opts(t, g.s, 'Not sure')}</select><select class="sel" data-act="ms-ga" data-v="${i}" aria-label="Assist">${opts(t, g.a, 'No assist')}</select><button class="btn ghost sm" data-act="ms-gdel" data-v="${i}" aria-label="Remove goal">✕</button></div>`).join('');
  const both = v => [f.home, f.away].map(t => `<optgroup label="${tname(t)}">${(SQUAD[t] || []).map(id => `<option value="${t}|${id}" ${v === t + '|' + id ? 'selected' : ''}>${esc(nm(id))}</option>`).join('')}</optgroup>`).join('');
  const cardRows = S.cards.map((c,i) => `<div class="grow4"><i class="ci ${c.c === 'red' ? 'r' : 'y'}"></i><select class="sel" data-act="ms-cp" data-v="${i}" aria-label="Player"><option value="">Choose player…</option>${both(c.p ? c.t + '|' + c.p : '')}</select><select class="sel" data-act="ms-cc" data-v="${i}" aria-label="Card"><option value="yellow" ${c.c === 'yellow' ? 'selected' : ''}>Yellow</option><option value="red" ${c.c === 'red' ? 'selected' : ''}>Red</option></select><button class="btn ghost sm" data-act="ms-cdel" data-v="${i}" aria-label="Remove card">✕</button></div>`).join('');
  return `<section class="sec"><h2>Match sheet</h2><p class="small muted">Type in the ref's card or what players tell you. Saving replaces this game's score, scorers and cards.</p>
  <div class="card pad sheet">
    <select class="sel" id="ms-fx" data-act="ms-fx" aria-label="Match">${list.map(x => `<option value="${x.id}" ${x.id === S.fid ? 'selected' : ''}>${x.status === 'final' ? '✓ ' : ''}${fmtDay(x.date)} · ${esc(T[x.home].short)} v ${esc(T[x.away].short)}</option>`).join('')}</select>
    <div class="row" style="justify-content:center;gap:12px">${crest(f.home)}<input class="sel sc-in" id="ms-h" type="number" min="0" max="30" inputmode="numeric" data-act="ms-h" value="${S.hs ?? ''}" aria-label="${tname(f.home)} score"><b>–</b><input class="sel sc-in" id="ms-a" type="number" min="0" max="30" inputmode="numeric" data-act="ms-a" value="${S.as ?? ''}" aria-label="${tname(f.away)} score">${crest(f.away)}</div>
    <span class="k">${tname(f.home)} goals</span>${goalRows(f.home)}<button class="btn ghost sm" data-act="ms-gadd" data-v="${f.home}">+ Goal</button>
    <span class="k">${tname(f.away)} goals</span>${goalRows(f.away)}<button class="btn ghost sm" data-act="ms-gadd" data-v="${f.away}">+ Goal</button>
    <span class="k">Cards</span>${cardRows}<button class="btn ghost sm" data-act="ms-cadd">+ Card</button>
    <button class="btn block" data-act="ms-save">Save match sheet</button>
  </div></section>`;
}
/* suspensions: adjust automatic red-card bans, add bans for misconduct */
function suspAdminHTML() {
  const nm = id => esc(ADM.names[id] || (P[id] && P[id].name) || 'Unknown');
  const list = bans().filter(x => x.left > 0 || (Date.now() - x.date) < 21 * 864e5); ADM.su = list;
  const row = (x, i) => `<div class="adm-fx" style="flex-wrap:wrap"><span class="small" style="flex:1;min-width:150px"><b>${nm(x.p)}</b> · ${esc(T[x.t].short)} · ${esc(x.why)}<br><span class="muted">${x.left === Infinity ? 'Until further notice' : x.left ? `${x.left} left (${x.served}/${x.games})` : 'Served'}${x.auto ? ' · automatic' : ''}</span></span>
    ${x.kind === 'yellow' ? '<span class="small muted">Set by the yellow-card rule</span>' : `<input class="sel" id="su-g-${i}" type="number" min="0" max="50" inputmode="numeric" value="${x.games ?? ''}" placeholder="∞" style="width:64px" aria-label="Games"><button class="btn ghost sm" data-act="su-set" data-v="${i}">Save</button>${x.id ? `<button class="btn ghost sm" data-act="su-del" data-v="${x.id}">${ADM.armed === x.id ? 'Tap to confirm' : 'Remove'}</button>` : ''}`}</div>`;
  const players = TIDS.map(t => `<optgroup label="${tname(t)}">${(SQUAD[t] || []).map(id => `<option value="${t}|${id}">${nm(id)}</option>`).join('')}</optgroup>`).join('');
  return `<section class="sec"><h2>Suspensions</h2><p class="small muted">Red cards and every ${ord(RULES.yellowLimit)} yellow create bans automatically from the match sheet. Change a red card's length here, or add a ban for misconduct. Leave games blank for "until further notice".</p>
  ${list.length ? `<div class="card">${list.map(row).join('')}</div>` : ''}
  <div class="card pad" style="display:flex;flex-direction:column;gap:10px"><span class="k">Add a ban</span>
    <select class="sel" id="su-p" aria-label="Player"><option value="">Choose player…</option>${players}</select>
    <div class="row"><select class="sel" id="su-r" aria-label="Reason" style="flex:1"><option value="misconduct">Misconduct / ref abuse</option><option value="ban">League ban</option><option value="red">Red card (no card on sheet)</option><option value="other">Other</option></select>
    <input class="sel" id="su-n" type="number" min="0" max="50" inputmode="numeric" placeholder="Games" style="width:90px" aria-label="Games"></div>
    <select class="sel" id="su-f" aria-label="Incident match"><option value="">No match: ban starts from the next game</option>${FX.filter(played).sort((a,b) => b.date - a.date).slice(0, 30).map(f => `<option value="${f.id}">${fmtDay(f.date)} · ${esc(T[f.home].short)} v ${esc(T[f.away].short)}</option>`).join('')}</select>
    <input class="sel" id="su-note" maxlength="120" placeholder="Short public note (optional)">
    <button class="btn" data-act="su-add">Add ban</button></div></section>`;
}
async function saveSheet(el) {
  const S = ADM.sheet, f = FX.find(x => x.id === S.fid);
  if (!(S.hs >= 0 && S.as >= 0)) { toast('Enter both scores'); return; }
  if (S.goals.filter(g => g.t === f.home).length > S.hs || S.goals.filter(g => g.t === f.away).length > S.as) { toast('More goal lines than the score. Check it.'); return; }
  el.disabled = true;
  const steps = [
    () => sb.from('fixtures').update({home_goals: S.hs, away_goals: S.as, status: 'final'}).eq('id', f.id),
    () => sb.from('goals').delete().eq('fixture_id', f.id),
    () => S.goals.length ? sb.from('goals').insert(S.goals.map(g => ({fixture_id: f.id, team_id: g.t, scorer_id: g.s || null, assist_id: g.a || null}))) : {},
    () => sb.from('cards').delete().eq('fixture_id', f.id),
    () => S.cards.filter(c => c.p).length ? sb.from('cards').insert(S.cards.filter(c => c.p).map(c => ({fixture_id: f.id, team_id: c.t, player_id: c.p, color: c.c}))) : {}
  ];
  for (const st of steps) { const r = await st(); if (r && r.error) { toast(r.error.message); el.disabled = false; return; } }
  toast('Match sheet saved'); const keep = f.id; await refresh(); openSheet(keep); render(false);
}

/* score card image for Instagram / WhatsApp */
async function scoreCard(f) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  try { await Promise.all([document.fonts.load('800 200px "Saira Condensed"'), document.fonts.load('700 40px Figtree'), document.fonts.load('500 30px Figtree')]); } catch (e) {}
  const h = T[f.home], a = T[f.away], D = '"Saira Condensed", "Arial Narrow", sans-serif', B = 'Figtree, system-ui, sans-serif';
  x.fillStyle = '#0c1411'; x.fillRect(0, 0, W, H);
  x.globalAlpha = .9; x.fillStyle = h.c1; x.beginPath(); x.moveTo(0, 0); x.lineTo(640, 0); x.lineTo(440, 820); x.lineTo(0, 820); x.fill();
  x.fillStyle = a.c1; x.beginPath(); x.moveTo(640, 0); x.lineTo(W, 0); x.lineTo(W, 820); x.lineTo(440, 820); x.fill(); x.globalAlpha = 1;
  const gr = x.createLinearGradient(0, 380, 0, 900); gr.addColorStop(0, 'rgba(12,20,17,0)'); gr.addColorStop(1, 'rgba(12,20,17,1)'); x.fillStyle = gr; x.fillRect(0, 380, W, 520);
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 12;
  x.font = `700 34px ${B}`; x.fillText("VERNON MEN'S INDOOR", W/2, 96);
  x.font = `500 30px ${B}`; x.fillText(`Week ${f.week || ''} · ${fmtDay(f.date)}`.toUpperCase(), W/2, 144);
  const crestAt = (t, cx, cy) => { const r = 120, g = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, t.c1); g.addColorStop(.62, t.c1); g.addColorStop(.62, t.c2); g.addColorStop(1, t.c2);
    x.save(); x.shadowBlur = 24; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fillStyle = g; x.fill(); x.restore(); x.lineWidth = 8; x.strokeStyle = '#fff'; x.stroke();
    x.save(); x.shadowBlur = 0; x.fillStyle = lum(t.c1) > .6 ? '#111' : '#fff'; x.font = `800 72px ${D}`; x.fillText(t.short, cx, cy + 25); x.restore(); };
  crestAt(h, 250, 390); crestAt(a, 830, 390);
  const fit = (txt, size, max) => { let s = size; do { x.font = `700 ${s}px ${B}`; s -= 2; } while (x.measureText(txt).width > max && s > 24); };
  fit(h.name, 44, 360); x.fillText(h.name, 250, 575); fit(a.name, 44, 360); x.fillText(a.name, 830, 575);
  x.font = `800 230px ${D}`; x.fillText(`${f.hs}–${f.as}`, W/2, 470);
  x.shadowBlur = 0; x.font = `700 28px ${B}`; x.fillStyle = 'rgba(255,255,255,.85)'; x.fillText('FULL TIME', W/2, 640);
  const names = t => { const m = new Map(); f.goals.filter(g => g.t === t && g.s && P[g.s] && !P[g.s].hidden).forEach(g => m.set(P[g.s].name, (m.get(P[g.s].name) || 0) + 1));
    const arr = [...m].map(([n, k]) => k > 1 ? `${n} ×${k}` : n); return arr.length > 4 ? [...arr.slice(0, 3), `+${arr.length - 3} more`] : arr; };
  const hn = names(f.home), an = names(f.away);
  if (hn.length || an.length) { x.fillStyle = '#fff'; x.font = `500 40px ${B}`;
    x.textAlign = 'right'; hn.forEach((n, i) => x.fillText(n, 490, 940 + i * 58)); x.textAlign = 'left'; an.forEach((n, i) => x.fillText(n, 590, 940 + i * 58));
    x.textAlign = 'center'; x.font = `40px ${B}`; x.fillText('⚽', W/2, 940); }
  x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,.55)'; x.font = `600 26px ${B}`; x.fillText('RESULTS & STATS · KB MEDIA', W/2 + 36, H - 60);
  if (LOGO_IMG.complete && LOGO_IMG.naturalWidth) { const tw = x.measureText('RESULTS & STATS · KB MEDIA').width; x.drawImage(LOGO_IMG, W/2 + 36 - tw/2 - 72, H - 102, 58, 58); }
  return await new Promise(r => c.toBlob(r, 'image/png'));
}
function showImage(url) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="modal-in"><img src="${url}" alt="Score card"><p class="small">Press and hold the image to save it, then post it to Instagram.</p><button class="btn block">Close</button></div>`;
  m.addEventListener('click', e => { if (e.target === m || e.target.tagName === 'BUTTON') m.remove(); }); document.body.appendChild(m);
}
async function admLoad() {
  const { data } = await sb.auth.getSession(); ADM.session = data.session; ADM.loaded = true;
  if (ADM.session) {
    const a = await sb.rpc('is_admin'); ADM.isAdmin = !!a.data;
    if (ADM.isAdmin) {
      const [s, t, p] = await Promise.all([
        sb.from('submissions').select('*').eq('status', 'pending').order('created_at'),
        sb.from('team_tokens').select('team_id, token'),
        sb.from('players').select('id, display_name').in('team_id', TIDS)
      ]);
      ADM.subs = (s.data || []).filter(x => FX.some(f => f.id === x.fixture_id)); ADM.tokens = t.data || [];
      ADM.names = Object.fromEntries((p.data || []).map(x => [x.id, x.display_name]));
    }
  }
  render(false);
}
// Web-size copy (1600px long edge): sharp on phones, too small for print. Optional watermark.
async function shrink(file, wm) {
  try { const img = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    if (wm) { const s = Math.round(c.width * .028); g.font = `700 ${s}px Figtree, system-ui, sans-serif`; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.7)'; g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = s * .4; if (LOGO_IMG.complete && LOGO_IMG.naturalWidth) { const L = Math.round(c.width * .075); g.globalAlpha = .85; g.drawImage(LOGO_IMG, c.width - L - s, c.height - L - s, L, L); g.globalAlpha = 1; }
      else g.fillText('KB MEDIA', c.width - s, c.height - s); }
    return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', .82)); } catch (e) { return file; }
}
async function refresh() { await load(); await admLoad(); }

/* ---------- router & events ---------- */
const AFTER = {admin: () => { if (!ADM.loaded) admLoad(); }, captain: capLoad};
function render(top) {
  const h = location.hash.slice(1) || (TOKEN ? 'captain' : 'home'); let html, nav = 'more';
  if (h.startsWith('team-')) html = V.team(h.slice(5));
  else if (h.startsWith('partner-')) html = V.partner(h.slice(8));
  else if (h.startsWith('match-')) { html = V.match(h.slice(6)); nav = 'fixtures'; }
  else if (V[h]) { html = V[h](); nav = ['home','fixtures','table','stats'].includes(h) ? h : 'more'; }
  else html = notFound();
  $('#app').innerHTML = html;
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.nav === nav));
  if (top) window.scrollTo(0, 0);
  const on = document.querySelector('#wk-chips .chip.on'); if (on) { const c = on.parentElement; c.scrollLeft = on.offsetLeft - c.clientWidth / 2 + on.clientWidth / 2; }
  if (AFTER[h]) AFTER[h]();
}
async function act(a, v, el) {
  if (a === 'copy') { const no = () => toast('Press and hold to copy'); try { navigator.clipboard.writeText(v).then(() => toast('Copied'), no); } catch (e) { no(); } return; }
  if (a === 'follow') { MYTEAM = MYTEAM === v ? null : v; try { MYTEAM ? localStorage.setItem('myteam', v) : localStorage.removeItem('myteam'); } catch (e) {} toast(MYTEAM ? 'Saved as your team' : 'Removed'); render(false); return; }
  if (a === 'view') { viewPhoto(v); return; }
  if (a === 'ics') { const t = T[v], p2 = n => String(n).padStart(2, '0'), u = d => `${d.getUTCFullYear()}${p2(d.getUTCMonth()+1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00Z`, e = x => String(x).replace(/[\\,;]/g, m => '\\' + m);
    const ev = FX.filter(f => (f.home === v || f.away === v) && !played(f) && f.status !== 'postponed').map(f => ['BEGIN:VEVENT', `UID:${f.id}@vernon-league`, `DTSTAMP:${u(new Date())}`, `DTSTART:${u(f.date)}`, `DTEND:${u(new Date(f.date.getTime() + 80 * 6e4))}`, `SUMMARY:${e(T[f.home].name + ' v ' + T[f.away].name)}`, `LOCATION:${e(LEAGUE.venue || '')}`, 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Game tonight', 'END:VALARM', 'END:VEVENT'].join('\r\n'));
    const blob = new Blob([['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KB Media//Vernon Mens Indoor//EN', `X-WR-CALNAME:${e(t.name)}`, ...ev, 'END:VCALENDAR'].join('\r\n')], {type: 'text/calendar'});
    const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `${t.slug}-fixtures.ics`; document.body.appendChild(l); l.click(); l.remove();
    toast(`${ev.length} games added. Open the file to save them to your calendar.`); return; }
  if (a === 'card') { const f = FXI[v]; toast('Making your score card…'); const blob = await scoreCard(f); if (!blob) { toast('Could not make the image'); return; }
    const file = new File([blob], `${T[f.home].short}-${T[f.away].short}-${f.hs}-${f.as}.png`, {type: 'image/png'});
    if (navigator.canShare && navigator.canShare({files: [file]})) { navigator.share({files: [file], title: `${T[f.home].name} ${f.hs}–${f.as} ${T[f.away].name}`}).catch(() => {}); }
    else showImage(URL.createObjectURL(blob)); return; }
  if (a === 'ms-gadd') { ADM.sheet.goals.push({t: v, s: '', a: ''}); render(false); return; }
  if (a === 'ms-gdel') { ADM.sheet.goals.splice(+v, 1); render(false); return; }
  if (a === 'ms-cadd') { const f = FX.find(x => x.id === ADM.sheet.fid); ADM.sheet.cards.push({t: f.home, p: '', c: 'yellow'}); render(false); return; }
  if (a === 'ms-cdel') { ADM.sheet.cards.splice(+v, 1); render(false); return; }
  if (a === 'ms-save') { await saveSheet(el); return; }
  if (a === 'share') { const f = FXI[v], url = location.origin + location.pathname + '#match-' + v;
    const text = f.status === 'final' ? `${T[f.home].name} ${f.hs}–${f.as} ${T[f.away].name}` : `${T[f.home].name} v ${T[f.away].name}, ${fmtDay(f.date)} ${fmtTime(f.date)}`;
    if (navigator.share) { navigator.share({title: text, text, url}).catch(() => {}); } else { try { navigator.clipboard.writeText(text + ' ' + url).then(() => toast('Link copied')); } catch (e) {} } return; }
  if (a === 'week') fxWeek = v === 'PO' ? 'PO' : +v;
  else if (a === 'stat') statTab = v;
  else if (a === 'cap-fx') { CAP.fid = v; CAP.hs = 0; CAP.as = 0; CAP.sc = []; }
  else if (a === 'cap-step') { const [k, d] = v.split(':'); CAP[k] = Math.max(0, Math.min(30, CAP[k] + (+d))); }
  else if (a === 'cap-again') { CAP = {ctx:null, err:null, fid:null, hs:0, as:0, sc:[], done:false, busy:false}; render(true); return; }
  else if (a === 'cap-submit') {
    CAP.busy = true; render(false);
    const r = await sb.rpc('submit_result', {p_token: TOKEN, p_fixture: CAP.fid, p_home: CAP.hs, p_away: CAP.as, p_goals: CAP.sc.map(x => ({scorer: x.s === '?' ? null : x.s, assist: x.a || null}))});
    CAP.busy = false; if (r.error) toast(r.error.message); else { CAP.done = true; toast('Result sent for approval'); window.scrollTo(0, 0); }
  }
  else if (a === 'approve' || a === 'reject') {
    el.disabled = true; const r = await sb.rpc(a === 'approve' ? 'approve_submission' : 'reject_submission', {p_id: v});
    if (r.error) { toast(r.error.message); el.disabled = false; return; }
    toast(a === 'approve' ? 'Approved. Table and stats updated.' : 'Rejected.'); await refresh(); return;
  }
  else if (a === 'manual') {
    const h = parseInt($('#mr-h').value, 10), w = parseInt($('#mr-a').value, 10);
    if (!(h >= 0 && w >= 0)) { toast('Enter both scores'); return; }
    const r = await sb.from('fixtures').update({home_goals: h, away_goals: w, status: 'final'}).eq('id', $('#mr-fx').value);
    if (r.error) { toast(r.error.message); return; } toast('Result saved'); await refresh(); return;
  }
  else if (a === 'postpone') {
    const f = FX.find(x => x.id === v); const r = await sb.from('fixtures').update({status: f.status === 'postponed' ? 'scheduled' : 'postponed'}).eq('id', v);
    if (r.error) { toast(r.error.message); return; } await refresh(); return;
  }
  else if (a === 'upload') {
    const files = [...($('#ph-files').files || [])], fid = $('#ph-fx').value || null, f = FX.find(x => x.id === fid), cap = $('#ph-cap').value.trim(), team = $('#ph-team').value || null, wm = $('#ph-wm').checked;
    if (!files.length) { toast('Choose at least one photo'); return; }
    el.disabled = true;
    for (let i = 0; i < files.length; i++) {
      toast(`Uploading ${i + 1} of ${files.length}…`);
      const blob = await shrink(files[i], wm), path = `${f ? f.code : 'gallery'}/${Date.now()}-${i}.jpg`;
      const up = await sb.storage.from('media').upload(path, blob, {contentType: 'image/jpeg'});
      if (up.error) { toast(up.error.message); el.disabled = false; return; }
      const url = sb.storage.from('media').getPublicUrl(path).data.publicUrl;
      const ins = await sb.from('media').insert({fixture_id: fid, team_id: team, kind: 'photo', url, caption: cap || null});
      if (ins.error) { toast(ins.error.message); el.disabled = false; return; }
    }
    toast('Photos added'); await refresh(); return;
  }
  else if (a === 'highlight') {
    const url = $('#hl-url').value.trim(); if (!/^https:\/\//.test(url)) { toast('Paste a full https:// link'); return; }
    const r = await sb.from('media').insert({fixture_id: $('#ph-fx').value || null, team_id: $('#ph-team').value || null, kind: 'highlight', url}); if (r.error) { toast(r.error.message); return; }
    toast('Highlight added'); await refresh(); return;
  }
  else if (a === 'delmedia') {
    if (ADM.armed !== v) { ADM.armed = v; render(false); return; }
    ADM.armed = null; const r = await sb.from('media').delete().eq('id', v); if (r.error) { toast(r.error.message); return; }
    toast('Removed'); await refresh(); return;
  }
  else if (a === 'su-add') {
    const [t, p] = ($('#su-p').value || '|').split('|'), n = $('#su-n').value;
    if (!p) { toast('Choose a player'); return; }
    el.disabled = true;
    const r = await sb.from('suspensions').insert({season_id: SEASON.id, player_id: p, team_id: t, fixture_id: $('#su-f').value || null, games: n === '' ? null : Math.max(0, parseInt(n, 10)), reason: $('#su-r').value, note: $('#su-note').value.trim() || null});
    if (r.error) { toast(r.error.message); el.disabled = false; return; } toast('Ban added'); await refresh(); return;
  }
  else if (a === 'su-set') {
    const x = ADM.su[+v], n = $('#su-g-' + v).value, games = n === '' ? null : Math.max(0, parseInt(n, 10));
    const r = x.id ? await sb.from('suspensions').update({games}).eq('id', x.id)
      : await sb.from('suspensions').insert({season_id: SEASON.id, player_id: x.p, team_id: x.t, fixture_id: x.f.id, games, reason: 'red'});
    if (r.error) { toast(r.error.message); return; } toast('Ban updated'); await refresh(); return;
  }
  else if (a === 'su-del') {
    if (ADM.armed !== v) { ADM.armed = v; render(false); return; }
    ADM.armed = null; const r = await sb.from('suspensions').delete().eq('id', v); if (r.error) { toast(r.error.message); return; }
    toast('Removed'); await refresh(); return;
  }
  else if (a === 'signout') { await sb.auth.signOut(); ADM = {session:null, isAdmin:false, subs:[], tokens:[], names:{}, err:'', loaded:true}; }
  else return;
  render(false);
}
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT') return; act(el.dataset.act, el.dataset.v, el); });
document.addEventListener('change', e => {
  const el = e.target, a = el.dataset.act; if (!a) return;
  if (a === 'fxteam') { fxTeam = el.value; render(false); return; }
  if (a.startsWith('ms-') && ADM.sheet) { const S = ADM.sheet, i = +el.dataset.v;
    if (a === 'ms-fx') { openSheet(el.value); render(false); }
    else if (a === 'ms-h' || a === 'ms-a') S[a === 'ms-h' ? 'hs' : 'as'] = el.value === '' ? null : Math.max(0, parseInt(el.value, 10));
    else if (a === 'ms-gs') S.goals[i].s = el.value; else if (a === 'ms-ga') S.goals[i].a = el.value;
    else if (a === 'ms-cp') { const [t, p] = el.value.split('|'); S.cards[i].t = t || S.cards[i].t; S.cards[i].p = p || ''; }
    else if (a === 'ms-cc') { S.cards[i].c = el.value; render(false); }
    return; }
  if (a === 'cap-s' || a === 'cap-a') { CAP.sc[+el.dataset.v][a === 'cap-s' ? 's' : 'a'] = el.value; const b = $('#cap-submit'); if (b) b.disabled = !CAP.sc.every(x => x.s); }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'login') return; e.preventDefault();
  const r = await sb.auth.signInWithPassword({email: $('#em').value.trim(), password: $('#pw').value});
  ADM.err = r.error ? 'Wrong email or password.' : ''; ADM.loaded = false; await admLoad();
});
window.addEventListener('hashchange', () => render(true));

(async () => {
  if (!CFG.url || !CFG.key || !window.supabase) { $('#app').innerHTML = `<section class="sec"><h1>Almost ready</h1>${empty('The database connection is not set up yet.')}</section>`; return; }
  sb = window.supabase.createClient(CFG.url, CFG.key);
  try { await load(); render(true); }
  catch (err) { console.error(err); $('#app').innerHTML = `<section class="sec"><h1>Can't load the league</h1>${empty('Check your connection and refresh. If it keeps happening, tell the league admin.')}</section>`; }
})();
