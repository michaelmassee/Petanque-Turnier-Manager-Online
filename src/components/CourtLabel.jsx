import { useTranslation } from 'react-i18next';

/** „Bahn x“, sofern das Turnier (bzw. das verbundene Turnierdokument) eine Bahn vergeben hat. */
export function CourtLabel({ court, className, as: Element = 'span' }) {
  const { t } = useTranslation();
  if (!court) return null;
  return (
    <Element className={className}>
      {t('Bahn')} <strong data-i18n-skip>{court}</strong>
    </Element>
  );
}
