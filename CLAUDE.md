# Projekt-Regeln

## Lade-Feedback bei Aktionen

Jeder Button, der eine asynchrone Aktion auslöst (API-Call: Speichern, Senden, Importieren, Löschen etc.), muss während der Aktion sichtbares Lade-Feedback zeigen — nicht nur `disabled`.

Dafür die generische `Button`-Komponente (`src/components/ui.jsx`) mit ihrem `loading`-Prop verwenden:

```jsx
<Button disabled={busy || ...} loading={busy} onClick={handleAction}>{t('Speichern')}</Button>
```

- `loading` kombiniert intern automatisch mit `disabled` (kein zusätzliches `|| busy` in `disabled` nötig, schadet aber auch nicht).
- Zeigt einen rotierenden CSS-Spinner links vom Button-Text (`.button-spinner`/`@keyframes button-spin` in `src/styles.css`), der Text bleibt sichtbar.
- Gilt nur für `Button`-Klicks/Submits, nicht für native Checkboxen/Inputs.
- Neue asynchrone Aktionen brauchen einen eigenen `busy`/`loading`-State (`useState` → `setBusy(true)` vor dem `api()`-Call → `try/finally setBusy(false)`), der dann sowohl an `disabled` als auch an `loading` durchgereicht wird.

## Fehler-/Erfolgsmeldungen immer sichtbar

Meldungen nach einer Aktion immer über die `Feedback`-Komponente (`src/components/ui.jsx`) anzeigen – bzw. über `EditDialog` mit `error`/`message`, der intern `Feedback` nutzt:

```jsx
<Feedback error={error} />
<Feedback message={message} />
```

- `Feedback` scrollt eine neue Meldung automatisch ins Blickfeld (`scrollIntoView`, `block: 'nearest'`) und setzt `role="alert"` bzw. `role="status"`. Sonst sieht man am Handy nach einem Klick unten im Formular nicht, dass oben ein Fehler steht.
- Keine handgeschriebenen `<p className="feedback error|success">` – nur statische Hinweise mit `feedback offline` sind erlaubt (die sollen nicht scrollen).
- Vor jeder Meldung den Zustand leeren (`setError('')` vor dem `api()`-Call), damit ein wiederholter gleicher Fehler erneut gescrollt wird.
- Wird vor jedem Commit durch `scripts/feedback-visibility-check.mjs` (Teil von `test:checks` → `quality-gate` → Pre-commit-Hook) geprüft.
