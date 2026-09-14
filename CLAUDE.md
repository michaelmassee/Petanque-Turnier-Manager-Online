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
