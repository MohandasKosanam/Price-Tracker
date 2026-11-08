(function () {
  'use strict';

  class LocalPriceSurfaceRegistry {
    constructor() { this.surfaces = []; }

    refresh() {
      this.surfaces = [...document.querySelectorAll('.glass-material')].filter((element) => {
        if (element.closest('.is-hidden')) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > .01;
      });
      return this.surfaces;
    }

    visible() {
      return this.surfaces.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      });
    }
  }

  window.LocalPriceSurfaceRegistry = LocalPriceSurfaceRegistry;
})();
