(function () {
  'use strict';

  class LocalPriceGlassEngine {
    constructor() {
      this.registry = new window.LocalPriceSurfaceRegistry();
      this.backdrop = new window.LocalPriceBackdropProvider();
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'liquid-glass-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.renderer = null;
      this.frame = 0;
      this.impulse = null;
      this.lastTime = 0;
      this.wavesUntil = 0;
      this.pendingRender = false;
      this.initialized = false;
      this.renderSamples = [];
      this.averageSubmitMs = null;
      this.openModals = new Set();
      this.modalRects = new WeakMap();
      this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
      this.resizeObserver = window.ResizeObserver
        ? new ResizeObserver(() => this.invalidate())
        : { observe() {}, unobserve() {} };
      this.mutationObserver = new MutationObserver(() => this.refresh());
      this.install();
    }

    install() {
      try {
        this.renderer = new window.LocalPriceGlassRenderer(this.canvas, this.backdrop);
        if (!this.renderer.fluid.available) throw new Error('Floating-point render targets are unavailable.');
        document.body.prepend(this.canvas);
        document.documentElement.classList.add('liquid-glass-webgl');
        document.documentElement.classList.remove('liquid-glass-fallback');
        this.initialized = true;
      } catch (error) {
        console.info('LocalPrice is using its CSS glass fallback:', error.message);
        if (this.renderer) this.renderer.dispose();
        this.renderer = null;
        this.canvas.remove();
        document.documentElement.classList.add('liquid-glass-fallback');
        document.documentElement.classList.remove('liquid-glass-webgl');
        return;
      }

      this.resizeObserver.observe(document.documentElement);
      window.addEventListener('resize', () => this.invalidate(), { passive: true });
      window.addEventListener('scroll', () => this.invalidate(), { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stopFrame(); else this.invalidate();
      });
      document.addEventListener('pointerdown', (event) => this.onPress(event), { capture: true, passive: true });
      document.addEventListener('click', (event) => this.onKeyboardClick(event), { capture: true });
      document.addEventListener('focusin', (event) => this.onFocus(event), { capture: true });
      document.documentElement.addEventListener('themechange', () => {
        if (this.renderer) this.renderer.updateBackdrop();
        this.invalidate();
      });
      this.canvas.addEventListener('webglcontextlost', (event) => this.onContextLost(event));
      this.canvas.addEventListener('webglcontextrestored', () => this.onContextRestored());
      this.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      this.reducedMotion.addEventListener?.('change', () => this.onMotionPreference());
      this.reducedTransparency.addEventListener?.('change', () => this.onMotionPreference());
      this.refresh();
    }

    onMotionPreference() {
      if (this.reducedMotion.matches || this.reducedTransparency.matches) {
        this.wavesUntil = 0;
        this.impulse = null;
        this.stopFrame();
        document.documentElement.classList.add('liquid-glass-fallback');
      } else if (this.initialized) {
        document.documentElement.classList.remove('liquid-glass-fallback');
        this.invalidate();
      }
    }

    refresh() {
      const old = this.registry.surfaces;
      const surfaces = this.registry.refresh();
      old.forEach((surface) => this.resizeObserver.unobserve(surface));
      surfaces.forEach((surface) => this.resizeObserver.observe(surface));
      const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      if (this.backdrop.theme !== theme && this.renderer) this.renderer.updateBackdrop();
      const currentModals = new Set(document.querySelectorAll('.modal-backdrop:not(.is-hidden)'));
      currentModals.forEach((modal) => {
        const rect = modal.getBoundingClientRect();
        this.modalRects.set(modal, rect);
        if (!this.openModals.has(modal) && rect.width && rect.height) {
          this.createImpulse(rect.left + rect.width * .5, rect.top + 8, .34);
        }
      });
      this.openModals.forEach((modal) => {
        if (currentModals.has(modal)) return;
        const rect = this.modalRects.get(modal);
        if (rect) this.createImpulse(rect.left + rect.width * .5, rect.top + 8, .28);
      });
      this.openModals = currentModals;
      this.invalidate();
    }

    invalidate() {
      if (!this.initialized || this.pendingRender || document.hidden) return;
      this.pendingRender = true;
      this.frame = requestAnimationFrame((time) => {
        this.pendingRender = false;
        this.draw(time);
      });
    }

    draw(time) {
      if (!this.initialized || !this.renderer || document.hidden) return;
      const delta = this.lastTime ? Math.min(.025, (time - this.lastTime) / 1000) : 1 / 60;
      this.lastTime = time;
      const motionEnabled = !this.reducedMotion.matches && !this.reducedTransparency.matches;
      const wavesActive = motionEnabled && time < this.wavesUntil;
      const started = performance.now();
      this.renderer.render(this.registry.visible(), { delta, impulse: this.impulse, wavesActive });
      this.renderSamples.push(performance.now() - started);
      if (this.renderSamples.length >= 30) {
        this.averageSubmitMs = this.renderSamples.reduce((sum, sample) => sum + sample, 0) / this.renderSamples.length;
        this.renderSamples = [];
        if (this.averageSubmitMs > 22) this.renderer.reduceResolution();
      }
      this.impulse = null;
      if (wavesActive) {
        this.frame = requestAnimationFrame((nextTime) => {
          this.pendingRender = false;
          this.draw(nextTime);
        });
        this.pendingRender = true;
      } else {
        this.frame = 0;
        this.pendingRender = false;
        this.lastTime = 0;
      }
    }

    stopFrame() {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.pendingRender = false;
    }

    createImpulse(x, y, strength = .72) {
      if (!this.initialized || this.reducedMotion.matches || this.reducedTransparency.matches) return;
      this.impulse = this.renderer.impulseAt(x, y, strength);
      this.wavesUntil = performance.now() + 1250;
      this.invalidate();
    }

    onPress(event) {
      const navItem = event.target.closest?.('.side-link, .lab-nav-item, [data-admin-view], [data-owner-view]');
      const target = event.target.closest?.('.glass-material') || navItem?.closest('.side-nav, .lab-nav');
      if (!target || !event.isPrimary) return;
      const meaningful = target.matches('button, a, input, select, textarea, [role="button"], .nav-indicator')
        || event.target.closest('button, a, input, select, textarea, [role="button"]');
      if (!meaningful) return;
      this.createImpulse(event.clientX || target.getBoundingClientRect().left + target.offsetWidth / 2, event.clientY || target.getBoundingClientRect().top + target.offsetHeight / 2, .62);
    }

    onKeyboardClick(event) {
      if (event.detail !== 0) return;
      const target = event.target.closest?.('.glass-material');
      if (!target || !event.target.closest('button, a, [role="button"]')) return;
      const rect = target.getBoundingClientRect();
      this.createImpulse(rect.left + rect.width / 2, rect.top + rect.height / 2, .55);
    }

    onFocus(event) {
      const target = event.target.closest?.('.glass-material');
      if (!target || !event.target.matches('input, select, textarea')) return;
      const rect = target.getBoundingClientRect();
      this.createImpulse(rect.left + rect.width / 2, rect.top + rect.height / 2, .34);
    }

    onContextLost(event) {
      event.preventDefault();
      this.initialized = false;
      this.stopFrame();
      document.documentElement.classList.remove('liquid-glass-webgl');
      document.documentElement.classList.add('liquid-glass-fallback');
    }

    onContextRestored() {
      try {
        this.renderer = new window.LocalPriceGlassRenderer(this.canvas, this.backdrop);
        if (!this.renderer.fluid.available) throw new Error('Floating-point render targets are unavailable.');
        this.initialized = true;
        document.documentElement.classList.add('liquid-glass-webgl');
        document.documentElement.classList.remove('liquid-glass-fallback');
        this.refresh();
      } catch (error) {
        console.info('LocalPrice kept the CSS glass fallback after WebGL restoration failed.', error.message);
        this.renderer = null;
        this.initialized = false;
      }
    }
  }

  window.LocalPriceGlassEngine = LocalPriceGlassEngine;
})();
