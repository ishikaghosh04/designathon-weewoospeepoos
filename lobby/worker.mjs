const ROUND_MS = 120_000;
const OPEN = 1;

function createCanvasUrl() {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(10)), (byte) =>
    byte.toString(16).padStart(2, "0")).join("");
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `https://excalidraw.com/#room=${id},${key}`;
}

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname !== "/cafe-lobby") {
      return new Response("Not found", { status: 404 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }
    const origins = env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
    if (!origins.includes(request.headers.get("Origin"))) {
      return new Response("Origin not allowed", { status: 403 });
    }
    return env.CAFE_LOBBY.getByName("main").fetch(request);
  },
};

export class CafeLobby {
  constructor(ctx) {
    this.ctx = ctx;
  }

  fetch() {
    const [client, player] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(player);

    const partner = this.ctx.getWebSockets().find((socket) =>
      socket.readyState === OPEN && socket.deserializeAttachment()?.waiting);

    if (partner) {
      const canvasUrl = createCanvasUrl();
      const match = { canvasUrl, ready: false, endsAt: null };
      player.serializeAttachment(match);
      partner.serializeAttachment(match);
      const message = JSON.stringify({ type: "matched", canvasUrl });
      player.send(message);
      partner.send(message);
    } else {
      player.serializeAttachment({ waiting: true });
      player.send(JSON.stringify({ type: "waiting" }));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  findPartner(player, canvasUrl) {
    return this.ctx.getWebSockets().find((socket) =>
      socket !== player && socket.readyState === OPEN &&
      socket.deserializeAttachment()?.canvasUrl === canvasUrl);
  }

  webSocketMessage(player, message) {
    const match = player.deserializeAttachment();
    if (message !== "ready" || !match?.canvasUrl || match.ready) return;

    const partner = this.findPartner(player, match.canvasUrl);
    if (!partner) return;

    match.ready = true;
    const partnerMatch = partner.deserializeAttachment();
    if (!partnerMatch.ready) {
      player.serializeAttachment(match);
      player.send(JSON.stringify({ type: "ready" }));
      return;
    }

    const serverNow = Date.now();
    const endsAt = serverNow + ROUND_MS;
    match.endsAt = endsAt;
    partnerMatch.endsAt = endsAt;
    player.serializeAttachment(match);
    partner.serializeAttachment(partnerMatch);
    const start = JSON.stringify({ type: "started", serverNow, endsAt });
    player.send(start);
    partner.send(start);
  }

  webSocketClose(player) {
    const match = player.deserializeAttachment();
    if (!match?.canvasUrl || (match.endsAt && Date.now() >= match.endsAt)) return;

    const partner = this.findPartner(player, match.canvasUrl);
    if (partner) {
      partner.serializeAttachment(null);
      partner.send(JSON.stringify({ type: "partner-left" }));
      partner.close(1000);
    }
  }

  webSocketError(player) {
    this.webSocketClose(player);
    player.close(1011, "Connection error");
  }
}
