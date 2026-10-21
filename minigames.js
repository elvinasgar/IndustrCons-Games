/* ==========================================================================
   IndustrCons — Career Skill-Check Mini-Games
   Five genuinely different interaction types, one per career:
     siteEngineer      -> reflex/timing   (stop a moving indicator)
     hseOfficer        -> attention/click (spot hazards under time pressure)
     planningEngineer  -> sequencing      (tap-to-order puzzle)
     quantitySurveyor  -> resource balance(linked sliders)
     projectManager    -> charge/release  (hold and release timing)
   Each game calls onDone(score 0-100, resultLabel) exactly once.
   ========================================================================== */

function shuffleArr(a){ return [...a].sort(() => Math.random() - 0.5); }

/* ---------------------------------------------------------------------- */
/* 1) Site Engineer — Crane Load Balance (reflex/timing)                  */
/* ---------------------------------------------------------------------- */
function runCraneGame(body, onDone){
  const ROUNDS = 3;
  let round = 0, totalScore = 0, raf, pos = 0, dir = 1, speed = 0.9;

  function nextRound(){
    round++;
    if(round > ROUNDS){
      const avg = Math.round(totalScore / ROUNDS);
      onDone(avg, `🎯 Crane Load Balance: ${avg}/100 average precision`);
      return;
    }
    const zoneWidth = Math.max(12, 22 - round * 3);
    const zoneLeft = 6 + Math.random() * (94 - zoneWidth - 6);
    speed = 0.75 + round * 0.35;
    pos = 0; dir = 1;

    body.innerHTML = `
      <div class="mg-head"><span class="mg-ic">🏗️</span><h3>Crane Load Balance</h3><span class="pill">Round ${round}/${ROUNDS}</span></div>
      <p class="mg-instructions">Tap <b>STOP LIFT</b> the instant the load indicator sits inside the green safe zone.</p>
      <div class="mg-track">
        <div class="mg-zone" style="left:${zoneLeft}%; width:${zoneWidth}%;"></div>
        <div class="mg-needle" id="mgNeedle"></div>
      </div>
      <button class="btn btn-primary btn-block" id="mgStopBtn">⛔ STOP LIFT</button>`;

    const needle = body.querySelector('#mgNeedle');
    const stopBtn = body.querySelector('#mgStopBtn');

    function frame(){
      pos += dir * speed;
      if(pos >= 97){ pos = 97; dir = -1; }
      if(pos <= 0){ pos = 0; dir = 1; }
      needle.style.left = pos + '%';
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    stopBtn.onclick = () => {
      cancelAnimationFrame(raf);
      stopBtn.disabled = true;
      const zoneCenter = zoneLeft + zoneWidth / 2;
      const dist = Math.abs(pos - zoneCenter);
      const roundScore = clamp(Math.round(100 - (dist / 50) * 100), 0, 100);
      totalScore += roundScore;
      playSound(roundScore > 60 ? 'success' : 'fail');
      showToast(`Round ${round}: ${roundScore}/100`, 1100);
      setTimeout(nextRound, 650);
    };
  }
  nextRound();
}

/* ---------------------------------------------------------------------- */
/* 2) HSE Officer — Spot the Hazard (attention / click under time)        */
/* ---------------------------------------------------------------------- */
const HAZARD_ICONS = ['⚡','🕳️','🛢️','📍','🔥','🪫'];
const SAFE_ICONS   = ['🧯','🦺','🚧','✅','🧰','📋'];

function runHazardGame(body, onDone){
  const hazardCount = 4;
  const totalCells = 9;
  const hazards = shuffleArr(HAZARD_ICONS).slice(0, hazardCount);
  const safes = shuffleArr(SAFE_ICONS).slice(0, totalCells - hazardCount);
  const cells = shuffleArr(
    hazards.map(h => ({ icon: h, hazard: true }))
      .concat(safes.map(s => ({ icon: s, hazard: false })))
  );
  let found = 0, wrong = 0, timeLeft = 12, timerInt, ended = false;

  body.innerHTML = `
    <div class="mg-head"><span class="mg-ic">🦺</span><h3>Spot the Hazard</h3><span class="pill" id="mgTimer">${timeLeft}s</span></div>
    <p class="mg-instructions">Tap every hazard on site before the clock runs out. Safe items cost you points.</p>
    <div class="mg-hazard-grid" id="mgGrid"></div>`;

  const grid = body.querySelector('#mgGrid');
  cells.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'mg-hazard-item';
    btn.textContent = c.icon;
    btn.onclick = () => {
      if(ended || btn.classList.contains('done')) return;
      btn.classList.add('done');
      if(c.hazard){ found++; btn.classList.add('correct'); playSound('click'); }
      else { wrong++; btn.classList.add('wrong'); playSound('fail'); }
      if(found >= hazardCount) endGame();
    };
    grid.appendChild(btn);
  });

  timerInt = setInterval(() => {
    timeLeft--;
    const t = body.querySelector('#mgTimer');
    if(t) t.textContent = timeLeft + 's';
    if(timeLeft <= 0) endGame();
  }, 1000);

  function endGame(){
    if(ended) return;
    ended = true;
    clearInterval(timerInt);
    grid.querySelectorAll('button').forEach(b => b.style.pointerEvents = 'none');
    const score = clamp(Math.round(((found - wrong * 0.5) / hazardCount) * 100), 0, 100);
    playSound(score >= 70 ? 'success' : 'fail');
    setTimeout(() => onDone(score, `🦺 Spot the Hazard: found ${found}/${hazardCount} · score ${score}/100`), 400);
  }
}

/* ---------------------------------------------------------------------- */
/* 3) Planning Engineer — Build the Critical Path (tap-to-order puzzle)   */
/* ---------------------------------------------------------------------- */
const SEQUENCE_TASKS = ['Site Clearance', 'Excavation', 'Foundation Pour', 'Rebar & Formwork', 'Structural Frame', 'Finishes & Handover'];

function runSequenceGame(body, onDone){
  const correctOrder = SEQUENCE_TASKS;
  const shuffled = shuffleArr(correctOrder);
  const placed = new Array(correctOrder.length).fill(null);

  body.innerHTML = `
    <div class="mg-head"><span class="mg-ic">🗓️</span><h3>Build the Critical Path</h3></div>
    <p class="mg-instructions">Tap tasks below in the order they actually happen on site.</p>
    <div class="mg-seq-slots" id="mgSlots"></div>
    <div class="mg-seq-pool" id="mgPool"></div>
    <button class="btn btn-primary btn-block" id="mgCheckBtn" style="margin-top:8px;" disabled>Check Order</button>`;

  const slotsEl = body.querySelector('#mgSlots');
  const poolEl = body.querySelector('#mgPool');
  const checkBtn = body.querySelector('#mgCheckBtn');

  correctOrder.forEach((_, i) => {
    const slot = document.createElement('div');
    slot.className = 'mg-seq-slot';
    slot.textContent = 'Step ' + (i + 1);
    slot.onclick = () => {
      if(placed[i]){
        const chip = placed[i];
        placed[i] = null;
        slot.textContent = 'Step ' + (i + 1);
        slot.classList.remove('filled');
        poolEl.appendChild(chip);
        updateCheckBtn();
      }
    };
    slotsEl.appendChild(slot);
  });

  shuffled.forEach(label => {
    const chip = document.createElement('button');
    chip.className = 'mg-chip';
    chip.textContent = label;
    chip.onclick = () => {
      const emptyIdx = placed.findIndex(p => p === null);
      if(emptyIdx === -1) return;
      placed[emptyIdx] = chip;
      const slot = slotsEl.children[emptyIdx];
      slot.textContent = label;
      slot.classList.add('filled');
      poolEl.removeChild(chip);
      updateCheckBtn();
    };
    poolEl.appendChild(chip);
  });

  function updateCheckBtn(){ checkBtn.disabled = placed.some(p => p === null); }

  checkBtn.onclick = () => {
    checkBtn.disabled = true;
    let correctCount = 0;
    placed.forEach((chip, i) => { if(chip.textContent === correctOrder[i]) correctCount++; });
    const score = Math.round((correctCount / correctOrder.length) * 100);
    playSound(score >= 70 ? 'success' : 'fail');
    onDone(score, `🗓️ Critical Path: ${correctCount}/${correctOrder.length} correct · score ${score}/100`);
  };
}

/* ---------------------------------------------------------------------- */
/* 4) Quantity Surveyor — Balance the Budget (linked sliders)             */
/* ---------------------------------------------------------------------- */
const BUDGET_CATEGORIES = ['Labor', 'Materials', 'Equipment', 'Contingency'];

function generateBudgetTarget(){
  const profiles = [
    { brief: "Client brief: labour-heavy trade package — keep contingency above 10%.", ranges: [[40,55],[20,30],[10,20],[10,18]] },
    { brief: "Client brief: plant-intensive package — keep contingency lean.", ranges: [[25,35],[20,30],[30,45],[5,12]] },
    { brief: "Client brief: finishes-heavy package — moderate contingency.", ranges: [[20,30],[40,55],[10,20],[8,15]] }
  ];
  return profiles[Math.floor(Math.random() * profiles.length)];
}

function runBudgetGame(body, onDone){
  const target = generateBudgetTarget();
  let values = [40, 30, 20, 10];

  body.innerHTML = `
    <div class="mg-head"><span class="mg-ic">💰</span><h3>Balance the Budget</h3></div>
    <p class="mg-instructions">${target.brief} Sliders auto-balance to keep the total at 100%.</p>
    <div id="mgSliders"></div>
    <div class="mg-match" id="mgMatch">Fit to brief: 0%</div>
    <button class="btn btn-primary btn-block" id="mgLockBtn">Lock Allocation</button>`;

  const slidersEl = body.querySelector('#mgSliders');
  BUDGET_CATEGORIES.forEach((cat, i) => {
    const row = document.createElement('div');
    row.className = 'mg-slider-row';
    row.innerHTML = `<div class="mg-slider-label">${cat}<span class="mg-slider-val" id="mgVal${i}">${values[i]}%</span></div>
      <input type="range" min="0" max="100" value="${values[i]}" id="mgSlider${i}" class="mg-slider">`;
    slidersEl.appendChild(row);
  });
  const sliderEls = BUDGET_CATEGORIES.map((_, i) => body.querySelector('#mgSlider' + i));
  const valEls = BUDGET_CATEGORIES.map((_, i) => body.querySelector('#mgVal' + i));

  function rebalance(changedIdx){
    const changedVal = values[changedIdx];
    const othersIdx = [0,1,2,3].filter(i => i !== changedIdx);
    const othersSum = othersIdx.reduce((s,i) => s + values[i], 0);
    const remaining = 100 - changedVal;
    if(othersSum <= 0){
      othersIdx.forEach(i => { values[i] = remaining / othersIdx.length; });
    } else {
      othersIdx.forEach(i => { values[i] = Math.max(0, Math.round(values[i] / othersSum * remaining)); });
    }
    const sum = values.reduce((a,b) => a+b, 0);
    values[othersIdx[othersIdx.length - 1]] += (100 - sum);
    sliderEls.forEach((el, i) => { el.value = values[i]; valEls[i].textContent = Math.round(values[i]) + '%'; });
  }

  function updateMatch(){
    let diffSum = 0;
    BUDGET_CATEGORIES.forEach((_, i) => {
      const [lo, hi] = target.ranges[i];
      const mid = (lo + hi) / 2;
      diffSum += Math.abs(values[i] - mid);
    });
    const match = clamp(Math.round(100 - diffSum), 0, 100);
    body.querySelector('#mgMatch').textContent = `Fit to brief: ${match}%`;
    return match;
  }

  sliderEls.forEach((el, i) => {
    el.oninput = () => {
      values[i] = parseInt(el.value, 10);
      rebalance(i);
      updateMatch();
    };
  });
  updateMatch();

  const lockBtn = body.querySelector('#mgLockBtn');
  lockBtn.onclick = () => {
    lockBtn.disabled = true;
    const score = updateMatch();
    playSound(score >= 70 ? 'success' : 'fail');
    onDone(score, `💰 Budget locked · fit ${score}/100`);
  };
}

/* ---------------------------------------------------------------------- */
/* 5) Project Manager — Find the Compromise (charge & release)           */
/* ---------------------------------------------------------------------- */
function runNegotiationGame(body, onDone){
  const ROUNDS = 3;
  let round = 0, totalScore = 0, raf, charge = 0, holding = false;

  function nextRound(){
    round++;
    if(round > ROUNDS){
      const avg = Math.round(totalScore / ROUNDS);
      onDone(avg, `🤝 Negotiation: ${avg}/100 average compromise fit`);
      return;
    }
    const zoneWidth = Math.max(14, 24 - round * 3);
    const zoneLeft = 15 + Math.random() * (85 - zoneWidth - 15);
    charge = 0; holding = false;
    let roundEnded = false;

    body.innerHTML = `
      <div class="mg-head"><span class="mg-ic">🤝</span><h3>Find the Compromise</h3><span class="pill">Round ${round}/${ROUNDS}</span></div>
      <p class="mg-instructions">Hold <b>PUSH</b> to build pressure. Release inside the green zone for a fair deal.</p>
      <div class="mg-track">
        <div class="mg-zone" style="left:${zoneLeft}%; width:${zoneWidth}%;"></div>
        <div class="mg-needle" id="mgMeterNeedle"></div>
      </div>
      <button class="btn btn-gold btn-block" id="mgPushBtn">✊ HOLD TO PUSH</button>`;

    const needle = body.querySelector('#mgMeterNeedle');
    const pushBtn = body.querySelector('#mgPushBtn');

    function frame(){
      if(roundEnded) return;
      if(holding) charge = Math.min(100, charge + 1.7);
      else charge = Math.max(0, charge - 2.4);
      needle.style.left = charge + '%';
      if(holding && charge >= 100) end();
      else raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function end(){
      if(roundEnded || !holding) return;
      roundEnded = true;
      holding = false;
      cancelAnimationFrame(raf);
      const zoneCenter = zoneLeft + zoneWidth / 2;
      const dist = Math.abs(charge - zoneCenter);
      const roundScore = clamp(Math.round(100 - (dist / 50) * 100), 0, 100);
      totalScore += roundScore;
      playSound(roundScore > 60 ? 'success' : 'fail');
      showToast(`Round ${round}: ${roundScore}/100`, 1100);
      pushBtn.disabled = true;
      setTimeout(nextRound, 650);
    }

    pushBtn.addEventListener('pointerdown', () => { holding = true; });
    pushBtn.addEventListener('pointerup', end);
    pushBtn.addEventListener('pointerleave', end);
  }
  nextRound();
}

/* ---------------------------------------------------------------------- */
/* 6) Blueprint Memory (card-flip matching)                                */
/* ---------------------------------------------------------------------- */
const MEMORY_SYMBOLS = ['🏗️','📐','🧱','🪟','🚪','🏛️'];

function runMemoryGame(body, onDone){
  const pairs = shuffleArr([...MEMORY_SYMBOLS, ...MEMORY_SYMBOLS]);
  const total = MEMORY_SYMBOLS.length;
  let first = null, lock = false, moves = 0, matched = 0;

  body.innerHTML = `
    <div class="mg-head"><span class="mg-ic">🏛️</span><h3>Blueprint Memory</h3><span class="pill" id="mgMoves">0 moves</span></div>
    <p class="mg-instructions">Flip two tiles at a time and match every blueprint symbol.</p>
    <div class="mg-memory-grid" id="mgMemGrid"></div>`;

  const grid = body.querySelector('#mgMemGrid');
  pairs.forEach(sym => {
    const tile = document.createElement('button');
    tile.className = 'mg-memory-tile';
    tile.dataset.sym = sym;
    tile.textContent = '❔';
    tile.onclick = () => {
      if(lock || tile.classList.contains('matched') || tile === first) return;
      tile.textContent = sym;
      tile.classList.add('flipped');
      if(!first){ first = tile; return; }
      moves++;
      body.querySelector('#mgMoves').textContent = moves + ' moves';
      if(first.dataset.sym === tile.dataset.sym){
        first.classList.add('matched'); tile.classList.add('matched');
        first = null; matched++;
        playSound('click');
        if(matched === total) endGame();
      } else {
        lock = true;
        const a = first, b = tile;
        setTimeout(() => {
          a.textContent = '❔'; a.classList.remove('flipped');
          b.textContent = '❔'; b.classList.remove('flipped');
          lock = false;
        }, 700);
        first = null;
        playSound('fail');
      }
    };
    grid.appendChild(tile);
  });

  function endGame(){
    const score = clamp(Math.round(100 - (moves - total) * 6), 0, 100);
    playSound('success');
    setTimeout(() => onDone(score, `🏛️ Blueprint Memory: ${moves} moves · score ${score}/100`), 500);
  }
}

/* ---------------------------------------------------------------------- */
/* 7) Cable Pull Rhythm (repeated timed taps)                              */
/* ---------------------------------------------------------------------- */
function runRhythmGame(body, onDone){
  const BEATS = 6;
  let beatIndex = 0, totalAcc = 0, raf, pos = 0, dir = 1, speed = 1.3, ended = false;

  body.innerHTML = `
    <div class="mg-head"><span class="mg-ic">⚡</span><h3>Cable Pull Rhythm</h3><span class="pill" id="mgBeat">Beat 1/${BEATS}</span></div>
    <p class="mg-instructions">Tap <b>PULL</b> every time the marker crosses the centre line.</p>
    <div class="mg-track">
      <div class="mg-center-line"></div>
      <div class="mg-needle" id="mgRNeedle"></div>
    </div>
    <button class="btn btn-primary btn-block" id="mgPullBtn">🔗 PULL</button>`;

  const needle = body.querySelector('#mgRNeedle');
  const pullBtn = body.querySelector('#mgPullBtn');

  function frame(){
    pos += dir * speed;
    if(pos >= 97){ pos = 97; dir = -1; }
    if(pos <= 0){ pos = 0; dir = 1; }
    needle.style.left = pos + '%';
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  pullBtn.onclick = () => {
    if(ended) return;
    const dist = Math.abs(pos - 50);
    const acc = clamp(Math.round(100 - (dist / 50) * 100), 0, 100);
    totalAcc += acc; beatIndex++;
    playSound(acc > 60 ? 'success' : 'fail');
    showToast(`Beat ${beatIndex}: ${acc}/100`, 900);
    speed += 0.15;
    if(beatIndex >= BEATS){
      ended = true;
      cancelAnimationFrame(raf);
      pullBtn.disabled = true;
      const avg = Math.round(totalAcc / BEATS);
      setTimeout(() => onDone(avg, `⚡ Cable Pull Rhythm: ${avg}/100 timing accuracy`), 500);
    } else {
      body.querySelector('#mgBeat').textContent = `Beat ${beatIndex + 1}/${BEATS}`;
    }
  };
}

/* ---------------------------------------------------------------------- */
/* 8) Whack-a-Leak (fast-reaction, dynamically appearing targets)          */
/* ---------------------------------------------------------------------- */
function runWhackGame(body, onDone){
  const ROUNDS = 8;
  let round = 0, hits = 0, timeoutId;

  body.innerHTML = `
    <div class="mg-head"><span class="mg-ic">🚰</span><h3>Whack-a-Leak</h3><span class="pill" id="mgWCount">0/${ROUNDS}</span></div>
    <p class="mg-instructions">Tap the leak the instant it appears — it gets faster each round.</p>
    <div class="mg-hazard-grid" id="mgWGrid"></div>`;

  const grid = body.querySelector('#mgWGrid');
  const cells = [];
  for(let i = 0; i < 9; i++){
    const c = document.createElement('button');
    c.className = 'mg-hazard-item';
    c.dataset.active = '0';
    c.onclick = () => {
      if(c.dataset.active !== '1') return;
      hits++;
      c.dataset.active = '0';
      c.classList.add('correct');
      c.textContent = '✅';
      clearTimeout(timeoutId);
      setTimeout(() => { c.classList.remove('correct'); c.textContent = ''; nextRound(); }, 300);
    };
    grid.appendChild(c); cells.push(c);
  }

  function nextRound(){
    round++;
    body.querySelector('#mgWCount').textContent = `${Math.min(round, ROUNDS)}/${ROUNDS}`;
    if(round > ROUNDS){ endGame(); return; }
    const idx = Math.floor(Math.random() * 9);
    cells[idx].dataset.active = '1';
    cells[idx].textContent = '🚰';
    const showTime = Math.max(450, 950 - round * 55);
    timeoutId = setTimeout(() => {
      if(cells[idx].dataset.active === '1'){
        cells[idx].dataset.active = '0'; cells[idx].textContent = '';
        nextRound();
      }
    }, showTime);
  }

  function endGame(){
    const score = clamp(Math.round((hits / ROUNDS) * 100), 0, 100);
    playSound(score >= 70 ? 'success' : 'fail');
    setTimeout(() => onDone(score, `🚰 Whack-a-Leak: ${hits}/${ROUNDS} caught · score ${score}/100`), 400);
  }
  nextRound();
}

/* ---------------------------------------------------------------------- */
/* 9) Quick Takeoff (mental-math multiple choice under a timer)           */
/* ---------------------------------------------------------------------- */
function runTallyGame(body, onDone){
  const ROUNDS = 4;
  let round = 0, correct = 0, timerInt;

  function nextRound(){
    round++;
    if(round > ROUNDS){ endGame(); return; }
    const a = Math.floor(Math.random() * 8 + 2), b = Math.floor(Math.random() * 8 + 2);
    const answer = a * b;
    const opts = shuffleArr([answer, Math.max(1, answer + 4), Math.max(1, answer - 6), Math.max(1, answer + 9)]);
    let timeLeft = 6;

    body.innerHTML = `
      <div class="mg-head"><span class="mg-ic">🧮</span><h3>Quick Takeoff</h3><span class="pill">Round ${round}/${ROUNDS}</span></div>
      <p class="mg-instructions">Panel needs <b>${a}m × ${b}m</b> of material. Tap the correct total area (m²).</p>
      <div class="mg-track" style="height:8px;">
        <div class="mg-zone" id="mgTBar" style="left:0; width:100%; background:rgba(0,229,255,.35); border:none;"></div>
      </div>
      <div class="option-list" id="mgTOpts" style="margin-top:12px;"></div>`;

    const optsEl = body.querySelector('#mgTOpts');
    opts.forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `<div class="opt-label">${v} m²</div>`;
      btn.onclick = () => {
        clearInterval(timerInt);
        optsEl.querySelectorAll('button').forEach(b => b.style.pointerEvents = 'none');
        if(v === answer){ correct++; playSound('click'); } else { playSound('fail'); }
        setTimeout(nextRound, 500);
      };
      optsEl.appendChild(btn);
    });

    const bar = body.querySelector('#mgTBar');
    timerInt = setInterval(() => {
      timeLeft -= 0.2;
      bar.style.width = Math.max(0, (timeLeft / 6) * 100) + '%';
      if(timeLeft <= 0){
        clearInterval(timerInt);
        optsEl.querySelectorAll('button').forEach(b => b.style.pointerEvents = 'none');
        playSound('fail');
        setTimeout(nextRound, 500);
      }
    }, 200);
  }

  function endGame(){
    const score = clamp(Math.round((correct / ROUNDS) * 100), 0, 100);
    playSound(score >= 70 ? 'success' : 'fail');
    onDone(score, `🧮 Quick Takeoff: ${correct}/${ROUNDS} correct · score ${score}/100`);
  }
  nextRound();
}

/* ---------------------------------------------------------------------- */
/* 10) Site Patrol — open-world top-down site walk (move, dodge, decide)   */
/* ---------------------------------------------------------------------- */
function runSitePatrolGame(body, onDone){
  const W = 1400, H = 1000, VW = 380, VH = 340, TOTAL = 6;
  const zones = [
    { x:60,  y:60,  w:380, h:260, c:'#3b2f1d', n:'EXCAVATION' },
    { x:520, y:60,  w:360, h:260, c:'#26323f', n:'CRANE ZONE' },
    { x:960, y:60,  w:380, h:260, c:'#2f2a3d', n:'SCAFFOLD' },
    { x:60,  y:400, w:380, h:240, c:'#3a3322', n:'MATERIAL YARD' },
    { x:960, y:400, w:380, h:240, c:'#1f3a33', n:'ELECTRICAL' },
    { x:520, y:720, w:360, h:230, c:'#2b2f36', n:'SITE OFFICE' }
  ];
  /* options[0] is always the correct one; order is shuffled on display */
  const spots = [
    { x:250, y:190, icon:'🕳️', title:'Open trench', done:false,
      situation:'A deep trench has no edge barrier, spoil is piled right at the lip and two workers are inside.',
      options:['Install edge barriers, safe ladder access and move spoil back','Place a single cone and keep working','Remind workers to watch their step'],
      lesson:'Deep excavations need edge protection, safe access/egress and spoil kept back from the edge.' },
    { x:700, y:190, icon:'🏗️', title:'Crane lift', done:false,
      situation:'A load is being lifted with no tag line and a worker is walking underneath.',
      options:['Stop the lift, clear the exclusion zone, then use tag lines','Let the lift finish, it is almost done','Wave the worker out of the way mid-lift'],
      lesson:'Nobody works under a suspended load; control swing with tag lines and keep an exclusion zone.' },
    { x:1150, y:190, icon:'🪜', title:'Scaffold', done:false,
      situation:'The scaffold has missing toe boards and an out-of-date inspection tag.',
      options:['Tag it out and have a competent person re-inspect it','Use it carefully until the end of the shift','Add a rope across the gap and carry on'],
      lesson:'Scaffolds must be inspected by a competent person and taken out of use when defective.' },
    { x:250, y:520, icon:'🧱', title:'Rebar stack', done:false,
      situation:'Rebar bundles are stacked too high on soft ground and leaning.',
      options:['Restack lower on firm bearers with chocks and clear the area','Lean a pallet against the stack','Leave it, steel is heavy so it will not move'],
      lesson:'Stack materials on level, firm ground within safe heights and keep walkways clear.' },
    { x:1150, y:520, icon:'⚡', title:'Wet cable', done:false,
      situation:'A temporary power cable lies across a wet walkway with a damaged sheath.',
      options:['Isolate it, replace the cable and route it safely off the ground','Cover it with a plank','Tell people not to step on it'],
      lesson:'Damaged temporary electrics must be isolated and replaced; use RCD protection and keep cables off wet ground.' },
    { x:700, y:830, icon:'🚪', title:'Blocked exit', done:false,
      situation:'Pallets are stacked in front of the site office fire exit.',
      options:['Clear the exit now and keep the assembly route open','Move them after the meeting','Put a sign on the pallets'],
      lesson:'Emergency exits and assembly routes must stay clear at all times.' }
  ];
  const trucks = [
    { x:80,  y:360, axis:'x', dir:1, min:60, max:1320, speed:2.3 },
    { x:920, y:80,  axis:'y', dir:1, min:60, max:940,  speed:2.0 }
  ];
  const p = { x:700, y:640, r:12 };
  let safety = 100, timeLeft = 150, correct = 0, resolved = 0;
  let paused = false, over = false, hitCd = 0, raf, tmr;
  const lessons = [], keys = {};
  let joy = { x:0, y:0 }, joyOrigin = null;

  body.innerHTML = `
    <div class="mg-head"><span class="mg-ic">🚧</span><h3>Site Patrol</h3><span class="pill">Open Site</span></div>
    <div class="sp-hud"><span id="spSafety">🛡️ 100</span><span id="spFound">🔎 0/${TOTAL}</span><span id="spTime">⏱️ ${timeLeft}s</span></div>
    <div class="sp-wrap"><canvas id="spCanvas" width="${VW}" height="${VH}"></canvas><div class="sp-panel" id="spPanel" style="display:none"></div></div>
    <p class="mg-instructions" style="margin-top:8px;">Move with WASD / arrows, or drag on the map (touch). Walk into the glowing rings, dodge site vehicles.</p>`;

  const canvas = body.querySelector('#spCanvas'), ctx = canvas.getContext('2d');
  const panel = body.querySelector('#spPanel');
  canvas.style.touchAction = 'none';

  function updateHud(){
    body.querySelector('#spSafety').textContent = '🛡️ ' + safety;
    body.querySelector('#spFound').textContent = `🔎 ${resolved}/${TOTAL}`;
    body.querySelector('#spTime').textContent = '⏱️ ' + timeLeft + 's';
  }

  const kd = e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true; if(k.startsWith('Arrow')) e.preventDefault(); };
  const ku = e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  canvas.addEventListener('pointerdown', e => { joyOrigin = { x:e.clientX, y:e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if(!joyOrigin) return;
    joy.x = clamp((e.clientX - joyOrigin.x) / 36, -1, 1);
    joy.y = clamp((e.clientY - joyOrigin.y) / 36, -1, 1);
  });
  const stopJoy = () => { joyOrigin = null; joy = { x:0, y:0 }; };
  canvas.addEventListener('pointerup', stopJoy); canvas.addEventListener('pointercancel', stopJoy);

  function openSpot(s){
    paused = true; playSound('event');
    const opts = shuffleArr(s.options.map((t, i) => ({ t, ok: i === 0 })));
    panel.style.display = 'block';
    panel.innerHTML = `<div class="sp-title">${s.icon} ${s.title}</div><p>${s.situation}</p>` +
      opts.map((o, i) => `<button class="option-btn sp-opt" data-i="${i}"><div class="opt-label">${o.t}</div></button>`).join('');
    panel.querySelectorAll('.sp-opt').forEach(b => b.onclick = () => {
      const o = opts[+b.dataset.i];
      s.done = true; resolved++;
      if(o.ok){ correct++; playSound('success'); } else { safety = clamp(safety - 12, 0, 100); playSound('fail'); }
      lessons.push(`${s.title}: ${s.lesson}`);
      updateHud();
      panel.innerHTML = `<div class="sp-title">${o.ok ? '✅ Good call' : '⚠️ Not quite'}</div><p><b>Lesson:</b> ${s.lesson}</p><button class="btn btn-primary btn-block" id="spNext">Continue</button>`;
      panel.querySelector('#spNext').onclick = () => {
        panel.style.display = 'none'; paused = false;
        if(resolved >= TOTAL || safety <= 0) end();
      };
    });
  }

  function end(){
    if(over) return;
    over = true; cancelAnimationFrame(raf); clearInterval(tmr);
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    const score = clamp(Math.round(correct / TOTAL * 70 + safety * 0.3), 0, 100);
    panel.style.display = 'block';
    panel.innerHTML = `<div class="sp-title">🏁 Patrol Complete — ${score}/100</div>
      <p>${correct}/${TOTAL} hazards handled correctly · Safety ${safety}%</p>
      <ul class="sp-lessons">${lessons.map(l => `<li>${l}</li>`).join('')}</ul>
      <button class="btn btn-primary btn-block" id="spDone">Collect Rewards</button>`;
    panel.querySelector('#spDone').onclick = () => onDone(score, `🚧 Site Patrol: ${correct}/${TOTAL} hazards · safety ${safety}% · score ${score}/100`);
  }

  tmr = setInterval(() => {
    if(paused || over) return;
    timeLeft--; updateHud();
    if(timeLeft <= 0) end();
  }, 1000);

  function drawEmoji(ch, x, y, size){ ctx.font = size + 'px serif'; ctx.fillText(ch, x, y); }

  function draw(){
    const cx = clamp(p.x - VW / 2, 0, W - VW), cy = clamp(p.y - VH / 2, 0, H - VH);
    ctx.fillStyle = '#161c27'; ctx.fillRect(0, 0, VW, VH);
    ctx.save(); ctx.translate(-cx, -cy);
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
    for(let x = 0; x <= W; x += 50){ ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for(let y = 0; y <= H; y += 50){ ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = '#2a2f38'; ctx.fillRect(0, 340, W, 40); ctx.fillRect(900, 0, 40, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    zones.forEach(z => {
      ctx.fillStyle = z.c; ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255,196,0,.55)'; ctx.lineWidth = 2; ctx.strokeRect(z.x, z.y, z.w, z.h); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,196,0,.8)'; ctx.font = '700 12px sans-serif'; ctx.fillText(z.n, z.x + z.w / 2, z.y + 16);
    });
    const pulse = 16 + Math.sin(Date.now() / 250) * 3;
    spots.forEach(s => {
      if(s.done){ drawEmoji('✅', s.x, s.y, 22); return; }
      ctx.strokeStyle = '#FFC400'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, pulse + 8, 0, Math.PI * 2); ctx.stroke();
      drawEmoji(s.icon, s.x, s.y, 26);
    });
    trucks.forEach(t => drawEmoji('🚚', t.x, t.y, 26));
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 12, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    drawEmoji('👷', p.x, p.y, 26);
    ctx.restore();
    // minimap
    const k = 0.07, mx = VW - W * k - 6, my = 6;
    ctx.fillStyle = 'rgba(7,11,20,.8)'; ctx.fillRect(mx, my, W * k, H * k);
    zones.forEach(z => { ctx.fillStyle = 'rgba(255,196,0,.25)'; ctx.fillRect(mx + z.x * k, my + z.y * k, z.w * k, z.h * k); });
    spots.forEach(s => { if(!s.done){ ctx.fillStyle = '#FF4D6D'; ctx.fillRect(mx + s.x * k - 2, my + s.y * k - 2, 4, 4); } });
    trucks.forEach(t => { ctx.fillStyle = '#FFC400'; ctx.fillRect(mx + t.x * k - 2, my + t.y * k - 2, 4, 4); });
    ctx.fillStyle = '#00E5FF'; ctx.beginPath(); ctx.arc(mx + p.x * k, my + p.y * k, 3, 0, Math.PI * 2); ctx.fill();
    if(hitCd > 60){ ctx.fillStyle = 'rgba(255,77,109,.25)'; ctx.fillRect(0, 0, VW, VH); }
  }

  function frame(){
    if(over) return;
    if(!paused){
      let dx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0) + joy.x;
      let dy = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0) + joy.y;
      const m = Math.hypot(dx, dy); if(m > 1){ dx /= m; dy /= m; }
      p.x = clamp(p.x + dx * 3.2, p.r, W - p.r); p.y = clamp(p.y + dy * 3.2, p.r, H - p.r);
      trucks.forEach(t => {
        t[t.axis] += t.dir * t.speed;
        if(t[t.axis] > t.max || t[t.axis] < t.min) t.dir *= -1;
        if(hitCd <= 0 && Math.hypot(t.x - p.x, t.y - p.y) < 24){
          safety = clamp(safety - 15, 0, 100); hitCd = 90;
          const a = Math.atan2(p.y - t.y, p.x - t.x);
          p.x = clamp(p.x + Math.cos(a) * 44, p.r, W - p.r); p.y = clamp(p.y + Math.sin(a) * 44, p.r, H - p.r);
          playSound('fail'); showToast('🚚 Hit by a site vehicle! Keep out of traffic routes.', 1400); updateHud();
          if(safety <= 0) end();
        }
      });
      if(hitCd > 0) hitCd--;
      for(const s of spots){ if(!s.done && Math.hypot(s.x - p.x, s.y - p.y) < 30){ openSpot(s); break; } }
    }
    draw();
    if(!over) raf = requestAnimationFrame(frame);
  }
  updateHud();
  raf = requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------------- */
/* Arcade — standalone hub, playable any time for a flat XP reward         */
/* ---------------------------------------------------------------------- */
const ARCADE_GAMES = [
  { id: 'patrol', icon: '🚧', title: 'Site Patrol', desc: 'Walk an open construction site, dodge vehicles and make 6 real safety calls, with a lesson after each.', run: runSitePatrolGame,
    difficulty: 'Hard', estMinutes: '~3 min', skills: ['Hazard ID', 'Decision Making', 'Site Safety'], rating: 4.9, players: '2.3K' },
  { id: 'crane', icon: '🏗️', title: 'Crane Load Balance', desc: 'Stop the load indicator inside the safe zone.', run: runCraneGame,
    difficulty: 'Easy', estMinutes: '~1 min', skills: ['Reflexes', 'Precision'], rating: 4.6, players: '6.1K' },
  { id: 'hazard', icon: '🦺', title: 'Spot the Hazard', desc: 'Find every hazard before the clock runs out.', run: runHazardGame,
    difficulty: 'Easy', estMinutes: '~1 min', skills: ['Observation', 'Hazard ID'], rating: 4.8, players: '7.4K' },
  { id: 'sequence', icon: '🗓️', title: 'Build the Critical Path', desc: 'Tap tasks into the correct construction order.', run: runSequenceGame,
    difficulty: 'Medium', estMinutes: '~2 min', skills: ['Sequencing', 'Logic'], rating: 4.5, players: '4.9K' },
  { id: 'budget', icon: '💰', title: 'Balance the Budget', desc: 'Balance linked sliders to fit the client brief.', run: runBudgetGame,
    difficulty: 'Medium', estMinutes: '~2 min', skills: ['Cost Control', 'Estimation'], rating: 4.4, players: '4.2K' },
  { id: 'negotiation', icon: '🤝', title: 'Find the Compromise', desc: 'Hold and release the pressure at the right moment.', run: runNegotiationGame,
    difficulty: 'Medium', estMinutes: '~1 min', skills: ['Timing', 'Negotiation'], rating: 4.5, players: '3.8K' },
  { id: 'memory', icon: '🏛️', title: 'Blueprint Memory', desc: 'Match every blueprint symbol in the fewest moves.', run: runMemoryGame,
    difficulty: 'Easy', estMinutes: '~2 min', skills: ['Memory', 'Focus'], rating: 4.7, players: '5.5K' },
  { id: 'rhythm', icon: '⚡', title: 'Cable Pull Rhythm', desc: 'Tap in time with the marker for six beats straight.', run: runRhythmGame,
    difficulty: 'Hard', estMinutes: '~1 min', skills: ['Rhythm', 'Reflexes'], rating: 4.3, players: '3.1K' },
  { id: 'whack', icon: '🚰', title: 'Whack-a-Leak', desc: 'Tap each leak the instant it appears.', run: runWhackGame,
    difficulty: 'Hard', estMinutes: '~1 min', skills: ['Reaction Speed'], rating: 4.6, players: '4.0K' },
  { id: 'tally', icon: '🧮', title: 'Quick Takeoff', desc: 'Solve fast material takeoffs before time runs out.', run: runTallyGame,
    difficulty: 'Medium', estMinutes: '~1 min', skills: ['Mental Math', 'Estimation'], rating: 4.4, players: '3.6K' }
];
