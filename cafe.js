const cafeLobby = document.querySelector("#cafe-scene");
const cafeJoin = document.querySelector("#cafe-join");
const cafeCanvas = document.querySelector("#cafe-canvas");
const cafeReady = document.querySelector("#cafe-ready");
const cafeLeave = document.querySelector("#cafe-leave");
const cafeClock = document.querySelector("#cafe-clock");
const cafeStatus = document.querySelector("#cafe-status");
const cafeLobbyUrl = cafeLobby.dataset.lobbyUrl ||
  (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? "ws://127.0.0.1:8787/cafe-lobby"
    : "");

let lobbySocket = null;
let countdownId;
let openedCafeCanvas = false;

function closeCafeLobby() {
  const socket = lobbySocket;
  lobbySocket = null;
  socket?.close();
  clearInterval(countdownId);
}

function resetCafeLobby(message = "Find a partner to start a round.") {
  closeCafeLobby();
  const focusJoin = document.activeElement.closest(".cafe-actions");
  cafeJoin.hidden = false;
  cafeCanvas.hidden = true;
  cafeCanvas.removeAttribute("href");
  openedCafeCanvas = false;
  cafeReady.hidden = true;
  cafeReady.disabled = true;
  cafeLeave.hidden = true;
  cafeClock.hidden = true;
  cafeStatus.textContent = message;
  if (focusJoin && !cafeLobby.hidden) cafeJoin.focus();
}

function startCafeCountdown(remainingMs) {
  const deadline = performance.now() + remainingMs;
  cafeClock.hidden = false;
  cafeStatus.textContent = "Go! Draw together in Excalidraw. Keep this page beside it to watch the timer.";
  if (document.activeElement === cafeReady) cafeCanvas.focus();
  cafeReady.hidden = true;

  function updateClock() {
    const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    const minutes = Math.floor(seconds / 60);
    cafeClock.textContent = `${minutes}:${String(seconds % 60).padStart(2, "0")}`;

    if (seconds === 0) {
      closeCafeLobby();
      cafeStatus.textContent = "Time’s up! Take a look at what you drew together.";
      cafeJoin.textContent = "Find another partner";
      cafeJoin.hidden = false;
      if (document.activeElement === cafeLeave) cafeJoin.focus();
      cafeLeave.hidden = true;
    }
  }

  countdownId = setInterval(updateClock, 250);
  updateClock();
}

cafeJoin.addEventListener("click", () => {
  resetCafeLobby();
  if (!cafeLobbyUrl) {
    cafeStatus.textContent = "The online lobby hasn’t been set up yet.";
    return;
  }

  let socket;
  try {
    socket = new WebSocket(cafeLobbyUrl);
  } catch {
    cafeStatus.textContent = "The lobby address is invalid.";
    return;
  }
  lobbySocket = socket;
  cafeStatus.textContent = "Connecting to the lobby…";
  cafeLeave.hidden = false;
  cafeLeave.focus();
  cafeJoin.hidden = true;

  socket.addEventListener("message", (event) => {
    if (lobbySocket !== socket) return;
    const message = JSON.parse(event.data);
    switch (message.type) {
      case "waiting":
        cafeStatus.textContent = "Waiting for another player…";
        break;
      case "matched":
        cafeCanvas.href = message.canvasUrl;
        cafeCanvas.hidden = false;
        cafeReady.hidden = false;
        cafeStatus.textContent = "Partner found! Open the canvas in a new tab, then come back here and mark yourself ready.";
        if (document.activeElement === cafeLeave) cafeCanvas.focus();
        break;
      case "ready":
        cafeStatus.textContent = "Waiting for your partner to get ready…";
        break;
      case "started":
        startCafeCountdown(message.endsAt - message.serverNow);
        break;
      case "partner-left":
        resetCafeLobby("Your partner left. Find a new partner to try again.");
        break;
    }
  });

  socket.addEventListener("close", () => {
    if (lobbySocket === socket) {
      resetCafeLobby("The lobby connection closed. Try finding a partner again.");
    }
  });
});

cafeCanvas.addEventListener("click", () => {
  if (!cafeReady.hidden && !openedCafeCanvas) {
    openedCafeCanvas = true;
    cafeReady.disabled = false;
  }
});

cafeReady.addEventListener("click", () => {
  if (lobbySocket?.readyState !== WebSocket.OPEN) return;
  lobbySocket.send("ready");
  cafeReady.disabled = true;
  cafeCanvas.focus();
});

cafeLeave.addEventListener("click", () => resetCafeLobby());
document.querySelector("#cafe-back").addEventListener("click", () => resetCafeLobby());
window.addEventListener("pagehide", () => resetCafeLobby());
