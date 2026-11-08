(function () {
  'use strict';

  const MATERIALS = window.LocalPriceGlassMaterials;
  const SHADERS = window.LocalPriceGlassShaders;

  function compileProgram(gl, vertexSource, fragmentSource) {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message || 'Glass shader compilation failed.');
      }
      return shader;
    };
    const program = gl.createProgram();
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(message || 'Glass shader link failed.');
    }
    return program;
  }

  class LocalPriceGlassRenderer {
    constructor(canvas, backdropProvider) {
      this.canvas = canvas;
      this.backdropProvider = backdropProvider;
      this.gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
      if (!this.gl) throw new Error('WebGL2 is unavailable.');
      this.quality = this.selectQuality();
      this.qualityScale = 1;
      this.program = compileProgram(this.gl, SHADERS.vertex, SHADERS.fragment);
      this.vao = this.gl.createVertexArray();
      this.backdropTexture = this.createBackdropTexture();
      this.waveFallback = this.createWaveFallback();
      this.fluid = new window.LocalPriceFluidSimulation(this.gl, this.quality.gridSize);
      this.locations = {};
      this.cacheLocations();
      this.resize();
    }

    selectQuality() {
      const cores = Number(navigator.hardwareConcurrency || 4);
      const memory = Number(navigator.deviceMemory || 4);
      const maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
      if (cores >= 8 && memory >= 8 && maxTextureSize >= 4096) return { name: 'high', gridSize: 128, pixelRatio: 1.5 };
      if (cores >= 4 && memory >= 4 && maxTextureSize >= 2048) return { name: 'medium', gridSize: 96, pixelRatio: 1.25 };
      return { name: 'low', gridSize: 64, pixelRatio: 1 };
    }

    cacheLocations() {
      const gl = this.gl;
      this.locations = {};
      for (const name of ['u_backdrop', 'u_wave', 'u_viewport', 'u_waveTexel', 'u_surface', 'u_radius', 'u_bevel', 'u_ior', 'u_thickness', 'u_roughness', 'u_opacity', 'u_absorption', 'u_dispersion', 'u_tint', 'u_waveEnabled']) {
        this.locations[name] = gl.getUniformLocation(this.program, name);
      }
    }

    createBackdropTexture() {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.backdropProvider.canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return texture;
    }

    updateBackdrop() {
      const gl = this.gl;
      this.backdropProvider.render();
      gl.bindTexture(gl.TEXTURE_2D, this.backdropTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.backdropProvider.canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    createWaveFallback() {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 1, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array([0, 0]));
      return texture;
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio * this.qualityScale);
      const width = Math.max(1, Math.round(window.innerWidth * dpr));
      const height = Math.max(1, Math.round(window.innerHeight * dpr));
      if (this.canvas.width === width && this.canvas.height === height) return;
      this.canvas.width = width;
      this.canvas.height = height;
    }

    render(surfaces, { delta = 1 / 60, impulse = null, wavesActive = false } = {}) {
      const gl = this.gl;
      this.resize();
      if (wavesActive && this.fluid.available) this.fluid.step(delta, impulse || [-2, -2, 0]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.enable(gl.SCISSOR_TEST);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.uniform2f(this.locations.u_viewport, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.locations.u_waveTexel, 1 / this.fluid.size, 1 / this.fluid.size);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.backdropTexture);
      gl.uniform1i(this.locations.u_backdrop, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.fluid.texture || this.waveFallback);
      gl.uniform1i(this.locations.u_wave, 1);
      gl.uniform1f(this.locations.u_waveEnabled, this.fluid.available ? 1 : 0);

      const dprX = this.canvas.width / Math.max(1, window.innerWidth);
      const dprY = this.canvas.height / Math.max(1, window.innerHeight);
      for (const element of surfaces) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) continue;
        const style = getComputedStyle(element);
        const materialName = ['glass-clear', 'glass-frosted', 'glass-deep', 'glass-reflective', 'glass-solid'].find((name) => element.classList.contains(name))?.replace('glass-', '') || 'frosted';
        const material = MATERIALS[materialName] || MATERIALS.frosted;
        const x = rect.left * dprX;
        const y = this.canvas.height - rect.bottom * dprY;
        const width = rect.width * dprX;
        const height = rect.height * dprY;
        const scissorX = Math.max(0, Math.floor(x));
        const scissorY = Math.max(0, Math.floor(y));
        const scissorRight = Math.min(this.canvas.width, Math.ceil(x + width));
        const scissorTop = Math.min(this.canvas.height, Math.ceil(y + height));
        if (scissorRight <= scissorX || scissorTop <= scissorY) continue;
        gl.scissor(scissorX, scissorY, scissorRight - scissorX, scissorTop - scissorY);
        const radius = Number.parseFloat(style.borderTopLeftRadius) || 12;
        const variantBoost = materialName === 'reflective' ? 1.15 : 1;
        gl.uniform4f(this.locations.u_surface, x, y, width, height);
        gl.uniform1f(this.locations.u_radius, radius * Math.min(dprX, dprY));
        gl.uniform1f(this.locations.u_bevel, Math.min(width, height) * .12);
        gl.uniform1f(this.locations.u_ior, material.ior);
        gl.uniform1f(this.locations.u_thickness, material.thickness * variantBoost);
        gl.uniform1f(this.locations.u_roughness, material.roughness);
        gl.uniform1f(this.locations.u_opacity, material.opacity);
        gl.uniform1f(this.locations.u_absorption, material.absorption);
        gl.uniform1f(this.locations.u_dispersion, material.dispersion);
        gl.uniform3fv(this.locations.u_tint, material.tint);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    impulseAt(x, y, amplitude = .7) {
      return [x / Math.max(1, window.innerWidth), 1 - y / Math.max(1, window.innerHeight), amplitude];
    }

    reduceResolution() {
      this.qualityScale = Math.max(.72, this.qualityScale * .86);
    }

    dispose() {
      if (this.fluid) this.fluid.dispose();
      const gl = this.gl;
      gl.deleteTexture(this.backdropTexture);
      gl.deleteTexture(this.waveFallback);
      gl.deleteVertexArray(this.vao);
      gl.deleteProgram(this.program);
    }
  }

  window.LocalPriceGlassRenderer = LocalPriceGlassRenderer;
})();
