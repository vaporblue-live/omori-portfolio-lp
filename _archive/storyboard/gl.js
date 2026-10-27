// Storyboard WebGL layers: velvet curtain shader and physically based glass cards.
import * as THREE from "./three.module.min.js";

const W = 1440;
const H = 900;

// ---------- Curtain: procedural cloth folds lit per pixel ----------
const curtainVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const curtainFragment = /* glsl */ `
  precision highp float;
  uniform float uOpen;
  uniform float uTime;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) {
    float i = floor(x); float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash(i), hash(i + 1.0), f);
  }

  // Height of the cloth at (u across one half, v down). Folds are irregular in
  // width and depth, drift as they fall, and gather tighter when the curtain opens.
  float cloth(float u, float v, float gather) {
    float freq = mix(12.0, 15.0, gather);
    float x = u * freq;
    x += 0.6 * sin(v * 2.3 + u * 7.0 + uTime) + 0.5 * noise(u * 9.0 + v * 1.4);
    float w = noise(floor(x) * 1.7 + 3.0);           // per-fold depth variation
    float h = (0.2 + 0.8 * w) * sin(x * 6.2831853);
    h += 0.28 * sin(x * 12.566 + noise(u * 17.0) * 5.0) * (0.5 + 0.5 * w);
    h += 0.45 * sin(u * 5.0 + noise(u * 3.0) * 4.0); // broad drape so folds rise and fall in groups
    h += 0.15 * (noise(x * 2.1 + v * 0.7) * 2.0 - 1.0);
    h += 0.03 * sin(x * 38.0 + v * 16.0);           // fine satin creases
    // hem sways a little more than the top
    h += 0.25 * v * v * sin(u * 31.0 + uTime * 1.3);
    return h;
  }

  void main() {
    vec2 p = vUv;
    float v = 1.0 - p.y;

    float halfW = 0.5 * (1.0 - uOpen * 0.8);
    float swag = uOpen * 0.09 * sin(clamp(v, 0.0, 1.0) * 3.14159);   // tied-back inner edge
    float leftEdge = halfW - swag;
    float rightEdge = 1.0 - halfW + swag;

    float u;
    float edgeDist;
    if (p.x < leftEdge) { u = p.x / leftEdge; edgeDist = leftEdge - p.x; }
    else if (p.x > rightEdge) { u = (1.0 - p.x) / (1.0 - rightEdge); edgeDist = p.x - rightEdge; }
    else { discard; }

    float e = 0.0012;
    float h = cloth(u, v, uOpen);
    float dhx = (cloth(u + e, v, uOpen) - h) / e;
    float dhy = (cloth(u, v + e, uOpen) - h) / e;
    float scaleX = 0.010 / max(leftEdge, 0.2);
    vec3 n = normalize(vec3(-dhx * scaleX, dhy * 0.003, 1.0));

    vec3 L = normalize(vec3(-0.35, 0.55, 0.8));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 Hh = normalize(L + V);

    float diff = max(dot(n, L), 0.0);
    float rim = pow(1.0 - max(dot(n, V), 0.0), 2.0);          // velvet sheen on fold flanks
    float spec = pow(max(dot(n, Hh), 0.0), 36.0);              // satin crest highlight
    float ao = smoothstep(-1.2, 0.9, h);                       // dark valleys between folds
    ao = ao * ao;

    vec3 base = vec3(0.015, 0.075, 0.40);
    vec3 col = base * (0.06 + 1.5 * diff) * (0.12 + 0.88 * ao);
    col += vec3(0.20, 0.38, 1.0) * rim * 0.45 * ao;
    col += vec3(0.70, 0.80, 1.0) * spec * 0.55 * ao;

    col *= mix(1.3, 0.6, v);                                    // stage light from above
    col += vec3(0.55, 0.33, 0.08) * smoothstep(0.8, 1.0, v) * 0.18 * ao;  // warm footlights
    col *= 0.45 + 0.55 * smoothstep(0.0, 0.025, edgeDist);       // shadow at the parting
    col *= 0.6 + 0.4 * smoothstep(0.0, 0.06, p.y);               // floor contact shadow

    gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
  }
`;

function curtainLayer(open) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    vertexShader: curtainVertex,
    fragmentShader: curtainFragment,
    uniforms: { uOpen: { value: open }, uTime: { value: 0.8 } },
    depthTest: false,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  return scene;
}

// ---------- Backdrop: award-night stage behind the glass ----------
function backdropTexture() {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const bg = g.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.5, W * 0.7);
  bg.addColorStop(0, "#1b3a8f"); bg.addColorStop(0.45, "#0a1640"); bg.addColorStop(1, "#03060f");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  g.save();
  g.filter = "blur(18px)";
  g.globalCompositeOperation = "screen";
  for (const [x, col] of [[0.2, "rgba(255,214,130,.35)"], [0.8, "rgba(255,214,130,.35)"], [0.42, "rgba(140,180,255,.3)"], [0.6, "rgba(140,180,255,.3)"]]) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x * W - 20, -10); g.lineTo(x * W + 20, -10);
    g.lineTo(W / 2 + (x - 0.5) * 300 + 140, H); g.lineTo(W / 2 + (x - 0.5) * 300 - 140, H);
    g.closePath(); g.fill();
  }
  g.restore();

  let seed = 89;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.save(); g.filter = "blur(6px)";
  for (let i = 0; i < 40; i += 1) {
    const x = rand() * W, y = rand() * H, r = 10 + rand() * 40;
    g.fillStyle = rand() > 0.35 ? "rgba(255,210,120,.35)" : "rgba(140,180,255,.3)";
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  for (let i = 0; i < 300; i += 1) {
    g.fillStyle = `rgba(255,236,190,${0.3 + rand() * 0.7})`;
    g.beginPath(); g.arc(rand() * W, Math.pow(rand(), 1.5) * H, rand() * 1.3 + 0.3, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- Environment for reflections: warm key lights and blue fill ----------
function environment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x02040c);
  const light = (color, intensity, x, y, z, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  light(0xffd38a, 6, -6, 6, 4, 4, 2);
  light(0xffd38a, 5, 6, 5, 3, 3, 2);
  light(0x6f9bff, 3, 0, -2, 8, 10, 2);
  light(0xffffff, 12, 0, 9, 0, 6, 1);
  light(0xffffff, 16, -8, 0, 2, 0.6, 10);   // tall strip lights for crisp edge reflections
  light(0xffffff, 16, 8, 0, 2, 0.6, 10);
  light(0x3a5cff, 2, 0, 0, -8, 12, 6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  return pmrem.fromScene(env, 0.04).texture;
}

// ---------- Glass card ----------
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

function labelTexture({ badge, title, sub }, front) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 632;
  const g = c.getContext("2d");
  let y = 400;
  if (badge) {
    g.font = "700 30px 'Shippori Mincho B1'";
    const bw = g.measureText(badge).width + 60;
    g.fillStyle = front ? "#d9b45a" : "rgba(217,180,90,.8)";
    g.fillRect(60, y - 70, bw, 46);
    g.fillStyle = "#0a0a0c";
    g.fillText(badge.split("").join(String.fromCharCode(8202)), 90, y - 36);
  }
  g.font = "800 92px 'Shippori Mincho B1'";
  const grad = g.createLinearGradient(0, y + 20, 0, y + 120);
  grad.addColorStop(0, "#fff6d2"); grad.addColorStop(0.35, "#f0d27a"); grad.addColorStop(0.55, "#a8792a");
  grad.addColorStop(0.7, "#f7dc90"); grad.addColorStop(1, "#7a561a");
  g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 8; g.shadowOffsetY = 4;
  g.fillStyle = grad;
  g.fillText(title, 60, y + 100);
  if (sub) {
    g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.font = "500 30px 'Shippori Mincho B1'";
    g.fillStyle = "rgba(225,232,250,.9)";
    g.fillText(sub, 60, y + 160);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function glassCard(label, front) {
  const group = new THREE.Group();
  const w = 3.4, h = 2.1, depth = 0.22;
  const geo = new THREE.ExtrudeGeometry(roundedRect(w, h, 0.26), {
    depth, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 8, curveSegments: 24,
  });
  geo.center();
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.18,
    transmission: 1,
    thickness: 0.9,
    ior: 1.5,
    iridescence: 1,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [250, 900],
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    attenuationColor: new THREE.Color(front ? 0xffe2a8 : 0xc4d6ff),
    attenuationDistance: 9,
    envMapIntensity: 2.2,
    specularIntensity: 1,
  });
  group.add(new THREE.Mesh(geo, glass));

  // Edge band: prismatic fringe on every card (the glass reference's dispersion),
  // warm gold on the nominee card.
  const ring = roundedRect(w + 0.12, h + 0.12, 0.31);
  ring.holes.push(roundedRect(w + 0.02, h + 0.02, 0.27));
  const ringGeo = new THREE.ShapeGeometry(ring, 32);
  const pos = ringGeo.attributes.position;
  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const a = Math.atan2(pos.getY(i) / h, pos.getX(i) / w);
    if (front) c.setHSL(0.115 + 0.02 * Math.sin(a * 3.0), 0.75, 0.5 + 0.14 * Math.sin(a * 2.0 + 1.0));
    else c.setHSL((a / (Math.PI * 2) + 1.0) % 1.0, 0.9, 0.62);
    colors.push(c.r, c.g, c.b);
  }
  ringGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const band = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: front ? 0.9 : 0.45,
    blending: front ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  band.position.z = depth / 2 + 0.095;
  group.add(band);

  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.1, h - 0.1),
    new THREE.MeshBasicMaterial({ map: labelTexture(label, front), transparent: true, toneMapped: false }),
  );
  text.position.z = depth / 2 + 0.1;
  group.add(text);
  return group;
}

function glassScene(renderer) {
  const scene = new THREE.Scene();
  scene.environment = environment(renderer);

  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(40, 25), new THREE.MeshBasicMaterial({ map: backdropTexture(), toneMapped: false }));
  backdrop.position.z = -12;
  scene.add(backdrop);

  const key = new THREE.DirectionalLight(0xfff0d0, 2.2);
  key.position.set(-4, 6, 8);
  scene.add(key);

  // helix: each card further round the spiral sits higher and deeper
  const cards = [
    { label: { title: "CONTACT" }, pos: [-2.6, 2.7, -6], rot: 0.55 },
    { label: { title: "PRICING" }, pos: [-4.9, 1.5, -3], rot: 0.62 },
    { label: { title: "PROFILE", sub: "S.OMORI" }, pos: [-4.0, 0.35, -0.6], rot: 0.48 },
    { label: { badge: "NOMINEE", title: "Fuu", sub: "MUSIC CHANNEL" }, pos: [4.0, -1.0, -0.6], rot: -0.48 },
    { label: { badge: "NOMINEE", title: "はじまりの一杯", sub: "CM STYLE · 27.7 SEC" }, pos: [0, -0.25, 1.6], rot: -0.14, front: true },
  ];
  for (const c of cards) {
    const card = glassCard(c.label, Boolean(c.front));
    card.position.set(...c.pos);
    card.rotation.y = c.rot;
    card.rotation.x = -0.12;
    scene.add(card);
  }
  return scene;
}

async function draw(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;

  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  renderer.clear();

  if (canvas.dataset.mode === "open") {
    const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
    camera.position.set(0, 0.2, 13);
    renderer.render(glassScene(renderer), camera);
    renderer.render(curtainLayer(0.72), ortho);
  } else {
    renderer.render(curtainLayer(0), ortho);
  }
}

await document.fonts.ready;
for (const canvas of document.querySelectorAll("canvas.gl")) await draw(canvas);
window.__glReady = true;
