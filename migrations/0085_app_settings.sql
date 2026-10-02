-- Globale Einstellungen, die ein Admin in der Oberfläche umschaltet (Schlüssel/Wert). Bewusst ohne Fremdschlüssel:
-- eine Einstellung überlebt das Löschen des Kontos, das sie gesetzt hat. Fehlt ein Schlüssel, gilt der im Code
-- festgelegte Standard.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT
);
