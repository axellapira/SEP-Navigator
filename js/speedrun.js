// Speedrun mode — pure network-based wikiracing for SEP articles.
//
// States: idle | setup | playing | won
// During `playing`, the network graph is the playing field. Clicks on
// non-neighbor articles are rejected; clicks on neighbors advance the run.
//
// Share URLs: ?race=<startId>,<targetId>[&c=<clicks>&t=<time>][&cats=<c1|c2|…>&lock=0|1]
// When loaded with ?race=, pops the setup window pre-filled with the pair,
// restores category filters + lock-graph flag, and optionally shows a
// "Beat: N clicks · M:SS" challenge header.

import { buildGraph } from './article_graph.js';
import globalState from './globalState.js';
import userData from './userData.js';

const STATS_KEY = 'sep-speedruns-v1';

let graph = null;
let state = 'idle';
let run = null;       // { start, target, current, path:[ids], clicks, startedAt, optimal }
let lastTick = null;  // interval id for timer
let onStateChange = () => {};

// Category filter state (persisted across runs in this session)
let allowedCategories = new Set();   // empty = all allowed
let lockGraphToCategories = true;    // when true, graph restricted during play

const elements = {};

// ----- Public API -----

export function initSpeedrun(data) {
  graph = buildGraph(data);

  // Cache DOM refs
  elements.window = document.getElementById('speedrunWindow');
  elements.setup = document.getElementById('speedrunSetup');
  elements.hud = document.getElementById('speedrunHUD');
  elements.victory = document.getElementById('speedrunVictory');
  elements.dockBadge = document.getElementById('speedrunBadge');

  // Hide HUD by default
  if (elements.hud) elements.hud.classList.add('hidden');

  // When the victory window closes via its red traffic light, also clear overlay.
  elements.victory?.addEventListener('click', e => {
    if (e.target.closest('.tl-close')) clearNetworkRestrictions();
  });

  // Setup screen interactions
  if (elements.setup) {
    elements.setup.querySelector('#srStartSearch')?.addEventListener('input', e =>
      renderSuggestions(e.target.value, 'start'));
    elements.setup.querySelector('#srTargetSearch')?.addEventListener('input', e =>
      renderSuggestions(e.target.value, 'target'));
    elements.setup.querySelector('#srRandomBtn')?.addEventListener('click', randomRun);
    elements.setup.querySelector('#srStartRunBtn')?.addEventListener('click', tryStartRun);
    elements.setup.querySelector('#srShareSetupBtn')?.addEventListener('click', shareSetupChallenge);
    renderCategoryFilters();
    const lockCb = elements.setup.querySelector('#srLockGraph');
    if (lockCb) {
      lockCb.checked = lockGraphToCategories;
      lockCb.addEventListener('change', () => { lockGraphToCategories = lockCb.checked; });
    }
  }

  // HUD give-up
  document.getElementById('srGiveUpBtn')?.addEventListener('click', giveUp);

  // (HUD is now docked under the Stanford header — no drag needed)
  // Victory buttons
  document.getElementById('srPlayAgainBtn')?.addEventListener('click', () => {
    hideVictory();
    enterSetup();
  });
  document.getElementById('srNewRandomBtn')?.addEventListener('click', () => {
    hideVictory();
    randomRun();
    tryStartRun();
  });

  // Listen to globalState for article navigation
  globalState.subscribe(handleGlobalStateChange);

  updateBadge();

  // Check for ?race=startId,targetId — pop setup pre-filled.
  maybeLoadRaceFromURL();
}

function maybeLoadRaceFromURL() {
  const params = new URLSearchParams(location.search);
  const race = params.get('race');
  if (!race || !graph) return;
  const [startId, targetId] = race.split(',').map(s => decodeURIComponent(s).trim());
  if (!startId || !targetId) return;
  const startArticle = graph.getArticle(startId);
  const targetArticle = graph.getArticle(targetId);
  if (!startArticle || !targetArticle) {
    console.warn('Race URL references unknown article ids', startId, targetId);
    return;
  }
  // Restore category filters + lock-graph flag if encoded.
  const catsParam = params.get('cats');
  if (catsParam) {
    const all = new Set(graph.allTopCategories());
    const requested = catsParam.split('|').map(s => decodeURIComponent(s).trim()).filter(Boolean);
    const valid = requested.filter(c => all.has(c));
    if (valid.length > 0) {
      allowedCategories = new Set(valid);
    }
  }
  const lockParam = params.get('lock');
  if (lockParam === '0' || lockParam === '1') {
    lockGraphToCategories = lockParam === '1';
  }
  // Open setup window and pre-fill
  enterSetup();
  // Re-render filter chips and lock checkbox to reflect restored state.
  renderCategoryFilters();
  const lockCb = elements.setup?.querySelector('#srLockGraph');
  if (lockCb) lockCb.checked = lockGraphToCategories;
  pickArticle(startArticle, 'start');
  pickArticle(targetArticle, 'target');
  // Show the challenge header (someone else's score) if present
  const challengeClicks = parseInt(params.get('c'), 10);
  const challengeTime = parseInt(params.get('t'), 10);
  showChallengeHeader(challengeClicks, challengeTime);
  // Clean URL so refresh doesn't keep re-popping
  history.replaceState({}, '', location.pathname);
}

function showChallengeHeader(clicks, time) {
  const banner = document.getElementById('srChallengeBanner');
  if (!banner) return;
  if (!clicks && !time) { banner.style.display = 'none'; return; }
  const parts = [];
  if (!Number.isNaN(clicks)) parts.push(`${clicks} click${clicks === 1 ? '' : 's'}`);
  if (!Number.isNaN(time))   parts.push(formatTime(time));
  banner.innerHTML = `<strong>Challenge:</strong> beat ${parts.join(' · ')}`;
  banner.style.display = 'block';
}

export function enterSetup() {
  state = 'setup';
  showWindow();
  if (elements.setup) elements.setup.classList.remove('hidden');
  if (elements.hud) elements.hud.classList.add('hidden');
  clearNetworkRestrictions();
  document.body.classList.remove('speedrun-active');
  resetSelections();
  // Hide any leftover challenge banner unless a URL handler re-shows it.
  const banner = document.getElementById('srChallengeBanner');
  if (banner) banner.style.display = 'none';
  onStateChange();
}

// ----- Internal -----

let pendingStart = null;
let pendingTarget = null;

function renderCategoryFilters() {
  const wrap = document.getElementById('srCategoryList');
  if (!wrap) return;
  const cats = graph.allTopCategories();
  // Default: all checked.
  if (allowedCategories.size === 0) cats.forEach(c => allowedCategories.add(c));
  wrap.innerHTML = '';
  cats.forEach(c => {
    const label = document.createElement('label');
    label.className = 'sr-cat-chip';
    const swatch = `<span class="sr-cat-swatch" style="background:${colorForCategory(c)}"></span>`;
    label.innerHTML = `
      <input type="checkbox" data-cat="${escapeHtml(c)}" ${allowedCategories.has(c) ? 'checked' : ''}/>
      ${swatch}<span>${escapeHtml(c)}</span>`;
    label.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) allowedCategories.add(c);
      else allowedCategories.delete(c);
      // Don't let the user uncheck everything.
      if (allowedCategories.size === 0) {
        e.target.checked = true;
        allowedCategories.add(c);
      }
      updateStartButton();
    });
    wrap.appendChild(label);
  });
}

function colorForCategory(name) {
  const key = (name || '').trim();
  const map = {
    'History of Philosophy':   '#c0392b',
    'Moral Philosophy':        '#e6a23c',
    'Metaphysics':             '#3e8e5a',
    'Philosophy of Knowledge': '#6a3d8a',
    'Philosophy of Logic':     '#2e7eb6',
    'Logic':                   '#2e7eb6'
  };
  return map[key] || '#8c1515';
}

function allowedSetIfLocked() {
  // The set of article ids the BFS / restrictions should respect, or null if no filter.
  if (!lockGraphToCategories) return null;
  const ids = new Set();
  graph.articles.forEach(a => {
    if (allowedCategories.has(a.broaderCategory || a.category)) ids.add(a.id);
  });
  return ids.size === graph.articles.length ? null : ids;
}

function resetSelections() {
  pendingStart = null;
  pendingTarget = null;
  if (elements.setup) {
    const sInput = elements.setup.querySelector('#srStartSearch');
    const tInput = elements.setup.querySelector('#srTargetSearch');
    if (sInput) sInput.value = '';
    if (tInput) tInput.value = '';
    elements.setup.querySelector('#srStartPick').innerHTML = '<em>pick a start article…</em>';
    elements.setup.querySelector('#srTargetPick').innerHTML = '<em>pick a target article…</em>';
    elements.setup.querySelector('#srSuggestions').innerHTML = '';
    elements.setup.querySelector('#srStartRunBtn').disabled = true;
    const shareBtn = elements.setup.querySelector('#srShareSetupBtn');
    if (shareBtn) { shareBtn.disabled = true; shareBtn.textContent = 'Share challenge'; }
    elements.setup.querySelector('#srRunSummary').textContent = '';
  }
}

function renderSuggestions(query, slot) {
  const list = elements.setup.querySelector('#srSuggestions');
  if (!list) return;
  list.dataset.slot = slot;
  const matches = graph.searchArticles(query, 10);
  list.innerHTML = '';
  matches.forEach(a => {
    const row = document.createElement('button');
    row.className = 'sr-suggest';
    row.innerHTML = `<span class="sr-sug-name">${escapeHtml(a.name)}</span>
      <span class="sr-sug-cat">${escapeHtml(a.broaderCategory || a.category || '')}</span>`;
    row.addEventListener('click', () => {
      pickArticle(a, slot);
      list.innerHTML = '';
      const input = slot === 'start'
        ? elements.setup.querySelector('#srStartSearch')
        : elements.setup.querySelector('#srTargetSearch');
      if (input) input.value = '';
    });
    list.appendChild(row);
  });
}

function pickArticle(a, slot) {
  if (slot === 'start') pendingStart = a;
  else pendingTarget = a;
  const slotEl = elements.setup.querySelector(slot === 'start' ? '#srStartPick' : '#srTargetPick');
  if (slotEl) {
    slotEl.innerHTML = `<span class="sr-pick-name">${escapeHtml(a.name)}</span>
      <button class="sr-pick-clear" title="Clear">✕</button>`;
    slotEl.querySelector('.sr-pick-clear').addEventListener('click', () => {
      if (slot === 'start') pendingStart = null;
      else pendingTarget = null;
      slotEl.innerHTML = `<em>pick a ${slot} article…</em>`;
      updateStartButton();
    });
  }
  updateStartButton();
}

function updateStartButton() {
  const btn = elements.setup?.querySelector('#srStartRunBtn');
  const shareBtn = elements.setup?.querySelector('#srShareSetupBtn');
  const summary = elements.setup?.querySelector('#srRunSummary');
  if (!btn) return;
  const can = pendingStart && pendingTarget && pendingStart.id !== pendingTarget.id;
  btn.disabled = !can;
  if (shareBtn) shareBtn.disabled = !can;
  if (summary && can) {
    const allowed = allowedSetIfLocked();
    // Allow start/target to bypass category restriction so manual picks always work.
    if (allowed) { allowed.add(pendingStart.id); allowed.add(pendingTarget.id); }
    const path = graph.shortestPath(pendingStart.id, pendingTarget.id, allowed);
    if (!path) {
      summary.innerHTML = `<span class="sr-warn">No path under current filters — try different articles or loosen categories.</span>`;
      btn.disabled = true;
      if (shareBtn) shareBtn.disabled = true;
    } else {
      summary.innerHTML = `Optimal path: <strong>${path.length - 1}</strong> click${path.length - 1 === 1 ? '' : 's'}.`;
    }
  } else if (summary) {
    summary.textContent = '';
  }
}

function shareSetupChallenge() {
  if (!pendingStart || !pendingTarget) return;
  const btn = elements.setup?.querySelector('#srShareSetupBtn');
  const params = new URLSearchParams();
  params.set('race', `${pendingStart.id},${pendingTarget.id}`);
  // Encode category filter only if it's a real restriction (not all categories).
  const allCats = graph.allTopCategories();
  const isAll = allCats.length === allowedCategories.size &&
    allCats.every(c => allowedCategories.has(c));
  if (!isAll && allowedCategories.size > 0) {
    params.set('cats', Array.from(allowedCategories).map(encodeURIComponent).join('|'));
  }
  params.set('lock', lockGraphToCategories ? '1' : '0');
  const url = `${location.origin}${location.pathname}?${params.toString()}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      if (!btn) return;
      btn.textContent = 'Link copied!';
      setTimeout(() => { btn.textContent = 'Share challenge'; }, 1400);
    }, () => {
      if (btn) btn.textContent = 'Copy failed';
    });
  } else if (btn) {
    btn.textContent = 'Clipboard unavailable';
  }
}

function randomRun() {
  const pick = graph.randomPair(3, 7, 80, allowedCategories);
  if (!pick) return;
  pickArticle(pick.start, 'start');
  pickArticle(pick.target, 'target');
}

function tryStartRun() {
  if (!pendingStart || !pendingTarget) return;
  const allowed = allowedSetIfLocked();
  if (allowed) { allowed.add(pendingStart.id); allowed.add(pendingTarget.id); }
  const path = graph.shortestPath(pendingStart.id, pendingTarget.id, allowed);
  if (!path) return;
  run = {
    start: pendingStart,
    target: pendingTarget,
    current: pendingStart,
    path: [pendingStart.id],
    optimalPath: path,
    allowedSet: allowed,
    clicks: 0,
    startedAt: Date.now(),
    optimal: path.length - 1
  };
  state = 'playing';
  if (elements.setup) elements.setup.classList.add('hidden');
  if (elements.hud) elements.hud.classList.remove('hidden');
  hideWindow(); // setup window away — HUD takes over
  document.body.classList.add('speedrun-active');
  // Navigate to the start article (drives existing views)
  navigateToCurrent();
  startTimer();
  renderHUD();
  // The graph re-renders asynchronously after globalState update; retry a few times.
  [40, 200, 600, 1200].forEach(t => setTimeout(applyNetworkRestrictions, t));
}

function navigateToCurrent() {
  if (!run) return;
  globalState.update({
    type: 'single',
    category: null,
    subcategory: null,
    node: {
      id: run.current.id,
      name: run.current.name,
      broaderCategory: run.current.broaderCategory,
      category: run.current.category,
      articleUrl: run.current.articleUrl
    }
  });
}

function handleGlobalStateChange(view) {
  if (state !== 'playing') return;
  // Re-apply restrictions any time the graph might have re-rendered (with a tiny delay)
  setTimeout(() => applyNetworkRestrictions(), 60);
  if (view.type !== 'single' || !view.node) return;
  const nextId = view.node.id;
  if (nextId === run.current.id) return; // same article — no-op
  // Check if it's a valid neighbor
  const neighbors = graph.neighborsOf(run.current.id);
  if (!neighbors.has(nextId)) {
    flashHUD('Not a neighbor — click a connected node');
    setTimeout(() => navigateToCurrent(), 0);
    return;
  }
  // Check if it's within the allowed category set (start/target always allowed)
  if (run.allowedSet && !run.allowedSet.has(nextId)) {
    flashHUD('Outside the allowed categories');
    setTimeout(() => navigateToCurrent(), 0);
    return;
  }
  // Valid move
  run.current = graph.getArticle(nextId) || {
    id: nextId,
    name: view.node.name,
    broaderCategory: view.node.broaderCategory,
    category: view.node.category,
    articleUrl: view.node.articleUrl
  };
  run.path.push(nextId);
  run.clicks += 1;
  renderHUD();
  applyNetworkRestrictions();
  if (nextId === run.target.id) {
    win();
  }
}

function applyNetworkRestrictions() {
  const svg = document.querySelector('#largeNetworkBody svg');
  if (!svg || !run) return;
  const neighbors = graph.neighborsOf(run.current.id);
  const allowed = run.allowedSet;
  const inAllowed = id => !allowed || allowed.has(id);

  // Hide nodes outside the allowed set entirely.
  svg.querySelectorAll('g.nodes circle').forEach(c => {
    const d = c.__data__;
    if (!d) return;
    if (!inAllowed(d.id)) {
      c.style.display = 'none';
      return;
    }
    c.style.display = '';
    if (d.id === run.current.id) {
      c.style.opacity = '1';
      c.setAttribute('stroke', '#222');
      c.setAttribute('stroke-width', '3');
    } else if (neighbors.has(d.id)) {
      c.style.opacity = '1';
      c.setAttribute('stroke', d.id === run.target.id ? '#e0aa3e' : '#fff');
      c.setAttribute('stroke-width', d.id === run.target.id ? '3' : '1.5');
    } else if (d.id === run.target.id) {
      // Target is always boldly visible and pulsing.
      c.style.opacity = '1';
      c.setAttribute('stroke', '#e0aa3e');
      c.setAttribute('stroke-width', '4');
      c.classList.add('sr-target-pulse');
    } else {
      c.style.opacity = '0.15';
      c.setAttribute('stroke', null);
    }
    if (d.id !== run.target.id) c.classList.remove('sr-target-pulse');
  });

  // Hide edges where either endpoint is outside the allowed set.
  svg.querySelectorAll('g.links line').forEach(l => {
    const d = l.__data__;
    if (!d) return;
    const sId = d.source?.id ?? d.source;
    const tId = d.target?.id ?? d.target;
    l.style.display = (inAllowed(sId) && inAllowed(tId)) ? '' : 'none';
  });

  // Hide labels of hidden nodes too.
  svg.querySelectorAll('g.labels text').forEach(t => {
    const d = t.__data__;
    if (!d) return;
    t.style.display = inAllowed(d.id) ? '' : 'none';
  });

  // Make sure the target's label is rendered prominently, even if the
  // network's normal label-throttling would have hidden it.
  ensureTargetLabel(svg);
}

function ensureTargetLabel(svg) {
  if (!run || !svg) return;
  // Remove any prior speedrun target label so we keep position fresh.
  svg.querySelectorAll('.sr-target-label').forEach(el => el.remove());
  const labelG = svg.querySelector('g.labels');
  if (!labelG) return;
  const nodesG = svg.querySelector('g.nodes');
  if (!nodesG) return;
  let targetCircle = null;
  nodesG.querySelectorAll('circle').forEach(c => {
    if (c.__data__ && c.__data__.id === run.target.id) targetCircle = c;
  });
  if (!targetCircle || !targetCircle.__data__) return;
  const d = targetCircle.__data__;
  if (typeof d.x !== 'number') return;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'sr-target-label');
  text.setAttribute('x', d.x);
  text.setAttribute('y', d.y - 14);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '14');
  text.setAttribute('font-weight', '800');
  text.setAttribute('fill', '#a47620');
  text.setAttribute('paint-order', 'stroke');
  text.setAttribute('stroke', '#fff');
  text.setAttribute('stroke-width', '4');
  text.style.pointerEvents = 'none';
  text.textContent = '★ ' + run.target.name;
  labelG.appendChild(text);
}

function clearNetworkRestrictions() {
  const svg = document.querySelector('#largeNetworkBody svg');
  if (!svg) return;
  svg.querySelectorAll('g.nodes circle').forEach(c => {
    c.style.opacity = '';
    c.style.display = '';
  });
  svg.querySelectorAll('g.links line').forEach(l => { l.style.display = ''; });
  svg.querySelectorAll('g.labels text').forEach(t => { t.style.display = ''; });
  svg.querySelectorAll('.sr-optimal-overlay').forEach(el => el.remove());
  svg.querySelectorAll('.sr-target-label').forEach(el => el.remove());
  svg.querySelectorAll('circle.sr-target-pulse').forEach(c => c.classList.remove('sr-target-pulse'));
}

// Render a vertical stacked path: each step gets its own row with a numbered
// circle + article name. Clicking the name opens the article; the star saves it.
// Bullets are colored by the article's top category; the connector line uses
// the section accent so YOUR vs OPTIMAL still reads at a glance.
function renderPathList(pathIds, lineColor) {
  if (!pathIds || pathIds.length === 0) return '';
  const rows = pathIds.map((id, i) => {
    const a = graph.getArticle(id);
    const name = a ? a.name : id;
    const cat = a ? (a.broaderCategory || a.category) : null;
    const bulletColor = colorForCategory(cat);
    const isLast = i === pathIds.length - 1;
    return `
      <div class="sr-path-row" data-article-id="${escapeHtml(id)}">
        <div class="sr-path-bullet" style="background:${bulletColor}">${i + 1}</div>
        ${isLast ? '' : `<div class="sr-path-line" style="background:${lineColor};"></div>`}
        <button class="sr-path-name" title="Open article">${escapeHtml(name)}</button>
        <button class="sr-path-star" title="Save to Reading List" aria-label="Save">☆</button>
      </div>`;
  }).join('');
  return `<div class="sr-path-list">${rows}</div>`;
}

let restrictionTick = null;
function startTimer() {
  if (lastTick) clearInterval(lastTick);
  lastTick = setInterval(renderHUD, 250);
  // While playing, keep restrictions + target label in sync with the simulation.
  if (restrictionTick) clearInterval(restrictionTick);
  restrictionTick = setInterval(() => {
    if (state === 'playing') applyNetworkRestrictions();
  }, 500);
}
function stopTimer() {
  if (lastTick) clearInterval(lastTick);
  lastTick = null;
  if (restrictionTick) clearInterval(restrictionTick);
  restrictionTick = null;
}

function renderHUD() {
  if (!elements.hud || !run) return;
  const elapsed = (Date.now() - run.startedAt) / 1000;
  setHudName('#srHudStart', run.start);
  setHudName('#srHudTarget', run.target);
  setHudName('#srHudCurrent', run.current);
  elements.hud.querySelector('#srHudClicks').textContent = run.clicks;
  elements.hud.querySelector('#srHudTime').textContent = formatTime(elapsed);
  elements.hud.querySelector('#srHudOptimal').textContent = run.optimal;
}

function setHudName(selector, article) {
  const el = elements.hud.querySelector(selector);
  if (!el || !article) return;
  el.textContent = article.name;
  const cat = (article.broaderCategory || article.category || '').trim();
  const sub = (article.category || '').trim();
  el.style.color = colorForCategory(cat);
  // Set tooltip on the parent column wrapper so overflow:hidden on the name doesn't clip it.
  const wrap = el.closest('.sr-hud-tippable') || el;
  const tipLines = [
    article.name,
    cat ? `Category: ${cat}` : null,
    sub && sub !== cat ? `Subcategory: ${sub}` : null
  ].filter(Boolean);
  wrap.setAttribute('data-tip', tipLines.join(' · '));
}

function flashHUD(message) {
  if (!elements.hud) return;
  const msg = elements.hud.querySelector('#srHudMessage');
  if (!msg) return;
  msg.textContent = message;
  msg.classList.remove('flash');
  void msg.offsetWidth;
  msg.classList.add('flash');
  setTimeout(() => { if (msg.textContent === message) msg.textContent = ''; }, 1800);
}

function giveUp() {
  if (state !== 'playing') return;
  const optimal = run.optimalPath ? run.optimalPath.slice() : null;
  const userPath = run.path ? run.path.slice() : null;
  const elapsed = (Date.now() - run.startedAt) / 1000;
  const clicks = run.clicks;
  const startName = run.start.name;
  const targetName = run.target.name;
  const optimalN = run.optimal;
  stopTimer();
  state = 'idle';
  if (elements.hud) elements.hud.classList.add('hidden');
  document.body.classList.remove('speedrun-active');
  clearNetworkRestrictions();
  showVictory({
    clicks, time: elapsed, optimal: optimalN, stars: 0,
    start: startName, target: targetName,
    gaveUp: true,
    optimalPath: optimal,
    userPath
  });
  run = null;
}

function win() {
  state = 'won';
  stopTimer();
  const elapsed = (Date.now() - run.startedAt) / 1000;
  const stars = computeStars(run.clicks, run.optimal);
  saveStats({
    date: new Date().toISOString(),
    start: run.start.id,
    target: run.target.id,
    clicks: run.clicks,
    time: elapsed,
    optimal: run.optimal,
    stars
  });
  if (elements.hud) elements.hud.classList.add('hidden');
  document.body.classList.remove('speedrun-active');
  clearNetworkRestrictions();
  const optimal = run.optimalPath ? run.optimalPath.slice() : null;
  const userPath = run.path ? run.path.slice() : null;
  showVictory({ clicks: run.clicks, time: elapsed, optimal: run.optimal, stars,
                start: run.start.name, target: run.target.name,
                optimalPath: optimal, userPath });
  run = null;
}

function cleanupRun() {
  stopTimer();
  clearNetworkRestrictions();
  run = null;
}

function computeStars(clicks, optimal) {
  const over = clicks - optimal;
  if (over <= 0) return 3;
  if (over <= 2) return 2;
  if (over <= 5) return 1;
  return 0;
}

function showVictory({ clicks, time, optimal, stars, start, target, gaveUp, optimalPath, userPath }) {
  const v = elements.victory;
  if (!v) return;
  // Make sure the modal isn't stuck in any closed/minimized state from earlier.
  v.classList.remove('hidden', 'is-closed', 'is-minimized', 'is-maximized');
  v.dataset.state = 'normal';
  v.style.display = '';
  v.style.transform = 'none';
  // Size + center within the desktop, clamping so it always fits.
  const desktopRect = document.getElementById('desktop').getBoundingClientRect();
  const maxW = Math.min(560, desktopRect.width  - 40);
  const maxH = Math.min(640, desktopRect.height - 40);
  v.style.width  = maxW + 'px';
  v.style.height = maxH + 'px';
  v.style.left = Math.max(20, (desktopRect.width  - maxW) / 2) + 'px';
  v.style.top  = Math.max(20, (desktopRect.height - maxH) / 2) + 'px';
  // Bring it to the front
  const allZ = Array.from(document.querySelectorAll('.window')).map(x => parseInt(x.style.zIndex) || 10);
  v.style.zIndex = (Math.max(...allZ) || 10) + 1;
  const titleEl = v.querySelector('h2');
  if (titleEl) titleEl.textContent = gaveUp ? 'Race ended' : 'You reached it!';
  v.querySelector('#srVStart').textContent = start;
  v.querySelector('#srVTarget').textContent = target;
  v.querySelector('#srVClicks').textContent = gaveUp ? `${clicks} (gave up)` : clicks;
  v.querySelector('#srVOptimal').textContent = optimal;
  v.querySelector('#srVTime').textContent = formatTime(time);
  const starsEl = v.querySelector('#srVStars');
  starsEl.innerHTML = '★★★'.split('').map((_, i) =>
    `<span class="sr-star ${i < stars ? 'is-filled' : ''}">★</span>`).join('');
  // Path diagrams
  const pathEl = v.querySelector('#srVPath');
  if (pathEl) {
    let html = '';
    if (userPath && userPath.length > 1) {
      const labelText = gaveUp
        ? `YOUR PATH · ${userPath.length - 1} click${userPath.length - 1 === 1 ? '' : 's'} (gave up)`
        : `YOUR PATH · ${userPath.length - 1} click${userPath.length - 1 === 1 ? '' : 's'}`;
      html += `
        <div class="sr-vpath-block">
          <div class="sr-vpath-label">${labelText}</div>
          ${renderPathList(userPath, '#8c1515')}
        </div>`;
    }
    if (optimalPath && optimalPath.length > 1) {
      html += `
        <div class="sr-vpath-block">
          <div class="sr-vpath-label sr-vpath-label-opt">OPTIMAL PATH · ${optimalPath.length - 1} click${optimalPath.length - 1 === 1 ? '' : 's'}</div>
          ${renderPathList(optimalPath, '#e0aa3e')}
        </div>`;
    }
    pathEl.innerHTML = html;
    pathEl.style.display = html ? 'block' : 'none';
    // Wire up path row interactions
    pathEl.querySelectorAll('.sr-path-row').forEach(row => {
      const id = row.dataset.articleId;
      const a = graph.getArticle(id);
      const star = row.querySelector('.sr-path-star');
      const refreshStar = () => {
        const saved = userData.isSaved(id);
        star.textContent = saved ? '★' : '☆';
        star.classList.toggle('is-saved', saved);
        star.title = saved ? 'Remove from Reading List' : 'Save to Reading List';
      };
      refreshStar();
      star.addEventListener('click', e => {
        e.stopPropagation();
        userData.toggleSave(id, a ? {
          name: a.name, url: a.articleUrl, topCategory: a.broaderCategory || a.category
        } : { name: id });
        refreshStar();
      });
      row.querySelector('.sr-path-name').addEventListener('click', () => {
        if (!a) return;
        globalState.update({
          type: 'single',
          category: null,
          subcategory: null,
          node: {
            id: a.id, name: a.name,
            broaderCategory: a.broaderCategory, category: a.category,
            articleUrl: a.articleUrl
          }
        });
      });
    });
  }
  // Share URL — uses article IDs so it survives label tweaks
  const shareBtn = v.querySelector('#srShareBtn');
  shareBtn.onclick = () => {
    const startId = run?.start?.id || pendingStart?.id || findIdByName(start);
    const targetId = run?.target?.id || pendingTarget?.id || findIdByName(target);
    if (!startId || !targetId) return;
    const params = new URLSearchParams();
    params.set('race', `${startId},${targetId}`);
    if (clicks != null) params.set('c', String(clicks));
    if (time != null) params.set('t', String(Math.round(time)));
    const allCats = graph.allTopCategories();
    const isAll = allCats.length === allowedCategories.size &&
      allCats.every(c => allowedCategories.has(c));
    if (!isAll && allowedCategories.size > 0) {
      params.set('cats', Array.from(allowedCategories).map(encodeURIComponent).join('|'));
    }
    params.set('lock', lockGraphToCategories ? '1' : '0');
    const url = `${location.origin}${location.pathname}?${params.toString()}`;
    navigator.clipboard?.writeText(url).then(() => {
      shareBtn.textContent = 'Copied!';
      setTimeout(() => shareBtn.textContent = 'Share', 1400);
    });
  };
}

function findIdByName(name) {
  if (!name || !graph) return null;
  for (const a of graph.articles) if (a.name === name) return a.id;
  return null;
}

function hideVictory() {
  if (elements.victory) elements.victory.classList.add('hidden');
}

function showWindow() {
  const win = document.getElementById('speedrunWindow');
  if (win && win.dataset.state !== 'normal') {
    win.dataset.state = 'normal';
    win.classList.remove('is-closed', 'is-minimized');
    // Bring to front
    const allZ = Array.from(document.querySelectorAll('.window'))
      .map(w => parseInt(w.style.zIndex) || 10);
    win.style.zIndex = Math.max(...allZ) + 1;
  }
}
function hideWindow() {
  const win = document.getElementById('speedrunWindow');
  if (win) { win.dataset.state = 'closed'; win.classList.add('is-closed'); }
}

function saveStats(entry) {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(entry);
    localStorage.setItem(STATS_KEY, JSON.stringify(arr));
  } catch (_) {}
  updateBadge();
}

function updateBadge() {
  if (!elements.dockBadge) return;
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const n = raw ? JSON.parse(raw).length : 0;
    if (n > 0) {
      elements.dockBadge.style.display = 'inline-flex';
      elements.dockBadge.textContent = n > 99 ? '99+' : String(n);
    } else {
      elements.dockBadge.style.display = 'none';
    }
  } catch (_) {}
}

function setupHudDrag(hud) {
  if (!hud) return;
  let drag = null;
  hud.addEventListener('mousedown', e => {
    // Don't drag from buttons inside the HUD.
    if (e.target.closest('button')) return;
    const rect = hud.getBoundingClientRect();
    drag = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };
    hud.style.transform = 'none';
    hud.style.left = rect.left + 'px';
    hud.style.top = rect.top + 'px';
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    hud.style.left = (e.clientX - drag.offsetX) + 'px';
    hud.style.top  = (e.clientY - drag.offsetY) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (drag) {
      drag = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  });
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
