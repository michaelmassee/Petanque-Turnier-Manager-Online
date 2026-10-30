import '@testing-library/jest-dom/vitest';

// Seiten öffnen sonst echte WebSockets zur Sofort-Aktualisierung; Hook-Tests setzen ihren eigenen Fake.
globalThis.WebSocket = undefined;
