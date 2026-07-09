/* ==========================================================================
   IndustrCons — Application Logic
   Pure client-side. All persistence via localStorage. No backend calls.
   ========================================================================== */

const SAVE_KEY = 'industrcons_save_v1';
const CAREER_IDS = Object.keys(CAREERS);

/* ---------------------------------------------------------------------- */
/* State                                                                   */
/* ---------------------------------------------------------------------- */
function defaultState(){
  const careers = {};
  CAREER_IDS.forEach(id => {
    careers[id] = {
      xp: 0,
      unlockedUpTo: 0, // highest node index currently unlocked
      nodes: NODES.map(() => ({ completed: false, stars: 0 }))
    };
  });
  return {
    playerName: 'Engineer',
    totalXP: 0,
    lastCareer: null,
    careers,
    achievementsUnlocked: [],
    daily: { lastDate: null, streakCount: 0 },
    settings: { sound: true },
    arcadeBest: {},
    stats: { missionsCompleted: 0, maxSafety: 0, maxBudget: 0, maxTime: 0, maxQuality: 0, threeStarCount: 0 }
  };
}

let STATE = null;

function loadState(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // shallow-merge to survive schema additions between versions
    const base = defaultState();
    const merged = Object.assign({}, base, parsed);
    merged.careers = Object.assign({}, base.careers, parsed.careers || {});
    CAREER_IDS.forEach(id => {
      if(!merged.careers[id]) merged.careers[id] = base.careers[id];
      if(!merged.careers[id].nodes || merged.careers[id].nodes.length !== NODES.length){
        merged.careers[id].nodes = base.careers[id].nodes;
      }
    });
    merged.stats = Object.assign({}, base.stats, parsed.stats || {});
    merged.daily = Object.assign({}, base.daily, parsed.daily || {});
    merged.settings = Object.assign({}, base.settings, parsed.settings || {});
    merged.arcadeBest = Object.assign({}, parsed.arcadeBest || {});
    return merged;
  }catch(e){
    console.warn('IndustrCons: save data unreadable, starting fresh.', e);
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(SAVE_KEY, JSON.stringify(STATE));
  updateHeaderXP();
}

/* ---------------------------------------------------------------------- */
/* Utilities                                                               */
/* ---------------------------------------------------------------------- */
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function signed(n){ return (n > 0 ? '+' : '') + n; }
function pad2(n){ return n < 10 ? '0' + n : '' + n; }
function todayKey(d = new Date()){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function yesterdayKey(){ const d = new Date(); d.setDate(d.getDate()-1); return todayKey(d); }
function dayOfYearIndex(){
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}
function computeLevel(xp, span = 250){
  const level = 1 + Math.floor(xp / span);
  const into = xp % span;
  return { level, pct: Math.round((into / span) * 100), into, need: span - into };
}
function starsString(count){
  return '★★★☆☆☆'.slice(3 - count, 6 - count).padEnd(3, '☆').slice(0,3)
    .split('').map((c,i) => i < count ? '★' : '☆').join('');
}
function starsHtml(count){
  let out = '';
  for(let i=0;i<3;i++) out += i < count ? '★' : '☆';
  return out;
}

/* ---------------------------------------------------------------------- */
/* Sound (WebAudio, generated tones — zero external assets)               */
/* ---------------------------------------------------------------------- */
let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ audioCtx = null; }
  }
  if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function tone(freq, start, dur, type='sine', vol=0.06){
  if(!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, audioCtx.currentTime + start);
  gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + dur);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + start);
  osc.stop(audioCtx.currentTime + start + dur + 0.02);
}
function playSound(name){
  if(!STATE.settings.sound) return;
  ensureAudio();
  if(!audioCtx) return;
  switch(name){
    case 'click': tone(720, 0, 0.06, 'square', 0.04); break;
    case 'nav': tone(500, 0, 0.05, 'sine', 0.035); break;
    case 'success': tone(523,0,0.12); tone(659,0.1,0.12); tone(784,0.2,0.18); break;
    case 'fail': tone(300,0,0.15,'sawtooth',0.05); tone(180,0.12,0.22,'sawtooth',0.05); break;
    case 'unlock': tone(660,0,0.09); tone(880,0.09,0.09); tone(1046,0.18,0.24); break;
    case 'event': tone(880,0,0.08,'square',0.05); tone(660,0.12,0.08,'square',0.05); break;
    default: break;
  }
}

/* ---------------------------------------------------------------------- */
/* Toast                                                                   */
/* ---------------------------------------------------------------------- */
let toastTimer = null;
function showToast(msg, ms = 2200){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------------------------------------------------------------------- */
/* Screen routing                                                          */
/* ---------------------------------------------------------------------- */
const NAV_SCREENS = ['home','careers','daily','achievements','leaderboard','settings'];

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
  const target = document.getElementById('screen-' + id);
  if(target) target.classList.add('visible');
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function goTo(id){
  playSound('nav');
  if(id === 'home') renderHome();
  else if(id === 'careers') renderCareers();
  else if(id === 'daily') renderDaily();
  else if(id === 'achievements') renderAchievements();
  else if(id === 'leaderboard') renderLeaderboard();
  else if(id === 'settings') renderSettings();
  showScreen(id);
}

/* ---------------------------------------------------------------------- */
/* Header XP chip                                                          */
/* ---------------------------------------------------------------------- */
function updateHeaderXP(){
  const lv = computeLevel(STATE.totalXP);
  document.getElementById('lvlNum').textContent = lv.level;
  document.getElementById('lvlRing').style.setProperty('--pct', lv.pct + '%');
  document.getElementById('xpChipText').textContent = `${STATE.totalXP} XP`;
}

/* ---------------------------------------------------------------------- */
/* HOME                                                                    */
/* ---------------------------------------------------------------------- */
function renderHome(){
  updateHeaderXP();
  const lv = computeLevel(STATE.totalXP);
  document.getElementById('homeTotalXP').textContent = STATE.totalXP;
  document.getElementById('homeLevel').textContent = lv.level;
  document.getElementById('homeLevelBar').style.width = lv.pct + '%';

  const continueBtn = document.getElementById('btnContinue');
  if(STATE.lastCareer){
    continueBtn.style.display = 'inline-flex';
    continueBtn.onclick = () => openMap(STATE.lastCareer);
  } else {
    continueBtn.style.display = 'none';
  }

  const wrap = document.getElementById('homeCareerMini');
  wrap.innerHTML = '';
  CAREER_IDS.forEach(id => {
    const c = CAREERS[id];
    const cs = STATE.careers[id];
    const done = cs.nodes.filter(n => n.completed).length;
    const card = document.createElement('div');
    card.className = 'glass career-card';
    card.style.setProperty('--career-accent', c.accent);
    card.innerHTML = `
      <div class="cicon">${c.icon}</div>
      <div class="cinfo">
        <h3>${c.name}</h3>
        <p>${done}/${NODES.length} stages complete</p>
        <div class="clevel">${cs.xp} XP</div>
      </div>
      <div class="arrow">›</div>`;
    card.onclick = () => openMap(id);
    wrap.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  STATE = loadState();
  wireStaticEvents();
  renderHome();
  showScreen('home');
});

/* ---------------------------------------------------------------------- */
/* CAREER SELECT                                                           */
/* ---------------------------------------------------------------------- */
function renderCareers(){
  const wrap = document.getElementById('careerGrid');
  wrap.innerHTML = '';
  CAREER_IDS.forEach(id => {
    const c = CAREERS[id];
    const cs = STATE.careers[id];
    const done = cs.nodes.filter(n => n.completed).length;
    const lv = computeLevel(cs.xp, 150);
    const card = document.createElement('div');
    card.className = 'glass career-card';
    card.style.setProperty('--career-accent', c.accent);
    card.innerHTML = `
      <div class="cicon">${c.icon}</div>
      <div class="cinfo">
        <h3>${c.name}</h3>
        <p>${done}/${NODES.length} stages · Level ${lv.level}</p>
        <div class="clevel">${cs.xp} XP</div>
      </div>
      <div class="arrow">›</div>`;
    card.onclick = () => openMap(id);
    wrap.appendChild(card);
  });
}

function openMap(careerId){
  STATE.lastCareer = careerId;
  saveState();
  renderMap(careerId);
  showScreen('map');
}

/* ---------------------------------------------------------------------- */
/* MISSION MAP (candy-crush style winding path)                           */
/* ---------------------------------------------------------------------- */
let currentMapCareer = null;

function renderMap(careerId){
  currentMapCareer = careerId;
  const c = CAREERS[careerId];
  const cs = STATE.careers[careerId];
  const lv = computeLevel(cs.xp, 150);

  document.getElementById('mapCareerIcon').textContent = c.icon;
  document.getElementById('mapCareerName').textContent = c.name;
  document.getElementById('mapCareerSub').textContent = `Level ${lv.level} · ${cs.xp} XP`;

  const n = NODES.length;
  const yStep = 148;
  const topPad = 70, botPad = 70;
  const height = (n - 1) * yStep + topPad + botPad;
  const xPattern = [50, 74, 50, 26, 50, 74, 50, 26, 50];

  const points = [];
  for(let i = 0; i < n; i++){
    const y = height - botPad - i * yStep; // node 0 at bottom, climbs upward
    points.push({ x: xPattern[i % xPattern.length], y });
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for(let i = 1; i < points.length; i++){
    const prev = points[i-1], p = points[i];
    const midY = (prev.y + p.y) / 2;
    d += ` Q ${prev.x} ${midY}, ${(prev.x+p.x)/2} ${midY} T ${p.x} ${p.y}`;
  }

  const wrap = document.getElementById('mapWrap');
  wrap.innerHTML = `
    <svg class="map-svg-layer" viewBox="0 0 100 ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="pathGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#00E5FF"/>
          <stop offset="100%" stop-color="#FFD700"/>
        </linearGradient>
      </defs>
      <path class="map-path-line" d="${d}" />
    </svg>
    <div class="map-nodes" style="--map-height:${height}px; height:${height}px;"></div>`;

  const nodesEl = wrap.querySelector('.map-nodes');
  points.forEach((p, i) => {
    const nodeState = cs.nodes[i];
    const unlocked = i <= cs.unlockedUpTo;
    const isCurrent = unlocked && !nodeState.completed && i === cs.unlockedUpTo;
    const cls = ['map-node'];
    cls.push(unlocked ? 'unlocked' : 'locked');
    if(nodeState.completed) cls.push('completed');
    if(isCurrent) cls.push('current');

    const el = document.createElement('div');
    el.className = cls.join(' ');
    el.style.left = p.x + '%';
    el.style.top = p.y + 'px';
    el.innerHTML = `
      <div class="badge">${NODES[i].icon}${!unlocked ? '<span class="lock-ic">🔒</span>' : ''}</div>
      <div class="label">${NODES[i].name}</div>
      <div class="stars">${nodeState.completed ? starsHtml(nodeState.stars) : ''}</div>`;
    if(unlocked){
      el.querySelector('.badge').onclick = () => startMission(careerId, i);
    } else {
      el.querySelector('.badge').onclick = () => { playSound('fail'); showToast('🔒 Complete the previous stage first'); };
    }
    nodesEl.appendChild(el);
  });
}

/* ---------------------------------------------------------------------- */
/* MISSION GAMEPLAY                                                        */
/* ---------------------------------------------------------------------- */
let session = null;

function startMission(careerId, nodeIndex){
  session = {
    careerId, nodeIndex,
    scenario: generateScenario(careerId, nodeIndex),
    runStats: { safety: 50, budget: 50, time: 50, quality: 50 },
    xpEarned: 0
  };
  renderMission();
  showScreen('mission');
}

function renderMission(){
  const c = CAREERS[session.careerId];
  const sc = session.scenario;
  document.getElementById('missionIcon').textContent = sc.title.split(' ')[0];
  document.getElementById('missionTitle').textContent = sc.title.replace(/^\S+\s/, '');
  document.getElementById('missionRole').textContent = c.name.toUpperCase() + ' · STAGE ' + (session.nodeIndex + 1) + '/' + NODES.length;
  document.getElementById('missionSituation').textContent = sc.situation;
  updateMissionBars();

  const list = document.getElementById('missionOptions');
  list.innerHTML = '';
  sc.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<div class="opt-label"><span class="opt-key">${opt.key}</span>${opt.label}</div><div class="opt-hint">${opt.hint}</div>`;
    btn.onclick = () => selectOption(i);
    list.appendChild(btn);
  });
}

function updateMissionBars(){
  const rs = session.runStats;
  ['safety','budget','time','quality'].forEach(k => {
    document.getElementById('bar' + capitalize(k)).style.width = rs[k] + '%';
    document.getElementById('val' + capitalize(k)).textContent = rs[k];
  });
}
function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

function applyDeltas(deltas){
  ['safety','budget','time','quality'].forEach(k => {
    if(deltas[k] != null) session.runStats[k] = clamp(session.runStats[k] + deltas[k], 0, 100);
  });
  session.xpEarned += (deltas.xp != null ? deltas.xp : 6);
}

function disableOptions(){
  document.querySelectorAll('#missionOptions .option-btn').forEach(b => { b.style.pointerEvents = 'none'; b.style.opacity = '.55'; });
}
function disableEventOptions(){
  document.querySelectorAll('#eventOptions .option-btn').forEach(b => { b.style.pointerEvents = 'none'; b.style.opacity = '.55'; });
}

function selectOption(i){
  const opt = session.scenario.options[i];
  disableOptions();
  playSound('click');
  showToast(opt.feedback, 1600);
  applyDeltas(opt.deltas);
  updateMissionBars();
  setTimeout(() => {
    maybeTriggerEvent(() => finishMission());
  }, 950);
}

/* ---------------------------------------------------------------------- */
/* ARCADE — standalone mini-games, playable any time (see minigames.js)    */
/* ---------------------------------------------------------------------- */
function goArcade(){
  playSound('nav');
  renderArcade();
  showScreen('arcade');
}

function renderArcade(){
  const grid = document.getElementById('arcadeGrid');
  grid.innerHTML = '';
  ARCADE_GAMES.forEach(g => {
    const best = (STATE.arcadeBest && STATE.arcadeBest[g.id]) || 0;
    const card = document.createElement('div');
    card.className = 'glass arcade-card';
    card.innerHTML = `
      <div class="cicon">${g.icon}</div>
      <div class="cinfo">
        <h3>${g.title}</h3>
        <p>${g.desc}</p>
        <div class="clevel">Best: ${best}/100</div>
      </div>
      <div class="arrow">▶</div>`;
    card.onclick = () => playArcadeGame(g.id);
    grid.appendChild(card);
  });
}

function playArcadeGame(gameId){
  const game = ARCADE_GAMES.find(g => g.id === gameId);
  if(!game) return;
  const overlay = document.getElementById('minigameOverlay');
  const body = document.getElementById('minigameBody');
  const skipBtn = document.getElementById('mgSkipBtn');
  overlay.classList.add('visible');
  skipBtn.style.display = 'none';
  const finish = (score, label) => {
    overlay.classList.remove('visible');
    skipBtn.style.display = '';
    if(!STATE.arcadeBest) STATE.arcadeBest = {};
    STATE.arcadeBest[gameId] = Math.max(STATE.arcadeBest[gameId] || 0, score);
    const gain = Math.round((score / 100) * 25);
    STATE.totalXP += gain;
    const newly = checkAchievements();
    saveState();
    playSound(score >= 70 ? 'success' : 'fail');
    showToast(`${label} · +${gain} XP`, 2400);
    newly.forEach(a => setTimeout(() => showToast(`🏅 ${a.name} unlocked!`, 2400), 700));
    renderArcade();
  };
  game.run(body, finish);
}

function maybeTriggerEvent(cb){
  if(Math.random() < 0.4){
    const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
    showEventOverlay(ev, cb);
  } else {
    cb();
  }
}

function showEventOverlay(ev, cb){
  playSound('event');
  document.getElementById('eventIcon').textContent = ev.icon;
  document.getElementById('eventText').textContent = ev.text;
  const opts = document.getElementById('eventOptions');
  opts.innerHTML = '';
  ev.options.forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<div class="opt-label">${o.label}</div>`;
    btn.onclick = () => {
      disableEventOptions();
      playSound('click');
      applyDeltas(o.deltas);
      updateMissionBars();
      document.getElementById('eventOverlay').classList.remove('visible');
      setTimeout(cb, 250);
    };
    opts.appendChild(btn);
  });
  document.getElementById('eventOverlay').classList.add('visible');
}

/* ---------------------------------------------------------------------- */
/* RESULTS + persistence                                                   */
/* ---------------------------------------------------------------------- */
function finishMission(){
  const rs = session.runStats;
  const score = clamp(Math.round(rs.safety*0.3 + rs.budget*0.2 + rs.time*0.2 + rs.quality*0.3), 0, 100);
  const stars = score >= 85 ? 3 : score >= 65 ? 2 : score >= 40 ? 1 : 0;
  const passed = stars >= 1;
  const starBonus = stars * 15;
  const totalGain = session.xpEarned + starBonus;

  const cs = STATE.careers[session.careerId];
  cs.xp += totalGain;
  STATE.totalXP += totalGain;

  const nodeState = cs.nodes[session.nodeIndex];
  nodeState.stars = Math.max(nodeState.stars || 0, stars);
  if(passed){
    nodeState.completed = true;
    cs.unlockedUpTo = Math.max(cs.unlockedUpTo, Math.min(session.nodeIndex + 1, NODES.length - 1));
  }

  STATE.stats.missionsCompleted++;
  STATE.stats.maxSafety = Math.max(STATE.stats.maxSafety, rs.safety);
  STATE.stats.maxBudget = Math.max(STATE.stats.maxBudget, rs.budget);
  STATE.stats.maxTime = Math.max(STATE.stats.maxTime, rs.time);
  STATE.stats.maxQuality = Math.max(STATE.stats.maxQuality, rs.quality);
  if(stars === 3) STATE.stats.threeStarCount++;
  STATE.lastCareer = session.careerId;

  const newly = checkAchievements();
  saveState();

  session.result = { score, stars, passed, totalGain, newly };
  playSound(passed ? 'success' : 'fail');
  renderResults();
  showScreen('results');
}

function checkAchievements(){
  STATE.dailyStreakCount = STATE.daily.streakCount;
  const newly = [];
  ACHIEVEMENTS.forEach(a => {
    if(!STATE.achievementsUnlocked.includes(a.id)){
      try{
        if(a.check(STATE)){ STATE.achievementsUnlocked.push(a.id); newly.push(a); }
      }catch(e){ /* ignore malformed check */ }
    }
  });
  return newly;
}

function renderResults(){
  const r = session.result;
  const rs = session.runStats;
  document.getElementById('scoreRing').style.setProperty('--score', r.score);
  document.getElementById('scoreVal').textContent = r.score + '%';
  document.getElementById('starsEarned').textContent = starsHtml(r.stars);
  document.getElementById('resultTitle').textContent = r.passed
    ? (r.stars === 3 ? 'Outstanding Execution' : 'Stage Passed') : 'Stage Failed — Try Again';
  document.getElementById('xpBanner').textContent = `⚡ +${r.totalGain} XP EARNED`;

  const deltaEl = (id, val) => {
    const el = document.getElementById(id);
    const diff = val - 50;
    el.textContent = signed(diff);
    el.className = 'dv ' + (diff > 0 ? 'delta-pos' : diff < 0 ? 'delta-neg' : '');
  };
  deltaEl('dSafety', rs.safety);
  deltaEl('dBudget', rs.budget);
  deltaEl('dTime', rs.time);
  deltaEl('dQuality', rs.quality);

  const badgesWrap = document.getElementById('resultBadges');
  badgesWrap.innerHTML = '';
  r.newly.forEach(a => {
    const div = document.createElement('div');
    div.className = 'glass badge-unlock';
    div.innerHTML = `<div class="bic">${a.icon}</div><div><b>Achievement Unlocked</b><span>${a.name} — ${a.desc}</span></div>`;
    badgesWrap.appendChild(div);
  });
  if(r.newly.length) playSound('unlock');

  const nextBtn = document.getElementById('btnNextMission');
  const isLast = session.nodeIndex === NODES.length - 1;
  if(!r.passed){
    nextBtn.textContent = '🔁 Retry Mission';
    nextBtn.onclick = () => startMission(session.careerId, session.nodeIndex);
  } else if(isLast){
    nextBtn.textContent = '🏆 Career Complete — View Map';
    nextBtn.onclick = () => { renderMap(session.careerId); showScreen('map'); };
  } else {
    nextBtn.textContent = 'Next Mission →';
    nextBtn.onclick = () => startMission(session.careerId, session.nodeIndex + 1);
  }
  document.getElementById('btnBackToMap').onclick = () => { renderMap(session.careerId); showScreen('map'); };
}

/* ---------------------------------------------------------------------- */
/* DAILY CHALLENGE                                                         */
/* ---------------------------------------------------------------------- */
function renderDaily(){
  const idx = dayOfYearIndex() % DAILY_CHALLENGES.length;
  const ch = DAILY_CHALLENGES[idx];
  const today = todayKey();
  const alreadyDone = STATE.daily.lastDate === today;

  document.getElementById('dailyStreakPill').textContent = `🔥 ${STATE.daily.streakCount}-day streak`;
  document.getElementById('dailyCard').style.display = alreadyDone ? 'none' : 'block';
  document.getElementById('dailyOptions').style.display = alreadyDone ? 'none' : 'flex';
  document.getElementById('dailyDoneCard').style.display = alreadyDone ? 'block' : 'none';
  if(alreadyDone) return;

  document.getElementById('dailyCard').querySelector('.dic').textContent = ch.icon;
  document.getElementById('dailyTitle').textContent = ch.title;
  document.getElementById('dailySituation').textContent = ch.situation;

  const list = document.getElementById('dailyOptions');
  list.innerHTML = '';
  ch.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<div class="opt-label">${opt.label}</div><div class="opt-hint">${opt.hint || ''}</div>`;
    btn.onclick = () => completeDaily(idx, i);
    list.appendChild(btn);
  });
}

function completeDaily(idx, optIndex){
  const ch = DAILY_CHALLENGES[idx];
  const opt = ch.options[optIndex];
  playSound('click');
  const today = todayKey();
  const yest = yesterdayKey();
  STATE.daily.streakCount = (STATE.daily.lastDate === yest) ? STATE.daily.streakCount + 1 : 1;
  STATE.daily.lastDate = today;
  const gain = (opt.deltas && opt.deltas.xp) || 15;
  STATE.totalXP += gain;
  const newly = checkAchievements();
  saveState();
  playSound('success');
  showToast(`✅ Daily challenge complete · +${gain} XP`, 2600);
  newly.forEach(a => setTimeout(() => showToast(`🏅 ${a.name} unlocked!`, 2400), 700));
  renderDaily();
}

/* ---------------------------------------------------------------------- */
/* ACHIEVEMENTS                                                            */
/* ---------------------------------------------------------------------- */
function renderAchievements(){
  const grid = document.getElementById('achvGrid');
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const unlocked = STATE.achievementsUnlocked.includes(a.id);
    const card = document.createElement('div');
    card.className = 'glass achv-card' + (unlocked ? ' unlocked' : '');
    card.innerHTML = `<div class="aic">${a.icon}</div><b>${a.name}</b><p>${a.desc}</p>`;
    grid.appendChild(card);
  });
}

/* ---------------------------------------------------------------------- */
/* LEADERBOARD (local/demo only)                                           */
/* ---------------------------------------------------------------------- */
function renderLeaderboard(){
  const rows = LEADERBOARD_SEED.map(r => ({ ...r, isMe: false }));
  rows.push({ name: STATE.playerName || 'You', role: 'You', xp: STATE.totalXP, isMe: true });
  rows.sort((a,b) => b.xp - a.xp);

  const wrap = document.getElementById('lbList');
  wrap.innerHTML = '';
  rows.forEach((r, i) => {
    const rank = i + 1;
    const row = document.createElement('div');
    row.className = `glass lb-row ${rank<=3 ? 'top'+rank : ''} ${r.isMe ? 'me' : ''}`;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    row.innerHTML = `
      <div class="rank">${medal}</div>
      <div class="who"><b>${r.name}${r.isMe ? ' (you)' : ''}</b><span>${r.role}</span></div>
      <div class="xpval">${r.xp} XP</div>`;
    wrap.appendChild(row);
  });
}

/* ---------------------------------------------------------------------- */
/* SETTINGS                                                                */
/* ---------------------------------------------------------------------- */
function renderSettings(){
  const sw = document.getElementById('settingsSoundSwitch');
  sw.classList.toggle('on', STATE.settings.sound);
  document.getElementById('playerNameInput').value = STATE.playerName;
}

function wireStaticEvents(){
  document.querySelectorAll('.navbtn').forEach(btn => {
    btn.addEventListener('click', () => goTo(btn.dataset.nav));
  });

  document.getElementById('btnPlay').onclick = () => goTo('careers');
  document.getElementById('btnDailyHome').onclick = () => goTo('daily');
  document.getElementById('btnArcadeHome').onclick = () => goArcade();
  document.getElementById('btnArcadeBack').onclick = () => goTo('home');

  document.getElementById('soundToggle').onclick = () => {
    ensureAudio();
    STATE.settings.sound = !STATE.settings.sound;
    document.getElementById('soundToggle').textContent = STATE.settings.sound ? '🔊' : '🔇';
    document.getElementById('soundToggle').classList.toggle('active', !STATE.settings.sound);
    saveState();
    if(STATE.settings.sound) playSound('click');
  };
  document.getElementById('soundToggle').textContent = STATE.settings.sound ? '🔊' : '🔇';

  document.getElementById('settingsSoundSwitch').onclick = () => {
    ensureAudio();
    STATE.settings.sound = !STATE.settings.sound;
    renderSettings();
    document.getElementById('soundToggle').textContent = STATE.settings.sound ? '🔊' : '🔇';
    saveState();
    if(STATE.settings.sound) playSound('click');
  };

  document.getElementById('playerNameInput').addEventListener('change', (e) => {
    STATE.playerName = (e.target.value || 'Engineer').trim().slice(0,18) || 'Engineer';
    saveState();
  });

  document.getElementById('btnResetProgress').onclick = () => {
    if(confirm('Reset all IndustrCons progress on this device? This cannot be undone.')){
      localStorage.removeItem(SAVE_KEY);
      STATE = defaultState();
      saveState();
      showToast('Progress reset.');
      goTo('home');
    }
  };

  document.getElementById('btnNextMission').onclick = () => {};
  document.getElementById('btnBackToMap').onclick = () => {};

  document.addEventListener('click', () => ensureAudio(), { once: true });
}
