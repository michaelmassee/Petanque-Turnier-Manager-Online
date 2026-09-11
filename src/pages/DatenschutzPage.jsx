import { useTranslation } from 'react-i18next';
import { StandalonePageHeader } from '../components/layout.jsx';

export function DatenschutzPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout }) {
  const { t } = useTranslation();
  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Datenschutzerklärung')}
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <section className="single-column legal-page">
        <div className="panel">
          <h2>{t('1. Verantwortlicher')}</h2>
          <p>{t('Verantwortlich für die Datenverarbeitung auf dieser Website ist:')}</p>
          <p data-i18n-skip>Michael Massee, An der Ziegelei 21, 35440 Linden, E-Mail: michael.massee@gmail.com</p>

          <h2>{t('2. Allgemeines zur Datenverarbeitung')}</h2>
          <p>
            {t('Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies zur Bereitstellung einer funktionsfähigen Website sowie unserer Inhalte und Leistungen erforderlich ist.')}
          </p>
          <p>
            {t('Rechtsgrundlage ist, je nach Verarbeitungsvorgang, die Erfüllung eines Vertrags bzw. vorvertraglicher Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO), eine erteilte Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) oder unser berechtigtes Interesse an einem sicheren und funktionsfähigen Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO).')}
          </p>

          <h2>{t('3. Bereitstellung der Website und Hosting')}</h2>
          <p>
            {t('Diese Website wird über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) als Hosting- und Content-Delivery-Anbieter bereitgestellt. Cloudflare verarbeitet dabei technisch notwendige Daten wie IP-Adresse, Datum und Uhrzeit der Anfrage sowie Browser-Informationen (Server-Logfiles), um die Website sicher und zuverlässig auszuliefern (Art. 6 Abs. 1 lit. f DSGVO).')}
          </p>
          <p>
            {t('Da Cloudflare auch Server außerhalb der EU nutzen kann, erfolgt die Datenübermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.')}
          </p>

          <h2>{t('4. Registrierung und Benutzerkonto')}</h2>
          <p>
            {t('Wenn du dich registrierst, erheben wir Name, E-Mail-Adresse und ein sicher gehashtes Passwort. Diese Daten werden zur Bereitstellung deines Benutzerkontos und zur Verwaltung deiner Turniere verarbeitet (Art. 6 Abs. 1 lit. b DSGVO). Nach der Registrierung senden wir dir zur Bestätigung deiner E-Mail-Adresse eine E-Mail mit einem 24 Stunden gültigen Bestätigungslink.')}
          </p>
          <p>
            {t('Wenn du die Google Anmeldung nutzt, erhalten wir von Google deine verifizierte E-Mail-Adresse, deinen Namen und eine technische Google-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Google-Konto deinem Benutzerkonto zuzuordnen.')}
          </p>
          <p>
            {t('Wenn du die Facebook Anmeldung nutzt, erhalten wir von Facebook deine E-Mail-Adresse, deinen Namen und eine technische Facebook-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Facebook-Konto deinem Benutzerkonto zuzuordnen.')}
          </p>

          <h2>{t('5. Turnieranmeldungen und öffentliche Teilnehmerlisten')}</h2>
          <p>
            {t('Wenn du dich über diese Website für ein Turnier anmeldest, verarbeiten wir Vorname, Nachname, E-Mail-Adresse sowie je nach Turnier optional oder verpflichtend Verein, Lizenznummer und Angaben zu deinem Partner bzw. deinen Partnern (Doublette/Triplette). Diese Daten werden an den jeweiligen Turnierleiter zur Organisation des Turniers weitergegeben (Art. 6 Abs. 1 lit. b DSGVO).')}
          </p>
          <p>
            {t('Turnierleiter können die Teilnehmerliste eines Turniers öffentlich sichtbar schalten. In diesem Fall werden Vorname, Nachname, Verein und die Namen deiner Partner für jeden Besucher der Turnierseite sichtbar, ohne dass eine Anmeldung erforderlich ist. Wenn du das nicht möchtest, wende dich bitte direkt an den Veranstalter (Turnierleiter) des jeweiligen Turniers, dessen Kontaktdaten auf der Turnierseite angegeben sind.')}
          </p>

          <h2>{t('6. Turniermeldungen')}</h2>
          <p>
            {t('Wenn du ein fremdes Turnier zur Veröffentlichung vorschlägst, verarbeiten wir deinen Namen und deine E-Mail-Adresse zur Rückfrage und Bestätigung sowie zur Moderation durch unsere Administratoren (Art. 6 Abs. 1 lit. a, lit. f DSGVO).')}
          </p>

          <h2>{t('7. Cookies und lokaler Speicher')}</h2>
          <p>
            {t('Diese Website verwendet ein technisch notwendiges Session-Cookie (ptm_session), um dich nach der Anmeldung für bis zu 14 Tage eingeloggt zu halten. Das Cookie ist HttpOnly, Secure und SameSite=Lax gesetzt und wird ausschließlich für den Login-Status verwendet. Da dieses Cookie technisch notwendig ist, ist gemäß § 25 Abs. 2 TTDSG keine Einwilligung erforderlich.')}
          </p>
          <p>
            {t('Zusätzlich speichern wir deine gewählte Sprache in deinem Browser (localStorage), um sie bei deinem nächsten Besuch beizubehalten. Diese Daten verlassen dein Gerät nicht.')}
          </p>
          <p>{t('Wir setzen keine Analyse-, Marketing- oder Tracking-Cookies ein.')}</p>

          <h2>{t('8. Versand von E-Mails')}</h2>
          <p>
            {t('Für den Versand von Bestätigungs-, Registrierungs- und Passwort-Zurücksetzen-E-Mails nutzen wir den Dienst Resend (Resend, Inc., USA). Hierbei werden die E-Mail-Adresse sowie der jeweilige E-Mail-Inhalt an Resend übermittelt (Art. 6 Abs. 1 lit. b DSGVO). Auch hier erfolgt die Übermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.')}
          </p>

          <h2>{t('9. Speicherdauer')}</h2>
          <p>
            {t('Bestätigungslinks für die E-Mail-Verifizierung und Turniermeldungen sind 24 Stunden gültig, Links zum Zurücksetzen des Passworts 30 Minuten. Danach werden die zugehörigen Token automatisch gelöscht. Benutzerkonten und Turnieranmeldungen speichern wir, solange dein Konto besteht bzw. das Turnier organisiert wird, oder bis du eine Löschung beantragst.')}
          </p>

          <h2>{t('10. Deine Rechte')}</h2>
          <p>
            {t('Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) sowie Widerspruch gegen die Verarbeitung (Art. 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).')}
          </p>
          <p>{t('Bitte wende dich hierfür an: michael.massee@gmail.com')}</p>
          <p>
            {t('Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.')}
          </p>

          <h2>{t('11. Stand')}</h2>
          <p>{t('Diese Datenschutzerklärung wurde zuletzt am 26. August 2026 aktualisiert.')}</p>
        </div>
      </section>
    </main>
  );
}

export default DatenschutzPage;
