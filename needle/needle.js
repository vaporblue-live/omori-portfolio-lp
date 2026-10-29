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

// ---------- About: the credo ----------
// Four lines take turns like tracks on a side. While music plays, the next line
// waits for a strong beat so the change lands on the music.
const credoLines = [...document.querySelectorAll(".credo-lines li")];
const credoNow = document.querySelector(".credo-now");
if (credoLines.length > 1 && !reduceMotion) {
  const HOLD = 4236; // ms each line stays before it may change
  let current = 0;
  let shownAt = performance.now();

  function show(next) {
    credoLines[current].classList.remove("is-on");
    current = next;
    credoLines[current].classList.add("is-on");
    credoNow.textContent = String(current + 1).padStart(2, "0");
    shownAt = performance.now();
  }

  function tick(now) {
    const due = now - shownAt > HOLD;
    // with music, change on a beat; without it (or if no beat comes), on time
    if (due && (!playing || level > 0.8 || now - shownAt > HOLD * 1.618)) {
      show((current + 1) % credoLines.length);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------- Skill & tools: the quartet ----------
// Each tool is a player. Hovering (or focusing) a card plays a short phrase on its
// instrument and draws the waveform. Sound only when the visitor has turned it on;
// the waveform draws either way. Notes are from the F minor pentatonic so they sit
// with the track.
const players = [...document.querySelectorAll(".player")];
const NOTE = { F2: 87.31, C3: 130.81, F3: 174.61, Ab3: 207.65, Bb3: 233.08, C4: 261.63, Eb4: 311.13, F4: 349.23, Ab4: 415.3, C5: 523.25 };
const PHRASE = {
  bass: [["F2", 0], ["C3", 0.18], ["F3", 0.36]],
  drums: [["kick", 0], ["hat", 0.12], ["snare", 0.24], ["hat", 0.36]],
  piano: [["F3", 0], ["Ab3", 0], ["C4", 0], ["Eb4", 0]],
  horn: [["C4", 0], ["Eb4", 0.15], ["F4", 0.3], ["Ab4", 0.45]],
};
// waveform shape drawn for each voice: amplitude over x (0..1) at time t
const SHAPE = {
  bass: (x, t) => Math.sin(x * 9 + t * 12) * Math.exp(-x * 1.2),
  drums: (x, t) => (Math.sin(x * 140 + t * 40) * Math.sin(x * 57)) * Math.exp(-((x * 4) % 1) * 3),
  piano: (x, t) => (Math.sin(x * 18 + t * 8) + Math.sin(x * 27 + t * 8) * 0.6) * 0.62 * Math.exp(-x * 2),
  horn: (x, t) => (((x * 14 + t * 6) % 1) * 2 - 1) * Math.min(1, x * 6) * Math.exp(-x * 0.8),
};

function voice(type, name, at) {
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const t = ctx.currentTime + at;
  if (type === "drums") {
    if (name === "kick") {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      out.gain.setValueAtTime(0.5, t);
      out.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(out);
      o.start(t);
      o.stop(t + 0.21);
      return;
    }
    const len = name === "hat" ? 0.05 : 0.15;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = name === "hat" ? "highpass" : "bandpass";
    f.frequency.value = name === "hat" ? 7000 : 1800;
    out.gain.setValueAtTime(name === "hat" ? 0.12 : 0.3, t);
    out.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(out);
    src.start(t);
    return;
  }
  const o = ctx.createOscillator();
  o.type = { bass: "sine", piano: "triangle", horn: "sawtooth" }[type];
  o.frequency.value = NOTE[name];
  const len = { bass: 0.3, piano: 0.9, horn: 0.22 }[type];
  const peakGain = { bass: 0.4, piano: 0.1, horn: 0.05 }[type];
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(peakGain, t + (type === "horn" ? 0.04 : 0.01));
  out.gain.exponentialRampToValueAtTime(0.001, t + len);
  if (type === "horn") {
    // a muted trumpet: soften the saw with a low-pass
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1600;
    o.connect(f).connect(out);
  } else {
    o.connect(out);
  }
  o.start(t);
  o.stop(t + len + 0.02);
}

players.forEach((card) => {
  const type = card.dataset.voice;
  const canvas = card.querySelector(".wave");
  const g = canvas.getContext("2d");
  const color = getComputedStyle(card).borderTopColor;
  let start = 0;
  let lastPlay = 0;

  function draw(now) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const t = (now - start) / 1000;
    const env = start ? Math.max(0, 1 - t / 1.2) : 0;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.globalAlpha = 0.35 + env * 0.65;
    g.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const y = h / 2 - SHAPE[type](x / w, t) * (h / 2 - 3) * env;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    if (env > 0) requestAnimationFrame(draw);
    else card.classList.remove("is-sounding");
  }

  function play() {
    const now = performance.now();
    if (now - lastPlay < 600) return; // one phrase at a time
    lastPlay = now;
    card.classList.add("is-sounding");
    if (playing && ctx) PHRASE[type].forEach(([name, at]) => voice(type, name, at));
    if (reduceMotion) {
      start = 0;
      requestAnimationFrame(draw);
      return;
    }
    const running = start && now - start < 1200;
    start = now;
    if (!running) requestAnimationFrame(draw);
  }

  card.addEventListener("pointerenter", play);
  card.addEventListener("focus", play);
  requestAnimationFrame(draw); // flat line at rest
});
