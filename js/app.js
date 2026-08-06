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
    settings: { sound: true, theme: 'dark', skin: 'industrial' },
    arcadeBest: {},
    stats: { missionsCompleted: 0, maxSafety: 0, maxBudget: 0, maxTime: 0, maxQuality: 0, threeStarCount: 0 },
    coins: 0,
    gems: 0,
    wishlist: [],
    favorites: [],
    activityLog: [],
    login: { lastDate: null, streak: 0 },
    weekly: { weekKey: null, counts: {}, claimed: [] },
    monthly: { monthKey: null, counts: {}, claimed: [], levelAtMonthStart: 1 },
    statTotals: { safety: 0, budget: 0, time: 0, quality: 0, count: 0 }
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
    merged.wishlist = Array.isArray(parsed.wishlist) ? parsed.wishlist : [];
    merged.favorites = Array.isArray(parsed.favorites) ? parsed.favorites : [];
    merged.activityLog = Array.isArray(parsed.activityLog) ? parsed.activityLog : [];
    merged.login = Object.assign({}, base.login, parsed.login || {});
    merged.weekly = Object.assign({}, base.weekly, parsed.weekly || {});
    merged.monthly = Object.assign({}, base.monthly, parsed.monthly || {});
    merged.statTotals = Object.assign({}, base.statTotals, parsed.statTotals || {});
    merged.coins = typeof parsed.coins === 'number' ? parsed.coins : 0;
    merged.gems = typeof parsed.gems === 'number' ? parsed.gems : 0;
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
/* Week/Month keys + rolling objective counters                            */
/* ---------------------------------------------------------------------- */
function weekKey(d = new Date()){
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - start) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}
function monthKey(d = new Date()){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }

function ensurePeriodsFresh(){
  const wk = weekKey(), mk = monthKey();
  if(STATE.weekly.weekKey !== wk){ STATE.weekly = { weekKey: wk, counts: {}, claimed: [] }; }
  if(STATE.monthly.monthKey !== mk){
    STATE.monthly = { monthKey: mk, counts: {}, claimed: [], levelAtMonthStart: computeLevel(STATE.totalXP).level };
  }
}
function bumpMetric(period, metric, amount = 1){
  const bucket = period === 'week' ? STATE.weekly : STATE.monthly;
  bucket.counts[metric] = (bucket.counts[metric] || 0) + amount;
}
function metricValue(period, metric){
  const bucket = period === 'week' ? STATE.weekly : STATE.monthly;
  if(metric === 'levelsThisMonth'){
    return Math.max(0, computeLevel(STATE.totalXP).level - (STATE.monthly.levelAtMonthStart || 1));
  }
  return bucket.counts[metric] || 0;
}

/* ---------------------------------------------------------------------- */
/* Activity log (powers Recently Played + Dashboard heatmap/timeline)      */
/* ---------------------------------------------------------------------- */
function logActivity(type, label, xp){
  STATE.activityLog.unshift({ date: todayKey(), type, label, xp, ts: Date.now() });
  if(STATE.activityLog.length > 200) STATE.activityLog.length = 200;
}

/* ---------------------------------------------------------------------- */
/* Coins & Gems                                                            */
/* ---------------------------------------------------------------------- */
function awardCurrency(xpGain, gemBonus = 0){
  const coins = Math.max(1, Math.round(xpGain * 0.6));
  STATE.coins += coins;
  if(gemBonus > 0) STATE.gems += gemBonus;
  return coins;
}

/* ---------------------------------------------------------------------- */
/* Theme (dark / light)                                                    */
/* ---------------------------------------------------------------------- */
function applyTheme(){
  document.documentElement.setAttribute('data-theme', STATE.settings.theme === 'light' ? 'light' : 'dark');
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = STATE.settings.theme === 'light' ? '☀️' : '🌙';
}

/* ---------------------------------------------------------------------- */
/* Confetti (lightweight canvas burst, no libraries)                       */
/* ---------------------------------------------------------------------- */
let confettiCtx = null, confettiParticles = [], confettiRAF = null;
function initConfetti(){
  const canvas = document.getElementById('confettiCanvas');
  if(!canvas) return;
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);
  confettiCtx = canvas.getContext('2d');
}
function burstConfetti(count = 60){
  if(!confettiCtx) return;
  const canvas = document.getElementById('confettiCanvas');
  const colors = ['#FFC400', '#00E5FF', '#7C4DFF', '#00FFA3', '#FF6B35'];
  for(let i = 0; i < count; i++){
    confettiParticles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height * 0.3,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * -6 - 3,
      size: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 12,
      life: 0
    });
  }
  if(!confettiRAF) confettiRAF = requestAnimationFrame(confettiStep);
}
function confettiStep(){
  const canvas = document.getElementById('confettiCanvas');
  confettiCtx.clearRect(0, 0, canvas.width, canvas.height);
  confettiParticles.forEach(p => {
    p.vy += 0.18; p.x += p.vx; p.y += p.vy; p.rot += p.vrot; p.life++;
    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot * Math.PI / 180);
    confettiCtx.fillStyle = p.color;
    confettiCtx.globalAlpha = clamp(1 - p.life / 110, 0, 1);
    confettiCtx.fillRect(-p.size/2, -p.size/2, p.size, p.size * 0.6);
    confettiCtx.restore();
  });
  confettiParticles = confettiParticles.filter(p => p.life < 110 && p.y < canvas.height + 40);
  if(confettiParticles.length){ confettiRAF = requestAnimationFrame(confettiStep); }
  else { confettiRAF = null; }
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

  renderProfileBar();
  renderLoginReward();
  renderHomeRows();
}

/* ---------------------------------------------------------------------- */
/* Player profile bar (level, avatar frame, coins, gems)                  */
/* ---------------------------------------------------------------------- */
function bestUnlockedFrame(){
  let best = AVATAR_FRAMES[0];
  AVATAR_FRAMES.forEach(f => {
    if(!f.unlock){ return; }
    const ok = f.unlock.type === 'xp' ? STATE.totalXP >= f.unlock.value
      : STATE.achievementsUnlocked.includes(f.unlock.value);
    if(ok) best = f;
  });
  return best;
}
function renderProfileBar(){
  const lv = computeLevel(STATE.totalXP);
  const frame = bestUnlockedFrame();
  const avatar = document.getElementById('profileAvatar');
  avatar.className = 'profile-avatar ' + frame.cssClass;
  avatar.textContent = CAREERS[STATE.lastCareer]?.icon || '👷';
  document.getElementById('profileName').textContent = STATE.playerName || 'Engineer';
  document.getElementById('profileLevelText').textContent = `Level ${lv.level} · ${STATE.totalXP} XP · ${frame.name}`;
  document.getElementById('profileCoins').textContent = STATE.coins;
  document.getElementById('profileGems').textContent = STATE.gems;
}

/* ---------------------------------------------------------------------- */
/* Daily login reward (separate from the scenario-based Daily Challenge)  */
/* ---------------------------------------------------------------------- */
function renderLoginReward(){
  const today = todayKey();
  const claimed = STATE.login.lastDate === today;
  const btn = document.getElementById('btnClaimLogin');
  const sub = document.getElementById('loginRewardSub');
  if(claimed){
    btn.textContent = 'Claimed ✓';
    btn.disabled = true;
    sub.textContent = `${STATE.login.streak}-day login streak — come back tomorrow`;
  } else {
    btn.textContent = 'Claim';
    btn.disabled = false;
    sub.textContent = `Day ${STATE.login.streak + 1} — claim your coins`;
  }
}
function claimLoginReward(){
  const today = todayKey(), yest = yesterdayKey();
  if(STATE.login.lastDate === today) return;
  STATE.login.streak = (STATE.login.lastDate === yest) ? STATE.login.streak + 1 : 1;
  STATE.login.lastDate = today;
  const coins = 20 + Math.min(STATE.login.streak, 10) * 5;
  STATE.coins += coins;
  saveState();
  playSound('success');
  showToast(`🎁 +${coins} coins · ${STATE.login.streak}-day streak`, 2400);
  renderLoginReward();
  renderProfileBar();
}

/* ---------------------------------------------------------------------- */
/* Home rows: Continue / Trending / New Releases / Recently Played         */
/* ---------------------------------------------------------------------- */
function buildHrowCard(opts){
  const el = document.createElement('div');
  el.className = 'glass hrow-card';
  el.style.setProperty('--gc-accent', opts.accent || 'var(--primary)');
  el.innerHTML = `
    <div class="hc-icon">${opts.icon}</div>
    <div class="hc-title">${opts.title}${opts.badge ? ` <span class="pill" style="color:var(--yellow);border-color:var(--yellow);">${opts.badge}</span>` : ''}</div>
    <div class="hc-sub">${opts.sub}</div>
    ${opts.progressPct != null ? `<div class="hc-progress"><div class="hc-progress-fill" style="width:${opts.progressPct}%"></div></div>` : ''}`;
  el.onclick = opts.onClick;
  return el;
}

function renderHomeRows(){
  // Continue Learning
  const contWrap = document.getElementById('continueRow');
  const contTitle = document.getElementById('continueRowTitle');
  contWrap.innerHTML = '';
  if(STATE.lastCareer && CAREERS[STATE.lastCareer]){
    const id = STATE.lastCareer, c = CAREERS[id], cs = STATE.careers[id];
    const done = cs.nodes.filter(n => n.completed).length;
    contWrap.appendChild(buildHrowCard({
      icon: c.icon, accent: c.accent, title: c.name,
      sub: `Stage ${Math.min(cs.unlockedUpTo + 1, NODES.length)}/${NODES.length}`,
      progressPct: Math.round((done / NODES.length) * 100),
      onClick: () => openMap(id)
    }));
    contTitle.style.display = ''; contWrap.style.display = 'flex';
  } else {
    contTitle.style.display = 'none'; contWrap.style.display = 'none';
  }

  // Trending Games — top-rated careers
  const trendWrap = document.getElementById('trendingRow');
  trendWrap.innerHTML = '';
  [...CAREER_IDS].sort((a,b) => (CAREERS[b].rating||0) - (CAREERS[a].rating||0)).slice(0,5).forEach(id => {
    const c = CAREERS[id], cs = STATE.careers[id];
    const done = cs.nodes.filter(n => n.completed).length;
    trendWrap.appendChild(buildHrowCard({
      icon: c.icon, accent: c.accent, title: c.name, sub: `⭐ ${c.rating} · ${c.players} players`,
      progressPct: Math.round((done / NODES.length) * 100),
      onClick: () => openMap(id)
    }));
  });

  // New Releases
  const newWrap = document.getElementById('newReleasesRow');
  newWrap.innerHTML = '';
  ['architect','mepEngineer'].forEach(id => {
    const c = CAREERS[id];
    newWrap.appendChild(buildHrowCard({ icon: c.icon, accent: c.accent, title: c.name, sub: c.tagline, badge: 'NEW', onClick: () => openMap(id) }));
  });
  ['whack','tally'].forEach(gid => {
    const g = ARCADE_GAMES.find(x => x.id === gid);
    if(!g) return;
    newWrap.appendChild(buildHrowCard({ icon: g.icon, accent: '#FFC400', title: g.title, sub: 'Arcade', badge: 'NEW', onClick: () => goArcade() }));
  });

  // Recently Played
  const recWrap = document.getElementById('recentRow');
  const recTitle = document.getElementById('recentRowTitle');
  recWrap.innerHTML = '';
  const recent = STATE.activityLog.slice(0, 6);
  if(recent.length){
    recent.forEach(a => {
      recWrap.appendChild(buildHrowCard({
        icon: a.type === 'arcade' ? '🎮' : a.type === 'daily' ? '🗓️' : '🏗️',
        title: a.label, sub: `${a.date}${a.xp ? ' · +' + a.xp + ' XP' : ''}`,
        onClick: () => goTo('careers')
      }));
    });
    recTitle.style.display = ''; recWrap.style.display = 'flex';
  } else {
    recTitle.style.display = 'none'; recWrap.style.display = 'none';
  }
}

/* ---------------------------------------------------------------------- */
/* Hero carousel (auto-sliding)                                            */
/* ---------------------------------------------------------------------- */
let carouselIndex = 0, carouselTimer = null;
function initCarousel(){
  const track = document.getElementById('carouselTrack');
  const dotsWrap = document.getElementById('carouselDots');
  if(!track) return;
  const slides = track.children.length;
  dotsWrap.innerHTML = '';
  for(let i = 0; i < slides; i++){
    const dot = document.createElement('div');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.onclick = () => goToSlide(i);
    dotsWrap.appendChild(dot);
  }
  carouselTimer = setInterval(() => goToSlide((carouselIndex + 1) % slides), 5000);
}
function goToSlide(i){
  carouselIndex = i;
  const track = document.getElementById('carouselTrack');
  track.style.transform = `translateX(-${i * 100}%)`;
  document.querySelectorAll('.carousel-dot').forEach((d, idx) => d.classList.toggle('active', idx === i));
}

document.addEventListener('DOMContentLoaded', () => {
  STATE = loadState();
  ensurePeriodsFresh();
  applyTheme();
  applySkin(STATE.settings.skin || 'industrial');
  initConfetti();
  initCarousel();
  wireStaticEvents();
  renderHome();
  showScreen('home');
});

/* ---------------------------------------------------------------------- */
/* CAREER SELECT                                                           */
/* ---------------------------------------------------------------------- */
function toggleListMembership(list, id){
  const i = list.indexOf(id);
  if(i === -1){ list.push(id); return true; }
  list.splice(i, 1); return false;
}

function shareItem(title, url){
  if(navigator.share){
    navigator.share({ title, url }).catch(() => {});
  } else if(navigator.clipboard){
    navigator.clipboard.writeText(url).then(() => showToast('🔗 Link copied to clipboard'));
  } else {
    showToast('Share this: ' + url, 3000);
  }
}

/**
 * Builds a rich, premium game card (cover, difficulty, time, skills, rating,
 * players, mentor tip, progress bar, and Play/Wishlist/Favorite/Share actions).
 */
function buildGameCard(cfg){
  const wishId = cfg.kind + ':' + cfg.id;
  const isWishlisted = STATE.wishlist.includes(wishId);
  const isFavorited = STATE.favorites.includes(wishId);
  const card = document.createElement('div');
  card.className = 'glass game-card';
  card.style.setProperty('--gc-accent', cfg.accent || 'var(--primary)');
  card.innerHTML = `
    <div class="gc-top">
      <div class="gc-cover">${cfg.icon}</div>
      <div class="gc-head">
        <h3>${cfg.title}</h3>
        <div class="gc-tagline">${cfg.tagline}</div>
      </div>
    </div>
    <div class="gc-meta-row">
      <span class="gc-tag difficulty-${cfg.difficulty.toLowerCase()}">${cfg.difficulty}</span>
      <span class="gc-tag">⏱️ ${cfg.estMinutes}</span>
      <span class="gc-tag">⚡ ${cfg.xpText}</span>
    </div>
    <div class="gc-skills">${cfg.skills.map(s => `<span class="gc-skill-chip">${s}</span>`).join('')}</div>
    <div class="gc-stats-row">
      <span class="gc-rating">⭐ ${cfg.rating}</span>
      <span>👥 ${cfg.players} players</span>
    </div>
    <div class="gc-progress-row">
      <div class="gc-progress-track"><div class="gc-progress-fill" style="width:${cfg.progressPct}%"></div></div>
      <div class="gc-progress-pct">${cfg.progressPct}%</div>
    </div>
    <div class="gc-mentor">💬 <b>Mentor tip:</b> ${cfg.mentorTip}</div>
    <div class="gc-actions">
      <button class="btn btn-primary" data-act="play">▶ Play</button>
      <button class="gc-icon-btn ${isWishlisted ? 'wishlisted' : ''}" data-act="wishlist" title="Wishlist">🔖</button>
      <button class="gc-icon-btn ${isFavorited ? 'active' : ''}" data-act="favorite" title="Favorite">❤️</button>
      <button class="gc-icon-btn" data-act="share" title="Share">📤</button>
    </div>`;
  card.querySelector('[data-act="play"]').onclick = () => { playSound('click'); cfg.onPlay(); };
  card.querySelector('[data-act="wishlist"]').onclick = (e) => {
    e.stopPropagation();
    const on = toggleListMembership(STATE.wishlist, wishId);
    saveState();
    e.currentTarget.classList.toggle('wishlisted', on);
    showToast(on ? '🔖 Added to wishlist' : 'Removed from wishlist', 1400);
  };
  card.querySelector('[data-act="favorite"]').onclick = (e) => {
    e.stopPropagation();
    const on = toggleListMembership(STATE.favorites, wishId);
    saveState();
    e.currentTarget.classList.toggle('active', on);
    showToast(on ? '❤️ Added to favorites' : 'Removed from favorites', 1400);
  };
  card.querySelector('[data-act="share"]').onclick = (e) => {
    e.stopPropagation();
    shareItem(`IndustrCons Games — ${cfg.title}`, 'https://elvinasgar.github.io/IndustrCons-Games/');
  };
  return card;
}

function renderCareers(){
  const wrap = document.getElementById('careerGrid');
  wrap.innerHTML = '';
  CAREER_IDS.forEach(id => {
    const c = CAREERS[id];
    const cs = STATE.careers[id];
    const done = cs.nodes.filter(n => n.completed).length;
    wrap.appendChild(buildGameCard({
      kind: 'career', id, icon: c.icon, accent: c.accent, title: c.name, tagline: c.tagline,
      difficulty: c.difficulty, estMinutes: c.estMinutes, xpText: '20–260 XP/stage',
      skills: c.skills, rating: c.rating, players: c.players,
      progressPct: Math.round((done / NODES.length) * 100), mentorTip: c.mentorTip,
      onPlay: () => openMap(id)
    }));
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
    grid.appendChild(buildGameCard({
      kind: 'arcade', id: g.id, icon: g.icon, accent: '#FFC400', title: g.title, tagline: 'Arcade Skill-Check',
      difficulty: g.difficulty, estMinutes: g.estMinutes, xpText: 'up to 25 XP',
      skills: g.skills, rating: g.rating, players: g.players,
      progressPct: best, mentorTip: g.desc,
      onPlay: () => playArcadeGame(g.id)
    }));
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
    const coins = awardCurrency(gain, score === 100 ? 1 : 0);
    ensurePeriodsFresh();
    bumpMetric('week', 'arcadeThisWeek', 1);
    logActivity('arcade', game.title, gain);
    const newly = checkAchievements();
    saveState();
    playSound(score >= 70 ? 'success' : 'fail');
    showToast(`${label} · +${gain} XP · +${coins} coins`, 2400);
    if(score >= 85) burstConfetti(40);
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

  // Radar-chart running totals
  STATE.statTotals.safety += rs.safety; STATE.statTotals.budget += rs.budget;
  STATE.statTotals.time += rs.time; STATE.statTotals.quality += rs.quality;
  STATE.statTotals.count++;

  // Coins + weekly/monthly objectives + activity log
  const coins = awardCurrency(totalGain, stars === 3 ? 2 : 0);
  ensurePeriodsFresh();
  bumpMetric('week', 'missionsThisWeek', 1);
  bumpMetric('month', 'missionsThisMonth', 1);
  if(stars === 3) bumpMetric('month', 'threeStarThisMonth', 1);
  logActivity('mission', `${CAREERS[session.careerId].name} — ${NODES[session.nodeIndex].name}`, totalGain);

  const newly = checkAchievements();
  saveState();

  session.result = { score, stars, passed, totalGain, coins, newly };
  playSound(passed ? 'success' : 'fail');
  if(passed) burstConfetti(stars === 3 ? 80 : 40);
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
  document.getElementById('xpBanner').textContent = `⚡ +${r.totalGain} XP · 🪙 +${r.coins} coins EARNED`;

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

  const certBtn = document.getElementById('btnViewCertificate');
  if(isLast && r.passed && STATE.careers[session.careerId].nodes.every(n => n.completed)){
    certBtn.style.display = 'block';
    certBtn.onclick = () => goCertificate(session.careerId);
  } else {
    certBtn.style.display = 'none';
  }
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

  if(!alreadyDone){
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

  ensurePeriodsFresh();
  renderObjectives('weeklyList', WEEKLY_OBJECTIVES, 'week');
  renderObjectives('monthlyList', MONTHLY_OBJECTIVES, 'month');
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
  const coins = awardCurrency(gain);
  logActivity('daily', ch.title, gain);
  const newly = checkAchievements();
  saveState();
  playSound('success');
  showToast(`✅ Daily challenge complete · +${gain} XP · +${coins} coins`, 2600);
  newly.forEach(a => setTimeout(() => showToast(`🏅 ${a.name} unlocked!`, 2400), 700));
  renderDaily();
}

/* ---------------------------------------------------------------------- */
/* Weekly Tournament / Monthly Championship objectives                     */
/* ---------------------------------------------------------------------- */
function renderObjectives(containerId, pool, period){
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  const bucket = period === 'week' ? STATE.weekly : STATE.monthly;
  pool.forEach(obj => {
    const current = Math.min(metricValue(period, obj.metric), obj.target);
    const done = current >= obj.target;
    const claimed = bucket.claimed.includes(obj.id);
    const pct = Math.round((current / obj.target) * 100);

    const card = document.createElement('div');
    card.className = 'glass objective-card' + (claimed ? ' done' : '');
    card.innerHTML = `
      <div class="oc-top"><b>${obj.title}</b><span class="oc-reward">🪙${obj.rewardCoins} 💎${obj.rewardGems} ⚡${obj.rewardXP}</span></div>
      <p>${obj.desc} (${current}/${obj.target})</p>
      <div class="oc-bar"><div class="oc-fill" style="width:${pct}%"></div></div>
      ${done && !claimed ? '<button class="btn btn-gold btn-block" style="margin-top:10px; padding:9px;">Claim Reward</button>' : ''}
      ${claimed ? '<div style="margin-top:8px; font-size:11px; color:var(--ok);">✓ Reward claimed</div>' : ''}`;
    if(done && !claimed){
      card.querySelector('button').onclick = () => claimObjective(obj, period);
    }
    wrap.appendChild(card);
  });
}

function claimObjective(obj, period){
  const bucket = period === 'week' ? STATE.weekly : STATE.monthly;
  bucket.claimed.push(obj.id);
  STATE.totalXP += obj.rewardXP;
  STATE.coins += obj.rewardCoins;
  STATE.gems += obj.rewardGems;
  const newly = checkAchievements();
  saveState();
  playSound('unlock');
  burstConfetti(60);
  showToast(`🏆 ${obj.title} claimed · +${obj.rewardXP} XP · +${obj.rewardCoins} coins · +${obj.rewardGems} gems`, 3000);
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
/* DASHBOARD — heatmap, skills radar, timeline, recommendation             */
/* ---------------------------------------------------------------------- */
function goDashboard(){
  playSound('nav');
  renderDashboard();
  showScreen('dashboard');
}

function renderDashboard(){
  renderRecommendation();
  renderHeatmap();
  renderRadar();
  renderTimeline();
}

function renderRecommendation(){
  const el = document.getElementById('recoText');
  // Prefer: next unlocked-but-incomplete stage in the career with the most progress.
  let best = null;
  CAREER_IDS.forEach(id => {
    const cs = STATE.careers[id];
    if(cs.unlockedUpTo > 0 || cs.nodes[0].completed === false){
      const nextIdx = cs.nodes.findIndex(n => !n.completed);
      if(nextIdx !== -1 && nextIdx <= cs.unlockedUpTo){
        if(!best || cs.xp > STATE.careers[best.id].xp) best = { id, nextIdx };
      }
    }
  });
  if(best){
    el.innerHTML = `Continue as <b>${CAREERS[best.id].name}</b> — ${NODES[best.nextIdx].name} is next up.`;
  } else {
    const weakest = ['maxSafety','maxBudget','maxTime','maxQuality'].reduce((a,b) => STATE.stats[a] <= STATE.stats[b] ? a : b);
    const label = { maxSafety: 'Safety', maxBudget: 'Budget', maxTime: 'Time', maxQuality: 'Quality' }[weakest];
    el.innerHTML = `Try the Arcade — your <b>${label}</b> scores have the most room to grow.`;
  }
}

function renderHeatmap(){
  const grid = document.getElementById('heatmapGrid');
  grid.innerHTML = '';
  const counts = {};
  STATE.activityLog.forEach(a => { counts[a.date] = (counts[a.date] || 0) + 1; });
  const days = 70;
  const today = new Date();
  for(let i = days - 1; i >= 0; i--){
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const c = counts[key] || 0;
    const lvl = c === 0 ? '' : c === 1 ? 'lvl1' : c === 2 ? 'lvl2' : 'lvl3';
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell ' + lvl;
    cell.title = `${key}: ${c} activities`;
    grid.appendChild(cell);
  }
}

function renderRadar(){
  const svg = document.getElementById('radarChart');
  const n = STATE.statTotals.count || 1;
  const vals = [
    STATE.statTotals.safety / n, STATE.statTotals.budget / n,
    STATE.statTotals.time / n, STATE.statTotals.quality / n
  ];
  const labels = ['Safety', 'Budget', 'Time', 'Quality'];
  const cx = 120, cy = 120, R = 90;
  const angleFor = i => (Math.PI * 2 * i / 4) - Math.PI / 2;
  const pointFor = (i, val) => {
    const r = (val / 100) * R;
    return [cx + r * Math.cos(angleFor(i)), cy + r * Math.sin(angleFor(i))];
  };
  let svgHtml = '';
  // grid rings
  [0.25, 0.5, 0.75, 1].forEach(f => {
    const pts = [0,1,2,3].map(i => pointFor(i, f * 100).join(',')).join(' ');
    svgHtml += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });
  // axes + labels
  [0,1,2,3].forEach(i => {
    const [x,y] = pointFor(i, 100);
    svgHtml += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,0.08)"/>`;
    const [lx,ly] = pointFor(i, 118);
    svgHtml += `<text x="${lx}" y="${ly}" fill="#8CA0AE" font-size="11" text-anchor="middle" font-family="Rajdhani">${labels[i]}</text>`;
  });
  // data polygon
  const dataPts = [0,1,2,3].map(i => pointFor(i, vals[i]).join(',')).join(' ');
  svgHtml += `<polygon points="${dataPts}" fill="rgba(255,196,0,0.28)" stroke="#FFC400" stroke-width="2"/>`;
  [0,1,2,3].forEach(i => {
    const [x,y] = pointFor(i, vals[i]);
    svgHtml += `<circle cx="${x}" cy="${y}" r="3.5" fill="#FFC400"/>`;
  });
  svg.innerHTML = svgHtml;
}

function renderTimeline(){
  const wrap = document.getElementById('timelineList');
  wrap.innerHTML = '';
  const recent = STATE.activityLog.slice(0, 10);
  if(!recent.length){
    wrap.innerHTML = '<p class="empty-note">No activity yet — play a mission or arcade game to get started.</p>';
    return;
  }
  recent.forEach(a => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `<div class="timeline-dot"></div><div class="timeline-info"><b>${a.label}</b><span>${a.date}${a.xp ? ' · +' + a.xp + ' XP' : ''}</span></div>`;
    wrap.appendChild(item);
  });
}

/* ---------------------------------------------------------------------- */
/* MULTIPLAYER (honest "Coming Soon" — needs a real backend)               */
/* ---------------------------------------------------------------------- */
function goMultiplayer(){
  playSound('nav');
  showScreen('multiplayer');
}

/* ---------------------------------------------------------------------- */
/* CERTIFICATE                                                             */
/* ---------------------------------------------------------------------- */
function goCertificate(careerId){
  playSound('nav');
  const c = CAREERS[careerId];
  document.getElementById('certCareerName').textContent = c.tagline;
  document.getElementById('certPlayerName').textContent = STATE.playerName || 'Engineer';
  document.getElementById('certDetail').textContent = `has completed all ${NODES.length} stages as ${c.name}.`;
  document.getElementById('certDate').textContent = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  showScreen('certificate');
}

/* ---------------------------------------------------------------------- */
/* SETTINGS                                                                */
/* ---------------------------------------------------------------------- */
function renderSettings(){
  const sw = document.getElementById('settingsSoundSwitch');
  sw.classList.toggle('on', STATE.settings.sound);
  document.getElementById('playerNameInput').value = STATE.playerName;
  renderSkinList();
}

function isSkinUnlocked(skin){
  if(!skin.unlock) return true;
  return skin.unlock.type === 'xp' ? STATE.totalXP >= skin.unlock.value : STATE.achievementsUnlocked.includes(skin.unlock.value);
}
function applySkin(skinId){
  STATE.settings.skin = skinId;
  const skin = THEME_SKINS.find(s => s.id === skinId) || THEME_SKINS[0];
  document.documentElement.style.setProperty('--primary', skin.accent);
  document.documentElement.style.setProperty('--yellow', skin.accent);
  saveState();
}
function renderSkinList(){
  const wrap = document.getElementById('skinList');
  if(!wrap) return;
  wrap.innerHTML = '';
  THEME_SKINS.forEach(skin => {
    const unlocked = isSkinUnlocked(skin);
    const active = STATE.settings.skin === skin.id;
    const row = document.createElement('div');
    row.className = 'glass settings-row';
    row.style.opacity = unlocked ? '1' : '.5';
    row.innerHTML = `
      <div class="sinfo"><b>${skin.name}</b><span>${unlocked ? (active ? 'Active' : 'Tap to apply') : (skin.unlock.type === 'xp' ? `Unlocks at ${skin.unlock.value} XP` : 'Unlocks with a specific achievement')}</span></div>
      <div style="width:26px;height:26px;border-radius:8px;background:${skin.accent};box-shadow:0 0 10px ${skin.accent};"></div>`;
    if(unlocked){ row.style.cursor = 'pointer'; row.onclick = () => { playSound('click'); applySkin(skin.id); renderSkinList(); }; }
    wrap.appendChild(row);
  });
}

function wireStaticEvents(){
  document.querySelectorAll('.navbtn').forEach(btn => {
    btn.addEventListener('click', () => goTo(btn.dataset.nav));
  });

  document.getElementById('btnPlayHero').onclick = () => goTo('careers');
  document.getElementById('btnDailyHero').onclick = () => goTo('daily');
  document.getElementById('btnArcadeHero').onclick = () => goArcade();
  document.getElementById('btnCareersHero').onclick = () => goTo('careers');
  document.getElementById('btnClaimLogin').onclick = () => claimLoginReward();
  document.getElementById('btnDashboardHome').onclick = () => goDashboard();
  document.getElementById('btnMultiplayerHome').onclick = () => goMultiplayer();
  document.getElementById('btnArcadeBack').onclick = () => goTo('home');
  document.getElementById('btnDashboardBack').onclick = () => goTo('home');
  document.getElementById('btnMultiplayerBack').onclick = () => goTo('home');
  document.getElementById('btnCertBack').onclick = () => { renderMap(session ? session.careerId : STATE.lastCareer); showScreen('map'); };
  document.getElementById('btnPrintCert').onclick = () => window.print();

  document.getElementById('themeToggle').onclick = () => {
    playSound('click');
    STATE.settings.theme = STATE.settings.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    saveState();
  };

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
    renderProfileBar();
  });

  document.getElementById('btnResetProgress').onclick = () => {
    if(confirm('Reset all IndustrCons progress on this device? This cannot be undone.')){
      localStorage.removeItem(SAVE_KEY);
      STATE = defaultState();
      ensurePeriodsFresh();
      saveState();
      showToast('Progress reset.');
      goTo('home');
    }
  };

  document.getElementById('btnNextMission').onclick = () => {};
  document.getElementById('btnBackToMap').onclick = () => {};

  document.addEventListener('click', () => ensureAudio(), { once: true });
}
