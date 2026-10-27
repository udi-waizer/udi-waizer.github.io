// Fractal-glass shader overlay for an <img>. Desktop only (>=1024px). Plain WebGL, no deps.
(function () {
  const VS = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const FS = `precision highp float;
uniform sampler2D uTex;uniform vec2 uMouse;uniform float uPar,uDist,uStr,uFreq,uSmooth,uEdge;varying vec2 vUv;
float disp(float x,float n,float s){return mod(x,1./n)*s;}
float glass(float x){float sw=1./uFreq,st=uSmooth*sw,d=0.;for(int i=-5;i<=5;i++){d+=disp(x+float(i)*st,uFreq,uStr);}return x+d/11.;}
float edge(float x,float p){if(x<p)return smoothstep(0.,p,x);if(x>1.-p)return smoothstep(1.,1.-p,x);return 1.;}
void main(){vec2 uv=vUv;float ox=uv.x,e=edge(ox,uEdge);uv.x=mix(ox,glass(ox),e);float df=uv.x-ox;
float dir=-sign(.5-uMouse.x);uv.x+=dir*abs(uMouse.x-.5)*uPar*(1.+abs(df)*uDist)*e;
gl_FragColor=texture2D(uTex,clamp(uv,0.,1.));}`;
  window.attachFractalGlass = function (img, o) {
    o = Object.assign({ minWidth: 1024, stripes: 40, strength: 2, smooth: 0.014, parallax: 0.15, distortion: 8, edge: 0.12 }, o || {});
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;pointer-events:none;display:none';
    img.after(cv);
    const cs = getComputedStyle(img);
    ['mask','webkitMask','maskImage','webkitMaskImage','maskComposite','webkitMaskComposite','maskSize','webkitMaskSize','maskRepeat','webkitMaskRepeat','maskPosition','webkitMaskPosition'].forEach(k => { const v = img.style[k] || cs[k]; if (v && v !== 'none') cv.style[k] = v; });
    if (img.style.mask) cv.style.mask = img.style.mask;
    const gl = cv.getContext('webgl', { premultipliedAlpha: false });
    if (!gl) { cv.remove(); return () => {}; }
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    gl.uniform1f(U('uPar'), o.parallax); gl.uniform1f(U('uDist'), o.distortion); gl.uniform1f(U('uStr'), o.strength);
    gl.uniform1f(U('uFreq'), o.stripes); gl.uniform1f(U('uSmooth'), o.smooth); gl.uniform1f(U('uEdge'), o.edge);
    const uM = U('uMouse');
    const tex = gl.createTexture(); let ready = false;
    const upload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      ['TEXTURE_WRAP_S', 'TEXTURE_WRAP_T'].forEach(k => gl.texParameteri(gl.TEXTURE_2D, gl[k], gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); ready = true;
    };
    if (img.complete && img.naturalWidth) upload(); else img.addEventListener('load', upload, { once: true });
    const tgt = { x: 0.5 }, cur = { x: 0.5 };
    const onMove = e => { const x = e.touches ? e.touches[0].clientX : e.clientX; tgt.x = x / innerWidth; };
    addEventListener('mousemove', onMove);
    let raf = 0, on = false, dead = false;
    const frame = () => {
      raf = 0; if (dead) return;
      const active = innerWidth >= o.minWidth && ready && !document.hidden;
      if (active !== on) { on = active; cv.style.display = on ? 'block' : 'none'; img.style.visibility = on ? 'hidden' : ''; }
      if (on) {
        const par = cv.offsetParent || img.parentElement, pr2 = par.getBoundingClientRect(), r = img.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) {
          const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
          cv.style.left = (r.left - pr2.left) + 'px'; cv.style.top = (r.top - pr2.top) + 'px';
          cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
          if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
          cur.x += (tgt.x - cur.x) * 0.04; gl.uniform2f(uM, cur.x, 0.5); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); removeEventListener('mousemove', onMove); img.style.visibility = ''; cv.remove(); };
  };
})();
