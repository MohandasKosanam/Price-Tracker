(function () {
  'use strict';

  class LocalPriceBackdropProvider {
    constructor(width = 1024, height = 768) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      this.context = this.canvas.getContext('2d', { alpha: false });
      this.theme = null;
      this.render();
    }

    render() {
      const context = this.context;
      const { width, height } = this.canvas;
      const dark = document.documentElement.dataset.theme === 'dark';
      this.theme = dark ? 'dark' : 'light';
      const base = context.createLinearGradient(0, 0, width, height);
      if (dark) {
        base.addColorStop(0, '#09121e');
        base.addColorStop(.52, '#0b1724');
        base.addColorStop(1, '#060d17');
      } else {
        base.addColorStop(0, '#e8edf2');
        base.addColorStop(.52, '#eff3f7');
        base.addColorStop(1, '#dde5ed');
      }
      context.fillStyle = base;
      context.fillRect(0, 0, width, height);

      const clouds = dark
        ? [[.15, .08, .42, 'rgba(69,119,165,.28)'], [.86, .14, .36, 'rgba(54,122,111,.20)'], [.66, .88, .48, 'rgba(46,76,116,.22)']]
        : [[.12, .08, .46, 'rgba(190,214,233,.66)'], [.88, .14, .42, 'rgba(230,215,207,.40)'], [.65, .87, .52, 'rgba(202,219,232,.50)']];

      clouds.forEach(([x, y, radius, color]) => {
        const r = Math.max(width, height) * radius;
        const gradient = context.createRadialGradient(width * x, height * y, 0, width * x, height * y, r);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      });

      // The texture is limited to this explicit ambient scene; it never reads page DOM or user imagery.
      context.save();
      context.globalAlpha = dark ? .12 : .16;
      context.strokeStyle = dark ? '#c5dcf1' : '#7e96ad';
      context.lineWidth = 1;
      for (let x = 42; x < width; x += 118) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
      for (let y = 38; y < height; y += 118) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      }
      context.restore();
    }
  }

  window.LocalPriceBackdropProvider = LocalPriceBackdropProvider;
})();
