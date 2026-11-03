(function () {
  'use strict';

  const root = document.documentElement;
  const canvas = document.getElementById('aurora-canvas');
  const pointer = document.querySelector('.cursor-glow');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const motion = window.Motion;
  let ctx;
  let width = 0;
  let height = 0;
  let scale = 1;
  let frame = 0;
  let lastFrame = 0;
  let pointerFrame = 0;

  const blobs = [
    { x: .08, y: .12, radius: .28, color: [224, 104, 81], speed: .00017, phase: .4 },
    { x: .84, y: .08, radius: .25, color: [132, 193, 157], speed: .00013, phase: 2.1 },
    { x: .77, y: .76, radius: .31, color: [231, 186, 122], speed: .00011, phase: 4.3 },
    { x: .25, y: .84, radius: .24, color: [185, 140, 176], speed: .00009, phase: 1.4 },
    { x: .5, y: .42, radius: .18, color: [247, 216, 174], speed: .00016, phase: 5.2 }
  ];

  function themeAlpha() { return root.dataset.theme === 'dark' ? .38 : .28; }

  function sizeCanvas() {
    if (!canvas) return;
    scale = Math.min(window.devicePixelRatio || 1, 1.75);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawAurora(performance.now());
  }

  function drawBlob(blob, time) {
    const driftX = Math.sin(time * blob.speed + blob.phase) * width * .055;
    const driftY = Math.cos(time * blob.speed * .83 + blob.phase) * height * .05;
    const x = width * blob.x + driftX;
    const y = height * blob.y + driftY;
    const radius = Math.max(width, height) * blob.radius;
    const [r, g, b] = blob.color;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${themeAlpha()})`);
    gradient.addColorStop(.42, `rgba(${r}, ${g}, ${b}, ${themeAlpha() * .42})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawAurora(time) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'screen';
    blobs.forEach((blob) => drawBlob(blob, time));
    ctx.globalCompositeOperation = 'source-over';
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, root.dataset.theme === 'dark' ? 'rgba(10, 11, 10, .1)' : 'rgba(255, 252, 246, .16)');
    wash.addColorStop(.5, 'rgba(255,255,255,0)');
    wash.addColorStop(1, root.dataset.theme === 'dark' ? 'rgba(10, 11, 10, .16)' : 'rgba(255, 252, 246, .16)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
  }

  function animate(time) {
    if (time - lastFrame > 28) {
      drawAurora(time);
      lastFrame = time;
    }
    frame = requestAnimationFrame(animate);
  }

  function updatePointer(event) {
    if (coarsePointer.matches || !pointer) return;
    const x = event.clientX;
    const y = event.clientY;
    root.style.setProperty('--pointer-x', `${x}px`);
    root.style.setProperty('--pointer-y', `${y}px`);
    if (!pointerFrame) {
      pointerFrame = requestAnimationFrame(() => {
        pointer.style.left = `${x}px`;
        pointer.style.top = `${y}px`;
        pointerFrame = 0;
      });
    }
    document.querySelectorAll('.liquid-surface').forEach((surface) => {
      const box = surface.getBoundingClientRect();
      const inside = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      if (inside) {
        surface.style.setProperty('--surface-x', `${x - box.left}px`);
        surface.style.setProperty('--surface-y', `${y - box.top}px`);
        surface.classList.add('surface-active');
      } else surface.classList.remove('surface-active');
    });
  }

  function tagSurfaces() {
    const selectors = '.topbar, .app-topbar, .search-panel, .live-board, .live-market-inner, .category-card, .process-card, .product-card, .owner-banner-inner, .cta-inner, .insight-card, .modal, .app-search, .side-nav, .dashboard-panel, .stat-card, .comparison-row, .table-wrap, .form-panel, .metric-tile, .market-feed, .empty-state';
    document.querySelectorAll(selectors).forEach((element) => element.classList.add('liquid-surface'));
  }

  function animateReveal(element, index) {
    if (prefersReduced.matches) {
      element.classList.add('revealed');
      return;
    }
    element.classList.add('revealed');
    if (motion && typeof motion.animate === 'function') {
      motion.animate(element, { opacity: [0, 1], y: [18, 0] }, { duration: .65, delay: Math.min(index * .045, .2), ease: 'easeOut' });
    }
  }

  function observeReveals() {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries, current) => entries.forEach((entry, index) => {
      if (entry.isIntersecting) { animateReveal(entry.target, index); current.unobserve(entry.target); }
    }), { threshold: .12 });
    document.querySelectorAll('.reveal-target').forEach((element) => observer.observe(element));
  }

  window.LocalPriceVisuals = { tagSurfaces, animateReveal, refresh: () => drawAurora(performance.now()) };

  if (canvas) {
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas, { passive: true });
    root.addEventListener('themechange', () => drawAurora(performance.now()));
    if (!prefersReduced.matches) frame = requestAnimationFrame(animate);
  }
  window.addEventListener('pointermove', updatePointer, { passive: true });
  window.addEventListener('load', () => { tagSurfaces(); observeReveals(); });
  new MutationObserver(() => { tagSurfaces(); }).observe(document.body, { childList: true, subtree: true });
})();
