import { useTranslation } from 'react-i18next';
import { PTM_DESKTOP_URL } from '../lib/constants.js';
import { supportedSystemsList } from '../lib/pairing/index.js';

// Deutlicher roter Hinweis für Turniersysteme ohne Online-Durchführung, mit Verweis auf PTM Desktop, das sie unterstützt.
export function NotOnlinePlayableNotice({ title, system }) {
  const { t, i18n } = useTranslation();
  const systems = supportedSystemsList(i18n.language);
  return (
    <div className="notice-danger" role="note">
      <strong><span aria-hidden="true">✕ </span>{title}</strong>
      <p>
        {t('Mit dem Turniersystem {{system}} kann das Turnier hier angelegt und die Anmeldung online geführt werden, Runden und Ergebnisse aber nicht.', { system })}
        {' '}{t('Online unterstützt: {{systems}}', { systems })}{systems.endsWith('.') ? '' : '.'}
      </p>
      <p>
        {t('PTM Desktop unterstützt dieses Turniersystem und kann das Turnier durchführen.')}
        {' '}<a href={PTM_DESKTOP_URL} target="_blank" rel="noreferrer">{t('PTM Desktop entdecken')}</a>
      </p>
    </div>
  );
}
