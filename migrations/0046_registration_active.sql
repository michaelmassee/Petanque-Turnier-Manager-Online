-- Aktiv/Inaktiv-Status pro Meldung für die Online-Turnierdurchführung, analog zum
-- Hauptprojekt (SpielrundeGespielt: nur aktive Meldungen gehen in die Rundenauslosung
-- ein - siehe turniersysteme/07_Supermelee.md). Ersetzt den match-bezogenen
-- "nicht angetreten"-Button: wer für die nächste Runde pausiert oder ausscheidet, wird
-- hier auf inaktiv gesetzt und dadurch von der Paarungsbildung ausgeschlossen, statt
-- nachträglich ein Fehlrunden-Ergebnis einzutragen.
ALTER TABLE registrations ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
