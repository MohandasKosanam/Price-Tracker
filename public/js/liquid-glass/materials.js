(function () {
  'use strict';

  window.LocalPriceGlassMaterials = {
    clear: { ior: 1.48, thickness: 0.42, roughness: 0.10, opacity: 0.72, absorption: 0.025, dispersion: 0.002, tint: [0.82, 0.90, 0.98] },
    frosted: { ior: 1.47, thickness: 0.62, roughness: 0.48, opacity: 0.78, absorption: 0.045, dispersion: 0.001, tint: [0.80, 0.88, 0.96] },
    deep: { ior: 1.50, thickness: 0.76, roughness: 0.30, opacity: 0.72, absorption: 0.12, dispersion: 0.003, tint: [0.56, 0.70, 0.84] },
    reflective: { ior: 1.49, thickness: 0.80, roughness: 0.14, opacity: 0.82, absorption: 0.06, dispersion: 0.004, tint: [0.82, 0.90, 0.98] },
    solid: { ior: 1.46, thickness: 0.16, roughness: 0.72, opacity: 0.90, absorption: 0.03, dispersion: 0.000, tint: [0.90, 0.94, 0.98] }
  };
})();
