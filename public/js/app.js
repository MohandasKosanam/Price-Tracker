const state = {
  user: null,
  categories: [],
  route: 'home',
  search: { query: '', locality: '', category: '', availability: 'available', sort: 'low', page: 1 },
  ownerView: 'overview',
  ownerAddMode: 'custom',
  adminView: 'overview',
  ownerData: null,
  adminData: null,
  pendingConfirm: null,
  searchController: null,
  searchRequest: 0
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const icon = (name, className = '') => `<svg class="icon ${className}"><use href="#i-${name}"></use></svg>`;
const escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'there';
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'LP';
const artKeys = ['pen', 'notebook', 'tea', 'care', 'bulb', 'pencil'];
const artClass = (key = '') => `art-${artKeys.includes(String(key).toLowerCase()) ? String(key).toLowerCase() : 'notebook'}`;
const productArtKey = (product = {}) => {
  const text = `${product.name || ''} ${product.brand || ''} ${product.category || ''}`.toLowerCase();
  const semanticRules = [
    ['pen', /\b(ball\s*)?pen\b|gel\s*pen|marker|highlighter|ink\b|writing/],
    ['pencil', /pencil|crayon|graphite|drawing/],
    ['notebook', /notebook|diary|journal|register|paper|folder|file|book\b/],
    ['tea', /tea|coffee|sugar|rice|flour|atta|dal|spice|snack|biscuit|bread|milk|grocery|pantry|bottle|mug|cup/],
    ['care', /soap|wash|shampoo|cream|lotion|toothpaste|toothbrush|sanitizer|deodorant|skincare|personal\s*care/],
    ['bulb', /bulb|light|lamp|led|battery|cable|charger|switch|home\s*supplies/]
  ];
  const semantic = semanticRules.find(([, pattern]) => pattern.test(text));
  if (semantic) return semantic[0];
  const explicit = String(product.image_key || '').toLowerCase();
  if (artKeys.includes(explicit)) return explicit;
  const categoryFallback = { stationery: 'notebook', pantry: 'tea', 'personal care': 'care', 'home supplies': 'bulb' }[String(product.category || '').toLowerCase()];
  if (categoryFallback) return categoryFallback;
  const name = String(product.name || 'product');
  const hash = [...name].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);
  return artKeys[hash % artKeys.length];
};
const productArtLabel = (product = {}, key = productArtKey(product)) => ({ pen: 'R', notebook: '▤', tea: 'tea', care: '+', bulb: '◌', pencil: 'HB' }[key] || String(product.name || 'P').trim().slice(0, 1).toUpperCase());
const art = (key, label = '') => `<div class="product-art ${artClass(key)}"><span>${escapeHTML(label || productArtLabel({}, String(key).toLowerCase()))}</span></div>`;
const productPhotoFor = (product = {}) => {
  if (product.image_url) return product.image_url;
  const name = String(product.name || '').trim().toLocaleLowerCase();
  const exactPhotos = {
    'ball pen blue': '/images/products/pen.jpg',
    'hb pencil pack': '/images/products/pencils.jpg',
    'a4 notebook': '/images/products/notebook.jpg',
    'pocket notebook': '/images/products/notebook.jpg',
    'premium tea 250g': '/images/products/tea.jpg',
    'hand wash 250ml': '/images/products/hand-wash.jpg',
    'led bulb 9w': '/images/products/led-bulb.jpg'
  };
  return exactPhotos[name] || '';
};
const productVisual = (product = {}, label = '', extraClass = '', id = '') => {
  const photo = productPhotoFor(product);
  return photo ? `<div class="product-art product-photo ${extraClass}"${id ? ` id="${escapeHTML(id)}"` : ''}><img src="${escapeHTML(photo)}" alt="${escapeHTML(product.name || 'Product photo')}" loading="lazy" width="384" height="320"></div>` : `<div class="product-art ${artClass(productArtKey(product))} ${extraClass}"${id ? ` id="${escapeHTML(id)}"` : ''} aria-label="${escapeHTML(product.name || 'Product')} visual"><span>${escapeHTML(label || productArtLabel(product))}</span></div>`;
};

const authCatMarkup = `<div class="auth-cat" data-auth-cat data-cat-state="idle" aria-hidden="true"><canvas class="cat-composite" width="384" height="378"></canvas><video class="cat-video" muted playsinline preload="auto"></video><video class="cat-video" muted playsinline preload="none"></video><img class="cat-static-fallback" src="/images/cat/cat-static-fallback.png" alt=""></div>`;

function prepareAuthUI() {
  const intro = $('.auth-intro');
  const brand = intro?.querySelector('.brand-mark');
  if (intro && brand && !intro.querySelector('[data-auth-cat]')) brand.insertAdjacentHTML('afterend', authCatMarkup);
  const loginForm = $('#login-form');
  const submit = loginForm?.querySelector('button[type="submit"]');
  if (loginForm && submit) {
    loginForm.classList.add('auth-form');
    submit.classList.add('auth-submit');
    if (!submit.querySelector('.submit-label')) submit.innerHTML = `<span class="submit-label">Log in</span>${icon('arrow-right', 'icon-small')}`;
    if (!loginForm.querySelector('[data-auth-feedback]')) submit.insertAdjacentHTML('beforebegin', '<p class="auth-feedback" data-auth-feedback aria-live="polite"></p>');
    loginForm.querySelector('[name="email"]')?.setAttribute('autocomplete', 'email');
    loginForm.querySelector('[name="password"]')?.setAttribute('autocomplete', 'current-password');
  }
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { headers, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Something went wrong.');
  return payload;
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type === 'error' ? 'error' : ''}`;
  item.innerHTML = `${icon(type === 'error' ? 'info' : 'check')}<span>${escapeHTML(message)}</span>`;
  $('#toast-region').appendChild(item);
  window.setTimeout(() => { item.classList.add('toast-out'); window.setTimeout(() => item.remove(), 260); }, 3600);
}

function setTheme(theme) {
  const next = theme || (document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  document.documentElement.dataset.theme = next;
  document.body.classList.add('theme-changing');
  clearTimeout(document.body._themeTimer);
  document.body._themeTimer = window.setTimeout(() => document.body.classList.remove('theme-changing'), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 520);
  localStorage.setItem('localprice-theme', next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#09121e' : '#e8edf2');
  document.documentElement.dispatchEvent(new Event('themechange'));
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.querySelector('.theme-label').textContent = next === 'dark' ? 'Dark' : 'Light';
    button.querySelector('use').setAttribute('href', next === 'dark' ? '#i-moon' : '#i-sun');
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  clearTimeout(modal._closeTimer);
  modal.classList.remove('is-closing');
  const alreadyOpen = $$('.modal-backdrop:not(.is-hidden)').at(-1);
  modal._returnFocus = alreadyOpen ? null : document.activeElement;
  modal.classList.remove('is-hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  window.requestAnimationFrame(() => modal.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')?.focus({ preventScroll: true }));
}

function closeModals() {
  const opened = $$('.modal-backdrop:not(.is-hidden)');
  opened.forEach((modal) => {
    modal.classList.add('is-closing');
    modal.setAttribute('aria-hidden', 'true');
    modal._closeTimer = window.setTimeout(() => { modal.classList.add('is-hidden'); modal.classList.remove('is-closing'); }, 160);
  });
  document.body.classList.remove('modal-open');
  suspendAuthCat();
  const returnFocus = opened[0]?._returnFocus;
  if (returnFocus?.isConnected) window.requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
}

const catAnimation = Object.freeze({
  idle: { file: 'cat-idle.mp4', priority: 0, loop: true },
  curious: { file: 'cat-curious.mp4', priority: 1 },
  blink: { file: 'cat-blink.mp4', priority: 2 },
  focused: { file: 'cat-blink.mp4', priority: 2 },
  peek: { file: 'cat-curious.mp4', priority: 2 },
  shy: { file: 'cat-blink.mp4', priority: 2 },
  happy: { file: 'cat-happy.mp4', priority: 3 },
  concerned: { file: 'cat-concerned.mp4', priority: 3 },
  submitting: { file: 'cat-curious.mp4', priority: 2 }
});

async function playCatVideo(cat, state, force = false) {
  const controller = cat?._controller;
  if (!controller) return;
  const config = catAnimation[state];
  if (!config) return;
  if (controller.reduced.matches) return showCatFallback(cat, 'reduced');
  if (!force && controller.state !== 'idle' && config.priority < controller.priority) return;
  if (!force && controller.state === state && !controller.videos[controller.active].paused) return;
  clearTimeout(controller.blinkTimer);
  const request = ++controller.request;
  controller.state = state;
  controller.priority = config.priority;
  cat.dataset.catState = state;
  const nextIndex = controller.active === 0 ? 1 : 0;
  const incoming = controller.videos[nextIndex];
  const outgoing = controller.videos[controller.active];
  incoming.pause();
  incoming.loop = Boolean(config.loop);
  incoming.muted = true;
  incoming.playsInline = true;
  incoming.src = `/images/cat/${config.file}`;
  incoming.load();
  try {
    if (incoming.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video load timed out')), 10000);
        incoming.addEventListener('loadeddata', () => { clearTimeout(timeout); resolve(); }, { once: true });
        incoming.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Video failed to load')); }, { once: true });
      });
    }
    if (request !== controller.request) return;
    await incoming.play();
    if (request !== controller.request) { incoming.pause(); return; }
    await startCatCompositing(cat, incoming, request);
    if (request !== controller.request) { incoming.pause(); return; }
    controller.fallback.classList.add('is-hidden');
    controller.canvas.classList.add('is-active');
    stopCatCompositing(outgoing);
    outgoing.pause();
    controller.active = nextIndex;
    incoming.onended = () => {
      incoming.onended = null;
      if (request === controller.request && !config.loop) playCatVideo(cat, 'idle', true);
    };
    if (state === 'idle') scheduleCatBlink(cat, request);
  } catch (error) {
    if (request === controller.request) showCatFallback(cat, 'fallback');
  }
}

function startCatCompositing(cat, video, request) {
  const controller = cat._controller;
  const { canvas, context } = controller;
  if (!context) return Promise.reject(new Error('Canvas is unavailable'));
  const width = canvas.width, height = canvas.height;
  const draw = (resolveFirst) => {
    if (request !== controller.request || video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const aspect = width / height;
    const sourceHeight = Math.min(video.videoHeight, video.videoWidth / aspect);
    const sourceWidth = sourceHeight * aspect;
    const sx = (video.videoWidth - sourceWidth) / 2;
    const sy = (video.videoHeight - sourceHeight) / 2;
    context.drawImage(video, sx, sy, sourceWidth, sourceHeight, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height);
    const pixels = frame.data;
    const bgR = (pixels[0] + pixels[(width - 1) * 4] + pixels[((height - 1) * width) * 4] + pixels[(height * width - 1) * 4]) / 4;
    const bgG = (pixels[1] + pixels[(width - 1) * 4 + 1] + pixels[((height - 1) * width) * 4 + 1] + pixels[(height * width - 1) * 4 + 1]) / 4;
    const bgB = (pixels[2] + pixels[(width - 1) * 4 + 2] + pixels[((height - 1) * width) * 4 + 2] + pixels[(height * width - 1) * 4 + 2]) / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const greenExcess = Math.min(g - r, g - b);
      if (g > 48 && greenExcess > 14) {
        const t = Math.max(0, Math.min(1, (greenExcess - 12) / 48));
        const alpha = 1 - t;
        if (alpha < .04) { pixels[i + 3] = 0; continue; }
        pixels[i] = Math.max(0, Math.min(255, (r - bgR * (1 - alpha)) / alpha));
        pixels[i + 1] = Math.max(0, Math.min(255, (g - bgG * (1 - alpha)) / alpha));
        pixels[i + 2] = Math.max(0, Math.min(255, (b - bgB * (1 - alpha)) / alpha));
        pixels[i + 3] = Math.round(alpha * 255);
      }
    }
    context.putImageData(frame, 0, 0);
    if (resolveFirst) resolveFirst();
    const next = () => draw();
    if (video.requestVideoFrameCallback) video._catRenderHandle = video.requestVideoFrameCallback(next);
    else video._catRenderHandle = requestAnimationFrame(next);
  };
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const wait = () => {
      if (request !== controller.request) return reject(new Error('Video request superseded'));
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) return draw(resolve);
      if (++attempts > 60) return reject(new Error('No video frame available'));
      requestAnimationFrame(wait);
    };
    wait();
  });
}

function stopCatCompositing(video) {
  if (!video?._catRenderHandle) return;
  if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(video._catRenderHandle);
  else cancelAnimationFrame(video._catRenderHandle);
  video._catRenderHandle = 0;
}

function showCatFallback(cat, state = 'fallback') {
  const controller = cat?._controller;
  if (!controller) return;
  ++controller.request;
  clearTimeout(controller.blinkTimer);
  controller.videos.forEach((video) => { stopCatCompositing(video); video.pause(); video.classList.remove('is-active'); });
  controller.canvas.classList.remove('is-active');
  controller.fallback.classList.remove('is-hidden');
  controller.state = state;
  cat.dataset.catState = state;
}

function suspendAuthCat() {
  const cat = $('[data-auth-cat]');
  const controller = cat?._controller;
  if (!controller) return;
  ++controller.request;
  clearTimeout(controller.blinkTimer);
  controller.videos.forEach((video) => video.pause());
  controller.videos.forEach(stopCatCompositing);
  controller.canvas.classList.remove('is-active');
  controller.state = 'idle'; controller.priority = 0; cat.dataset.catState = 'idle';
}

function scheduleCatBlink(cat, idleRequest) {
  const controller = cat._controller;
  clearTimeout(controller.blinkTimer);
  controller.blinkTimer = setTimeout(() => {
    if (controller.request === idleRequest && controller.state === 'idle') playCatVideo(cat, 'blink');
  }, 18000 + Math.random() * 12000);
}

function setAuthCatMood(mood = 'idle', force = false) {
  const cat = $('[data-auth-cat]');
  if (!cat?._controller) return;
  if (mood === 'error' || mood === 'concerned') mood = 'concerned';
  if (mood === 'success') mood = 'happy';
  if (mood === 'email' || mood === 'password' || mood === 'focused' || mood === 'shy') mood = 'blink';
  if (mood === 'looking') mood = 'focused';
  playCatVideo(cat, mood in catAnimation ? mood : 'idle', force);
}

function setupAuthCat() {
  const cat = $('[data-auth-cat]');
  if (!cat) return;
  const videos = [...cat.querySelectorAll('video')];
  const canvas = cat.querySelector('.cat-composite');
  cat._controller = { videos, canvas, context: canvas.getContext('2d', { willReadFrequently: true }), fallback: cat.querySelector('.cat-static-fallback'), active: 0, state: 'idle', priority: 0, request: 0, blinkTimer: 0, reduced: matchMedia('(prefers-reduced-motion: reduce)') };
  videos.forEach((video) => { video.muted = true; video.playsInline = true; video.addEventListener('error', () => { if (cat._controller.state !== 'idle' || !video.src.endsWith('cat-idle.mp4')) showCatFallback(cat); }); });
  cat._controller.reduced.addEventListener?.('change', (event) => { if (event.matches) showCatFallback(cat, 'reduced'); else playCatVideo(cat, 'idle', true); });
  suspendAuthCat();
}

function setAuthFeedback(message = '', type = '') {
  const form = $('#login-form');
  const feedback = form?.querySelector('[data-auth-feedback]');
  if (!form || !feedback) return;
  feedback.textContent = message;
  feedback.dataset.type = type;
  form.classList.toggle('auth-error', type === 'error');
}

function setAuthLoading(form, loading) {
  const submit = form?.querySelector('button[type="submit"]');
  if (!submit) return;
  const label = submit.querySelector('.submit-label');
  submit.disabled = loading;
  submit.setAttribute('aria-busy', String(loading));
  if (label) label.textContent = loading ? 'Checking…' : 'Log in';
}

function openAuth(mode = 'login') {
  openModal('auth-modal');
  setAuthFeedback();
  switchAuthTab(mode === 'register-owner' ? 'register' : mode, true);
  setAuthCatMood('idle', true);
  if (mode === 'register-owner') {
    $('#register-role').value = 'shop_owner';
    $('#owner-fields').classList.remove('is-hidden');
  }
  window.setTimeout(() => $('#auth-modal [data-close-modal]')?.focus(), 120);
}

function switchAuthTab(tab, initializing = false) {
  $$('[data-auth-tab]').forEach((button) => button.classList.toggle('active', button.dataset.authTab === tab));
  $('#login-form').classList.toggle('is-hidden', tab !== 'login');
  $('#register-form').classList.toggle('is-hidden', tab !== 'register');
  setAuthFeedback();
  if (!initializing) setAuthCatMood(tab === 'login' ? 'idle' : 'curious', true);
}

function setAppVisibility(isApp) {
  $('#public-nav').classList.toggle('is-hidden', isApp);
  $('#landing-view').classList.toggle('is-hidden', isApp);
  $('#app-view').classList.toggle('is-hidden', !isApp);
  $('.footer').classList.toggle('is-hidden', isApp);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function go(route, replace = false) {
  const target = `#${route}`;
  if (replace) history.replaceState(null, '', target);
  else if (location.hash !== target) location.hash = route;
  else renderRoute();
}

function renderRoute() {
  const raw = location.hash.replace(/^#/, '') || 'home';
  state.route = raw.split('?')[0] || 'home';
  if (['home', 'explore', 'how-it-works'].includes(state.route)) {
    setAppVisibility(false);
    $$('.public-links a').forEach((link) => link.classList.toggle('active', link.dataset.route === state.route));
    if (state.route !== 'home') window.setTimeout(() => document.getElementById(state.route)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
    return;
  }
  if (state.route === 'owner' && (!state.user || state.user.role !== 'shop_owner')) { openAuth('login'); toast('Sign in as a shop owner to open this dashboard.', 'error'); return; }
  if (state.route === 'admin' && (!state.user || state.user.role !== 'admin')) { openAuth('login'); toast('Administrator access is required.', 'error'); return; }
  setAppVisibility(true);
  renderApp();
}

function appHeader(title, subtitle, search = true) {
  return `<header class="app-topbar"><a class="brand" href="#home"><span class="brand-mark">LP</span><span>Local<span class="brand-muted">Price</span></span></a>${search ? `<form class="search-panel" data-search-form><label class="search-field"><span class="sr-only">Search</span>${icon('search')}<input name="query" value="${escapeHTML(state.search.query)}" placeholder="Search products" autocomplete="off"></label><label class="search-field search-field-place"><span class="sr-only">Locality</span>${icon('map-pin')}<input name="locality" value="${escapeHTML(state.search.locality)}" placeholder="Locality"></label><button type="submit" class="button button-primary search-submit">Search</button></form>` : ''}<div class="nav-actions"><button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun')}<span class="theme-label">${document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light'}</span></button><button class="user-menu" type="button" data-user-menu><span class="user-avatar">${initials(state.user?.full_name || 'Guest')}</span><span>${escapeHTML(state.user ? firstName(state.user.full_name) : 'Guest')}</span>${icon('chevron-down', 'icon-small')}</button></div></header>`;
}

function sideNav(items, active, kind) {
  return `<aside class="side-nav"><p class="side-nav-title">${kind === 'owner' ? 'Store workspace' : kind === 'admin' ? 'Administration' : 'Your workspace'}</p><span class="nav-indicator" aria-hidden="true"></span>${items.map((item) => `<button class="side-link ${active === item.key ? 'active' : ''}" type="button" data-${kind}-view="${item.key}">${icon(item.icon)}<span>${item.label}</span></button>`).join('')}<div class="side-separator"></div><button class="side-link" type="button" data-logout>${icon('log-out')}<span>Log out</span></button></aside>`;
}

function positionNavIndicator(nav = $('.side-nav')) {
  if (!nav) return;
  const active = nav.querySelector('.side-link.active');
  const indicator = nav.querySelector('.nav-indicator');
  if (!active || !indicator) return;
  const navRect = nav.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  const horizontal = matchMedia('(max-width: 760px)').matches;
  indicator.style.width = `${rect.width}px`;
  indicator.style.height = `${rect.height}px`;
  indicator.style.transform = horizontal
    ? `translate(${rect.left - navRect.left + nav.scrollLeft}px, 0)`
    : `translate(0, ${rect.top - navRect.top + nav.scrollTop}px)`;
}

function renderApp() {
  const isOwner = state.route === 'owner';
  const isAdmin = state.route === 'admin';
  const isSearch = state.route === 'search' || state.route === 'customer';
  if (isOwner) {
    $('#app-view').innerHTML = `${appHeader('Store workspace', 'Manage your local catalogue with clarity.')}<div class="app-layout">${sideNav([{ key: 'overview', icon: 'chart', label: 'Overview' }, { key: 'products', icon: 'box', label: 'My products' }, { key: 'add', icon: 'plus', label: 'Add product' }, { key: 'store', icon: 'store', label: 'My store' }], state.ownerView, 'owner')}<main class="app-main"><div class="app-content" id="owner-content"></div></main></div>`;
    positionNavIndicator();
    loadOwnerView();
    return;
  }
  if (isAdmin) {
    $('#app-view').innerHTML = `${appHeader('Admin console', 'Keep the LocalPrice marketplace reliable.')}<div class="app-layout">${sideNav([{ key: 'overview', icon: 'chart', label: 'Overview' }, { key: 'approvals', icon: 'store', label: 'Shop approvals' }, { key: 'products', icon: 'box', label: 'Products' }, { key: 'listings', icon: 'list', label: 'Listings' }, { key: 'categories', icon: 'grid', label: 'Categories' }, { key: 'users', icon: 'users', label: 'Accounts' }], state.adminView, 'admin')}<main class="app-main"><div class="app-content" id="admin-content"></div></main></div>`;
    positionNavIndicator();
    loadAdminView();
    return;
  }
  $('#app-view').innerHTML = `${appHeader('Explore local prices', 'A clearer way to choose what to buy nearby.')}<div class="app-layout">${sideNav([{ key: 'search', icon: 'search', label: 'Compare prices' }, { key: 'customer', icon: 'clock', label: 'Recent searches' }], 'search', 'customer')}<main class="app-main"><div class="app-content" id="customer-content"></div></main></div>`;
  positionNavIndicator();
  loadCustomerView();
}

async function loadCategories() {
  try { state.categories = (await api('/api/categories')).categories || []; } catch (error) { console.warn(error); }
}

function landingProductCard(product, storeCount) {
  return `<article class="product-card" data-product-query="${escapeHTML(product.name)}" data-product-details='${escapeHTML(JSON.stringify(product))}'><div class="product-card-top">${productVisual(product)}<span class="availability-dot">Available</span></div><div class="product-card-body"><span class="card-kicker">${escapeHTML(product.brand)} · ${escapeHTML(product.category || 'Everyday')}</span><h3>${escapeHTML(product.name)}</h3><div class="product-card-meta"><strong>from ${shortMoney(product.price)}</strong><span>${storeCount} ${storeCount === 1 ? 'store' : 'stores'}</span></div></div></article>`;
}

function renderLandingFeed(items) {
  const feed = $('#market-feed');
  if (!feed || !items.length) return;
  feed.innerHTML = `<div class="feed-heading"><span>Sample price listings</span><span>Store data</span></div>${items.slice(0, 3).map((item) => { const key = productArtKey(item); return `<div class="feed-item"><span class="feed-avatar ${artClass(key)}">${escapeHTML(productArtLabel(item, key))}</span><span><strong>${escapeHTML(item.name)} at ${escapeHTML(item.store_name)}</strong><small>${escapeHTML(item.locality)} · ${relativeDate(item.updated_at)}</small></span><b>${shortMoney(item.price)}</b></div>`; }).join('')}`;
}

function renderHeroLadder(items) {
  const ladder = $('#hero-price-ladder');
  if (!ladder || !items.length) return;
  const best = Number(items[0].price);
  ladder.innerHTML = items.slice(0, 3).map((item, index) => `<div class="price-ladder-row ${index === 0 ? 'best' : ''}"><span class="rank">${String(index + 1).padStart(2, '0')}</span><span class="ladder-store"><span class="store-avatar">${escapeHTML((item.store_name || 'S')[0])}</span><span><strong>${escapeHTML(item.store_name)}</strong><small>${escapeHTML(item.locality)} · updated ${relativeDate(item.updated_at)}</small></span></span><strong class="ladder-price">${shortMoney(item.price)}</strong>${index === 0 ? '<span class="best-badge">Best</span>' : `<span class="ladder-gap">+${shortMoney(Number(item.price) - best)}</span>`}</div>`).join('');
}

function renderLandingMarket(data) {
  const available = (data.results || []).filter((item) => item.is_available);
  if (!available.length) {
    const label = $('#hero-data-label'); if (label) label.textContent = 'No sample prices';
    const feed = $('#market-feed'); if (feed) feed.innerHTML = '<div class="feed-heading"><span>Sample price listings</span><span>Store data</span></div><div class="feed-item"><span>No available listings yet. Try product search below.</span></div>';
    return;
  }
  const isDemo = data.database === 'demo' || available.every((item) => item.is_demo);
  const dataLabel = $('#hero-data-label'); if (dataLabel) dataLabel.textContent = isDemo ? 'Illustrative demo prices' : 'Nearby store prices';
  const dataNote = $('#hero-data-note'); if (dataNote) dataNote.textContent = isDemo ? 'Fictional sample listings' : 'Submitted by local stores';
  const first = available[0];
  const comparisonLocality = String(first.locality || '').trim().toLocaleLowerCase();
  const sameProduct = available.filter((item) => item.product_id === first.product_id && String(item.locality || '').trim().toLocaleLowerCase() === comparisonLocality).sort((a, b) => Number(a.price) - Number(b.price));
  const heroArt = $('#hero-product-art');
  if (heroArt) heroArt.outerHTML = productVisual(first, 'R', 'hero-product-art', 'hero-product-art');
  const name = $('#hero-product-name'); if (name) name.textContent = first.name;
  const category = $('#hero-product-category'); if (category) category.textContent = `Featured comparison · ${first.category || 'Everyday'}`;
  const meta = $('#hero-product-meta'); if (meta) meta.textContent = `${first.brand} · ${sameProduct.length} ${sameProduct.length === 1 ? 'store' : 'stores'} found`;
  const locality = $('#hero-locality'); if (locality) locality.textContent = first.locality || 'Nearby stores';
  const savings = $('#hero-savings'); if (savings) savings.textContent = sameProduct.length > 1 ? `${shortMoney(Number(sameProduct[sameProduct.length - 1].price) - Number(sameProduct[0].price))} saved` : 'best price found';
  const priceDifference = $('#hero-price-difference'); if (priceDifference) priceDifference.textContent = sameProduct.length > 1 ? `${shortMoney(Number(sameProduct[sameProduct.length - 1].price) - Number(sameProduct[0].price))} range` : 'One store price';
  const itemStoreCount = $('#hero-store-count'); if (itemStoreCount) itemStoreCount.textContent = String(new Set(sameProduct.map((item) => item.store_id)).size);
  renderHeroLadder(sameProduct);
  renderLandingFeed(available);
  const products = new Map();
  available.forEach((item) => { const current = products.get(item.product_id); if (!current || Number(item.price) < Number(current.price)) products.set(item.product_id, item); });
  const recent = $('#recent-products');
  if (recent) recent.innerHTML = [...products.values()].slice(0, 3).map((item) => landingProductCard(item, available.filter((row) => row.product_id === item.product_id).length)).join('');
  const listings = $('#metric-listings'); if (listings) listings.textContent = data.total || available.length;
  const stores = $('#metric-stores'); if (stores) stores.textContent = new Set(available.map((item) => item.store_id)).size;
  const localities = $('#metric-localities'); if (localities) localities.textContent = `Across ${new Set(available.map((item) => item.locality).filter(Boolean)).size} localities`;
  const savingsMetric = $('#metric-savings');
  if (savingsMetric) {
    const comparisons = new Map();
    available.forEach((item) => {
      const key = `${item.product_id}:${String(item.locality || '').trim().toLocaleLowerCase()}`;
      const prices = comparisons.get(key) || [];
      prices.push(Number(item.price));
      comparisons.set(key, prices);
    });
    const spreads = [...comparisons.values()].filter((prices) => prices.length > 1).map((prices) => Math.max(...prices) - Math.min(...prices));
    savingsMetric.textContent = spreads.length ? shortMoney(spreads.reduce((sum, value) => sum + value, 0) / spreads.length) : '—';
  }
}

async function loadLandingMarket() {
  try {
    const data = await api('/api/products?availability=available&sort=low&limit=50');
    renderLandingMarket(data);
  } catch (error) {
    console.warn(error);
    const label = $('#hero-data-label'); if (label) label.textContent = 'Prices unavailable';
    const note = $('#hero-data-note'); if (note) note.textContent = 'Try search again in a moment';
    const feed = $('#market-feed'); if (feed) feed.innerHTML = `<div class="feed-heading"><span>Sample price listings</span><span>Unavailable</span></div><div class="feed-item"><span>${escapeHTML(error.message)} <button type="button" data-retry-market>Retry</button></span></div>`;
  }
}

function setupRevealAnimations() {
  const sections = $$('.content-section, .live-market-section, .process-section, .recent-section, .owner-banner, .cta-section');
  sections.forEach((section) => section.classList.add('reveal-target'));
  if (window.LocalPriceVisuals) {
    window.LocalPriceVisuals.tagSurfaces();
  }
  if (!('IntersectionObserver' in window)) { sections.forEach((section) => section.classList.add('revealed')); return; }
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('revealed'); currentObserver.unobserve(entry.target); } });
  }, { threshold: .12 });
  sections.forEach((section) => observer.observe(section));
}

function categoryChips() {
  return `<div class="filter-chips"><button class="filter-chip ${!state.search.category ? 'active' : ''}" type="button" data-category-filter="">All products</button>${state.categories.map((category) => `<button class="filter-chip ${String(state.search.category) === String(category.category_id) || state.search.category === category.name ? 'active' : ''}" type="button" data-category-filter="${escapeHTML(category.category_id)}">${escapeHTML(category.name)}</button>`).join('')}</div>`;
}

function productRow(item, bestPrice) {
  const isBest = item.is_available && Number(item.price) === bestPrice;
  return `<article class="comparison-row"><div class="comparison-product" data-product-details='${escapeHTML(JSON.stringify(item))}' role="button" tabindex="0" aria-label="View ${escapeHTML(item.name)} details">${productVisual(item)}<div><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.brand)} · ${escapeHTML(item.category || 'Product')}</span></div></div><div class="store-cell"><span class="store-avatar">${escapeHTML((item.store_name || 'S')[0])}</span><div><strong>${escapeHTML(item.store_name)}</strong><span>${escapeHTML(item.locality)} · ${escapeHTML(item.phone || 'Store contact available')}</span></div></div><div class="price-cell ${isBest ? 'best-price' : ''}"><strong>${shortMoney(item.price)}</strong>${isBest ? '<span class="best-badge">Best available</span>' : `<small>Updated ${relativeDate(item.updated_at)}</small>`}</div><div><span class="availability ${item.is_available ? '' : 'out'}">${item.is_available ? 'In stock' : 'Out of stock'}</span></div><div class="row-action"><button type="button" class="icon-button" data-store-details='${escapeHTML(JSON.stringify(item))}' aria-label="View store details">${icon('arrow-up-right')}</button></div></article>`;
}

function relativeDate(value) {
  if (!value) return 'recently';
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function loadCustomerView() {
  const target = $('#customer-content');
  if (!target) return;
  target.innerHTML = `<div class="page-intro"><div><p class="eyebrow">Your local shortlist</p><h1>Compare with confidence.</h1><p>Find the right price, from a store that is close by.</p></div></div><form class="app-search" data-search-form><label class="search-field search-field-product">${icon('search')}<span class="sr-only">Product</span><input name="query" value="${escapeHTML(state.search.query)}" placeholder="Search by product or brand"></label><label class="search-field search-field-place">${icon('map-pin')}<span class="sr-only">Locality</span><input name="locality" value="${escapeHTML(state.search.locality)}" placeholder="Locality or pincode"></label><button class="button button-primary search-submit" type="submit">Compare prices ${icon('arrow-right', 'icon-small')}</button></form><div class="filter-bar">${categoryChips()}<div class="select-wrap"><select data-sort aria-label="Sort results"><option value="low" ${state.search.sort === 'low' ? 'selected' : ''}>Lowest price first</option><option value="high" ${state.search.sort === 'high' ? 'selected' : ''}>Highest price first</option></select>${icon('chevron-down')}</div></div><div id="results-area" aria-live="polite"><div class="comparison-skeletons" role="status" aria-label="Loading nearby prices">${Array.from({ length: 3 }, () => '<div class="comparison-skeleton"><span></span><span></span><span></span><i></i></div>').join('')}</div></div>`;
  await queryResults();
}

async function queryResults() {
  const target = $('#results-area');
  if (!target) return;
  state.searchController?.abort();
  const controller = new AbortController();
  state.searchController = controller;
  const requestId = ++state.searchRequest;
  target.classList.add('loading');
  try {
    const params = new URLSearchParams({ query: state.search.query, locality: state.search.locality, category: state.search.category, availability: state.search.availability, sort: state.search.sort, page: state.search.page });
    const data = await api(`/api/products?${params}`, { signal: controller.signal });
    if (requestId !== state.searchRequest) return;
    const best = data.results.filter((item) => item.is_available).reduce((lowest, item) => Math.min(lowest, Number(item.price)), Infinity);
    const pagination = data.pages > 1 ? `<div class="pagination"><button class="icon-button" type="button" data-search-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''} aria-label="Previous page">${icon('arrow-left')}</button><span>Page ${data.page} of ${data.pages}</span><button class="icon-button" type="button" data-search-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''} aria-label="Next page">${icon('arrow-right')}</button></div>` : '';
    target.innerHTML = `<div class="results-summary"><h2>${data.total ? `${data.total} ${data.total === 1 ? 'listing' : 'listings'} found` : 'No listings found'}</h2><span>${state.search.locality ? `Showing stores near ${escapeHTML(state.search.locality)}` : 'Showing approved local store listings'}</span></div>${data.results.length ? `<div class="comparison-list">${data.results.map((item) => productRow(item, best)).join('')}</div>${pagination}` : `<div class="empty-state"><div class="modal-icon">${icon('search')}</div><h3>Nothing matched this search.</h3><p>Try a broader product name or another locality. New listings are added regularly.</p><button class="button button-quiet" type="button" data-clear-search>Clear filters</button></div>`}`;
  } catch (error) {
    if (error.name !== 'AbortError' && requestId === state.searchRequest) target.innerHTML = `<div class="empty-state"><div class="modal-icon">${icon('info')}</div><h3>Could not load prices</h3><p>${escapeHTML(error.message)}</p><button class="button button-quiet" type="button" data-retry-search>Try again</button></div>`;
  } finally {
    if (requestId === state.searchRequest) target.classList.remove('loading');
  }
}

function dashboardStat(label, value, foot, iconName, positive = false) {
  return `<div class="stat-card"><span class="stat-label">${label}${icon(iconName)}</span><strong class="stat-value">${value}</strong><span class="stat-foot ${positive ? 'positive' : ''}">${foot}</span></div>`;
}

async function loadOwnerView() {
  const target = $('#owner-content');
  if (!target) return;
  target.innerHTML = `<div class="empty-state"><div class="modal-icon"><span class="spinner"></span></div><h3>Loading your workspace</h3><p>Bringing in your store details.</p></div>`;
  try {
    const [overview, catalogue] = await Promise.all([api('/api/owner/overview'), api('/api/owner/catalogue')]);
    state.ownerData = { ...overview, catalogue: catalogue.products || [] };
    if (state.ownerView === 'overview') target.innerHTML = ownerOverview(state.ownerData);
    if (state.ownerView === 'products') target.innerHTML = ownerProducts(state.ownerData);
    if (state.ownerView === 'add') target.innerHTML = ownerAddProduct(state.ownerData);
    if (state.ownerView === 'store') target.innerHTML = ownerStore(state.ownerData);
  } catch (error) { target.innerHTML = `<div class="empty-state"><div class="modal-icon">${icon('info')}</div><h3>Workspace unavailable</h3><p>${escapeHTML(error.message)}</p></div>`; }
}

function ownerIntro(kicker, title, subtitle, action = '') {
  return `<div class="page-intro"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function ownerOverview(data) {
  const store = data.store;
  const status = store?.approval_status || 'pending';
  const statusLabel = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Needs attention' : 'Pending approval';
  return `${ownerIntro('Store overview', `Good morning, ${escapeHTML(firstName(state.user.full_name))}.`, 'A quick look at what shoppers see from your store.', `<button class="button button-primary" type="button" data-owner-view="add">${icon('plus', 'icon-small')} Add product</button>`)}${!store || status !== 'approved' ? `<div class="notice-bar ${status === 'rejected' ? 'notice-danger' : ''}">${icon(status === 'rejected' ? 'info' : 'clock')}<span><strong>${statusLabel}</strong> ${!store ? 'Complete your store profile to start listing products.' : 'Your store will appear in customer searches once approved by an administrator.'}</span></div>` : ''}<div class="stats-grid">${dashboardStat('Listed products', data.stats.total, 'Across your catalogue', 'box')}${dashboardStat('Available now', data.stats.available, 'Visible to customers', 'check', true)}${dashboardStat('Out of stock', data.stats.outOfStock, 'Update when ready', 'clock')}${dashboardStat('Store status', status === 'approved' ? 'Live' : 'Review', statusLabel, 'store', status === 'approved')}</div><div class="dashboard-grid"><section class="dashboard-panel"><div class="panel-heading"><h2>Recent listings</h2><button class="text-link" type="button" data-owner-view="products">View all ${icon('arrow-right', 'icon-small')}</button></div>${data.listings.length ? data.listings.slice(0, 4).map((item) => `<div class="mini-result">${productVisual(item)}<div class="mini-result-info"><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.brand)} · ${item.is_available ? 'Available' : 'Out of stock'}</span></div><div class="mini-price"><strong>${money(item.price)}</strong><span>${relativeDate(item.updated_at)}</span></div></div>`).join('') : `<div class="empty-inline">No products listed yet. Add your first product to get started.</div>`}</section><section class="dashboard-panel"><div class="panel-heading"><h2>Your store</h2><button class="text-link" type="button" data-owner-view="store">Edit</button></div>${store ? `<div class="store-summary"><span class="store-avatar large">${escapeHTML(store.store_name[0])}</span><h3>${escapeHTML(store.store_name)}</h3><p>${escapeHTML(store.locality)}</p><span class="badge ${status === 'approved' ? 'badge-success' : status === 'rejected' ? 'badge-danger' : 'badge-warning'}">${statusLabel}</span></div><div class="store-details"><span>${icon('map-pin')} ${escapeHTML(store.address)}</span><span>${icon('phone')} ${escapeHTML(store.phone || 'Add a phone number')}</span></div>` : `<div class="empty-inline">Store details are not available.</div>`}</section></div>`;
}

function ownerProducts(data) {
  return `${ownerIntro('Catalogue', 'My products.', 'Keep the prices and availability shoppers see up to date.', `<button class="button button-primary" type="button" data-owner-view="add">${icon('plus', 'icon-small')} Add product</button>`)}<div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Availability</th><th>Updated</th><th></th></tr></thead><tbody>${data.listings.length ? data.listings.map((item) => `<tr><td><div class="table-product">${productVisual(item)}<div><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.brand)}</small></div></div></td><td>${escapeHTML(item.category || '—')}</td><td><strong>${money(item.price)}</strong></td><td><span class="badge ${item.is_available ? 'badge-success' : 'badge-warning'}">${item.is_available ? 'Available' : 'Out of stock'}</span></td><td>${relativeDate(item.updated_at)}</td><td><div class="table-actions"><button class="icon-button" type="button" data-edit-listing="${item.listing_id}" aria-label="Edit listing">${icon('edit')}</button><button class="icon-button" type="button" data-delete-listing="${item.listing_id}" aria-label="Delete listing">${icon('trash')}</button></div></td></tr>`).join('') : `<tr><td colspan="6"><div class="empty-inline">No products listed yet.</div></td></tr>`}</tbody></table></div>`;
}

function ownerAddProduct(data) {
  const custom = state.ownerAddMode === 'custom';
  const tabs = `<div class="composer-tabs"><button type="button" class="${custom ? 'active' : ''}" data-composer-mode="custom">Create a product</button><button type="button" class="${!custom ? 'active' : ''}" data-composer-mode="catalogue">Use catalogue</button></div>`;
  if (!custom) return `${ownerIntro('Catalogue', 'Add a product.', 'Add an existing catalogue item to your store.', '')}${tabs}<form class="form-panel" data-owner-add-form><h2>New store listing</h2><p>Your listing will be associated with ${escapeHTML(data.store?.store_name || 'your store')}.</p><div class="field-grid"><div class="field field-full"><label>Product from catalogue<select name="productId" required><option value="">Choose a product</option>${data.catalogue.map((item) => `<option value="${item.product_id}">${escapeHTML(item.brand)} · ${escapeHTML(item.name)}</option>`).join('')}</select></label></div><div class="field"><label>Price in rupees<input name="price" type="number" min="0" step="0.01" placeholder="e.g. 49.00" required></label></div><div class="field"><label class="toggle-line"><input name="isAvailable" type="checkbox" checked> Available to customers</label></div></div><div class="form-actions"><button class="button button-quiet" type="button" data-owner-view="overview">Cancel</button><button class="button button-primary" type="submit">Save listing ${icon('arrow-right', 'icon-small')}</button></div></form>`;
  return `${ownerIntro('Catalogue', 'Create a product.', 'Add a complete product listing with the details customers need.', '')}${tabs}<form class="form-panel custom-product-form" data-owner-custom-form enctype="multipart/form-data"><h2>New product listing</h2><p>This product will be added to the shared LocalPrice catalogue and listed in ${escapeHTML(data.store?.store_name || 'your store')}.</p><div class="custom-product-layout"><div class="custom-product-fields"><div class="field-grid"><div class="field"><label>Product name<input name="name" type="text" maxlength="160" placeholder="e.g. Cotton face towel" required></label></div><div class="field"><label>Brand<input name="brand" type="text" maxlength="100" placeholder="e.g. Solimo" required></label></div><div class="field"><label>Category<select name="categoryId" required><option value="">Choose category</option>${state.categories.map((category) => `<option value="${category.category_id}">${escapeHTML(category.name)}</option>`).join('')}</select></label></div><div class="field"><label>Price in rupees<input name="price" type="number" min="0" step="0.01" placeholder="e.g. 149.00" required></label></div><div class="field field-full"><label>Description<textarea name="description" rows="4" maxlength="1000" placeholder="Describe the size, material, pack quantity, or other useful details." required></textarea><small class="field-help">${icon('info')} Add at least 10 characters so shoppers can make a confident choice.</small></label></div><div class="field field-full"><label class="toggle-line"><input name="isAvailable" type="checkbox" checked> Available to customers</label></div></div></div><div class="image-upload-card"><input class="sr-only" id="custom-product-image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-product-image><label class="image-dropzone" for="custom-product-image"><span class="image-preview" data-image-preview>${icon('plus')}<small>Add product image</small></span><strong>Drop an image here</strong><small>JPG, PNG, WEBP or GIF · max 3MB</small><span class="button button-quiet">Choose image</span></label></div></div><div class="form-actions"><button class="button button-quiet" type="button" data-owner-view="overview">Cancel</button><button class="button button-primary" type="submit">Create product & listing ${icon('arrow-right', 'icon-small')}</button></div></form>`;
}

function openProductDetails(product) {
  const modal = $('#product-detail-content');
  if (!modal) return;
  modal.innerHTML = `<div class="product-detail-visual">${productVisual(product, '', 'detail-art')}</div><div class="product-detail-copy"><span class="eyebrow">${escapeHTML(product.category || 'Everyday essential')}</span><h2 id="product-detail-title">${escapeHTML(product.name)}</h2><p class="product-detail-brand">${escapeHTML(product.brand || 'Local brand')}</p><p class="product-detail-description">${escapeHTML(product.description || 'A useful local product, listed with current store information.')}</p>${product.price !== undefined ? `<div class="product-detail-price"><span>Available from</span><strong>${money(product.price)}</strong></div>` : ''}<div class="product-detail-actions"><button class="button button-primary" type="button" data-detail-search="${escapeHTML(product.name)}">Compare nearby prices ${icon('arrow-right', 'icon-small')}</button><button class="button button-quiet" type="button" data-close-modal>Close</button></div></div>`;
  openModal('product-modal');
}

function ownerStore(data) {
  const store = data.store || {};
  return `${ownerIntro('Store profile', 'My store.', 'This is the information customers use to find and contact you.')}<form class="form-panel" data-store-form><h2>Store information</h2><p>Keep your local presence accurate and easy to trust.</p><div class="field-grid"><div class="field"><label>Store name<input name="storeName" value="${escapeHTML(store.store_name || '')}" placeholder="Your store name"></label></div><div class="field"><label>Locality<input name="locality" value="${escapeHTML(store.locality || '')}" placeholder="Your locality"></label></div><div class="field field-full"><label>Address<input name="address" value="${escapeHTML(store.address || '')}" placeholder="Street and area"></label></div><div class="field"><label>Contact number<input name="phone" value="${escapeHTML(store.phone || '')}" placeholder="10-digit phone"></label></div><div class="field"><label>Approval status<div class="status-input"><span class="badge ${store.approval_status === 'approved' ? 'badge-success' : 'badge-warning'}">${store.approval_status === 'approved' ? 'Approved and visible' : 'Pending administrator review'}</span></div></label></div></div><div class="form-actions"><button class="button button-primary" type="submit">Save changes ${icon('check', 'icon-small')}</button></div></form>`;
}

async function loadAdminView() {
  const target = $('#admin-content');
  if (!target) return;
  target.innerHTML = `<div class="empty-state"><div class="modal-icon"><span class="spinner"></span></div><h3>Loading admin console</h3><p>Gathering marketplace activity.</p></div>`;
  try {
    state.adminData = await api('/api/admin/overview');
    if (state.adminView === 'overview') target.innerHTML = adminOverview(state.adminData);
    if (state.adminView === 'approvals') target.innerHTML = adminApprovals(state.adminData);
    if (state.adminView === 'products') target.innerHTML = adminProducts(state.adminData);
    if (state.adminView === 'categories') target.innerHTML = adminCategories(state.adminData);
    if (state.adminView === 'users') target.innerHTML = adminUsers(state.adminData);
    if (state.adminView === 'listings') target.innerHTML = adminListings(state.adminData);
  } catch (error) { target.innerHTML = `<div class="empty-state"><div class="modal-icon">${icon('info')}</div><h3>Admin console unavailable</h3><p>${escapeHTML(error.message)}</p></div>`; }
}

function adminIntro(kicker, title, subtitle) { return `<div class="page-intro"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${subtitle}</p></div></div>`; }

function adminOverview(data) {
  const pending = data.stores.filter((store) => store.approval_status === 'pending');
  return `${adminIntro('Marketplace overview', 'Keep local commerce moving.', 'A focused view of people, stores, and listings in LocalPrice.')}<div class="stats-grid">${dashboardStat('Registered users', data.stats.users, 'Customer and owner accounts', 'users')}${dashboardStat('Registered shops', data.stats.shops, 'Across localities', 'store')}${dashboardStat('Pending approvals', data.stats.pending, pending.length ? 'Needs your review' : 'All caught up', 'clock', !pending.length)}${dashboardStat('Product listings', data.stats.listings, 'Prices being compared', 'box')}</div><div class="store-approval-grid"><section class="dashboard-panel"><div class="panel-heading"><h2>Needs your attention</h2><button class="text-link" type="button" data-admin-view="approvals">See all</button></div>${pending.length ? pending.slice(0, 3).map((store) => approvalCard(store)).join('') : `<div class="empty-inline">No stores are waiting for approval.</div>`}</section><section class="dashboard-panel"><div class="panel-heading"><h2>Categories</h2><button class="text-link" type="button" data-admin-view="categories">Manage</button></div><div class="category-list">${data.categories.slice(0, 5).map((category) => `<div class="category-list-item"><span>${escapeHTML(category.name)}</span><small>Catalogue category</small></div>`).join('')}</div></section></div>`;
}

function approvalCard(store) {
  return `<div class="approval-card"><div><h3>${escapeHTML(store.store_name)}</h3><p>${escapeHTML(store.owner_name || 'Store owner')} · ${escapeHTML(store.locality)}</p></div><div class="approval-actions"><button class="button button-primary" type="button" data-approve-store="${store.store_id}" data-status="approved">Approve</button><button class="button button-quiet" type="button" data-approve-store="${store.store_id}" data-status="rejected">Decline</button></div></div>`;
}

function adminApprovals(data) {
  return `${adminIntro('Store approvals', 'Review local stores.', 'Approve listings that meet the basic store information requirements.')}<div class="table-wrap"><table class="data-table"><thead><tr><th>Store</th><th>Owner</th><th>Locality</th><th>Status</th><th>Action</th></tr></thead><tbody>${data.stores.map((store) => `<tr><td><strong>${escapeHTML(store.store_name)}</strong><small>${escapeHTML(store.address || '')}</small></td><td>${escapeHTML(store.owner_name || '—')}<small>${escapeHTML(store.owner_email || '')}</small></td><td>${escapeHTML(store.locality)}</td><td><span class="badge ${store.approval_status === 'approved' ? 'badge-success' : store.approval_status === 'rejected' ? 'badge-danger' : 'badge-warning'}">${escapeHTML(store.approval_status)}</span></td><td>${store.approval_status === 'pending' ? `<div class="approval-actions"><button class="button button-primary" type="button" data-approve-store="${store.store_id}" data-status="approved">Approve</button><button class="button button-quiet" type="button" data-approve-store="${store.store_id}" data-status="rejected">Decline</button></div>` : `<button class="button button-quiet" type="button" data-approve-store="${store.store_id}" data-status="pending">Re-open</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}

function adminCategories(data) {
  return `${adminIntro('Catalogue structure', 'Categories.', 'Keep the central catalogue easy for customers and stores to browse.')}<section class="form-panel admin-create-panel"><h2>Add a category</h2><p>Use a clear name and short browsing description.</p><form data-admin-category-form class="admin-create-form"><label>Category name<input name="name" maxlength="80" required></label><label>Description<input name="description" maxlength="255"></label><button class="button button-primary" type="submit">Add category</button></form></section><section class="dashboard-panel"><div class="panel-heading"><h2>Product categories</h2><span class="muted-small">${data.categories.length} categories</span></div><div class="category-list">${data.categories.map((category) => { const count = (data.products || []).filter((product) => Number(product.category_id) === Number(category.category_id)).length; return `<div class="category-list-item"><span><strong>${escapeHTML(category.name)}</strong><small>${escapeHTML(category.description || 'No description')} · ${count} ${count === 1 ? 'product' : 'products'}</small></span><div class="table-actions"><button class="icon-button" type="button" data-edit-category="${category.category_id}" data-category-name="${escapeHTML(category.name)}" aria-label="Edit category">${icon('edit')}</button><button class="icon-button" type="button" data-delete-category="${category.category_id}" data-category-name="${escapeHTML(category.name)}" aria-label="Delete category">${icon('trash')}</button></div></div>`; }).join('')}</div></section>`;
}

function adminProducts(data) {
  return `${adminIntro('Central catalogue', 'Products.', 'Maintain shared product names, brands, descriptions, and categories.')}<section class="form-panel admin-create-panel"><h2>Add a product</h2><p>New catalogue entries are available to shop owners for listing.</p><form data-admin-product-form class="admin-product-form"><label>Product name<input name="name" maxlength="160" required></label><label>Brand<input name="brand" maxlength="100" required></label><label>Category<select name="categoryId" required>${(data.categories || []).map((category) => `<option value="${category.category_id}">${escapeHTML(category.name)}</option>`).join('')}</select></label><label>Unit / quantity<input name="unit" maxlength="80" placeholder="e.g. 250 g"></label><label class="admin-photo-field">Product photo<input name="image" type="file" accept="image/*" data-admin-product-image><small>Optional · JPEG, PNG, WebP, max 3 MB</small></label><label class="admin-product-description">Description<textarea name="description" maxlength="1000" rows="2"></textarea></label><button class="button button-primary" type="submit">Add product</button></form></section><div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Brand</th><th>Category</th><th>Description</th><th>Action</th></tr></thead><tbody>${(data.products || []).map((product) => `<tr><td><div class="table-product">${productVisual(product)}<div><strong>${escapeHTML(product.name)}</strong><small>Product #${product.product_id}${product.unit ? ` · ${escapeHTML(product.unit)}` : ''}</small></div></div></td><td>${escapeHTML(product.brand)}</td><td>${escapeHTML(product.category)}</td><td class="description-cell">${escapeHTML(product.description || 'No description added')}</td><td><div class="table-actions"><button class="button button-quiet" type="button" data-edit-product="${product.product_id}">Edit</button><button class="icon-button" type="button" data-delete-product="${product.product_id}" aria-label="Delete ${escapeHTML(product.name)}" title="Delete when no store listings use this product">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function adminListings(data) {
  const listings = data.listings || [];
  return `${adminIntro('Marketplace activity', 'Store listings.', 'Monitor the prices and availability submitted across approved stores.')}<div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Store</th><th>Locality</th><th>Price</th><th>Availability</th><th>Updated</th></tr></thead><tbody>${listings.map((item) => `<tr><td><strong>${escapeHTML(item.product_name)}</strong><small>${escapeHTML(item.brand)}</small></td><td>${escapeHTML(item.store_name)}</td><td>${escapeHTML(item.locality)}</td><td>${shortMoney(item.price)}</td><td><span class="badge ${item.is_available ? 'badge-success' : 'badge-warning'}">${item.is_available ? 'available' : 'out of stock'}</span></td><td>${relativeDate(item.updated_at)}</td></tr>`).join('') || '<tr><td colspan="6">No store listings yet.</td></tr>'}</tbody></table></div>`;
}

function adminUsers(data) {
  const users = data.users || [];
  return `${adminIntro('Account access', 'People and permissions.', 'Review account status and suspend or restore access.')}<div class="table-wrap"><table class="data-table"><thead><tr><th>Account</th><th>Role</th><th>Phone</th><th>Status</th><th>Action</th></tr></thead><tbody>${users.map((user) => { const active = user.is_active !== false; const self = Number(user.user_id) === Number(state.user?.user_id); return `<tr><td><strong>${escapeHTML(user.full_name)}</strong><small>${escapeHTML(user.email)}</small></td><td>${escapeHTML(user.role.replace('_', ' '))}</td><td>${escapeHTML(user.phone || '—')}</td><td><span class="badge ${active ? 'badge-success' : 'badge-danger'}">${active ? 'active' : 'inactive'}</span></td><td><button class="button button-quiet" type="button" data-user-status="${user.user_id}" data-active="${!active}" ${self ? 'disabled title="You cannot deactivate your own administrator account."' : ''}>${active ? 'Deactivate' : 'Activate'}</button></td></tr>`; }).join('')}</tbody></table></div>`;
}

function openConfirm(title, message, action, callback) {
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-action').textContent = action;
  state.pendingConfirm = callback;
  openModal('confirm-modal');
}

async function submitSearch(form) {
  const values = new FormData(form);
  state.search.query = String(values.get('query') || '').trim();
  state.search.locality = String(values.get('locality') || '').trim();
  state.search.page = 1;
  if (state.route !== 'search') go('search');
  else { await loadCustomerView(); }
}

async function handleLogin(form) {
  const values = Object.fromEntries(new FormData(form));
  setAuthFeedback();
  setAuthLoading(form, true);
  setAuthCatMood('submitting');
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(values) });
    state.user = data.user;
    setAuthCatMood('success');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    closeModals();
    toast(data.message);
    go(state.user.role === 'shop_owner' ? 'owner' : state.user.role === 'admin' ? 'admin' : 'customer');
  } catch (error) {
    setAuthFeedback(error.message, 'error');
    form.querySelector('[name="password"]')?.focus();
    setAuthCatMood('error');
    toast(error.message, 'error');
  } finally {
    setAuthLoading(form, false);
  }
}

async function handleRegister(form) {
  const values = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  setAuthCatMood('submitting');
  try {
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(values) });
    state.user = data.user;
    setAuthCatMood('happy');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    closeModals();
    toast(data.message);
    go(state.user.role === 'shop_owner' ? 'owner' : 'customer');
  } catch (error) { setAuthCatMood('error'); toast(error.message, 'error'); }
  finally { if (submit) submit.disabled = false; }
}

async function saveOwnerListing(form) {
  const values = Object.fromEntries(new FormData(form));
  values.productId = Number(values.productId);
  values.price = Number(values.price);
  values.isAvailable = form.isAvailable.checked;
  try { const data = await api('/api/owner/listings', { method: 'POST', body: JSON.stringify(values) }); toast(data.message); state.ownerView = 'products'; loadOwnerView(); } catch (error) { toast(error.message, 'error'); }
}

async function saveCustomProduct(form) {
  const values = new FormData(form);
  values.set('isAvailable', form.isAvailable.checked ? 'true' : 'false');
  try {
    const data = await api('/api/owner/products', { method: 'POST', body: values });
    toast(data.message);
    state.ownerView = 'products';
    loadOwnerView();
  } catch (error) { toast(error.message, 'error'); }
}

async function editListing(id) {
  const listing = state.ownerData?.listings.find((item) => Number(item.listing_id) === Number(id));
  if (!listing) return;
  const price = window.prompt(`Update price for ${listing.name}`, listing.price);
  if (price === null) return;
  const availability = window.confirm('Should this product be shown as available?');
  try { const data = await api(`/api/owner/listings/${id}`, { method: 'PATCH', body: JSON.stringify({ price: Number(price), isAvailable: availability }) }); toast(data.message); loadOwnerView(); } catch (error) { toast(error.message, 'error'); }
}

async function deleteListing(id) {
  openConfirm('Remove this listing?', 'Customers will no longer see this product from your store.', 'Remove listing', async () => {
    try { const data = await api(`/api/owner/listings/${id}`, { method: 'DELETE' }); closeModals(); toast(data.message); loadOwnerView(); } catch (error) { closeModals(); toast(error.message, 'error'); }
  });
}

async function updateStore(form) {
  const values = Object.fromEntries(new FormData(form));
  try { const data = await api('/api/owner/store', { method: 'PATCH', body: JSON.stringify(values) }); toast(data.message); loadOwnerView(); } catch (error) { toast(error.message, 'error'); }
}

async function approveStore(id, status) {
  try { const data = await api(`/api/admin/stores/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); toast(data.message); loadAdminView(); } catch (error) { toast(error.message, 'error'); }
}

async function updateUserStatus(id, isActive) {
  try { const data = await api(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }); toast(data.message); loadAdminView(); } catch (error) { toast(error.message, 'error'); }
}

async function editAdminProduct(id) {
  const product = state.adminData?.products?.find((item) => Number(item.product_id) === Number(id));
  if (!product) return;
  const categories = state.adminData.categories || state.categories;
  $('#admin-editor-content').innerHTML = `<p class="eyebrow">Central catalogue</p><h2 id="admin-editor-title">Edit product</h2><form data-admin-editor="product" data-id="${product.product_id}" class="admin-editor-form"><label>Product name<input name="name" maxlength="160" value="${escapeHTML(product.name)}" required></label><label>Brand<input name="brand" maxlength="100" value="${escapeHTML(product.brand)}" required></label><label>Category<select name="categoryId" required>${categories.map((category) => `<option value="${category.category_id}" ${Number(category.category_id) === Number(product.category_id) ? 'selected' : ''}>${escapeHTML(category.name)}</option>`).join('')}</select></label><label>Unit / quantity<input name="unit" maxlength="80" value="${escapeHTML(product.unit || '')}" placeholder="e.g. 250 g"></label><label>Replace product photo<input name="image" type="file" accept="image/*" data-admin-product-image><small>Optional · JPEG, PNG, WebP, max 3 MB</small></label><label>Description<textarea name="description" maxlength="1000" rows="3">${escapeHTML(product.description || '')}</textarea></label><div class="modal-actions"><button type="button" class="button button-quiet" data-close-modal>Cancel</button><button type="submit" class="button button-primary">Save changes</button></div></form>`;
  openModal('admin-editor-modal');
}

async function editCategory(id, currentName) {
  const category = state.adminData?.categories?.find((item) => Number(item.category_id) === Number(id));
  $('#admin-editor-content').innerHTML = `<p class="eyebrow">Catalogue structure</p><h2 id="admin-editor-title">Edit category</h2><form data-admin-editor="category" data-id="${id}" class="admin-editor-form"><label>Category name<input name="name" maxlength="80" value="${escapeHTML(currentName)}" required></label><label>Description<input name="description" maxlength="255" value="${escapeHTML(category?.description || '')}"></label><div class="modal-actions"><button type="button" class="button button-quiet" data-close-modal>Cancel</button><button type="submit" class="button button-primary">Save changes</button></div></form>`;
  openModal('admin-editor-modal');
}

async function saveAdminEdit(form) {
  const type = form.dataset.adminEditor;
  const formData = new FormData(form);
  const values = type === 'category' ? Object.fromEntries(formData) : formData;
  if (type === 'product') values.set('categoryId', String(Number(values.get('categoryId'))));
  try {
    const data = await api(`/api/admin/${type === 'product' ? 'products' : 'categories'}/${form.dataset.id}`, { method: 'PATCH', body: type === 'product' ? values : JSON.stringify(values) });
    closeModals(); toast(data.message);
    if (type === 'category') await loadCategories();
    loadAdminView();
  } catch (error) { toast(error.message, 'error'); }
}

async function saveAdminCategory(form) {
  const values = Object.fromEntries(new FormData(form));
  try { const data = await api('/api/admin/categories', { method: 'POST', body: JSON.stringify(values) }); toast(data.message); await loadCategories(); loadAdminView(); }
  catch (error) { toast(error.message, 'error'); }
}

async function saveAdminProduct(form) {
  const values = new FormData(form);
  try { const data = await api('/api/admin/products', { method: 'POST', body: values }); toast(data.message); loadAdminView(); }
  catch (error) { toast(error.message, 'error'); }
}

function confirmCategoryDelete(id, name) {
  openConfirm(`Delete ${name}?`, 'Categories with products cannot be removed. Move or remove their products first.', 'Delete category', async () => {
    try { const data = await api(`/api/admin/categories/${id}`, { method: 'DELETE' }); closeModals(); toast(data.message); await loadCategories(); loadAdminView(); }
    catch (error) { closeModals(); toast(error.message, 'error'); }
  });
}

function confirmProductDelete(id, name) {
  openConfirm(`Delete ${name}?`, 'Products with store listings cannot be removed. The listing relationship will be checked before deletion.', 'Delete product', async () => {
    try { const data = await api(`/api/admin/products/${id}`, { method: 'DELETE' }); closeModals(); toast(data.message); loadAdminView(); }
    catch (error) { closeModals(); toast(error.message, 'error'); }
  });
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (error) { console.warn(error); }
  state.user = null;
  state.route = 'home';
  go('home', true);
  setAppVisibility(false);
  toast('You have been signed out.');
}

document.addEventListener('click', async (event) => {
  const auth = event.target.closest('[data-auth]');
  if (auth) { $('.public-links')?.classList.remove('open'); openAuth(auth.dataset.auth); return; }
  const backdrop = event.target.closest('.modal-backdrop');
  if (backdrop && event.target === backdrop) { closeModals(); return; }
  const close = event.target.closest('[data-close-modal]');
  if (close) { closeModals(); return; }
  const tab = event.target.closest('[data-auth-tab]');
  if (tab) { switchAuthTab(tab.dataset.authTab); return; }
  const theme = event.target.closest('[data-theme-toggle]');
  if (theme) { setTheme(); return; }
  const mobileMenu = event.target.closest('[data-mobile-menu]');
  if (mobileMenu) { $('.public-links')?.classList.toggle('open'); return; }
  const suggestion = event.target.closest('[data-query]');
  if (suggestion) { const form = $('[data-search-form]'); if (form) { form.query.value = suggestion.dataset.query; form.locality.value = ''; submitSearch(form); } return; }
  const liveSearch = event.target.closest('[data-live-search]');
  if (liveSearch) { state.search = { ...state.search, query: liveSearch.dataset.liveSearch, locality: '', category: '', page: 1 }; go('search'); return; }
  const detailSearch = event.target.closest('[data-detail-search]');
  if (detailSearch) { closeModals(); state.search = { ...state.search, query: detailSearch.dataset.detailSearch, locality: '', category: '', page: 1 }; go('search'); return; }
  const productDetails = event.target.closest('[data-product-details]');
  if (productDetails) { openProductDetails(JSON.parse(productDetails.dataset.productDetails)); return; }
  const productCard = event.target.closest('[data-product-query]');
  if (productCard) { state.search = { ...state.search, query: productCard.dataset.productQuery, locality: '', category: '', page: 1 }; go('search'); return; }
  const category = event.target.closest('[data-category]');
  if (category) { state.search = { ...state.search, query: '', category: category.dataset.category, sort: 'low' }; go('search'); return; }
  const route = event.target.closest('[data-route]');
  if (route) { $('.public-links')?.classList.remove('open'); return; }
  const ownerView = event.target.closest('[data-owner-view]');
  if (ownerView) { state.ownerView = ownerView.dataset.ownerView; loadOwnerView(); return; }
  const composerMode = event.target.closest('[data-composer-mode]');
  if (composerMode) { state.ownerAddMode = composerMode.dataset.composerMode; loadOwnerView(); return; }
  const adminView = event.target.closest('[data-admin-view]');
  if (adminView) { state.adminView = adminView.dataset.adminView; $$('.side-nav [data-admin-view]').forEach((item) => item.classList.toggle('active', item.dataset.adminView === state.adminView)); positionNavIndicator(); loadAdminView(); return; }
  const customerView = event.target.closest('[data-customer-view]');
  if (customerView) { state.route = customerView.dataset.customerView; loadCustomerView(); return; }
  const clear = event.target.closest('[data-clear-search]');
  if (clear) { state.search = { query: '', locality: '', category: '', availability: 'available', sort: 'low', page: 1 }; loadCustomerView(); return; }
  const retry = event.target.closest('[data-retry-search]');
  if (retry) { queryResults(); return; }
  const retryMarket = event.target.closest('[data-retry-market]');
  if (retryMarket) { loadLandingMarket(); return; }
  const searchPage = event.target.closest('[data-search-page]');
  if (searchPage && !searchPage.disabled) { state.search.page = Number(searchPage.dataset.searchPage); queryResults(); return; }
  const details = event.target.closest('[data-store-details]');
  if (details) { const store = JSON.parse(details.dataset.storeDetails); openConfirm(store.store_name, `${store.address || store.locality}. Contact: ${store.phone || 'Available at the store.'}`, 'Close', () => closeModals()); return; }
  const edit = event.target.closest('[data-edit-listing]');
  if (edit) { editListing(edit.dataset.editListing); return; }
  const remove = event.target.closest('[data-delete-listing]');
  if (remove) { deleteListing(remove.dataset.deleteListing); return; }
  const signOut = event.target.closest('[data-logout]');
  if (signOut) { openConfirm('Sign out of LocalPrice?', 'Your saved session will be closed on this device.', 'Sign out', logout); return; }
  const approve = event.target.closest('[data-approve-store]');
  if (approve) { approveStore(approve.dataset.approveStore, approve.dataset.status); return; }
  const userStatus = event.target.closest('[data-user-status]');
  if (userStatus) { updateUserStatus(userStatus.dataset.userStatus, userStatus.dataset.active === 'true'); return; }
  const productEdit = event.target.closest('[data-edit-product]');
  if (productEdit) { editAdminProduct(productEdit.dataset.editProduct); return; }
  const productDelete = event.target.closest('[data-delete-product]');
  if (productDelete) { const product = state.adminData?.products?.find((item) => Number(item.product_id) === Number(productDelete.dataset.deleteProduct)); confirmProductDelete(productDelete.dataset.deleteProduct, product?.name || 'this product'); return; }
  const categoryEdit = event.target.closest('[data-edit-category]');
  if (categoryEdit) { editCategory(categoryEdit.dataset.editCategory, categoryEdit.dataset.categoryName); return; }
  const categoryDelete = event.target.closest('[data-delete-category]');
  if (categoryDelete) { confirmCategoryDelete(categoryDelete.dataset.deleteCategory, categoryDelete.dataset.categoryName); return; }
  const password = event.target.closest('[data-toggle-password]');
  if (password) { const input = password.parentElement.querySelector('input'); input.type = input.type === 'password' ? 'text' : 'password'; const visible = input.type === 'text'; password.textContent = visible ? 'Hide' : 'Show'; password.setAttribute('aria-label', visible ? 'Hide password' : 'Show password'); setAuthCatMood('curious', true); return; }
  const userMenu = event.target.closest('[data-user-menu]');
  if (userMenu) { if (state.user) { openConfirm('Sign out of LocalPrice?', 'Your saved session will be closed on this device.', 'Sign out', logout); } else openAuth('login'); return; }
});

document.addEventListener('focusin', (event) => {
  const authField = event.target.closest('#auth-modal input, #auth-modal select');
  if (!authField) return;
  if (authField.name === 'password' || authField.name === 'email') setAuthCatMood(authField.type === 'text' ? 'curious' : 'blink');
});

document.addEventListener('input', (event) => {
  const authField = event.target.closest('#auth-modal input');
  if (!authField) return;
  if ($('#login-form')?.contains(authField)) {
    setAuthFeedback();
    setAuthCatMood(authField.name === 'password' && authField.type === 'text' ? 'curious' : 'blink');
  }
});

document.addEventListener('invalid', (event) => {
  const form = event.target.closest('#login-form');
  if (!form) return;
  setAuthFeedback(event.target.validationMessage || 'Please complete this field.', 'error');
  setAuthCatMood('error');
}, true);

document.addEventListener('submit', async (event) => {
  if (event.target.matches('[data-search-form]')) { event.preventDefault(); await submitSearch(event.target); }
  if (event.target.matches('[data-form="login"]')) { event.preventDefault(); await handleLogin(event.target); }
  if (event.target.matches('[data-form="register"]')) { event.preventDefault(); await handleRegister(event.target); }
  if (event.target.matches('[data-owner-add-form]')) { event.preventDefault(); await saveOwnerListing(event.target); }
  if (event.target.matches('[data-owner-custom-form]')) { event.preventDefault(); await saveCustomProduct(event.target); }
  if (event.target.matches('[data-store-form]')) { event.preventDefault(); await updateStore(event.target); }
  if (event.target.matches('[data-admin-category-form]')) { event.preventDefault(); await saveAdminCategory(event.target); }
  if (event.target.matches('[data-admin-product-form]')) { event.preventDefault(); await saveAdminProduct(event.target); }
  if (event.target.matches('[data-admin-editor]')) { event.preventDefault(); await saveAdminEdit(event.target); }
});

document.addEventListener('change', (event) => {
  if (event.target.matches('#register-role')) $('#owner-fields').classList.toggle('is-hidden', event.target.value !== 'shop_owner');
  if (event.target.matches('[data-sort]')) { state.search.sort = event.target.value; queryResults(); }
  if (event.target.matches('[data-admin-product-image]')) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { event.target.value = ''; toast('Choose an image smaller than 3MB.', 'error'); return; }
    const note = event.target.parentElement.querySelector('small');
    if (note) note.textContent = file.name;
  }
  if (event.target.matches('[data-category-filter]')) { state.search.category = event.target.dataset.categoryFilter; loadCustomerView(); }
  if (event.target.matches('[data-product-image]')) {
    const file = event.target.files?.[0];
    const preview = $('[data-image-preview]');
    if (!file || !preview) return;
    if (file.size > 3 * 1024 * 1024) { event.target.value = ''; toast('Choose an image smaller than 3MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => { preview.innerHTML = `<img src="${reader.result}" alt="Selected product preview"><small>Change image</small>`; };
    reader.readAsDataURL(file);
  }
});

document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.closest('.product-photo')) return;
  const product = { name: image.alt || 'Product', category: '' };
  const fallback = document.createElement('div');
  fallback.className = `product-art ${artClass(productArtKey(product))}`;
  fallback.setAttribute('aria-label', image.alt || 'Product photo unavailable');
  fallback.innerHTML = `<span>${escapeHTML(productArtLabel(product))}</span>`;
  image.closest('.product-photo').replaceWith(fallback);
}, true);

document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-product-details][role="button"]')) {
    event.preventDefault(); openProductDetails(JSON.parse(event.target.dataset.productDetails));
  }
});

$('#confirm-action').addEventListener('click', () => { if (state.pendingConfirm) state.pendingConfirm(); });
document.addEventListener('keydown', (event) => {
  const modal = $$('.modal-backdrop:not(.is-hidden)').at(-1);
  if (event.key === 'Escape' && modal) { closeModals(); return; }
  if (event.key !== 'Tab' || !modal) return;
  const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length);
  if (!focusable.length) return;
  if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
});
window.addEventListener('resize', () => positionNavIndicator());
window.addEventListener('hashchange', renderRoute);

prepareAuthUI();
setupAuthCat();

(async function init() {
  setTheme(document.documentElement.dataset.theme);
  try { state.user = (await api('/api/auth/me')).user; } catch (error) { console.warn(error); }
  await loadCategories();
  renderRoute();
  setupRevealAnimations();
  loadLandingMarket();
})();
