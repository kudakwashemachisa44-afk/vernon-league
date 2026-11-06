/* League Hub — live site. Reads everything from Supabase; no sample data. */
const CFG = window.LEAGUE_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sb = null;
let T = {}, TIDS = [], SLUG = {}, P = {}, SQUAD = {}, FX = [], FXI = {}, SPONSORS = [], MEDIA = [], SEASON = null, LEAGUE = null;

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
  t.data.forEach(x => { T[x.id] = {id:x.id, slug:x.slug, name:x.name, short:x.short_name, c1:x.color_primary||'#6b7280', c2:x.color_secondary||'#d1d5db', todo:!x.colors_confirmed, rep:x.rep_name, email:x.rep_email, formation:x.formation}; SLUG[x.slug] = x.id; });
  TIDS = Object.keys(T);
  const fids = f.data.map(x => x.id);
  const [p, g, sp, md] = await Promise.all([
    sb.from('public_players').select('*').in('team_id', TIDS).eq('active', true).order('sort'),
    fids.length ? sb.from('goals').select('*').in('fixture_id', fids) : {data:[]},
    sb.from('sponsors').select('*').eq('season_id', SEASON.id).order('sort'),
    fids.length ? sb.from('media').select('*').in('fixture_id', fids).order('created_at', {ascending:false}) : {data:[]}
  ]);
  P = {}; SQUAD = {}; TIDS.forEach(id => SQUAD[id] = []);
  (p.data||[]).forEach(x => { P[x.id] = {id:x.id, team:x.team_id, name:x.name, hidden:!x.name, pos:x.position||'', slot:x.lineup_slot, ph:!!x.is_placeholder}; SQUAD[x.team_id].push(x.id); });
  FX = f.data.map(x => ({id:x.id, code:x.code, week:x.week, stage:x.stage, date:new Date(x.kickoff), home:x.home_team_id, away:x.away_team_id, status:x.status, hs:x.home_goals, as:x.away_goals, goals:[]}));
  FXI = Object.fromEntries(FX.map(x => [x.code, x]));
  const byId = Object.fromEntries(FX.map(x => [x.id, x]));
  (g.data||[]).forEach(x => byId[x.fixture_id] && byId[x.fixture_id].goals.push({t:x.team_id, s:x.scorer_id, a:x.assist_id}));
  SPONSORS = sp.data || []; MEDIA = md.data || [];
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
function lineup(t) { const sq = SQUAD[t] || []; const xi = SHAPE.map(s => sq.find(id => P[id].slot === s) || null); return {xi, rest: sq.filter(id => !xi.includes(id)), has: xi.some(Boolean)}; }

/* ---------- helpers ---------- */
const lum = h => { const n = parseInt(h.slice(1), 16); return (.299*(n>>16&255) + .587*(n>>8&255) + .114*(n&255)) / 255; };
const crest = (t, c = '') => { const x = T[t]; return x ? `<span class="crest ${c}" style="--c1:${x.c1};--c2:${x.c2};color:${lum(x.c1) > .6 ? '#111' : '#fff'}" aria-hidden="true">${esc(x.short)}</span>` : ''; };
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
const FULL = {GK:[150,378],LCB:[95,300],RCB:[205,300],LW:[46,196],LCM:[116,220],RCM:[184,220],RW:[254,196],ST:[150,92]};
const HALF = {GK:[150,552],LCB:[95,488],RCB:[205,488],LW:[46,420],LCM:[116,405],RCM:[184,405],RW:[254,420],ST:[150,342]};
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
  const top = H.xi.map((p,i) => { const [x,y] = HALF[SHAPE[i]]; return dot(f.home, p, SHAPE[i], 300-x, 600-y, m); }).join('');
  const bot = A.xi.map((p,i) => { const [x,y] = HALF[SHAPE[i]]; return dot(f.away, p, SHAPE[i], x, y, m); }).join('');
  return `<section class="sec"><h2>${fin ? 'Lineups' : 'Probable lineups'}</h2><div class="lu card">
  <a class="lu-h" href="#team-${T[f.home].slug}">${crest(f.home)}<b>${tname(f.home)}</b><span class="tag">${esc(T[f.home].formation)}</span></a>
  <svg viewBox="0 0 300 600" role="img" aria-label="Lineups">${pitchLines(600)}${top}${bot}</svg>
  <a class="lu-h" href="#team-${T[f.away].slug}">${crest(f.away)}<b>${tname(f.away)}</b><span class="tag">${esc(T[f.away].formation)}</span></a></div>
  <h3>Subs</h3><div class="goals">${restList(f.home, H.rest, m)}${restList(f.away, A.rest, m)}</div>
  <p class="small muted">⚽ scored, 👟 assisted. Lineups show each team's usual formation.</p></section>`;
}
function tableHTML(rows, mini) {
  return `<div class="tbl"><table><thead><tr><th>#</th><th class="tm">Team</th><th>GP</th>${mini ? '' : '<th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th>'}<th>GD</th><th>Pts</th>${mini ? '' : '<th>Form</th>'}</tr></thead><tbody>
  ${rows.map((r,i) => `<tr><td class="pos">${i+1}</td><td class="tm"><a href="#team-${T[r.t].slug}">${crest(r.t)}<span class="nm">${tname(r.t)}</span></a></td><td>${r.gp}</td>
  ${mini ? '' : `<td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td>`}<td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td>
  ${mini ? '' : `<td><span class="form">${r.form.slice(-5).map(x => `<span class="fd ${x}">${x}</span>`).join('')}</span></td>`}</tr>`).join('')}
  </tbody></table></div>`;
}

/* ---------- public views ---------- */
const V = {};
V.home = () => {
  const next = FX.filter(f => f.status === 'scheduled' && !played(f)).sort((a,b) => a.date - b.date);
  const day = next[0], nd = day ? next.filter(f => vKey(f.date) === vKey(day.date)) : [];
  const past = FX.filter(f => played(f) && f.status !== 'postponed').sort((a,b) => b.date - a.date);
  const days = [...new Set(past.map(f => vKey(f.date)))].slice(0, 2);
  const latest = past.filter(f => days.includes(vKey(f.date)));
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
  <section class="sec"><div class="sec-head"><h2>Latest results</h2><a href="#fixtures">All fixtures →</a></div>
    ${latest.length ? `<div class="fxlist">${latest.map(f => fxRow(f)).join('')}</div>` : empty('No games played yet.')}</section>
  <section class="sec"><div class="sec-head"><h2>Table</h2><a href="#table">Full table →</a></div>${tableHTML(table().slice(0, 4), true)}</section>
  <section class="sec"><div class="sec-head"><h2>Leaders</h2><a href="#stats">All stats →</a></div>
    <div class="lead2">${ld('Top scorer', g ? g.g : 0, g)}${ld('Most assists', a ? a.a : 0, a)}</div></section>
  <section class="sec"><h2>How a result goes live</h2>
    <div class="steps">
      <div class="card st"><span class="st-n">1</span><p><b>Captain reports.</b> Score and scorers from a private link, in about 30 seconds.</p></div>
      <div class="card st"><span class="st-n">2</span><p><b>Admin approves.</b> One tap checks it before it goes public.</p></div>
      <div class="card st"><span class="st-n">3</span><p><b>Everything updates.</b> Table, stats and team pages refresh on their own.</p></div>
    </div></section>
  <section class="sec"><span class="k">League partners</span>${SPONSORS.length ? `<div class="more">${SPONSORS.map(sponsorCard).join('')}</div>` : `<a class="slot" href="#partners" style="text-decoration:none">Your business here · partner slots open</a>`}</section>`;
};
const sponsorCard = s => `<a class="card" href="${esc(s.link_url || '#partners')}" target="_blank" rel="noopener">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="${esc(s.name)}" style="max-height:48px;object-fit:contain">` : `<b>${esc(s.name)}</b>`}<span>${esc(s.tier)} partner</span></a>`;

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
  <div class="chips"><button class="chip ${statTab === 'g' ? 'on' : ''}" data-act="stat" data-v="g">Goals</button><button class="chip ${statTab === 'a' ? 'on' : ''}" data-act="stat" data-v="a">Assists</button></div>
  ${list.length ? `<ol class="rank card">${list.map((x,i) => `<li><span class="rn">${i+1}</span><span class="who">${crest(P[x.id].team)}<span><b class="nm">${pname(x.id)}</b><small>${tname(P[x.id].team)} · ${statTab === 'g' ? x.a + ' assists' : x.g + ' goals'}</small></span></span><span class="v">${statTab === 'g' ? x.g : x.a}</span></li>`).join('')}</ol>` : empty('Stats appear once captains report scorers.')}
  <p class="small muted">"Name hidden" means the player opted out of public stats. Their goals still count for the team.</p></section>`;
};
V.teams = () => `<section class="sec"><h1>Teams</h1><div class="more">${TIDS.map(t => `<a class="card" href="#team-${T[t].slug}" style="flex-direction:row;align-items:center;gap:12px">${crest(t, 'md')}<b class="nm" style="font:700 18px var(--display);text-transform:uppercase">${tname(t)}</b></a>`).join('')}</div></section>`;
V.team = slug => {
  const id = SLUG[slug], t = T[id]; if (!t) return notFound();
  const tb = table(), pos = tb.findIndex(r => r.t === id) + 1, r = tb[pos-1], m = Object.fromEntries(leaders().map(x => [x.id, x]));
  const fx = FX.filter(f => f.home === id || f.away === id);
  const res = fx.filter(f => f.status === 'final').sort((a,b) => b.date - a.date), up = fx.filter(f => f.status !== 'final').sort((a,b) => a.date - b.date).slice(0, 3);
  const {xi, rest, has} = lineup(id);
  return `<section class="thead">${crest(id, 'lg')}<div><h1>${esc(t.name)}</h1><p class="muted">${r.gp ? `${ord(pos)} · ` : ''}${r.w}W ${r.d}D ${r.l}L · ${r.pts} pts</p>
  <button class="btn ${MYTEAM === id ? '' : 'ghost'} sm" data-act="follow" data-v="${id}" style="margin-top:8px">${MYTEAM === id ? '★ My team' : '☆ Set as my team'}</button></div></section>
  <section class="tinfo">
    <div class="card pad kit">${jersey(t)}<div><span class="k">Kit</span><p>${t.todo ? 'Colours to confirm' : 'Home colours'}</p></div></div>
    <div class="card pad rep"><span class="k">Team rep</span>${t.rep ? `<b>${esc(t.rep)}</b>` : ''}${t.email ? `<span class="row" style="gap:8px"><span class="email">${esc(t.email)}</span><button class="btn ghost sm" data-act="copy" data-v="${esc(t.email)}">Copy</button></span>` : ''}</div>
  </section>
  <section class="sec"><div class="sec-head"><h2>Squad</h2><span class="tag">${esc(t.formation)}</span></div>
    ${has ? `<figure class="pitch"><svg viewBox="0 0 300 430" role="img" aria-label="${esc(t.name)} squad">${pitchLines(430)}${xi.map((p,i) => { const [x,y] = FULL[SHAPE[i]]; return dot(id, p, SHAPE[i], x, y, m); }).join('')}</svg></figure>
    <h3>Rest of squad</h3>${restList(id, rest, m)}` : (SQUAD[id].length ? restList(id, SQUAD[id], m) : empty('Squad coming soon. The team rep sends the names once and we keep them updated.'))}
    <p class="small muted">${SQUAD[id].some(p => P[p].ph) ? '<b>Sample names</b> until the team sends its roster. ' : ''}⚽ goals, 👟 assists this season. Any player can ask to hide their name.</p></section>
  <section class="sec"><h2>Next matches</h2>${up.length ? `<div class="fxlist">${up.map(f => fxRow(f)).join('')}</div>` : empty('Season finished.')}</section>
  <section class="sec"><h2>Results</h2>${res.length ? `<div class="fxlist">${res.map(f => fxRow(f)).join('')}</div>` : empty('No results yet.')}</section>`;
};
V.match = code => {
  const f = FXI[code]; if (!f || !T[f.home] || !T[f.away]) return notFound();
  const fin = f.status === 'final';
  const gl = t => { const g = f.goals.filter(x => x.t === t); return g.length ? g.map(x => `<li>⚽ ${pname(x.s)}${x.a ? ` <small>👟 ${pname(x.a)}</small>` : ''}</li>`).join('') : `<li class="muted">${fin && (t === f.home ? f.hs : f.as) ? 'Scorers not reported yet' : 'No goals'}</li>`; };
  const ph = MEDIA.filter(x => x.fixture_id === f.id);
  return `<section class="sec"><p class="k">${f.week ? `Week ${f.week} · ` : ''}${fmtDay(f.date)} · ${fmtTime(f.date)} · ${esc(LEAGUE.venue || '')}</p>
  <div class="card board"><a class="side" href="#team-${T[f.home].slug}" style="color:inherit;text-decoration:none">${crest(f.home, 'lg')}<span class="nm">${tname(f.home)}</span></a>
    ${fin ? `<div class="big-sc">${f.hs}<span>–</span>${f.as}</div>` : `<div class="big-ko">${fmtTime(f.date)}</div>`}
    <a class="side" href="#team-${T[f.away].slug}" style="color:inherit;text-decoration:none">${crest(f.away, 'lg')}<span class="nm">${tname(f.away)}</span></a></div>
  <div class="row" style="justify-content:center">${pill(f)}<button class="btn ghost sm" data-act="share" data-v="${f.code}">Share</button></div></section>
  ${fin ? `<section class="sec"><h2>Goals</h2><div class="goals"><ul class="card">${gl(f.home)}</ul><ul class="card">${gl(f.away)}</ul></div></section>` : ''}
  ${matchLineups(f)}
  ${(() => { const hh = FX.filter(x => x.id !== f.id && ((x.home === f.home && x.away === f.away) || (x.home === f.away && x.away === f.home))).sort((a,b) => a.date - b.date);
    return hh.length ? `<section class="sec"><h2>Head-to-head this season</h2><div class="fxlist">${hh.map(x => fxRow(x)).join('')}</div></section>` : ''; })()}
  ${ph.length ? `<section class="sec"><h2>Photos & highlights</h2><div class="gal">${ph.map(mediaTile).join('')}</div></section>` : ''}`;
};
const mediaTile = x => x.kind === 'photo'
  ? `<a class="ph" href="${esc(x.url)}" target="_blank" rel="noopener" style="background:#1a2822 url('${esc(x.url)}') center/cover"><span>${esc(x.caption || '')}</span></a>`
  : `<a class="ph" href="${esc(x.url)}" target="_blank" rel="noopener" style="background:linear-gradient(135deg,#17734a,#13201a)"><span>▶ Highlights<small>${esc(x.caption || 'Watch on Instagram')}</small></span></a>`;
V.gallery = () => `<section class="sec"><h1>Gallery</h1><p class="muted">Selected photos and highlights by KB Media, posted when available and always with player consent.</p>
  ${MEDIA.length ? `<div class="gal">${MEDIA.slice(0, 24).map(mediaTile).join('')}</div>` : empty('No photos yet. Check back during the season.')}</section>`;
V.partners = () => `<section class="sec"><h1>Partners</h1>
  <p>Players and their friends check this site every week for scores and stats. Partner money keeps the site free for players.</p>
  ${SPONSORS.length ? `<div class="more">${SPONSORS.map(sponsorCard).join('')}</div>` : ''}
  <div class="tiers">
    <div class="card tier"><span class="k">Headline partner</span><span class="pr">$250</span><span class="small muted">per season · 1 spot</span><ul><li>Logo on every page</li><li>"Presented by" on the weekly Golden Boot graphic</li><li>Mention in match highlight posts</li></ul></div>
    <div class="card tier"><span class="k">Matchday partner</span><span class="pr">$150</span><span class="small muted">per season · 2 spots</span><ul><li>Logo on fixtures and results</li><li>Link to your website</li></ul></div>
    <div class="card tier"><span class="k">Supporter</span><span class="pr">$100</span><span class="small muted">per season</span><ul><li>Logo on the partner wall</li><li>Link to your website</li></ul></div>
  </div><p class="small muted">Interested? Message KB Media on Instagram.</p></section>`;
V.info = () => `<section class="sec"><h1>League info</h1><div class="card pad" style="display:flex;flex-direction:column;gap:12px">
  <p><b>Where.</b> ${esc(LEAGUE.venue || '')} (Vernon Toyota Indoor Sports Centre).</p>
  <p><b>When.</b> One game a week. Wednesday 7:00 or 8:40 PM, Saturday 6:00 or 7:40 PM. Games are 1 hour 20 minutes.</p>
  <p><b>Season.</b> Oct 14 to Dec 19, then Jan 6 to Mar 13. Playoffs Mar 17/20 and 24, final Mar 27.</p>
  <p><b>Joining.</b> You must be on a team. Registration and waivers stay on the <a href="https://vernonsoccer.ca/content/adult-indoor-soccer" target="_blank" rel="noopener">official VISC page</a>.</p>
  <p><b>Privacy.</b> Any player can hide their name and stats. Photos go up only with consent.</p></div></section>`;
V.more = () => `<section class="sec"><h1>More</h1><div class="more">
  <a class="card" href="#teams"><b>Teams</b><span>Squads, form and kits</span></a>
  <a class="card" href="#gallery"><b>Gallery</b><span>Match photos by KB Media</span></a>
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
  <section class="sec"><h2>Enter a result</h2><p class="small muted">For games no captain reported. Score only; scorers can come from captains later.</p>
    ${past.length ? `<div class="card pad" style="display:flex;flex-direction:column;gap:10px"><select class="sel" id="mr-fx" aria-label="Match">${past.map(f => `<option value="${f.id}">${fmtDay(f.date)} · ${esc(T[f.home].short)} v ${esc(T[f.away].short)}</option>`).join('')}</select>
    <div class="row"><input class="sel" id="mr-h" type="number" min="0" max="30" inputmode="numeric" placeholder="Home" style="width:90px"><span>–</span><input class="sel" id="mr-a" type="number" min="0" max="30" inputmode="numeric" placeholder="Away" style="width:90px"><button class="btn" data-act="manual">Save result</button></div></div>` : empty('No past games are missing a result.')}</section>
  <section class="sec"><h2>Upcoming fixtures</h2><div class="card">${upcoming.map(f => `<div class="adm-fx"><span><b>${esc(T[f.home].short)} v ${esc(T[f.away].short)}</b> <span class="muted">· ${fmtDay(f.date)} ${fmtTime(f.date)}</span> ${f.status === 'postponed' ? '<span class="tag loss">Postponed</span>' : ''}</span>
    <button class="btn ghost sm" data-act="postpone" data-v="${f.id}">${f.status === 'postponed' ? 'Restore' : 'Postpone'}</button></div>`).join('') || '<p class="pad muted">None.</p>'}</div></section>
  <section class="sec"><h2>Captain links</h2><p class="small muted">Send each link only to that team's captain or rep. Anyone with a link can report results for that team, and you still approve everything.</p>
    <div class="card">${ADM.tokens.filter(x => T[x.team_id]).map(x => `<div class="adm-fx"><span class="row" style="gap:8px;min-width:0">${crest(x.team_id)}<b>${tname(x.team_id)}</b></span><button class="btn ghost sm" data-act="copy" data-v="${base}?c=${x.token}#captain">Copy link</button></div>`).join('')}</div></section>`;
};
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
async function refresh() { await load(); await admLoad(); }

/* ---------- router & events ---------- */
const AFTER = {admin: () => { if (!ADM.loaded) admLoad(); }, captain: capLoad};
function render(top) {
  const h = location.hash.slice(1) || (TOKEN ? 'captain' : 'home'); let html, nav = 'more';
  if (h.startsWith('team-')) html = V.team(h.slice(5));
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
  else if (a === 'signout') { await sb.auth.signOut(); ADM = {session:null, isAdmin:false, subs:[], tokens:[], names:{}, err:'', loaded:true}; }
  else return;
  render(false);
}
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT') return; act(el.dataset.act, el.dataset.v, el); });
document.addEventListener('change', e => {
  const el = e.target, a = el.dataset.act; if (!a) return;
  if (a === 'fxteam') { fxTeam = el.value; render(false); return; }
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
