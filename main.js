// Award-night stage: a velvet curtain opens on scroll, then glass cards turn
// along a helix so each chapter's card comes to the front in turn.
// Phones, reduced-motion and no-WebGL clients get a light CSS curtain instead.
import * as THREE from "./vendor/three/three.module.min.js";

const root = document.documentElement;
const intro = document.getElementById("intro");
const introCopy = document.getElementById("intro-copy");
const chapters = [...document.querySelectorAll("[data-chapter]")];
const menuLinks = [...document.querySelectorAll(".menu a")];

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2"));
  } catch {
    return false;
  }
}

const lite =
  window.matchMedia("(max-width: 767px)").matches ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  !supportsWebGL();
root.classList.toggle("lite", lite);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

// ---------- Scroll state shared by both modes ----------
// open: curtain progress 0..1 across the intro.
// index: continuous chapter position (negative while the curtain is opening).
function readScroll() {
  const vh = window.innerHeight;
  const open = clamp(window.scrollY / (intro.offsetHeight - vh * 0.4), 0, 1);
  const mid = window.scrollY + vh / 2;
  // interpolate between the real centres of the chapters, whatever their heights
  const centers = chapters.map((c) => c.offsetTop + c.offsetHeight / 2);
  let index;
  if (mid <= centers[0]) {
    index = (mid - centers[0]) / vh;
  } else {
    index = chapters.length - 1;
    for (let k = 0; k < centers.length - 1; k += 1) {
      if (mid < centers[k + 1]) {
        index = k + (mid - centers[k]) / (centers[k + 1] - centers[k]);
        break;
      }
    }
  }
  return { open, index: clamp(index, -2.5, chapters.length - 1) };
}

let activeChapter = -1;
function updateDom({ open, index }) {
  introCopy.style.setProperty("--intro-opacity", String(clamp(1 - open * 2.2, 0, 1)));
  root.style.setProperty("--open", String(smooth(open)));

  const active = index < -0.5 ? -1 : Math.round(clamp(index, 0, chapters.length - 1));
  if (active === activeChapter) return;
  activeChapter = active;
  chapters.forEach((c, i) => c.classList.toggle("is-active", i === active));
  const menu = active >= 0 ? chapters[active].dataset.menu : "";
  menuLinks.forEach((a) => a.classList.toggle("is-active", a.dataset.menu === menu));
}

if (lite) {
  // In lite mode every panel is visible; only the curtain and menu follow scroll.
  const onScroll = () => updateDom(readScroll());
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
} else {
  // card labels are drawn with the web font, so wait for it first
  document.fonts.ready.then(startStage);
}

// ---------- WebGL stage ----------
function startStage() {
  const canvas = document.getElementById("stage");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.2, 13);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const scene = new THREE.Scene();
  scene.environment = environment(renderer);
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 25),
    new THREE.MeshBasicMaterial({ map: backdropTexture(), toneMapped: false }),
  );
  backdrop.position.z = -12;
  scene.add(backdrop);
  const key = new THREE.DirectionalLight(0xfff0d0, 2.2);
  key.position.set(-4, 6, 8);
  scene.add(key);

  const labels = [
    { badge: "NOMINEE", title: "はじまりの一杯", sub: "CM STYLE · 27.7 SEC" },
    { badge: "NOMINEE", title: "Fuu", sub: "MUSIC CHANNEL" },
    { title: "PROFILE", sub: "S.OMORI" },
    { title: "PRICING", sub: "料金の目安" },
    { title: "CONTACT", sub: "次の一本を" },
  ];
  const cards = labels.map((label) => {
    const card = glassCard(label);
    scene.add(card.group);
    return card;
  });

  const curtain = curtainLayer();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the helix inside narrower viewports, and shift it right of the panels on wide ones
    camera.position.z = w / h < 1.3 ? 16 : 13;
    camera.updateProjectionMatrix();
    helixOffsetX = w >= 1100 ? 2.4 : 0;
  }
  window.addEventListener("resize", resize);
  resize();

  let shownIndex = readScroll().index;
  const clock = new THREE.Clock();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const state = readScroll();
    updateDom(state);

    // ease toward the scroll position for a weighted, cinematic glide
    shownIndex += (state.index - shownIndex) * (1 - Math.exp(-dt * 6));

    cards.forEach((card, i) => placeOnHelix(card, i - shownIndex));

    curtain.material.uniforms.uOpen.value = smooth(state.open);
    curtain.material.uniforms.uTime.value += dt * 0.35;

    renderer.clear();
    renderer.render(scene, camera);
    renderer.render(curtain.scene, ortho);
  }
  frame();
}

let helixOffsetX = 0;

// Position a card by its distance d from the front of the helix.
function placeOnHelix(card, d) {
  const theta = d * 0.72;
  const radius = 6;
  card.group.position.set(helixOffsetX + radius * Math.sin(theta), -d * 1.25 - 0.25, radius * Math.cos(theta) - radius + 1.6);
  card.group.rotation.set(-0.1, -theta * 0.62, 0);
  const front = 1 - clamp(Math.abs(d) * 2, 0, 1);
  card.group.scale.setScalar(1 + front * 0.1);
  card.gold.material.opacity = 0.9 * front;
  card.prism.material.opacity = 0.45 * (1 - front);
  card.group.visible = Math.abs(d) < 3.2;
}

// ---------- Curtain: procedural cloth folds lit per pixel ----------
function curtainLayer() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpen: { value: 0 }, uTime: { value: 0.8 } },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
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

      // Cloth height: irregular folds that drift as they fall and gather when opened.
      float cloth(float u, float v, float gather) {
        float x = u * mix(12.0, 15.0, gather);
        x += 0.6 * sin(v * 2.3 + u * 7.0 + uTime) + 0.5 * noise(u * 9.0 + v * 1.4);
        float w = noise(floor(x) * 1.7 + 3.0);
        float h = (0.2 + 0.8 * w) * sin(x * 6.2831853);
        h += 0.28 * sin(x * 12.566 + noise(u * 17.0) * 5.0) * (0.5 + 0.5 * w);
        h += 0.45 * sin(u * 5.0 + noise(u * 3.0) * 4.0);
        h += 0.15 * (noise(x * 2.1 + v * 0.7) * 2.0 - 1.0);
        h += 0.03 * sin(x * 38.0 + v * 16.0);
        h += 0.25 * v * v * sin(u * 31.0 + uTime * 1.3);
        return h;
      }

      void main() {
        vec2 p = vUv;
        float v = 1.0 - p.y;
        float halfW = 0.5 * (1.0 - uOpen * 0.8);
        float swag = uOpen * 0.09 * sin(clamp(v, 0.0, 1.0) * 3.14159);
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
        vec3 n = normalize(vec3(-dhx * 0.010 / max(leftEdge, 0.2), dhy * 0.003, 1.0));

        vec3 L = normalize(vec3(-0.35, 0.55, 0.8));
        vec3 V = vec3(0.0, 0.0, 1.0);
        float diff = max(dot(n, L), 0.0);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 2.0);
        float spec = pow(max(dot(n, normalize(L + V)), 0.0), 36.0);
        float ao = smoothstep(-1.2, 0.9, h);
        ao *= ao;

        vec3 col = vec3(0.015, 0.075, 0.40) * (0.06 + 1.5 * diff) * (0.12 + 0.88 * ao);
        col += vec3(0.20, 0.38, 1.0) * rim * 0.45 * ao;
        col += vec3(0.70, 0.80, 1.0) * spec * 0.55 * ao;
        col *= mix(1.3, 0.6, v);
        col += vec3(0.55, 0.33, 0.08) * smoothstep(0.8, 1.0, v) * 0.18 * ao;
        col *= 0.45 + 0.55 * smoothstep(0.0, 0.025, edgeDist);
        col *= 0.6 + 0.4 * smoothstep(0.0, 0.06, p.y);

        gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
      }
    `,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, material };
}

// ---------- Backdrop and reflections ----------
function backdropTexture() {
  const W = 1440;
  const H = 900;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const bg = g.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.5, W * 0.7);
  bg.addColorStop(0, "#1b3a8f");
  bg.addColorStop(0.45, "#0a1640");
  bg.addColorStop(1, "#03060f");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  g.save();
  g.filter = "blur(18px)";
  g.globalCompositeOperation = "screen";
  for (const [x, col] of [[0.2, "rgba(255,214,130,.35)"], [0.8, "rgba(255,214,130,.35)"], [0.42, "rgba(140,180,255,.3)"], [0.6, "rgba(140,180,255,.3)"]]) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x * W - 20, -10);
    g.lineTo(x * W + 20, -10);
    g.lineTo(W / 2 + (x - 0.5) * 300 + 140, H);
    g.lineTo(W / 2 + (x - 0.5) * 300 - 140, H);
    g.closePath();
    g.fill();
  }
  g.restore();

  let seed = 89;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.save();
  g.filter = "blur(6px)";
  for (let i = 0; i < 40; i += 1) {
    g.fillStyle = rand() > 0.35 ? "rgba(255,210,120,.35)" : "rgba(140,180,255,.3)";
    g.beginPath();
    g.arc(rand() * W, rand() * H, 10 + rand() * 40, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  for (let i = 0; i < 300; i += 1) {
    g.fillStyle = `rgba(255,236,190,${0.3 + rand() * 0.7})`;
    g.beginPath();
    g.arc(rand() * W, Math.pow(rand(), 1.5) * H, rand() * 1.3 + 0.3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function environment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x02040c);
  const light = (color, intensity, x, y, z, w, h) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  light(0xffd38a, 6, -6, 6, 4, 4, 2);
  light(0xffd38a, 5, 6, 5, 3, 3, 2);
  light(0x6f9bff, 3, 0, -2, 8, 10, 2);
  light(0xffffff, 12, 0, 9, 0, 6, 1);
  light(0xffffff, 16, -8, 0, 2, 0.6, 10);
  light(0xffffff, 16, 8, 0, 2, 0.6, 10);
  light(0x3a5cff, 2, 0, 0, -8, 12, 6);
  return new THREE.PMREMGenerator(renderer).fromScene(env, 0.04).texture;
}

// ---------- Glass cards ----------
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

function labelTexture({ badge, title, sub }) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 632;
  const g = c.getContext("2d");
  const y = 400;
  if (badge) {
    g.font = "700 30px 'Shippori Mincho B1'";
    g.fillStyle = "#d9b45a";
    g.fillRect(60, y - 70, g.measureText(badge).width + 60, 46);
    g.fillStyle = "#0a0a0c";
    g.fillText(badge, 90, y - 36);
  }
  g.font = "800 92px 'Shippori Mincho B1'";
  const grad = g.createLinearGradient(0, y + 20, 0, y + 120);
  grad.addColorStop(0, "#fff6d2");
  grad.addColorStop(0.35, "#f0d27a");
  grad.addColorStop(0.55, "#a8792a");
  grad.addColorStop(0.7, "#f7dc90");
  grad.addColorStop(1, "#7a561a");
  g.shadowColor = "rgba(0,0,0,.6)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 4;
  g.fillStyle = grad;
  g.fillText(title, 60, y + 100);
  if (sub) {
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
    g.font = "500 30px 'Shippori Mincho B1'";
    g.fillStyle = "rgba(225,232,250,.9)";
    g.fillText(sub, 60, y + 160);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function edgeBand(w, h, colorAt, blending) {
  const ring = roundedRect(w + 0.12, h + 0.12, 0.31);
  ring.holes.push(roundedRect(w + 0.02, h + 0.02, 0.27));
  const geo = new THREE.ShapeGeometry(ring, 32);
  const pos = geo.attributes.position;
  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    colorAt(c, Math.atan2(pos.getY(i) / h, pos.getX(i) / w));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, blending, depthWrite: false, toneMapped: false,
  }));
}

function glassCard(label) {
  const group = new THREE.Group();
  const w = 3.4;
  const h = 2.1;
  const depth = 0.22;
  const geo = new THREE.ExtrudeGeometry(roundedRect(w, h, 0.26), {
    depth, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 8, curveSegments: 24,
  });
  geo.center();
  group.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.18,
    transmission: 1,
    thickness: 0.9,
    ior: 1.5,
    iridescence: 1,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [250, 900],
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    attenuationColor: new THREE.Color(0xc4d6ff),
    attenuationDistance: 9,
    envMapIntensity: 2.2,
  })));

  // prismatic fringe on cards away from the front, warm gold on the front card
  const prism = edgeBand(w, h, (c, a) => c.setHSL((a / (Math.PI * 2) + 1) % 1, 0.9, 0.62), THREE.AdditiveBlending);
  const gold = edgeBand(w, h, (c, a) => c.setHSL(0.115 + 0.02 * Math.sin(a * 3), 0.75, 0.5 + 0.14 * Math.sin(a * 2 + 1)), THREE.NormalBlending);
  prism.position.z = gold.position.z = depth / 2 + 0.095;
  group.add(prism, gold);

  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.1, h - 0.1),
    new THREE.MeshBasicMaterial({ map: labelTexture(label), transparent: true, toneMapped: false }),
  );
  text.position.z = depth / 2 + 0.1;
  group.add(text);

  return { group, prism, gold };
}
