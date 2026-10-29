-- Schnellstart-Turniere kennzeichnen (Liste „Meine Schnellstart-Turniere“ unter dem Schnellstart).
-- Nur ADD COLUMN, kein Table-Rebuild (tournaments hat eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE tournaments ADD COLUMN quick_start INTEGER NOT NULL DEFAULT 0;

-- Bestehende Schnellstart-Turniere nachtragen: privat, mit Live-Ansicht und Name „System Formation JJJJ-MM-TT“,
-- dessen Datum dem Turnierdatum entspricht. Alle Trigger auf tournaments hängen an anderen Spalten.
UPDATE tournaments SET quick_start = 1
WHERE visibility = 'private'
  AND live_view_enabled = 1
  AND length(date) = 10
  AND substr(name, -11) = ' ' || date;
