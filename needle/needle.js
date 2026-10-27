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
