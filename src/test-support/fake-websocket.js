// Nachbildung des Browser-WebSockets für die Sofort-Aktualisierung (useTournamentLiveSocket).
export class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = 0;
    FakeWebSocket.instances.push(this);
  }

  send(data) { this.sent.push(data); }

  close(code = 1000) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code });
  }

  // Testseite: Server nimmt die Verbindung an, schickt eine Meldung oder trennt.
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(payload) { this.onmessage?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) }); }

  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

export function installFakeWebSocket() {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket;
  return FakeWebSocket;
}

export function uninstallFakeWebSocket() {
  globalThis.WebSocket = undefined;
  FakeWebSocket.instances = [];
}

export function latestSocket() {
  return FakeWebSocket.instances.at(-1);
}
