const { launch } = require('./atlas-harness.js');
(async () => {
  const h = await launch({});
  await h.page.goto(h.url);
  const r = await h.page.evaluate(() => {
    const out = {};
    for (const t of ['webgl2', 'webgl']) {
      const c = document.createElement('canvas');
      const gl = c.getContext(t, { antialias: true });
      if (!gl) { out[t] = null; continue; }
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      out[t] = {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        samples: gl.getParameter(gl.SAMPLES),
        exts: ['OES_standard_derivatives', 'OES_element_index_uint', 'ANGLE_instanced_arrays', 'OES_vertex_array_object'].filter(e => gl.getExtension(e)),
        highp: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision
      };
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await h.close();
})();
