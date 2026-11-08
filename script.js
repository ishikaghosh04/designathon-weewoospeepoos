const studio = document.querySelector("#studio");
const ocean = document.querySelector("#ocean");
const swimmers = document.querySelector("#swimmers");
const canvas = document.querySelector("#drawing");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const palette = document.querySelector("#palette");
const sizeButtons = [...document.querySelectorAll("[data-size]")];
const eraserButton = document.querySelector("#eraser");
const undoButton = document.querySelector("#undo");
const clearButton = document.querySelector("#clear");
const releaseButton = document.querySelector("#release");
const nameInput = document.querySelector("#fish-name");
const notice = document.querySelector("#notice");

const colors = [
  ["Ink", "#264653"], ["Ocean", "#387acc"], ["Sky", "#70c9ee"],
  ["Mint", "#63cfad"], ["Leaf", "#87b957"], ["Sunshine", "#ffcb55"],
  ["Peach", "#ff9d72"], ["Coral", "#ef6a72"], ["Pink", "#f48abd"],
  ["Lavender", "#a589ea"], ["Plum", "#7954a7"], ["White", "#ffffff"],
];

const history = [];
const historyLimit = 20;
let brushColor = colors[0][1];
let brushSize = 10;
let erasing = false;
let activePointer = null;
let lastPoint = null;
let drawingBounds = null;

// Drawing tools

const colorButtons = colors.map(([label, hex]) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.style.setProperty("--swatch", hex);
  button.addEventListener("click", () => {
    brushColor = hex;
    erasing = false;
    updateToolSelection();
  });
  palette.append(button);
  return button;
});

function updateToolSelection() {
  colorButtons.forEach((button, index) => {
    button.setAttribute("aria-pressed", String(!erasing && colors[index][1] === brushColor));
  });

  sizeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.size) === brushSize));
  });

  eraserButton.setAttribute("aria-pressed", String(erasing));
}

sizeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    brushSize = Number(button.dataset.size);
    updateToolSelection();
  });
});

eraserButton.addEventListener("click", () => {
  erasing = !erasing;
  updateToolSelection();
});

function saveUndo() {
  if (history.length === historyLimit) history.shift();
  history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
}

function paint(from, to) {
  ctx.save();
  ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
  ctx.fillStyle = brushColor;
  ctx.strokeStyle = brushColor;
  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";
  ctx.beginPath();

  if (from.x === to.x && from.y === to.y) {
    ctx.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  ctx.restore();
}

canvas.addEventListener("pointerdown", (event) => {
  if (activePointer !== null || event.button !== 0) return;
  if (erasing && !drawingBounds) return;

  event.preventDefault();
  saveUndo();
  activePointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  lastPoint = getPoint(event);
  paint(lastPoint, lastPoint);
  updateDrawingButtons();
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== activePointer) return;

  const point = getPoint(event);
  paint(lastPoint, point);
  lastPoint = point;
});

function finishStroke(event) {
  if (event.pointerId !== activePointer) return;

  if (event.type === "pointerup") {
    const point = getPoint(event);
    if (point.x !== lastPoint.x || point.y !== lastPoint.y) paint(lastPoint, point);
  }

  activePointer = null;
  refreshDrawing();
}

canvas.addEventListener("pointerup", finishStroke);
canvas.addEventListener("pointercancel", finishStroke);
canvas.addEventListener("lostpointercapture", finishStroke);

undoButton.addEventListener("click", () => {
  if (!history.length || activePointer !== null) return;
  ctx.putImageData(history.pop(), 0, 0);
  refreshDrawing();
});

clearButton.addEventListener("click", () => {
  if (!drawingBounds || activePointer !== null) return;
  saveUndo();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  refreshDrawing();
});

function updateDrawingButtons() {
  const busy = activePointer !== null;
  releaseButton.disabled = busy || !drawingBounds;
  clearButton.disabled = busy || !drawingBounds;
  undoButton.disabled = busy || !history.length;
}

function refreshDrawing() {
  drawingBounds = findInkBounds();
  updateDrawingButtons();
}

// Read the alpha channel so even white ink counts as part of the fish.
function findInkBounds() {
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < 0) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function exportFish(bounds) {
  const output = document.createElement("canvas");
  const scale = Math.min(1, 256 / Math.max(bounds.width, bounds.height));
  output.width = Math.max(1, Math.round(bounds.width * scale));
  output.height = Math.max(1, Math.round(bounds.height * scale));

  output.getContext("2d").drawImage(
    canvas, bounds.x, bounds.y, bounds.width, bounds.height,
    0, 0, output.width, output.height,
  );

  return {
    name: nameInput.value.trim() || "Little Fish",
    image: output.toDataURL("image/png"),
    width: output.width,
    height: output.height,
  };
}

// Only user drawings are saved. The sample fish are generated on each load.
const storageKey = "little-ocean-fish-v1";

function loadFish() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(saved)) return [];

    return saved.filter((fish) =>
      typeof fish?.name === "string" &&
      typeof fish.image === "string" &&
      fish.image.startsWith("data:image/png;base64,") &&
      Number.isFinite(fish.width) && fish.width > 0 &&
      Number.isFinite(fish.height) && fish.height > 0
    );
  } catch {
    return [];
  }
}

const savedFish = loadFish();

function saveFish(fish) {
  savedFish.push(fish);
  try {
    localStorage.setItem(storageKey, JSON.stringify(savedFish));
  } catch {
    notice.textContent = "Your fish is swimming, but browser storage couldn't save it for next time.";
  }
}

// Sample fish

const samples = [
  ["Bubbles", "#ff986f", "#da6076"], ["Sunny", "#ffd36b", "#e7904f"],
  ["Clover", "#83d9a4", "#3b9b78"], ["Ripple", "#79d3f2", "#557de1"],
  ["Mochi", "#f7a9d4", "#d5639a"], ["Plum", "#b6a3f4", "#805ec8"],
  ["Peach", "#ffbe95", "#f17a6f"], ["Pebble", "#93b7da", "#617cab"],
  ["Sprout", "#cbe47b", "#79af63"], ["Indigo", "#8cacf9", "#5c61bd"],
  ["Coral", "#f88791", "#ca516c"], ["Minty", "#83e0d1", "#44aaab"],
];

function makeSample([name, body, fin], index) {
  const radius = 18 + (index % 3) * 3;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70">
      <path fill="${fin}" d="M42 35 Q18 10 6 15 Q15 35 6 55 Q18 60 42 35Z"/>
      <path fill="${fin}" d="M47 23 Q57 1 77 13 L83 25Z"/>
      <ellipse cx="70" cy="35" rx="43" ry="${radius}" fill="${body}"/>
      <path fill="${fin}" d="M60 33 Q77 38 62 48 Q56 43 60 33Z"/>
      <circle cx="94" cy="30" r="6" fill="#fff"/>
      <circle cx="96" cy="30" r="2.8" fill="#173d47"/>
      <path d="M98 42 Q103 45 108 41" fill="none"
            stroke="#173d47" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;

  return {
    name,
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: 120,
    height: 70,
  };
}

// Ocean animation

const fishList = [];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const random = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

let frameId = 0;
let previousTime = null;
let oceanWidth = 0;
let oceanHeight = 0;
let swimTop = 0;

function addFish(data, index, sample = false) {
  const element = document.createElement("div");
  element.className = "fish";

  const art = document.createElement("div");
  art.className = "fish-art";

  for (const part of ["body", "tail"]) {
    const image = document.createElement("img");
    image.className = `fish-${part}`;
    image.src = data.image;
    image.width = data.width;
    image.height = data.height;
    image.style.height = "auto";
    image.alt = "";
    art.append(image);
  }

  const label = document.createElement("span");
  label.className = "fish-label";
  label.textContent = data.name;

  element.append(art, label);
  swimmers.append(element);

  const fish = {
    element,
    art,
    data,
    sample,
    index,
    x: null,
    direction: Math.random() < 0.5 ? -1 : 1,
    speed: random(24, 66),
    lane: sample ? (index + 0.5) / samples.length : random(0.15, 0.85),
    phase: random(0, Math.PI * 2),
    bob: random(4, 14),
    frequency: random(0.9, 1.8),
    entering: false,
  };

  fishList.push(fish);
  return fish;
}

function layoutOcean() {
  const viewWidth = ocean.clientWidth;
  const areaLeft = ocean.dataset.area === "2" ? viewWidth : 0;
  oceanWidth = swimmers.clientWidth;
  oceanHeight = ocean.clientHeight;
  swimTop = document.querySelector(".ocean-header").offsetHeight + 8;
  const hotspot = activeCheckIn && activityHotspots.get(activeCheckIn.activityId);

  for (const fish of fishList) {
    const { data } = fish;
    const maxWidth = Math.min(viewWidth * 0.3, fish.sample ? 104 : 148);
    const maxHeight = fish.sample ? 68 : 102;
    const scale = Math.min(maxWidth / data.width, maxHeight / data.height);

    fish.art.style.width = `${data.width * scale}px`;
    fish.art.style.height = `${data.height * scale}px`;

    fish.minX = 8;
    fish.maxX = Math.max(fish.minX, oceanWidth - data.width * scale - 8);
    fish.minY = swimTop;
    fish.maxY = Math.max(swimTop, oceanHeight - fish.element.offsetHeight - 12);

    const start = fish.sample ? (fish.index % 4 + 0.5) / 4 : random(0.2, 0.8);
    const spawnX = areaLeft + 8 + start * Math.max(0, viewWidth - data.width * scale - 16);
    fish.x = clamp(fish.x ?? spawnX, fish.minX, fish.maxX);
    fish.anchor = null;
    if (hotspot && !fish.sample && fish.index === activeCheckIn.fishIndex) {
      const { panel, button } = hotspot;
      const left = panel.offsetLeft + 8;
      const right = panel.offsetLeft + panel.clientWidth - data.width * scale - 8;
      const x = clamp(panel.offsetLeft + button.offsetLeft - data.width * scale / 2, left, Math.max(left, right));
      const nearbyY = button.offsetTop < oceanHeight / 2
        ? button.offsetTop + button.offsetHeight + 32
        : button.offsetTop - fish.element.offsetHeight - 24;
      const y = clamp(nearbyY, fish.minY, fish.maxY);
      fish.anchor = { x, y };
      fish.x = x;
    }
    placeFish(fish, 0);
  }
}

function placeFish(fish, time) {
  const laneY = fish.anchor?.y ?? fish.minY + fish.lane * (fish.maxY - fish.minY);
  const bob = reducedMotion.matches ? 0 : Math.sin(time * fish.frequency + fish.phase) * fish.bob;
  const y = clamp(laneY + bob, fish.minY, fish.maxY);

  fish.element.style.transform = `translate3d(${fish.x}px, ${y}px, 0)`;
  fish.art.style.setProperty("--facing", fish.direction);
}

function animateOcean(now) {
  const elapsed = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  for (const fish of fishList) {
    if (fish.entering) continue;

    if (!reducedMotion.matches && !fish.anchor) {
      fish.x += fish.direction * fish.speed * elapsed;
      if (fish.x >= fish.maxX) fish.direction = -1;
      if (fish.x <= fish.minX) fish.direction = 1;
      fish.x = clamp(fish.x, fish.minX, fish.maxX);
    }

    placeFish(fish, now / 1000);
  }

  frameId = requestAnimationFrame(animateOcean);
}

function showOcean() {
  studio.hidden = true;
  ocean.hidden = false;
  layoutOcean();
  previousTime = null;
  if (!frameId) frameId = requestAnimationFrame(animateOcean);
  document.querySelector("#ocean-title").focus();
  window.dispatchEvent(new Event("ocean:show"));
}

function showStudio() {
  cancelAnimationFrame(frameId);
  frameId = 0;
  ocean.hidden = true;
  studio.hidden = false;
  notice.textContent = "";
  document.querySelector("#studio-title").focus();
}

// Start the entrance animation at the drawing's position before switching screens.
releaseButton.addEventListener("click", () => {
  if (!drawingBounds || activePointer !== null) return;

  const bounds = drawingBounds;
  const rect = canvas.getBoundingClientRect();
  const startWidth = bounds.width * rect.width / canvas.width;
  const startX = rect.left + (bounds.x + bounds.width / 2) * rect.width / canvas.width;
  const startY = rect.top + (bounds.y + bounds.height / 2) * rect.height / canvas.height;

  const data = exportFish(bounds);
  notice.textContent = "";
  saveFish(data);
  const fish = addFish(data, savedFish.length - 1);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  history.length = 0;
  nameInput.value = "";
  refreshDrawing();
  showOcean();
  window.dispatchEvent(new CustomEvent("ocean:release", { detail: { data, fish } }));

  if (reducedMotion.matches) return;

  const end = fish.art.getBoundingClientRect();
  const dx = startX - (end.left + end.width / 2);
  const dy = startY - (end.top + end.height / 2);
  const scale = startWidth / end.width;
  fish.entering = true;

  const entrance = fish.element.animate([
    { translate: `${dx}px ${dy}px`, scale },
    { translate: "0px 0px", scale: 1 },
  ], {
    duration: 850,
    easing: "cubic-bezier(.2,.65,.25,1)",
  });

  entrance.finished.finally(() => {
    fish.entering = false;
  });
});

document.querySelector("#visit").addEventListener("click", showOcean);
document.querySelector("#draw-again").addEventListener("click", showStudio);
window.addEventListener("resize", () => {
  if (!ocean.hidden) layoutOcean();
});

savedFish.forEach((fish, index) => addFish(fish, index));
updateToolSelection();
const oceanArrow = document.querySelector("#ocean-arrow");

function showOceanArea(area) {
  ocean.dataset.area = area;
  syncSeafloorArea(area);

  oceanArrow.setAttribute(
    "aria-label",
    area === "2" ? "Return to the first ocean area" : "Swim to the next ocean area",
  );
}

oceanArrow.addEventListener("click", () => {
  showOceanArea(ocean.dataset.area === "2" ? "1" : "2");
});

window.addEventListener("keydown", (event) => {
  if (ocean.hidden || document.querySelector("dialog[open]") || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

  event.preventDefault();
  showOceanArea(event.key === "ArrowRight" ? "2" : "1");
});
const cursorBubbleImages = [
  "./assets/bubble-1.png",
  "./assets/bubble-2.png",
];

const cursorBubbleMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let lastCursorBubble = -Infinity;
let cursorBubbleIndex = 0;

window.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || cursorBubbleMotion.matches) return;
  if (event.target === document.querySelector("#drawing")) return;

  // Space out bubbles so quick mouse movement doesn't flood the screen.
  if (event.timeStamp - lastCursorBubble < 45) return;
  lastCursorBubble = event.timeStamp;

  const bubble = document.createElement("img");
  bubble.className = "cursor-bubble";
  bubble.src = cursorBubbleImages[cursorBubbleIndex];
  bubble.alt = "";
  bubble.style.left = `${event.clientX}px`;
  bubble.style.top = `${event.clientY}px`;
  bubble.style.width = `${32 + Math.random() * 20}px`;
  bubble.style.setProperty("--bubble-drift", `${Math.random() * 24 - 12}px`);

  cursorBubbleIndex = (cursorBubbleIndex + 1) % cursorBubbleImages.length;

  bubble.addEventListener("animationend", () => bubble.remove(), { once: true });
  document.body.append(bubble);
});
const activityGroups = [
  [
    ["dinos", "coral-1.png", "Dinos games", "Find a group to go to a Dinos game together.", "12.5%"],
    ["board-games", "coral-2.png", "Board games & trivia", "Play board games or team up for a trivia night.", "37.5%"],
    ["study", "starfish-1.png", "TFDL study jams", "Meet at TFDL for a study jam or work quietly side by side (body doubling).", "62.5%"],
    ["meal-breaks", "oyester-1.png", "Group meal breaks", "Take a study break and grab a meal together.", "87.5%"],
    ["intramurals", "blue-sardine-school.png", "Intramurals & drop-in sports", "Find a group for intramurals or drop-in sports at the Kinesiology facilities."],
  ],
  [
    ["open-mic", "coral-3.png", "Open mic & jams", "Meet up for an open mic or jam night at the Den or Last Defence.", "16.67%"],
    ["cultural-events", "seaweed-1.png", "Cultural events", "Get together for cultural club events and festivals.", "50%"],
    ["de-stress", "seaweed-2.png", "Exam de-stress", "Take a breather together at an exam-season de-stress zone.", "83.33%"],
    ["mindfulness", "jellyfish-1.png", "Journaling & mindfulness", "Drop in to journal or take a quiet mindfulness break."],
  ],
];

const seafloorPanels = [...ocean.querySelectorAll(".ocean-panel")];
const activityHotspots = new Map();
const hotspotDialog = document.querySelector("#hotspot-dialog");
const hotspotTitle = document.querySelector("#hotspot-title");
const hotspotDescription = document.querySelector("#hotspot-description");
const hotspotStatus = document.querySelector("#hotspot-status");
const checkInButton = document.querySelector("#hotspot-check-in");
const checkOutButton = document.querySelector("#hotspot-check-out");
const checkInKey = "little-ocean-check-in-v1";
const checkInDuration = 60 * 60 * 1000;
let selectedActivityId;
let activeCheckIn;
let checkInTimeout;

seafloorPanels.forEach((panel, panelIndex) => {
  panel.removeAttribute("aria-hidden");
  const items = activityGroups[panelIndex];
  items.forEach(([id, filename, title, description, position]) => {
    const button = document.createElement("button");
    button.className = "ocean-floor-item";
    button.type = "button";
    button.dataset.activity = id;
    button.setAttribute("aria-haspopup", "dialog");
    if (position) button.style.setProperty("--floor-position", position);

    const image = document.createElement("img");
    image.src = `./assets/${filename}`;
    image.alt = "";
    const label = document.createElement("span");
    label.className = "ocean-hotspot-label";
    button.append(image, label);
    panel.append(button);
    activityHotspots.set(id, { panel, button, label, title, description });
    button.addEventListener("click", () => {
      selectedActivityId = id;
      renderHotspotDialog();
      hotspotDialog.showModal();
    });
  });
});

function renderHotspotDialog() {
  const { title, description } = activityHotspots.get(selectedActivityId);
  const isHere = activeCheckIn?.activityId === selectedActivityId;
  hotspotTitle.textContent = title;
  hotspotDescription.textContent = description;
  hotspotStatus.textContent = isHere
    ? `1 checked in on this device · ${savedFish[activeCheckIn.fishIndex].name}. Your check-in lasts up to an hour.`
    : "0 checked in on this device.";
  if (!savedFish.length) hotspotStatus.textContent += " Draw and release a fish to check in.";
  checkInButton.disabled = !savedFish.length;
  checkInButton.hidden = isHere;
  checkOutButton.hidden = !isHere;
}

function refreshCheckIn() {
  clearTimeout(checkInTimeout);
  if (activeCheckIn?.expiresAt <= Date.now()) activeCheckIn = null;
  if (activeCheckIn) {
    checkInTimeout = setTimeout(refreshCheckIn, activeCheckIn.expiresAt - Date.now());
  }
  for (const [id, { button, label, title }] of activityHotspots) {
    const isHere = activeCheckIn?.activityId === id;
    button.toggleAttribute("data-active", isHere);
    label.textContent = `${title} · ${isHere ? 1 : 0}`;
    button.setAttribute("aria-label", `${title}, ${isHere ? 1 : 0} checked in`);
  }
  if (hotspotDialog.open) renderHotspotDialog();
  if (!ocean.hidden) layoutOcean();
}

function saveCheckIn(checkIn) {
  activeCheckIn = checkIn;
  try {
    if (checkIn) localStorage.setItem(checkInKey, JSON.stringify(checkIn));
    else localStorage.removeItem(checkInKey);
  } catch {
    // Keep the check-in for this visit if browser storage is unavailable.
  }
  refreshCheckIn();
}

function restoreCheckIn() {
  try {
    const saved = JSON.parse(localStorage.getItem(checkInKey));
    if (activityHotspots.has(saved?.activityId) && Number.isInteger(saved.fishIndex) &&
        savedFish[saved.fishIndex] && Number.isFinite(saved.expiresAt)) {
      return saved;
    }
  } catch {
    // An unavailable or invalid saved check-in starts with an empty map.
  }
  return null;
}

checkInButton.addEventListener("click", () => {
  saveCheckIn({
    activityId: selectedActivityId,
    fishIndex: savedFish.length - 1,
    expiresAt: Date.now() + checkInDuration,
  });
  checkOutButton.focus();
});

checkOutButton.addEventListener("click", () => {
  saveCheckIn(null);
  checkInButton.focus();
});

window.addEventListener("storage", (event) => {
  if (event.key === checkInKey || event.key === null) {
    activeCheckIn = restoreCheckIn();
    refreshCheckIn();
  }
});

activeCheckIn = restoreCheckIn();
refreshCheckIn();

function syncSeafloorArea(area) {
  seafloorPanels.forEach((panel, index) => {
    const offscreen = String(index + 1) !== area;

    if (offscreen && panel.contains(document.activeElement)) {
      oceanArrow.focus({ preventScroll: true });
    }

    panel.inert = offscreen;
  });
}

syncSeafloorArea(ocean.dataset.area || "1");

const cafeEntrance = document.querySelector("#cafe-entrance");
const cafeScene = document.querySelector("#cafe-scene");
const cafeBack = document.querySelector("#cafe-back");

cafeEntrance.addEventListener("click", () => {
  if (cafeEntrance.classList.contains("is-opening")) return;

  cafeEntrance.classList.add("is-opening");

  // Let the click glow show briefly before opening the café.
  window.setTimeout(() => {
    cafeEntrance.classList.remove("is-opening");

    if (ocean.hidden || cafeEntrance.closest(".ocean-panel").inert) return;

    cancelAnimationFrame(frameId);
    frameId = 0;
    ocean.hidden = true;

    cafeScene.hidden = false;
    document.querySelector("#cafe-join").focus();
  }, reducedMotion.matches ? 0 : 210);
});

cafeBack.addEventListener("click", () => {
  cafeScene.hidden = true;
  showOcean();
  cafeEntrance.focus({ preventScroll: true });
});
