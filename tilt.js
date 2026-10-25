// Spatial works cards: pointer-driven tilt on devices with a fine pointer.
// Touch devices and reduced-motion clients keep flat cards.
const cards = document.querySelectorAll("[data-tilt]");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const MAX_TILT = 8; // degrees

function enableTilt(card) {
  let frame = 0;

  card.addEventListener("pointermove", (event) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty("--ry", `${(px * MAX_TILT * 2).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${(-py * MAX_TILT * 2).toFixed(2)}deg`);
    });
  });

  card.addEventListener("pointerleave", () => {
    cancelAnimationFrame(frame);
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
  });
}

if (finePointer.matches && !motionQuery.matches) {
  cards.forEach(enableTilt);
}
