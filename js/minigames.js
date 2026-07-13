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
/* Arcade — standalone hub, playable any time for a flat XP reward         */
/* ---------------------------------------------------------------------- */
const ARCADE_GAMES = [
  { id: 'crane', icon: '🏗️', title: 'Crane Load Balance', desc: 'Stop the load indicator inside the safe zone.', run: runCraneGame },
  { id: 'hazard', icon: '🦺', title: 'Spot the Hazard', desc: 'Find every hazard before the clock runs out.', run: runHazardGame },
  { id: 'sequence', icon: '🗓️', title: 'Build the Critical Path', desc: 'Tap tasks into the correct construction order.', run: runSequenceGame },
  { id: 'budget', icon: '💰', title: 'Balance the Budget', desc: 'Balance linked sliders to fit the client brief.', run: runBudgetGame },
  { id: 'negotiation', icon: '🤝', title: 'Find the Compromise', desc: 'Hold and release the pressure at the right moment.', run: runNegotiationGame },
  { id: 'memory', icon: '🏛️', title: 'Blueprint Memory', desc: 'Match every blueprint symbol in the fewest moves.', run: runMemoryGame },
  { id: 'rhythm', icon: '⚡', title: 'Cable Pull Rhythm', desc: 'Tap in time with the marker for six beats straight.', run: runRhythmGame },
  { id: 'whack', icon: '🚰', title: 'Whack-a-Leak', desc: 'Tap each leak the instant it appears.', run: runWhackGame },
  { id: 'tally', icon: '🧮', title: 'Quick Takeoff', desc: 'Solve fast material takeoffs before time runs out.', run: runTallyGame }
];
