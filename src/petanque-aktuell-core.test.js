import { describe, expect, it } from 'vitest';
import { isFuturePetanqueAktuellTournament, mapPetanqueAktuellFormation, mapPetanqueAktuellTournament, parsePetanqueAktuellCalendar, parsePetanqueAktuellDetailAddress, parsePetanqueAktuellDetailLogoUrl, petanqueAktuellPageUrls } from './petanque-aktuell-core.js';

const CALENDAR = `
  <table>
    <tr><td>19.09.26 Sa</td><td></td><td><a href="kalender.php?kal_Aktion=detail&kal_Nummer=123">Chateau &amp; Zock</a></td><td>Düsseldorf</td><td>10:20</td><td>2:2 mixte</td><td>NRW</td><td>nein</td><td><a href="flyer.pdf">Flyer</a></td></tr>
    <tr><td>20.09.26 So</td><td></td><td><a href="kalender.php?kal_Aktion=detail&amp;kal_Nummer=124">Supermêlée</a></td><td>Berlin</td><td>13:00</td><td>2:2 sm</td><td>Berlin</td><td>ja</td><td></td></tr>
  </table>
  <a href="kalender.php?kal_Start=51">2</a>`;

const LIVE_SHAPE = `
  <div class="kalTbZl1">
    <div class="kalTbLst"><span class="kalTbLst">Datum</span>19.09.26&nbsp;Sa</div>
    <div class="kalTbLst"><span class="kalTbLst">Turnier</span><a class="kalDetl" href="/kialender_1/kalender.php?kal_Aktion=detail&amp;kal_Nummer=2443">Chateau Benrath Zock</a></div>
    <div class="kalTbLst"><span class="kalTbLst">Ort</span>Düsseldorf</div>
    <div class="kalTbLst kalTbLsM"><span class="kalTbLst">Uhrzeit</span>10:20</div>
    <div class="kalTbLst"><span class="kalTbLst">Formation</span>2:2</div>
    <div class="kalTbLst"><span class="kalTbLst">LV</span>NRW</div>
    <div class="kalTbLst"><span class="kalTbLst">Lizenz</span>nein</div>
  </div><div class="kalTbZlX"></div>`;

describe('Pétanque-Aktuell-Import', () => {
  it('liest die Kalenderzeilen mit stabiler Detail-ID und Quellenlinks', () => {
    const entries = parsePetanqueAktuellCalendar(CALENDAR);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ externalKey: 'kalender:123', name: 'Chateau & Zock', date: '2026-09-19', startTime: '10:20', location: 'Düsseldorf', formation: '2:2 mixte', association: 'NRW', licenseRequired: 'nein' });
    expect(entries[0].detailUrl).toContain('kal_Nummer=123');
    expect(entries[0].flyerUrl).toBe('https://petanque-aktuell.de/kialender_1/flyer.pdf');
  });

  it('ermittelt weitere Kalenderseiten nur von der erlaubten Quelle', () => {
    expect(petanqueAktuellPageUrls(`${CALENDAR}<a href="https://example.test/kalender.php?kal_Start=99">x</a>`)).toEqual(expect.arrayContaining([
      'https://petanque-aktuell.de/kialender_1/kalender.php',
      'https://petanque-aktuell.de/kialender_1/kalender.php?kal_Start=51',
    ]));
  });

  it('ignoriert Turnier-Detaillinks, die kal_Start nur als Kontext mitführen', () => {
    // Auf petanque-aktuell.de trägt jeder Detaillink ab Seite 2 kal_Start als
    // zusätzlichen Query-Parameter (z.B. ?kal_Aktion=detail&kal_Nummer=2626&kal_Start=51).
    // Ohne den kal_Aktion-Ausschluss würde jeder dieser Links als eigene "Seite" gezählt
    // und das Seiten-Limit sofort erschöpfen.
    const html = `${CALENDAR}<a href="kalender.php?kal_Aktion=detail&amp;kal_Nummer=2626&amp;kal_Start=51">Detail</a>`;
    expect(petanqueAktuellPageUrls(html)).toEqual([
      'https://petanque-aktuell.de/kialender_1/kalender.php',
      'https://petanque-aktuell.de/kialender_1/kalender.php?kal_Start=51',
    ]);
  });

  it('liest die tatsächliche div-basierte Kalenderstruktur', () => {
    expect(parsePetanqueAktuellCalendar(LIVE_SHAPE)).toEqual([expect.objectContaining({
      externalKey: 'kalender:2443', date: '2026-09-19', name: 'Chateau Benrath Zock', location: 'Düsseldorf', startTime: '10:20', formation: '2:2', association: 'NRW', licenseRequired: 'nein',
    })]);
  });

  it('liest PLZ/Straße von der Detailseite, wenn der Veranstalter sie gepflegt hat', () => {
    const detail = `
      <div class="kalTbZl1"><div class="kalTbSp1">Nummer</div><div class="kalTbSp2">2544</div></div>
      <div class="kalTbZl2"><div class="kalTbSp1">PLZ</div><div class="kalTbSp2">69121</div></div>
      <div class="kalTbZl1"><div class="kalTbSp1">Ort</div><div class="kalTbSp2">Heidelberg</div></div>
      <div class="kalTbZl2"><div class="kalTbSp1">Straße, Nr.</div><div class="kalTbSp2">Im Weiher 18</div></div>`;
    expect(parsePetanqueAktuellDetailAddress(detail)).toBe('Im Weiher 18, 69121 Heidelberg');
  });

  it('liefert null, wenn die Detailseite keine PLZ/Straße enthält', () => {
    const detail = `
      <div class="kalTbZl1"><div class="kalTbSp1">Nummer</div><div class="kalTbSp2">2626</div></div>
      <div class="kalTbZl2"><div class="kalTbSp1">Ort</div><div class="kalTbSp2">Khon Kaen (Thailand)</div></div>`;
    expect(parsePetanqueAktuellDetailAddress(detail)).toBeNull();
  });

  it('übernimmt das Veranstalter-Icon der Detailseite als Link', () => {
    const detail = `
      <div class="kalTbZl2">
        <div class="kalTbSp1">Icon</div>
        <div class="kalTbSp2"><img class="kalBild" src="https://petanque-aktuell.de/kialender_1/bilder/2701_Logo.jpg" style="max-width:60px"></div>
      </div>`;
    expect(parsePetanqueAktuellDetailLogoUrl(detail)).toBe('https://petanque-aktuell.de/kialender_1/bilder/2701_Logo.jpg');
    expect(parsePetanqueAktuellDetailLogoUrl('<div class="kalTbSp1">Icon</div><div class="kalTbSp2"><img src="https://evil.example/x.jpg"></div>')).toBeNull();
    expect(parsePetanqueAktuellDetailLogoUrl('<div class="kalTbSp1">PLZ</div><div class="kalTbSp2">64521</div>')).toBeNull();
  });

  it('übernimmt die Lizenzpflicht strukturiert vom Kalender', () => {
    const entries = parsePetanqueAktuellCalendar(CALENDAR);
    expect(entries[0].licenseRequired).toBe('nein');
    expect(entries[1].licenseRequired).toBe('ja');
    expect(mapPetanqueAktuellTournament(entries[0]).licenseRequired).toBe(false);
    expect(mapPetanqueAktuellTournament(entries[1]).licenseRequired).toBe(true);
  });

  it('ordnet bekannte Formationen zu und bewahrt andere als Originalinformation', () => {
    expect(mapPetanqueAktuellFormation('1:1')).toBe('tete');
    expect(mapPetanqueAktuellFormation('2:2 sm')).toBe('doublette');
    expect(mapPetanqueAktuellFormation('3:3 Damen')).toBe('triplette');
    const mapped = mapPetanqueAktuellTournament(parsePetanqueAktuellCalendar(CALENDAR)[1]);
    expect(mapped.description).toContain('Landesverband: Berlin');
    expect(mapped.formation).toBe('doublette');
  });

  it('akzeptiert nur künftige Termine', () => {
    expect(isFuturePetanqueAktuellTournament({ date: '2026-09-16' }, '2026-09-15')).toBe(true);
    expect(isFuturePetanqueAktuellTournament({ date: '2026-09-15' }, '2026-09-15')).toBe(false);
  });
});
