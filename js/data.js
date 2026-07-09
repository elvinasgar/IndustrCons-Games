/* ==========================================================================
   IndustrCons — Data Layer
   Careers, mission-map nodes, scenario generation, random events,
   achievements, daily challenges, and seed leaderboard data.
   ========================================================================== */

const NODES = [
  { id: 'foundation', icon: '🏗️', name: 'Foundation',
    issue: "Soil test results just came back showing weaker bearing capacity than the geotechnical report assumed — right as the crew is ready to pour footings." },
  { id: 'rebar', icon: '🧱', name: 'Rebar',
    issue: "The rebar delivery arrived with the wrong bar diameter for the columns, and the structural engineer is two days out from site." },
  { id: 'formwork', icon: '🪵', name: 'Formwork',
    issue: "Overnight wind damaged part of tomorrow's slab formwork, and the concrete truck booking can't be shifted without a cancellation penalty." },
  { id: 'concrete', icon: '🧪', name: 'Concrete',
    issue: "A sudden heatwave is pushing ambient temperature past the limit set in the mix design, risking flash-set during the pour." },
  { id: 'structure', icon: '🏢', name: 'Structure',
    issue: "A structural steel connection failed its load test on the 4th floor, and finishing trades are booked to start next week." },
  { id: 'bridge', icon: '🌉', name: 'Bridge',
    issue: "River levels are rising faster than forecast, threatening the temporary piers under the bridge-deck formwork." },
  { id: 'tunnel', icon: '🚇', name: 'Tunnel',
    issue: "The tunnel boring machine has hit an unexpected pocket of loose ground, and face-pressure sensors are trending unstable." },
  { id: 'airport', icon: '✈️', name: 'Airport',
    issue: "Airside paving must finish inside a night-only work window before flights resume at dawn, and rain is forecast." },
  { id: 'skyscraper', icon: '🌆', name: 'Skyscraper',
    issue: "The tower crane's load-moment indicator is giving inconsistent readings on the 40th-floor lift, mid steel-erection sequence." }
];

const CAREERS = {
  siteEngineer: {
    id: 'siteEngineer', name: 'Site Engineer', icon: '👷', accent: '#00E5FF',
    frame: "As Site Engineer you're closest to the work — the crew looks to you first.",
    authority: 'the structural engineer', crew: 'your site team'
  },
  projectManager: {
    id: 'projectManager', name: 'Project Manager', icon: '📋', accent: '#7C4DFF',
    frame: "As Project Manager, the client and the schedule are both watching this decision.",
    authority: 'the client', crew: 'the project team'
  },
  hseOfficer: {
    id: 'hseOfficer', name: 'HSE Officer', icon: '🦺', accent: '#FF6B35',
    frame: "As HSE Officer, the wellbeing of every worker on site sits with you.",
    authority: 'the safety committee', crew: 'the workforce'
  },
  planningEngineer: {
    id: 'planningEngineer', name: 'Planning Engineer', icon: '🗓️', accent: '#00FFA3',
    frame: "As Planning Engineer, one slip here ripples down the entire critical path.",
    authority: 'the programme review board', crew: 'the planning team'
  },
  quantitySurveyor: {
    id: 'quantitySurveyor', name: 'Quantity Surveyor', icon: '💰', accent: '#FFD700',
    frame: "As Quantity Surveyor, every option here has a price tag attached.",
    authority: 'the cost consultant', crew: 'the commercial team'
  },
  architect: {
    id: 'architect', name: 'Architect', icon: '🏛️', accent: '#FF6EC7',
    frame: "As Architect, the design intent is yours to protect under pressure.",
    authority: 'the design review board', crew: 'the design team'
  },
  mepEngineer: {
    id: 'mepEngineer', name: 'MEP Engineer', icon: '⚡', accent: '#FF9F1C',
    frame: "As MEP Engineer, everything behind the walls has to work the first time.",
    authority: 'the services consultant', crew: 'the MEP subcontractor'
  }
};

/* Four decision archetypes reused across every node, with node-specific
   action phrasing so nothing reads like a repeated quiz template. */
const NODE_ACTIONS = {
  foundation: {
    A: "Halt the pour and commission additional soil testing + a footing redesign",
    B: "Proceed with the original footing design as scheduled",
    C: "Add a modest strip of extra reinforcement without redesigning",
    D: "Redesign only the affected footings in direct coordination with the engineer"
  },
  rebar: {
    A: "Reject the shipment and wait for the correct diameter to be re-delivered",
    B: "Install the delivered bars as-is to keep the pour date",
    C: "Substitute bars informally on-site without sign-off",
    D: "Use the bars only on non-critical columns pending engineer confirmation"
  },
  formwork: {
    A: "Postpone the pour until formwork is fully rebuilt and re-inspected",
    B: "Patch the damage quickly and pour on the original schedule",
    C: "Brace the weak sections with scrap timber to save time and cost",
    D: "Rebuild only the damaged panels overnight with a small overtime crew"
  },
  concrete: {
    A: "Delay the pour to a cooler window and adjust the mix design",
    B: "Pour as planned and monitor temperature manually",
    C: "Add extra water on-site to ease workability and keep pace",
    D: "Bring in ice/retarder admixture to control temperature and proceed"
  },
  structure: {
    A: "Stop all finishing works and re-test every similar connection",
    B: "Let finishing trades start on schedule while retesting only the failed one",
    C: "Reinforce the failed connection with a quick field fix",
    D: "Isolate the affected bay, retest it, and let unaffected floors proceed"
  },
  bridge: {
    A: "Suspend deck works and reinforce the temporary piers immediately",
    B: "Continue formwork installation and monitor the river gauge",
    C: "Add minimal sandbagging and keep the crew on the piers",
    D: "Relocate critical formwork to higher piers and post a watch crew"
  },
  tunnel: {
    A: "Stop the TBM and grout-stabilise the ground ahead of the face",
    B: "Continue boring at reduced advance rate and monitor sensors",
    C: "Push through the pocket at normal rate to protect the programme",
    D: "Stop, install additional face support, then resume at reduced rate"
  },
  airport: {
    A: "Postpone paving to the next clear night window",
    B: "Proceed with paving and race the forecast",
    C: "Thin the asphalt lift to finish faster before the rain arrives",
    D: "Bring forward extra plant and crews to finish before rain lands"
  },
  skyscraper: {
    A: "Halt the lift and have the crane fully recalibrated and inspected",
    B: "Continue the lift, treating the readings as sensor noise",
    C: "Reduce load slightly and continue without recalibration",
    D: "Pause, cross-check with a second instrument, then resume if clear"
  }
};

const ARCHETYPES = {
  A: { safety: 15, budget: -12, time: -15, quality: 15, xp: 22,
       feedback: "You chose the by-the-book route. It costs time and money now, but the project is protected." },
  B: { safety: -16, budget: 6, time: 16, quality: -10, xp: 10,
       feedback: "You kept the programme moving — but you gambled with safety and quality to do it." },
  C: { safety: -12, budget: 14, time: 6, quality: -16, xp: 8,
       feedback: "You saved money today. Whether that corner stays cut is now out of your hands." },
  D: { safety: 6, budget: -4, time: -4, quality: 10, xp: 16,
       feedback: "A measured middle path — not flashy, but solid across every metric." }
};

/* Difficulty scaling: later nodes swing the stats harder. */
function scaleForNode(nodeIndex) {
  return 1 + nodeIndex * 0.12;
}

function buildOptionLabelHint(key) {
  const hints = {
    A: '🛡️ Safer · 🐢 Slower · 💸 Costlier',
    B: '⚡ Faster · ⚠️ Riskier · 📉 Lower quality',
    C: '💰 Cheaper · ⚠️ Riskier · 📉 Lower quality',
    D: '⚖️ Balanced trade-off'
  };
  return hints[key];
}

function generateScenario(careerId, nodeIndex) {
  const node = NODES[nodeIndex];
  const career = CAREERS[careerId];
  const scale = scaleForNode(nodeIndex);
  const situation = `${career.frame} ${node.issue}`;
  const actions = NODE_ACTIONS[node.id];
  const options = ['A', 'B', 'C', 'D'].map(key => {
    const base = ARCHETYPES[key];
    return {
      key,
      label: actions[key],
      hint: buildOptionLabelHint(key),
      feedback: base.feedback,
      deltas: {
        safety: Math.round(base.safety * scale),
        budget: Math.round(base.budget * scale),
        time: Math.round(base.time * scale),
        quality: Math.round(base.quality * scale),
        xp: Math.round(base.xp * scale)
      }
    };
  });
  return {
    careerId, nodeIndex, nodeId: node.id,
    title: `${node.icon} ${node.name}`,
    situation, options
  };
}

const RANDOM_EVENTS = [
  { id: 'rain', icon: '🌧️', text: "Unscheduled heavy rain rolls in, flooding a section of the works area.",
    options: [
      { label: 'Halt outdoor work and cover materials', deltas: { safety: 8, time: -8, budget: -4, quality: 4 } },
      { label: 'Keep crews working under tarps to save time', deltas: { safety: -10, time: 8, budget: 2, quality: -4 } }
    ]},
  { id: 'concreteDelay', icon: '🚛', text: "The ready-mix supplier calls: your concrete truck is running 90 minutes late.",
    options: [
      { label: 'Reschedule the pour to the next available slot', deltas: { time: -10, quality: 8, budget: -3 } },
      { label: 'Wait it out on-site and pour late with extra retarder', deltas: { time: -4, quality: -6, budget: -6 } }
    ]},
  { id: 'craneFailure', icon: '🏗️', text: "A tower crane throws a hydraulic fault mid-lift.",
    options: [
      { label: 'Stop all lifts and call the crane technician', deltas: { safety: 12, time: -12, budget: -8 } },
      { label: 'Finish the current lift manually-guided, then stop', deltas: { safety: -14, time: 4, budget: -2 } }
    ]},
  { id: 'materialShortage', icon: '📦', text: "A last-minute audit shows you're short on a key material for tomorrow.",
    options: [
      { label: 'Expedite an emergency delivery at a premium', deltas: { budget: -12, time: 8, quality: 4 } },
      { label: 'Resequence tomorrow\'s tasks to work around the gap', deltas: { time: -6, quality: 2, budget: 2 } }
    ]},
  { id: 'inspection', icon: '🔍', text: "A surprise inspector shows up on-site, unannounced.",
    options: [
      { label: 'Down tools and walk the inspector through everything', deltas: { safety: 10, quality: 8, time: -8 } },
      { label: 'Keep working while a supervisor handles the visit', deltas: { time: 6, safety: -6, quality: -2 } }
    ]},
  { id: 'powerOutage', icon: '⚡', text: "A grid outage cuts power to site equipment for the afternoon.",
    options: [
      { label: 'Switch to backup generators immediately', deltas: { time: 4, budget: -8, safety: 4 } },
      { label: 'Pause power-dependent tasks and wait for restoration', deltas: { time: -10, budget: 2, safety: 2 } }
    ]}
];

const DAILY_CHALLENGES = [
  { icon: '🧭', title: 'Design Clash', situation: "Design and site teams disagree on how a duct routes through a beam that's already cast.",
    options: [
      { label: 'Core-drill the beam under engineer supervision', hint: '🛡️ Safer · 💸 Costlier', deltas: { safety: 8, budget: -10, quality: 10, time: -6, xp: 26 } },
      { label: 'Reroute the ductwork around the beam instead', hint: '⚖️ Balanced', deltas: { safety: 4, budget: -4, quality: 6, time: -4, xp: 22 } },
      { label: 'Notch the beam slightly without formal approval', hint: '⚠️ Risky · ⚡ Fast', deltas: { safety: -14, budget: 6, quality: -16, time: 10, xp: 12 } }
    ]},
  { icon: '📉', title: 'Budget Squeeze', situation: "A cost report shows the project is trending 6% over budget at the halfway mark.",
    options: [
      { label: 'Freeze non-essential spend and re-forecast', hint: '🛡️ Safer for budget', deltas: { budget: 16, quality: -2, time: -4, xp: 24 } },
      { label: 'Value-engineer two finishes packages', hint: '⚖️ Balanced', deltas: { budget: 12, quality: -6, time: 2, xp: 22 } },
      { label: 'Push subcontractors for a blanket discount', hint: '⚠️ Relationship risk', deltas: { budget: 10, quality: -2, safety: -2, xp: 14 } }
    ]},
  { icon: '🌡️', title: 'Heat Advisory', situation: "A extreme-heat warning is issued for tomorrow, with several outdoor crews scheduled.",
    options: [
      { label: 'Shift outdoor work to early morning only', hint: '🛡️ Safer · 🐢 Slower', deltas: { safety: 14, time: -8, xp: 24 } },
      { label: 'Add rotation breaks and hydration stations', hint: '⚖️ Balanced', deltas: { safety: 8, time: -3, budget: -2, xp: 20 } },
      { label: 'Keep the normal schedule with more water on-site', hint: '⚠️ Riskier', deltas: { safety: -10, time: 6, xp: 10 } }
    ]},
  { icon: '📋', title: 'Scope Creep', situation: "The client verbally requests an unbudgeted change during a routine walk-through.",
    options: [
      { label: 'Log it and require a formal variation order first', hint: '🛡️ Protects budget', deltas: { budget: 10, quality: 4, time: -2, xp: 24 } },
      { label: 'Agree informally now, paperwork later', hint: '⚠️ Risky precedent', deltas: { budget: -10, quality: 2, xp: 12 } },
      { label: 'Politely decline until the next scheduled review', hint: '⚖️ Balanced', deltas: { budget: 4, time: 2, quality: -2, xp: 18 } }
    ]},
  { icon: '🧱', title: 'Quality Hold Point', situation: "A hold-point inspection is due, but the follow-on crew is already staged and waiting.",
    options: [
      { label: 'Hold the crew until the inspection clears', hint: '🛡️ Safer · 🐢 Slower', deltas: { quality: 14, time: -10, xp: 24 } },
      { label: 'Let the crew begin low-risk prep work meanwhile', hint: '⚖️ Balanced', deltas: { quality: 8, time: 4, xp: 22 } },
      { label: 'Wave the crew through and inspect retroactively', hint: '⚠️ Risky', deltas: { quality: -14, time: 10, safety: -4, xp: 10 } }
    ]},
  { icon: '🚧', title: 'Access Dispute', situation: "A neighbouring property owner blocks the shared access road over dust complaints.",
    options: [
      { label: 'Bring in a water cart and negotiate in person', hint: '🛡️ Relationship-safe', deltas: { time: -4, budget: -4, safety: 4, xp: 22 } },
      { label: 'Escalate to legal / council immediately', hint: '⚖️ Formal route', deltas: { time: -8, budget: -2, quality: 2, xp: 20 } },
      { label: 'Reroute deliveries through a longer detour', hint: '⚡ Keeps peace, costs time', deltas: { time: -10, budget: -6, xp: 16 } }
    ]},
  { icon: '🩹', title: 'Near Miss', situation: "A worker reports a near-miss with a reversing dumper truck — no injury, but it was close.",
    options: [
      { label: 'Stop dumper movements and retrain all drivers today', hint: '🛡️ Safest', deltas: { safety: 16, time: -6, xp: 26 } },
      { label: 'Add a spotter and banksman for the rest of the week', hint: '⚖️ Balanced', deltas: { safety: 10, budget: -4, xp: 22 } },
      { label: 'Log it and remind the crew at tomorrow\'s toolbox talk', hint: '⚠️ Minimal action', deltas: { safety: -6, time: 4, xp: 10 } }
    ]},
  { icon: '📐', title: 'Survey Discrepancy', situation: "A resurvey shows the building setback is 40mm off the approved plan.",
    options: [
      { label: 'Stop and get formal design/authority sign-off', hint: '🛡️ Safest', deltas: { quality: 12, time: -8, budget: -4, xp: 24 } },
      { label: 'Adjust the next pour to correct the drift', hint: '⚖️ Balanced', deltas: { quality: 8, time: -3, xp: 20 } },
      { label: 'Proceed — 40mm is within informal tolerance', hint: '⚠️ Unverified risk', deltas: { quality: -10, time: 6, xp: 8 } }
    ]}
];

const ACHIEVEMENTS = [
  { id: 'first_step', name: 'First Step', icon: '🥾', desc: 'Complete your first mission.',
    check: s => s.stats.missionsCompleted >= 1 },
  { id: 'safety_first', name: 'Safety First', icon: '🛡️', desc: 'Finish a mission with 100 Safety.',
    check: s => s.stats.maxSafety >= 100 },
  { id: 'on_budget', name: 'Under Budget', icon: '💵', desc: 'Finish a mission with 90+ Budget.',
    check: s => s.stats.maxBudget >= 90 },
  { id: 'speed_demon', name: 'Speed Demon', icon: '⚡', desc: 'Finish a mission with 90+ Time.',
    check: s => s.stats.maxTime >= 90 },
  { id: 'quality_master', name: 'Quality Master', icon: '💎', desc: 'Finish a mission with 100 Quality.',
    check: s => s.stats.maxQuality >= 100 },
  { id: 'perfectionist', name: 'Perfectionist', icon: '🌟', desc: 'Earn 3 stars on any mission.',
    check: s => s.stats.threeStarCount >= 1 },
  { id: 'explorer', name: 'Explorer', icon: '🧭', desc: 'Play a mission in every career.',
    check: s => Object.values(s.careers).every(c => c.nodes.some(n => n.completed)) },
  { id: 'high_scorer', name: 'Veteran Engineer', icon: '🏆', desc: 'Reach 3000 total XP.',
    check: s => s.totalXP >= 3000 },
  { id: 'daily_warrior', name: 'Daily Warrior', icon: '📅', desc: 'Complete 3 daily challenges.',
    check: s => s.dailyStreakCount >= 3 },
  { id: 'grand_engineer', name: 'Grand Engineer', icon: '👑', desc: 'Complete every node in every career.',
    check: s => Object.values(s.careers).every(c => c.nodes.every(n => n.completed)) },
  ...Object.keys(CAREERS).map(cid => ({
    id: `master_${cid}`, name: `${CAREERS[cid].name} Master`, icon: CAREERS[cid].icon,
    desc: `Complete all 9 stages as ${CAREERS[cid].name}.`,
    check: s => s.careers[cid].nodes.every(n => n.completed)
  }))
];

/* Seed rows for the local/demo leaderboard — flavor only, never sent anywhere. */
const LEADERBOARD_SEED = [
  { name: 'A. Huseynova', role: 'Project Manager', xp: 4820 },
  { name: 'R. Mammadli', role: 'Site Engineer', xp: 4310 },
  { name: 'N. Aliyev', role: 'Planning Engineer', xp: 3990 },
  { name: 'K. Ismayilova', role: 'HSE Officer', xp: 3650 },
  { name: 'T. Guliyev', role: 'Quantity Surveyor', xp: 3200 },
  { name: 'S. Rzayeva', role: 'Site Engineer', xp: 2790 },
  { name: 'E. Novruzov', role: 'Project Manager', xp: 2340 },
  { name: 'M. Bagirova', role: 'HSE Officer', xp: 1890 }
];
