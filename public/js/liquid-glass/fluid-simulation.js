(function () {
  'use strict';

  const vertexSource = `#version 300 es
    precision highp float;
    out vec2 v_uv;
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      v_uv = p * .5;
      gl_Position = vec4(p - 1.0, 0.0, 1.0);
    }
  `;

  const updateSource = `#version 300 es
    precision highp float;
    uniform sampler2D u_state;
    uniform vec2 u_grid;
    uniform float u_dt;
    uniform float u_waveSpeed;
    uniform float u_damping;
    uniform vec3 u_impulse;
    in vec2 v_uv;
    out vec2 out_state;
    void main() {
      vec2 texel = 1.0 / u_grid;
      vec2 state = texture(u_state, v_uv).rg;
      float h = state.r;
      float velocity = state.g;
      float laplacian = texture(u_state, v_uv + vec2(texel.x, 0.0)).r
        + texture(u_state, v_uv - vec2(texel.x, 0.0)).r
        + texture(u_state, v_uv + vec2(0.0, texel.y)).r
        + texture(u_state, v_uv - vec2(0.0, texel.y)).r
        - 4.0 * h;
      float aspect = u_grid.x / u_grid.y;
      vec2 delta = (v_uv - u_impulse.xy) * vec2(aspect, 1.0);
      float pressure = u_impulse.z * exp(-dot(delta, delta) * 1500.0);
      float dt = clamp(u_dt, 0.0, .025);
      velocity += (u_waveSpeed * u_waveSpeed * laplacian + pressure * 16.0) * dt;
      velocity *= exp(-u_damping * dt);
      h += velocity * dt;
      float edge = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
      float boundaryDamping = smoothstep(0.0, .035, edge);
      h *= boundaryDamping;
      velocity *= boundaryDamping;
      out_state = vec2(clamp(h, -.22, .22), clamp(velocity, -3.0, 3.0));
    }
  `;

  function compileProgram(gl, vertex, fragment) {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message || 'Fluid shader compilation failed.');
      }
      return shader;
    };
    const program = gl.createProgram();
    const vertexShader = compile(gl.VERTEX_SHADER, vertex);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(message || 'Fluid shader linking failed.');
    }
    return program;
  }

  class LocalPriceFluidSimulation {
    constructor(gl, size = 128) {
      this.gl = gl;
      this.size = size;
      this.available = Boolean(gl.getExtension('EXT_color_buffer_float'));
      if (!this.available) return;
      this.program = compileProgram(gl, vertexSource, updateSource);
      this.vao = gl.createVertexArray();
      this.textures = [];
      this.framebuffers = [];
      for (let index = 0; index < 2; index += 1) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, size, size, 0, gl.RG, gl.HALF_FLOAT, null);
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          this.available = false;
          break;
        }
        gl.viewport(0, 0, size, size);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.textures.push(texture);
        this.framebuffers.push(framebuffer);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.readIndex = 0;
      this.writeIndex = 1;
    }

    get texture() { return this.available ? this.textures[this.readIndex] : null; }

    step(dt, impulse = [-2, -2, 0]) {
      if (!this.available) return;
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[this.writeIndex]);
      gl.viewport(0, 0, this.size, this.size);
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[this.readIndex]);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_state'), 0);
      gl.uniform2f(gl.getUniformLocation(this.program, 'u_grid'), this.size, this.size);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_dt'), dt);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_waveSpeed'), 6.2);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_damping'), 2.6);
      gl.uniform3f(gl.getUniformLocation(this.program, 'u_impulse'), impulse[0], impulse[1], impulse[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      [this.readIndex, this.writeIndex] = [this.writeIndex, this.readIndex];
    }

    dispose() {
      const gl = this.gl;
      this.textures.forEach((texture) => gl.deleteTexture(texture));
      this.framebuffers.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
      if (this.program) gl.deleteProgram(this.program);
      if (this.vao) gl.deleteVertexArray(this.vao);
    }
  }

  window.LocalPriceFluidSimulation = LocalPriceFluidSimulation;
})();
