// Liquid particle portrait (WebGL2 GPGPU). Ported from "Sculpture Hero" by guglielmogiannattasio.it.
// window.attachLiquidPortrait(img, opts) -> destroy(). Active only at >= minWidth (default 1024px).
(function () {
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }
vec2 ambientField(vec2 uv, float t){
  vec2 q = uv*vec2(3.2,1.7);
  vec2 a = vec2(vnoise(q+vec2(t*0.11,0.0))-0.5, vnoise(q+vec2(5.2,t*0.08)+3.1)-0.5);
  vec2 q2 = uv*vec2(7.5,4.0) + vec2(-t*0.19, t*0.13);
  vec2 b = vec2(vnoise(q2+1.7)-0.5, vnoise(q2+9.3)-0.5);
  return a + b*0.45;
}`;
const ENERGY = `
float energyAt(vec2 rectPx, vec2 mouse, float radius, float presence, float wakeEnergy){
  vec2 d = rectPx - mouse;
  float f = exp(-dot(d,d)/(radius*radius))*presence;
  return smoothstep(0.06, 0.5, f*1.15 + wakeEnergy*1.7);
}`;
const QUAD_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;
const FLOW_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPrev; uniform vec2 uTexel; uniform vec2 uMouse; uniform vec2 uVel; uniform vec2 uSize;
uniform float uRadius; uniform float uPresence; uniform float uDecay;
vec2 decV(vec4 c){ return (c.rg*255.0-128.0)/127.0; }
void main(){
  vec2 v0 = decV(texture(uPrev, vUv));
  vec2 uv = vUv - v0*uTexel*2.5;
  vec4 c = texture(uPrev, uv)*0.52
    + 0.12*(texture(uPrev, uv+vec2(uTexel.x,0.0)) + texture(uPrev, uv-vec2(uTexel.x,0.0))
          + texture(uPrev, uv+vec2(0.0,uTexel.y)) + texture(uPrev, uv-vec2(0.0,uTexel.y)));
  vec2 v = decV(c); float p = c.b;
  vec2 d = (vUv-uMouse)*uSize;
  float f = exp(-dot(d,d)/(uRadius*uRadius))*uPresence;
  float sp = clamp(length(uVel)*2.5, 0.0, 1.0);
  v += uVel*f*0.22; p = max(p, f*sp);
  v *= uDecay; p *= uDecay;
  v = sign(v)*max(abs(v)-1.2/127.0, 0.0);
  p = max(p-1.2/255.0, 0.0);
  v = clamp(v, -1.0, 1.0);
  o = vec4((v*127.0+128.0)/255.0, p, 1.0);
}`;
const SIM_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uState; uniform sampler2D uHome; uniform sampler2D uFlow;
uniform vec2 uSize; uniform vec2 uMouse; uniform float uRadius; uniform float uPresence; uniform float uStrength;
uniform float uSpread; uniform float uTurb; uniform float uReturn; uniform float uTime; uniform float uDt; uniform float uIntro;
${NOISE}
vec2 curl(vec2 p){
  const float e = 0.35;
  float a = vnoise(p+vec2(0.0,e)) - vnoise(p-vec2(0.0,e));
  float b = vnoise(p+vec2(e,0.0)) - vnoise(p-vec2(e,0.0));
  return vec2(a, -b)/(2.0*e);
}
void main(){
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 hm = texelFetch(uHome, ij, 0);
  if(hm.w <= 0.0){ o = vec4(0.0); return; }
  vec4 st = texelFetch(uState, ij, 0);
  vec2 off = st.xy; vec2 vel = st.zw;
  float sd = hm.z; float light = 0.45 + sd*1.1;
  vec2 p = hm.xy*uSize + off;
  vec4 fl = texture(uFlow, clamp(p/uSize, 0.0, 1.0));
  vec2 wake = (fl.rg*255.0-128.0)/127.0; float pr = fl.b;
  vec2 toM = p - uMouse; float r2 = dot(toM,toM);
  float f = exp(-r2/(uRadius*uRadius))*uPresence;
  vec2 n = toM*inversesqrt(r2+1.0);
  float e = clamp(pr*2.0 + f, 0.0, 1.0);
  vec2 acc = vec2(0.0);
  acc += n*f*1.25*uStrength*uSpread*light;
  acc += vec2(-n.y, n.x)*f*1.45*uStrength*uSpread*(0.4+sd);
  acc += (wake*42.0*uSpread*light - vel)*e*0.08;
  vec2 q = p*0.0095 + vec2(uTime*0.35, -uTime*0.2);
  vec2 c = curl(q) + 0.5*curl(q*2.3 + 7.1);
  acc += c*(e*1.2*uSpread + uIntro*1.5)*uTurb*light;
  float k = (0.006 + 0.02*uReturn)*(0.65+sd*0.7)*(1.0 - uIntro*0.75);
  acc -= off*k;
  vel += acc*uDt;
  vel *= pow(mix(0.93, 0.955, e), uDt);
  off += vel*uDt;
  if(dot(off,off) < 0.0004 && dot(vel,vel) < 0.0004){ off = vec2(0.0); vel = vec2(0.0); }
  o = vec4(off, vel);
}`;
const PART_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
uniform sampler2D uState; uniform sampler2D uHome; uniform sampler2D uCol; uniform sampler2D uFlow;
uniform int uTexW; uniform vec4 uRect; uniform vec2 uRes; uniform vec2 uMouse; uniform float uRadius; uniform float uPresence;
uniform float uDot; uniform float uTime; uniform float uAmbient; uniform float uStreak; uniform float uIntroVis; uniform float uRest; uniform vec3 uTint;
out vec2 vLocal; out float vHalfLen; out float vR; out vec3 vCol; out float vA;
${NOISE}
${ENERGY}
void main(){
  int id = gl_InstanceID;
  ivec2 ij = ivec2(id % uTexW, id / uTexW);
  vec4 hm = texelFetch(uHome, ij, 0); vec4 st = texelFetch(uState, ij, 0); vec4 cl = texelFetch(uCol, ij, 0);
  float wakeE = texture(uFlow, hm.xy).b;
  float E = energyAt(hm.xy*uRect.zw, uMouse, uRadius, uPresence, wakeE);
  float lift = smoothstep(0.35, 2.5, length(st.xy));
  float a = max(max(E, lift), max(uRest, 1.0-uIntroVis));
  if(a < 0.01 || hm.w <= 0.0){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  vec2 base = uRect.xy + hm.xy*uRect.zw + st.xy;
  base -= ambientField(hm.xy, uTime)*10.0*uAmbient;
  vec2 v = st.zw; float sp = length(v);
  vec2 dir = sp > 0.001 ? v/sp : vec2(1.0,0.0);
  float r = uDot*hm.w*0.5;
  float len = min(sp*1.25, 18.0)*uStreak;
  vec2 lc = aCorner*vec2(r + len*0.5 + 1.0, r + 1.0);
  vec2 center = base - dir*len*0.5;
  vec2 world = center + dir*lc.x + vec2(-dir.y, dir.x)*lc.y;
  vec2 clip = world/uRes*2.0-1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vLocal = lc; vHalfLen = len*0.5; vR = r;
  vec3 col = cl.rgb*uTint;
  float glint = smoothstep(2.0, 16.0, sp);
  col = mix(col, min(col*1.18 + vec3(0.07,0.075,0.085), vec3(1.0)), glint*0.75);
  vCol = col; vA = a;
}`;
const PART_FS = `#version 300 es
precision highp float;
in vec2 vLocal; in float vHalfLen; in float vR; in vec3 vCol; in float vA;
uniform float uDpr; out vec4 o;
void main(){
  vec2 q = vec2(max(abs(vLocal.x)-vHalfLen, 0.0), vLocal.y);
  float d = length(q) - vR;
  float a = clamp(0.5 - d*uDpr, 0.0, 1.0);
  float tail = vHalfLen > 0.0 ? clamp(0.5 - vLocal.x/(2.0*(vHalfLen+vR)), 0.0, 1.0) : 0.0;
  a *= 1.0 - tail*0.55; a *= vA;
  if(a < 0.004) discard;
  o = vec4(vCol*a, a);
}`;
const IMAGE_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uImg; uniform sampler2D uFlow; uniform vec2 uRes; uniform float uDpr; uniform vec4 uRect;
uniform vec3 uBg; uniform vec3 uImgBg; uniform vec2 uMouse; uniform float uPresence; uniform float uRadius; uniform float uStrength;
uniform float uTime; uniform float uAmbient; uniform float uIntroVis; uniform float uRest; uniform float uAlphaMode;
${NOISE}
${ENERGY}
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y*uDpr - gl_FragCoord.y)/uDpr;
  vec2 size = uRect.zw;
  vec2 uv = (px-uRect.xy)/size;
  vec4 fl = texture(uFlow, clamp(uv,0.0,1.0));
  vec2 vel = (fl.rg*255.0-128.0)/127.0;
  vec2 rp = uv*size; vec2 toM = rp - uMouse;
  float fall = exp(-dot(toM,toM)/(uRadius*uRadius))*uPresence;
  vec2 disp = -toM*0.22*uStrength*fall - vel*10.0*uStrength;
  disp += ambientField(uv, uTime)*10.0*uAmbient;
  vec2 suv = clamp(uv + disp/size, 0.0, 1.0);
  vec4 tx = texture(uImg, suv);
  vec3 col = tx.rgb;
  float key = uAlphaMode > 0.5 ? tx.a : smoothstep(0.012, 0.05, length(col-uImgBg));
  float E = energyAt(rp, uMouse, uRadius, uPresence, fl.b);
  float show = (1.0 - max(E, uRest))*uIntroVis;
  vec3 mat = uAlphaMode > 0.5 ? col : col*(uBg/max(uImgBg, vec3(0.001)));
  float A = key*show;
  o = vec4(mat*A, A);
}`;
function compile(gl, vs, fs) {
  const make = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(), v = make(gl.VERTEX_SHADER, vs), f = make(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
  gl.deleteShader(v); gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); if (info) u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
const TEX_W = 1024, SETTLE = 270;

class Engine {
  constructor(canvas, opts) {
    this.canvas = canvas; this.o = opts;
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.flowW = 256; this.flowH = 256; this.flowIdx = 0; this.flowTex = []; this.flowFb = [];
    this.stateTex = []; this.stateFb = []; this.stateIdx = 0; this.texH = 1; this.n = 0; this.gridW = 1;
    this.imgBg = [0, 0, 0]; this.flowing = 0; this.aspect = 1;
    this.rect = { x: 0, y: 0, w: 1, h: 1 }; this.cssW = 1; this.cssH = 1;
    this.target = { x: -9999, y: -9999 }; this.mouse = { x: -9999, y: -9999 }; this.prev = { x: -9999, y: -9999 }; this.mvel = { x: 0, y: 0 };
    this.presence = 0; this.presenceTarget = 0; this.settle = 1e9; this.time = 0;
    this.running = false; this.visible = true; this.ready = false; this.dead = false;
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('No float RT');
    this.pFlow = compile(gl, QUAD_VS, FLOW_FS); this.pSim = compile(gl, QUAD_VS, SIM_FS);
    this.pPart = compile(gl, PART_VS, PART_FS); this.pImg = compile(gl, QUAD_VS, IMAGE_FS);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (let i = 0; i < 2; i++) {
      const t = this.tex(gl.RGBA8, this.flowW, this.flowH, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      this.flowTex.push(t); this.flowFb.push(fb);
    }
    this.clearFlow();
    this.frame = this.frame.bind(this);
  }
  tex(internal, w, h, format, type, data, filter) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  clearFlow() { const gl = this.gl; for (const fb of this.flowFb) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, this.flowW, this.flowH); gl.clearColor(128 / 255, 128 / 255, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.flowDirty = false; }
  clearState() { const gl = this.gl; for (const fb of this.stateFb) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, TEX_W, this.texH); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.stateDirty = false; }
  setImage(img) {
    const gl = this.gl;
    this.aspect = img.naturalWidth / img.naturalHeight || 1;
    this.flowH = Math.max(32, Math.round(this.flowW / this.aspect));
    for (const t of this.flowTex) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.flowW, this.flowH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
    this.clearFlow();
    this.imgTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.build(img); this.ready = true; this.draw();
  }
  build(img) {
    const gl = this.gl, o = this.o;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    const gw = Math.round((lowPower ? 420 : 620) * Math.sqrt(clamp(o.density, 0.15, 2)));
    const gh = Math.max(1, Math.round(gw / this.aspect));
    this.gridW = gw;
    const c = document.createElement('canvas'); c.width = gw; c.height = gh;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, gw, gh);
    const data = ctx.getImageData(0, 0, gw, gh).data;
    let r = 0, g = 0, b = 0, n = 0; const pw = Math.max(2, Math.round(gw * 0.012));
    for (const [cx, cy] of [[0, 0], [gw - pw, 0], [0, gh - pw], [gw - pw, gh - pw]])
      for (let y = cy; y < cy + pw; y++) for (let x = cx; x < cx + pw; x++) { const i = (y * gw + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    this.imgBg = o.imgBg || [r / n / 255, g / n / 255, b / n / 255];
    const home = [], col = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = (y * gw + x) * 4, R = data[i] / 255, G = data[i + 1] / 255, B = data[i + 2] / 255;
      const dev = Math.hypot(R - this.imgBg[0], G - this.imgBg[1], B - this.imgBg[2]);
      if (dev < 0.03) continue;
      if (dev < 0.07 && Math.random() > (dev - 0.03) / 0.04) continue;
      home.push((x + 0.5 + (Math.random() - 0.5) * 0.6) / gw, (y + 0.5 + (Math.random() - 0.5) * 0.6) / gh, Math.random(), 0.85 + Math.random() * 0.3);
      col.push(data[i], data[i + 1], data[i + 2], 255);
    }
    this.n = home.length / 4; this.texH = Math.max(1, Math.ceil(this.n / TEX_W));
    const total = TEX_W * this.texH, homeArr = new Float32Array(total * 4); homeArr.set(home);
    const colArr = new Uint8Array(total * 4); colArr.set(col);
    this.homeTex = this.tex(gl.RGBA32F, TEX_W, this.texH, gl.RGBA, gl.FLOAT, homeArr, gl.NEAREST);
    this.colTex = this.tex(gl.RGBA8, TEX_W, this.texH, gl.RGBA, gl.UNSIGNED_BYTE, colArr, gl.NEAREST);
    for (let i = 0; i < 2; i++) {
      const t = this.tex(gl.RGBA16F, TEX_W, this.texH, gl.RGBA, gl.HALF_FLOAT, null, gl.NEAREST);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Float FBO incomplete');
      this.stateTex.push(t); this.stateFb.push(fb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.clearState();
  }
  resize(w, h) {
    this.cssW = Math.max(1, w); this.cssH = Math.max(1, h); this.rect = { x: 0, y: 0, w: this.cssW, h: this.cssH };
    let dpr = Math.min(devicePixelRatio || 1, 2);
    if (this.cssW * this.cssH * dpr * dpr > 4.5e6) dpr = Math.max(1, Math.sqrt(4.5e6 / (this.cssW * this.cssH)));
    const W = Math.round(this.cssW * dpr), H = Math.round(this.cssH * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    this.draw();
  }
  setVisible(v) { this.visible = v; if (v) this.wake(); else this.stop(); }
  pointer(type, x, y) {
    if (type === 'leave') { this.presenceTarget = 0; this.wake(); return; }
    if (this.mouse.x < -9000) { this.mouse.x = this.prev.x = x; this.mouse.y = this.prev.y = y; }
    this.target.x = x; this.target.y = y; this.presenceTarget = 1; this.settle = 0; this.wake();
  }
  wake() {
    if (!this.ready || this.running || !this.visible || this.dead) { if (this.ready && !this.running) this.draw(); return; }
    this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame(this.frame);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  radiusPx() { return this.o.radius * clamp(this.rect.w / 900, 0.6, 1.25); }
  frame(now) {
    if (!this.running) return;
    const raw = now - this.last, dt = clamp(raw / 16.6667, 0.25, 3); this.last = now;
    const ease = 1 - Math.pow(1 - 0.22, dt);
    this.mouse.x += (this.target.x - this.mouse.x) * ease; this.mouse.y += (this.target.y - this.mouse.y) * ease;
    const vx = (this.mouse.x - this.prev.x) / dt, vy = (this.mouse.y - this.prev.y) / dt;
    this.prev.x = this.mouse.x; this.prev.y = this.mouse.y;
    this.mvel.x += (clamp(vx, -60, 60) - this.mvel.x) * 0.5; this.mvel.y += (clamp(vy, -60, 60) - this.mvel.y) * 0.5;
    const pk = this.presenceTarget > this.presence ? 0.1 : 0.035;
    this.presence += (this.presenceTarget - this.presence) * (1 - Math.pow(1 - pk, dt));
    if (this.presence < 0.001 && this.presenceTarget === 0) this.presence = 0;
    const fk = this.presenceTarget > this.flowing ? 0.05 : 0.018;
    this.flowing += (this.presenceTarget - this.flowing) * (1 - Math.pow(1 - fk, dt));
    if (this.flowing < 0.002 && this.presenceTarget === 0) this.flowing = 0;
    const interacting = this.presence > 0.001;
    this.settle = interacting ? 0 : this.settle + dt;
    if (!interacting && this.settle >= SETTLE) {
      if (this.flowDirty) this.clearFlow(); if (this.stateDirty) this.clearState();
      this.draw(); this.stop(); return;
    }
    this.raf = requestAnimationFrame(this.frame);
    this.time += (dt * this.o.speed * (1 + this.flowing * 1.6)) / 60;
    this.stepFlow(dt); this.stepSim(dt); this.draw();
  }
  stepFlow(dt) {
    const gl = this.gl, P = this.pFlow, dst = 1 - this.flowIdx, r = this.rect;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.flowFb[dst]); gl.viewport(0, 0, this.flowW, this.flowH); gl.disable(gl.BLEND);
    gl.useProgram(P.p); gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]); gl.uniform1i(P.u.uPrev, 0);
    gl.uniform2f(P.u.uTexel, 1 / this.flowW, 1 / this.flowH);
    gl.uniform2f(P.u.uMouse, (this.mouse.x - r.x) / r.w, (this.mouse.y - r.y) / r.h);
    gl.uniform2f(P.u.uVel, clamp(this.mvel.x / 40, -1, 1), clamp(this.mvel.y / 40, -1, 1));
    gl.uniform2f(P.u.uSize, r.w, r.h); gl.uniform1f(P.u.uRadius, this.radiusPx());
    gl.uniform1f(P.u.uPresence, this.presence); gl.uniform1f(P.u.uDecay, Math.pow(0.968, dt));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); this.flowIdx = dst; this.flowDirty = true;
  }
  stepSim(dt) {
    if (!this.n) return;
    const gl = this.gl, P = this.pSim, o = this.o, r = this.rect, dst = 1 - this.stateIdx;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.stateFb[dst]); gl.viewport(0, 0, TEX_W, this.texH); gl.disable(gl.BLEND);
    gl.useProgram(P.p); gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.stateTex[this.stateIdx]); gl.uniform1i(P.u.uState, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.homeTex); gl.uniform1i(P.u.uHome, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]); gl.uniform1i(P.u.uFlow, 2);
    gl.uniform2f(P.u.uSize, r.w, r.h); gl.uniform2f(P.u.uMouse, this.mouse.x - r.x, this.mouse.y - r.y);
    gl.uniform1f(P.u.uRadius, this.radiusPx()); gl.uniform1f(P.u.uPresence, this.presence);
    gl.uniform1f(P.u.uStrength, o.strength); gl.uniform1f(P.u.uSpread, o.spread); gl.uniform1f(P.u.uTurb, o.turbulence);
    gl.uniform1f(P.u.uReturn, o.returnSpeed); gl.uniform1f(P.u.uTime, this.time); gl.uniform1f(P.u.uDt, dt); gl.uniform1f(P.u.uIntro, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); this.stateIdx = dst; this.stateDirty = true;
  }
  draw() {
    if (!this.ready || this.dead) return;
    const gl = this.gl, o = this.o, r = this.rect, [br, bg, bb] = o.bg, [ir, ig, ib] = this.imgBg;
    const dpr = this.canvas.width / this.cssW, amb = this.flowing * 0.85 * o.liquid;
    const mx = this.mouse.x - r.x, my = this.mouse.y - r.y;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindVertexArray(this.vao); gl.disable(gl.BLEND);
    const I = this.pImg; gl.useProgram(I.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.imgTex); gl.uniform1i(I.u.uImg, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]); gl.uniform1i(I.u.uFlow, 1);
    gl.uniform2f(I.u.uRes, this.cssW, this.cssH); gl.uniform1f(I.u.uDpr, dpr); gl.uniform4f(I.u.uRect, r.x, r.y, r.w, r.h);
    gl.uniform3f(I.u.uBg, br, bg, bb); gl.uniform3f(I.u.uImgBg, ir, ig, ib); gl.uniform2f(I.u.uMouse, mx, my);
    gl.uniform1f(I.u.uPresence, this.presence); gl.uniform1f(I.u.uRadius, this.radiusPx()); gl.uniform1f(I.u.uStrength, o.strength);
    gl.uniform1f(I.u.uTime, this.time); gl.uniform1f(I.u.uAmbient, amb); gl.uniform1f(I.u.uIntroVis, 1); gl.uniform1f(I.u.uRest, 0);
    gl.uniform1f(I.u.uAlphaMode, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!this.n || !this.stateDirty) return;
    const P = this.pPart; gl.useProgram(P.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.stateTex[this.stateIdx]); gl.uniform1i(P.u.uState, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.homeTex); gl.uniform1i(P.u.uHome, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.colTex); gl.uniform1i(P.u.uCol, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]); gl.uniform1i(P.u.uFlow, 3);
    gl.uniform1i(P.u.uTexW, TEX_W); gl.uniform4f(P.u.uRect, r.x, r.y, r.w, r.h); gl.uniform2f(P.u.uRes, this.cssW, this.cssH);
    gl.uniform2f(P.u.uMouse, mx, my); gl.uniform1f(P.u.uRadius, this.radiusPx()); gl.uniform1f(P.u.uPresence, this.presence);
    gl.uniform1f(P.u.uDot, (r.w / this.gridW) * 1.45 * o.dotSize); gl.uniform1f(P.u.uTime, this.time); gl.uniform1f(P.u.uAmbient, amb);
    gl.uniform1f(P.u.uStreak, 1); gl.uniform1f(P.u.uIntroVis, 1); gl.uniform1f(P.u.uRest, 0); gl.uniform1f(P.u.uDpr, dpr);
    gl.uniform3f(P.u.uTint, br / Math.max(ir, 0.001), bg / Math.max(ig, 0.001), bb / Math.max(ib, 0.001));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n); gl.disable(gl.BLEND);
  }
  destroy() { this.dead = true; this.stop(); const l = this.gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); }
}

window.attachLiquidPortrait = function (img, opts) {
  const o = Object.assign({ minWidth: 1024, strength: 1, radius: 160, density: 1, dotSize: 1, spread: 1, turbulence: 1, returnSpeed: 1, liquid: 1, speed: 1, bg: [11 / 255, 13 / 255, 16 / 255], imgBg: null }, opts || {});
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;pointer-events:none;display:none';
  const cs = getComputedStyle(img);
  ['maskImage', 'webkitMaskImage', 'maskComposite', 'webkitMaskComposite', 'maskSize', 'webkitMaskSize', 'maskRepeat', 'webkitMaskRepeat', 'maskPosition', 'webkitMaskPosition'].forEach(k => { const v = cs[k]; if (v && v !== 'none') cv.style[k] = v; });
  if (img.style.mask) cv.style.mask = img.style.mask;
  img.after(cv);
  let eng;
  try { eng = new Engine(cv, o); } catch (e) { console.warn('Liquid portrait disabled:', e.message); cv.remove(); return () => {}; }
  let on = false, loaded = false, lastW = 0, lastH = 0, raf = 0;
  const place = () => {
    raf = 0;
    const active = loaded && innerWidth >= o.minWidth;
    if (active !== on) { on = active; cv.style.display = on ? 'block' : 'none'; img.style.visibility = on ? 'hidden' : ''; eng.setVisible(on); if (!on) eng.pointer('leave'); }
    if (!on) return;
    const par = (cv.offsetParent || img.parentElement).getBoundingClientRect(), r = img.getBoundingClientRect();
    cv.style.left = (r.left - par.left) + 'px'; cv.style.top = (r.top - par.top) + 'px';
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    if (r.width !== lastW || r.height !== lastH) { lastW = r.width; lastH = r.height; eng.resize(r.width, r.height); }
  };
  const sched = () => { if (!raf) raf = requestAnimationFrame(place); };
  const onMove = e => {
    if (!on) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, m = 40;
    if (x > -m && y > -m && x < r.width + m && y < r.height + m) eng.pointer('move', x, y); else eng.pointer('leave');
  };
  const onLeave = () => eng.pointer('leave');
  const init = () => { try { eng.setImage(img); loaded = true; sched(); } catch (e) { console.warn('Liquid portrait disabled:', e.message); } };
  if (img.complete && img.naturalWidth) init(); else img.addEventListener('load', init, { once: true });
  addEventListener('scroll', sched, { passive: true }); addEventListener('resize', sched);
  addEventListener('pointermove', onMove, { passive: true }); document.addEventListener('pointerleave', onLeave);
  const onVis = () => eng.setVisible(on && !document.hidden); document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(sched); ro.observe(img);
  return () => {
    cancelAnimationFrame(raf); ro.disconnect();
    removeEventListener('scroll', sched); removeEventListener('resize', sched); removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave); document.removeEventListener('visibilitychange', onVis);
    eng.destroy(); img.style.visibility = ''; cv.remove();
  };
};
})();
