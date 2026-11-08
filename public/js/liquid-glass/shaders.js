(function () {
  'use strict';

  window.LocalPriceGlassShaders = {
    vertex: `#version 300 es
      precision highp float;
      out vec2 v_uv;
      void main() {
        vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
        v_uv = p * .5;
        gl_Position = vec4(p - 1.0, 0.0, 1.0);
      }
    `,
    fragment: `#version 300 es
      precision highp float;
      uniform sampler2D u_backdrop;
      uniform sampler2D u_wave;
      uniform vec2 u_viewport;
      uniform vec2 u_waveTexel;
      uniform vec4 u_surface;
      uniform float u_radius;
      uniform float u_bevel;
      uniform float u_ior;
      uniform float u_thickness;
      uniform float u_roughness;
      uniform float u_opacity;
      uniform float u_absorption;
      uniform float u_dispersion;
      uniform vec3 u_tint;
      uniform float u_waveEnabled;
      in vec2 v_uv;
      out vec4 out_color;

      float roundedBox(vec2 point, vec2 halfSize, float radius) {
        vec2 q = abs(point) - (halfSize - vec2(radius));
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
      }

      vec3 sampleRough(sampler2D source, vec2 uv, float roughness) {
        vec2 spread = (1.0 / u_viewport) * (1.5 + 5.0 * roughness);
        vec3 color = texture(source, uv).rgb * .40;
        color += texture(source, uv + vec2(spread.x, 0.0)).rgb * .15;
        color += texture(source, uv - vec2(spread.x, 0.0)).rgb * .15;
        color += texture(source, uv + vec2(0.0, spread.y)).rgb * .15;
        color += texture(source, uv - vec2(0.0, spread.y)).rgb * .15;
        return color;
      }

      void main() {
        vec2 pixel = gl_FragCoord.xy;
        vec2 local = pixel - u_surface.xy;
        vec2 size = u_surface.zw;
        vec2 centered = local - size * .5;
        float radius = clamp(u_radius, 0.0, min(size.x, size.y) * .5);
        float sdf = roundedBox(centered, size * .5, radius);
        float edge = 1.0 - smoothstep(-fwidth(sdf), fwidth(sdf), sdf);
        if (edge <= 0.001) discard;

        float bevel = max(2.0, u_bevel);
        float insideDepth = max(0.0, -sdf);
        float edgeCurve = 1.0 - smoothstep(0.0, bevel, insideDepth);
        float dx = roundedBox(centered + vec2(1.0, 0.0), size * .5, radius) - sdf;
        float dy = roundedBox(centered + vec2(0.0, 1.0), size * .5, radius) - sdf;
        vec2 normalXY = normalize(vec2(dx, dy) + vec2(.00001)) * edgeCurve * .74;

        vec2 screenUv = clamp(pixel / u_viewport, vec2(.001), vec2(.999));
        if (u_waveEnabled > .5) {
          vec2 waveStep = u_waveTexel;
          float leftWave = texture(u_wave, screenUv - vec2(waveStep.x, 0.0)).r;
          float rightWave = texture(u_wave, screenUv + vec2(waveStep.x, 0.0)).r;
          float downWave = texture(u_wave, screenUv - vec2(0.0, waveStep.y)).r;
          float upWave = texture(u_wave, screenUv + vec2(0.0, waveStep.y)).r;
          normalXY += vec2(rightWave - leftWave, upWave - downWave) * 2.4;
        }

        vec3 normal = normalize(vec3(normalXY, 1.0));
        float depthProfile = mix(.42, 1.0, smoothstep(0.0, bevel * 1.35, insideDepth));
        float thickness = u_thickness * depthProfile;
        float eta = 1.0 / clamp(u_ior, 1.01, 1.7);
        vec3 incident = vec3(0.0, 0.0, -1.0);
        vec3 refracted = refract(incident, normal, eta);
        vec2 displacement = refracted.xy / max(.35, -refracted.z) * thickness * 26.0;
        vec2 refractedUv = clamp(screenUv + displacement / u_viewport, vec2(.001), vec2(.999));

        float edgeDispersion = u_dispersion * edgeCurve * thickness;
        vec3 transmitted;
        transmitted.r = sampleRough(u_backdrop, clamp(refractedUv + displacement / u_viewport * edgeDispersion * 24.0, vec2(.001), vec2(.999)), u_roughness).r;
        transmitted.g = sampleRough(u_backdrop, refractedUv, u_roughness).g;
        transmitted.b = sampleRough(u_backdrop, clamp(refractedUv - displacement / u_viewport * edgeDispersion * 24.0, vec2(.001), vec2(.999)), u_roughness).b;

        vec3 reflected = texture(u_backdrop, clamp(screenUv - normalXY * .018, vec2(.001), vec2(.999))).rgb;
        float cosView = clamp(normal.z, 0.0, 1.0);
        float f0 = pow((u_ior - 1.0) / (u_ior + 1.0), 2.0);
        float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosView, 5.0);
        float absorption = exp(-u_absorption * thickness * 4.0);
        transmitted *= mix(vec3(1.0), u_tint, .34) * absorption;
        vec3 viewDirection = vec3(0.0, 0.0, 1.0);
        vec3 lightDirection = normalize(vec3(-.45, .62, .64));
        vec3 halfVector = normalize(lightDirection + viewDirection);
        float specularPower = mix(86.0, 10.0, u_roughness);
        float specular = pow(max(dot(normal, halfVector), 0.0), specularPower) * (1.0 - u_roughness * .68);
        float rim = pow(1.0 - cosView, 2.4) * .44;
        vec3 color = mix(transmitted, reflected, clamp(fresnel * 1.35 + rim, 0.0, .62));
        color += vec3(.86, .93, 1.0) * (specular * .28 + rim * .16);
        float alpha = u_opacity * edge;
        out_color = vec4(color, alpha);
      }
    `
  };
})();
