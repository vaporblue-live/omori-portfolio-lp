// Film reel in the hero: draggable 3D on wide screens, CSS fallback elsewhere.
import * as THREE from "./vendor/three/three.module.min.js";

const container = document.getElementById("reel");
const canvasQuery = window.matchMedia("(min-width: 768px)");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function buildReel() {
  const group = new THREE.Group();

  const gold = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.3 });
  const film = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.2, roughness: 0.7, side: THREE.DoubleSide });
  const hub = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.4, roughness: 0.5 });

  // Two flanges and the film band between them, sized on a golden-ratio pair (1 : 0.618).
  const flangeGeo = new THREE.CylinderGeometry(1, 1, 0.08, 96);
  const flangeA = new THREE.Mesh(flangeGeo, gold);
  const flangeB = new THREE.Mesh(flangeGeo, gold);
  flangeA.rotation.x = Math.PI / 2;
  flangeB.rotation.x = Math.PI / 2;
  flangeA.position.z = 0.25;
  flangeB.position.z = -0.25;

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.618, 0.618, 0.5, 96, 1, true), film);
  band.rotation.x = Math.PI / 2;

  const center = new THREE.Mesh(new THREE.CylinderGeometry(0.382, 0.382, 0.6, 64), hub);
  center.rotation.x = Math.PI / 2;

  group.add(flangeA, flangeB, band, center);

  // Sprocket holes around the band, evenly spaced.
  const holeGeo = new THREE.BoxGeometry(0.09, 0.07, 0.02);
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 });
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.set(Math.cos(angle) * 0.8, Math.sin(angle) * 0.8, 0.32);
    hole.rotation.z = angle;
    group.add(hole);
  }

  return group;
}

function initReel() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 4.2);

  scene.add(new THREE.AmbientLight(0xf5f1e8, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.5, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd97706, 0.9);
  rim.position.set(-3, -1, -2);
  scene.add(rim);

  const reel = buildReel();
  reel.rotation.x = 0.35;
  scene.add(reel);

  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  container.classList.add("is-3d");
  container.appendChild(canvas);

  // Drag to rotate, with inertia. Auto-rotate slowly when idle.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let velocityY = 0;
  let velocityX = 0;

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    velocityY = dx * 0.005;
    velocityX = dy * 0.003;
    reel.rotation.y += velocityY;
    reel.rotation.x = THREE.MathUtils.clamp(reel.rotation.x + velocityX, -0.9, 0.9);
  });

  const endDrag = () => {
    dragging = false;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  function resize() {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // Render only while the reel is on screen.
  let visible = true;
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
  }).observe(container);

  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    if (!dragging) {
      velocityY *= 0.95;
      velocityX *= 0.95;
      reel.rotation.y += velocityY + 0.002;
      reel.rotation.x = THREE.MathUtils.clamp(reel.rotation.x + velocityX, -0.9, 0.9);
    }
    renderer.render(scene, camera);
  }
  frame();
}

function setup() {
  // Mobile, reduced-motion, or no WebGL: keep the CSS fallback only.
  if (!canvasQuery.matches || motionQuery.matches || !supportsWebGL()) return;
  initReel();
}

setup();
canvasQuery.addEventListener("change", () => {
  if (container.classList.contains("is-3d")) return;
  setup();
});
