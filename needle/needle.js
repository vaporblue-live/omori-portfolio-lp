// Drop the Needle: clicking the record (or the sound switch) lowers the tonearm
// and starts the track. The bass of the track drives --beat, which the page uses
// to pulse the grooves, the label and the title. Nothing plays until the visitor
// asks for it, and the sound switch can stop it at any time.

const root = document.documentElement;
const body = document.body;
const record = document.querySelector(".record");
const soundButton = document.querySelector(".sound");
const soundLabel = soundButton.querySelector(".sound-label");
const cueText = document.querySelector(".cue-text");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const TRACK = "audio/drop-the-needle.mp3";
const LOOP_FROM = 10; // seconds: after the quiet intro, loop the full band

// Stagger the title letters as they drop in.
document.querySelectorAll(".title .ch").forEach((ch, i) => ch.style.setProperty("--i", String(i)));

// Fetch the track early so the needle drop answers at once.
const trackData = fetch(TRACK).then((r) => {
  if (!r.ok) throw new Error(`track ${r.status}`);
  return r.arrayBuffer();
});

let ctx = null;
let analyser = null;
let playing = false;

async function startTrack() {
  ctx = new AudioContext();
  const buffer = await ctx.decodeAudioData(await trackData);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = Math.min(LOOP_FROM, buffer.duration - 1);
  source.loopEnd = buffer.duration;

  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;

  source.connect(analyser);
  analyser.connect(ctx.destination);
  source.start(0);
  if (!reduceMotion) requestAnimationFrame(pulse);
}

function setPlaying(on) {
  playing = on;
  body.classList.toggle("is-playing", on);
  soundButton.setAttribute("aria-pressed", String(on));
  soundButton.setAttribute("aria-label", on ? "音楽を止める" : "音楽を再生");
  soundLabel.textContent = on ? "SOUND ON" : "SOUND OFF";
  record.setAttribute("aria-label", on ? "針を上げて音楽を止める" : "針を落として音楽を再生");
  cueText.textContent = on ? "NOW PLAYING — スクロールして先へ" : "レコードをクリックして、針を落とす";
}

async function toggle() {
  try {
    if (!ctx) {
      setPlaying(true);
      await startTrack();
    } else if (playing) {
      await ctx.suspend();
      setPlaying(false);
    } else {
      await ctx.resume();
      setPlaying(true);
      if (!reduceMotion) requestAnimationFrame(pulse);
    }
  } catch (err) {
    setPlaying(false);
    cueText.textContent = "音楽を読み込めませんでした。もう一度お試しください";
    console.error(err);
  }
}

record.addEventListener("click", toggle);
soundButton.addEventListener("click", toggle);

// Bass energy (roughly below 150 Hz) mapped to 0..1 with a fast attack and slow
// release, normalised against a slowly decaying peak so quiet and loud passages
// both move the page.
let level = 0;
let peak = 0.2;
const bins = new Uint8Array(512);

function pulse() {
  if (!playing || !analyser) {
    level *= 0.85;
    root.style.setProperty("--beat", level.toFixed(3));
    if (level > 0.01) requestAnimationFrame(pulse);
    return;
  }
  analyser.getByteFrequencyData(bins);
  const hz = ctx.sampleRate / analyser.fftSize;
  const last = Math.max(1, Math.round(150 / hz));
  let sum = 0;
  for (let i = 1; i <= last; i += 1) sum += bins[i];
  const energy = sum / last / 255;

  peak = Math.max(energy, peak * 0.995);
  const target = Math.max(0, (energy / peak - 0.7) / 0.3);
  level = target > level ? target : level * 0.88;

  root.style.setProperty("--beat", level.toFixed(3));
  requestAnimationFrame(pulse);
}

// ---------- About: live halftone portrait ----------
// The portrait is re-printed as navy dots on cream paper. Dot size follows the
// photo's darkness; dots swell around the pointer and, while music plays, on
// the beat. It draws only while the canvas is on screen.
const halftone = document.querySelector(".halftone");
if (halftone) {
  const g = halftone.getContext("2d");
  const photo = new Image();
  photo.src = "images/portrait.webp";

  let cells = null; // { cols, rows, step, ink: Float32Array }
  let pointer = null; // last pointer position, kept so the swell can fade out
  let inside = false;
  let reach = 0; // eases toward 1 while the pointer is over the canvas
  let visible = false;

  function sample() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = halftone.clientWidth;
    const h = halftone.clientHeight;
    if (!w || !h || !photo.complete) return;
    halftone.width = Math.round(w * dpr);
    halftone.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const step = Math.max(6, w / 68);
    const cols = Math.ceil(w / step);
    const rows = Math.ceil(h / step);
    const off = document.createElement("canvas");
    off.width = cols;
    off.height = rows;
    const og = off.getContext("2d");
    const s = Math.max(cols / photo.naturalWidth, rows / photo.naturalHeight);
    og.drawImage(photo, (cols - photo.naturalWidth * s) / 2, (rows - photo.naturalHeight * s) / 2, photo.naturalWidth * s, photo.naturalHeight * s);
    const px = og.getImageData(0, 0, cols, rows).data;

    const lum = new Float32Array(cols * rows);
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < lum.length; i += 1) {
      const l = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255;
      lum[i] = l;
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    const ink = new Float32Array(lum.length);
    for (let i = 0; i < lum.length; i += 1) ink[i] = Math.pow(1 - (lum[i] - lo) / (hi - lo || 1), 0.9);
    cells = { cols, rows, step, ink, w, h };
  }

  function draw() {
    if (!cells) return;
    const { cols, rows, step, ink, w, h } = cells;
    g.fillStyle = "#f2ead8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#0a1430";
    const radius = w * 0.2;
    const beat = reduceMotion ? 0 : level;
    for (let y = 0; y < rows; y += 1) {
      const cy = y * step + step / 2;
      const shift = y % 2 ? step / 2 : 0;
      for (let x = 0; x < cols; x += 1) {
        const k = ink[y * cols + x];
        const cx = x * step + shift;
        let boost = 0;
        if (pointer && reach > 0) {
          const d = Math.hypot(cx - pointer.x, cy - pointer.y);
          boost = Math.max(0, 1 - d / radius) * 0.6 * reach;
        }
        const r = (step / 2) * 1.15 * Math.min(1, k + boost * k + boost * 0.25 + beat * k * 0.3);
        if (r < 0.35) continue;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    // printed register bars, as on the sleeve
    g.fillStyle = "#f08a24";
    g.fillRect(0, h - 26, w, 10);
    g.fillStyle = "#f5c242";
    g.fillRect(0, h - 10, w, 10);
  }

  function loop() {
    if (!visible) return;
    reach += ((inside ? 1 : 0) - reach) * 0.15;
    draw();
    requestAnimationFrame(loop);
  }

  photo.addEventListener("load", () => {
    sample();
    draw();
  });
  new ResizeObserver(() => {
    sample();
    draw();
  }).observe(halftone);

  if (!reduceMotion) {
    halftone.addEventListener("pointermove", (e) => {
      const rect = halftone.getBoundingClientRect();
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      inside = true;
    });
    halftone.addEventListener("pointerleave", () => {
      inside = false;
    });
    new IntersectionObserver((entries) => {
      const was = visible;
      visible = entries[0].isIntersecting;
      if (visible && !was) requestAnimationFrame(loop);
    }).observe(halftone);
  }
}
