// Sofort-Aktualisierung offener Turnierseiten, Anzeigen und Live-Ansichten: ein Durable Object je Turnier hält die
// WebSockets im Ruhezustand (Hibernation, kostet keine Laufzeit) und meldet nach jedem Schreibzugriff nur "changed".
// Die Seiten laden dann über den gewohnten Abruf (ETag/Edge-Cache) neu, über den Socket gehen keine Turnierdaten.
// Wie RegistrationOpeningScheduler ohne cloudflare:workers-Import, damit die Klasse in Node testbar bleibt.

// Obergrenze je Turnier; darüber bleibt die Seite beim regelmäßigen Abruf.
export const MAX_LIVE_SOCKETS_PER_TOURNAMENT = 500;
export const LIVE_SOCKET_CHANGED_MESSAGE = JSON.stringify({ type: 'changed' });

export class TournamentLiveHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // Keepalive des Clients beantwortet die Plattform selbst, ohne das Objekt aufzuwecken.
    if (typeof WebSocketRequestResponsePair === 'function') {
      ctx.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair('ping', 'pong'));
    }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      if (this.ctx.getWebSockets().length > MAX_LIVE_SOCKETS_PER_TOURNAMENT) server.close(1013, 'Too many connections');
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === 'POST' && new URL(request.url).pathname === '/notify') {
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(LIVE_SOCKET_CHANGED_MESSAGE);
        } catch {
          // Gerade geschlossene Verbindung: Der Client verbindet sich selbst neu.
        }
      }
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }

  // Clients senden nur das Keepalive, das die Auto-Response abfängt; alles andere wird ignoriert.
  async webSocketMessage() {}

  async webSocketClose(socket, code) {
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, 'closed');
    } catch {
      // bereits geschlossen
    }
  }

  async webSocketError(socket) {
    try {
      socket.close(1011, 'error');
    } catch {
      // bereits geschlossen
    }
  }
}

// Meldet dem Hub eines Turniers eine Änderung. Fehler dürfen den Schreibzugriff nie scheitern lassen.
export async function notifyTournamentChanged(env, tournamentId) {
  if (!env?.TOURNAMENT_LIVE_HUB || !tournamentId) return;
  try {
    const stub = env.TOURNAMENT_LIVE_HUB.get(env.TOURNAMENT_LIVE_HUB.idFromName(String(tournamentId)));
    await stub.fetch('https://live-hub/notify', { method: 'POST' });
  } catch (error) {
    console.error(`Failed to notify live hub for tournament ${tournamentId}`, error);
  }
}

// Leitet einen geprüften Upgrade-Request an den Hub des Turniers weiter.
export function connectTournamentLiveSocket(env, tournamentId, request) {
  if (!env?.TOURNAMENT_LIVE_HUB) return new Response(null, { status: 503 });
  const stub = env.TOURNAMENT_LIVE_HUB.get(env.TOURNAMENT_LIVE_HUB.idFromName(String(tournamentId)));
  return stub.fetch(request);
}
