(function () {
  'use strict';

  const materials = new Map([
    ['glass-clear', '.topbar-public, .app-topbar, .search-panel, .app-search, .theme-toggle, .icon-button, .nav-indicator, .toast'],
    ['glass-frosted', '.side-nav, .category-card, .process-card, .product-card, .owner-banner-inner, .live-market-inner, .live-board, .cta-inner'],
    ['glass-deep', '.modal, .auth-intro'],
    ['glass-reflective', '.button-primary, .side-link.active'],
    ['glass-solid', '.dashboard-panel, .stat-card, .form-panel, .table-wrap, .empty-state, .metric-tile, .market-feed']
  ]);

  function tagSurfaces() {
    materials.forEach((selector, material) => {
      document.querySelectorAll(selector).forEach((element) => element.classList.add('glass-material', material));
    });
  }

  function refresh() {
    tagSurfaces();
    engine?.refresh();
  }

  let engine;
  window.LocalPriceVisuals = { tagSurfaces, refresh, get engine() { return engine; } };
  tagSurfaces();
  if (window.LocalPriceGlassEngine) engine = new window.LocalPriceGlassEngine();
  let refreshPending = false;
  new MutationObserver(() => {
    if (refreshPending) return;
    refreshPending = true;
    requestAnimationFrame(() => { refreshPending = false; refresh(); });
  }).observe(document.body, { childList: true, subtree: true });
})();
