import { StandalonePageHeader } from '../components/layout.jsx';

export function ImpressumPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout }) {
  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading="Impressum"
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
          <h2>Angaben gemäß § 5 DDG</h2>
          <p>Michael Massee</p>
          <p>An der Ziegelei 21</p>
          <p>35440 Linden</p>
          <p>Deutschland</p>

          <h2>Kontakt</h2>
          <p>E-Mail: michael.massee@gmail.com</p>

          <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
          <p>Michael Massee (Anschrift wie oben)</p>

          <h2>Haftung für Inhalte</h2>
          <p>
            Turnierdaten, Anmeldungen und Turniermeldungen auf dieser Plattform werden von den jeweiligen Turnierleitern bzw. Nutzern eigenverantwortlich erstellt und gepflegt. Für die Richtigkeit, Vollständigkeit und Aktualität dieser Inhalte sind allein die jeweiligen Turnierleiter bzw. Einsender verantwortlich, nicht der Betreiber dieser Plattform.
          </p>
          <p>
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Bei Bekanntwerden entsprechender Rechtsverletzungen werden wir die betroffenen Inhalte umgehend entfernen.
          </p>

          <h2>Haftung für Links</h2>
          <p>
            Turniermeldungen können Links zu externen Websites Dritter enthalten, etwa zu Anmeldeseiten der jeweiligen Veranstalter, auf deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte können wir daher keine Gewähr übernehmen; für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
          </p>

          <h2>Hinweis</h2>
          <p>
            Dieses Angebot wird als nicht-kommerzielles Privatprojekt betrieben. Es werden keine Waren oder Dienstleistungen gegen Entgelt über diese Website angeboten oder abgewickelt.
          </p>

          <h2>Streitschlichtung</h2>
          <p>
            Als Privatperson bieten wir kein kommerzielles Angebot an und nehmen daher nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil.
          </p>
        </div>
      </section>
    </main>
  );
}

export default ImpressumPage;
