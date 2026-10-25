// Importiert die Mitgliedsvereine des Niedersächsischen Pétanque-Verbands (NPV, Niedersachsen und Bremen) als
// Organisationen. Quelle: npv-petanque.de/verband/ueber-uns/vereine bettet die DPV-Vereinskarte ein (VEREINE_URL), die
// der Verband aus seiner Verbandsverwaltung pflegt; sie zeigt die Adresse des Sportgeländes, sonst die Vereinsadresse.
// Die Kartenkoordinaten sind oft nur Orts- oder Stadtteilmitte; jeder Verein hat darum in PLACES einen geprüften
// Spielort (Pétanque-Aktuell-Karte, Nominatim, Vereinswebsites, pebou.com; Stand 2026-10-25). Vereine werden mit
// Owner = Admin und Status 'pending' angelegt, mit --publish gleich freigegeben (wie die Admin-Freigabe).
//
//   node scripts/import-npv-clubs.mjs --local                       # SQL erzeugen und anzeigen
//   node scripts/import-npv-clubs.mjs --local --apply               # zusätzlich ausführen
//   node scripts/import-npv-clubs.mjs --remote --apply --publish    # Produktion, gleich freigegeben
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VEREINE_URL = 'https://dpvserver.de/npv/web/vmap/src/vereine.json';
const MEMBER_OF = ['Niedersächsischer Pétanque-Verband'];
// Vorerst nicht importieren: Spielort weder aus Karte, Website noch anderen Karten bestimmbar (nur Ortsmitte,
// Postfach oder keine Adresse). Später mit geprüftem Spielort nachholen.
const EXCLUDED = new Set([
  'mtv eickeloh-hademstorf von 1921 ev', 'turn- und sportverein "jahn" reyershausen e.v.', 'bffnl bremen e.v.',
  'bfnl göttingen e.v.', 'sonnenfreunde langenhagen-krähenwinkel e.v.', 'nordhorner sportverein sparta 09 e.v.',
  'rasenkitzler wilsum (r.k.) e.v.',
]);
// Tote, falsch geschriebene oder umgezogene Vereinsseiten (geprüft 2026-10-25), nach Hostname; null = keine Website.
const WEBSITE_FIXES = {
  'tus-hermannsburg.de': 'https://www.mtv-moisburg.de/', // MTV Moisburg verlinkte auf die Seite des TuS Hermannsburg
  'vfrhelen.de': 'https://vfrhehlen.de/',
  'boulefreundegoslar.com': null,
  'petangueules.de': null,
  'vd-auhagen.de': null,
  'tsv-warzen.de': 'https://tsv-warzen.de/',
  'tura-braunschweig.de': 'https://www.tura-braunschweig.de/',
  'schwalbe-hannover.de': 'https://www.fcschwalbe.de/',
  'vfb-wuelfel.de': 'http://www.vfb-wuelfel.de/',
  'tgfreden.de': 'http://tgfreden.de/',
  'jever-petanque-club.de': 'http://jever-petanque-club.de/',
  'boule-tsg-echte.npage.de': 'https://boule-tsg-echte.hpage.com/',
  'fc09.de': 'https://www.fcschuettorf09.de/',
  'fvdittmern.de': 'https://fvdittmern.jimdo.com/',
  'svn.dueshorn.de': 'http://svn.dueshorn.de/',
  'turn-club-bissendorf.de': 'http://turn-club-bissendorf.de/',
  'sv-badbentheim.de': 'https://svbadbentheim.de/',
  'klack95.de': 'https://klack95.jimdoweb.com/',
  'fsb-salzgitter.de': 'https://www.fsb-salzgitter.de/',
};
// Geprüfter Spielort je Verein (Schlüssel = Vereinsname klein).
const PLACES = {
  // Pin der Pétanque-Aktuell-Karte (gleicher Verein, Adresse bestätigt bzw. Reverse-Geokodierung: Sportplatz).
  '1. hamelner boule club': { street: 'Heinestr. 7A', postcode: '31785', city: 'Hameln', latitude: 52.1179573, longitude: 9.347233 },
  '1.göttinger pétanque club 1989 „boule sur leine“ e. v.': { street: 'Sandweg 5', postcode: '37083', city: 'Göttingen', latitude: 51.5186504, longitude: 9.9292268 },
  'allez allee hannover e.v.': { street: 'Herrenhäuser Allee (Georgengarten)', postcode: '30167', city: 'Hannover', latitude: 52.3845296, longitude: 9.7075326 },
  'b – team rettmer e.v.': { street: 'Klosterweg 23', postcode: '21335', city: 'Lüneburg', latitude: 53.2126258, longitude: 10.3710446 },
  'boule compagnie osterholz von 1988 e.v.': { street: 'Am Stadion 1', postcode: '27711', city: 'Osterholz-Scharmbeck', latitude: 53.2236693, longitude: 8.7973225 },
  'boule-gemeinschaft bremen e. v.': { street: 'Neustadtswall 81', postcode: '28199', city: 'Bremen', latitude: 53.0703854, longitude: 8.7968664 },
  'boulefreunde bad nenndorf e.v.': { street: 'Sportplatzweg 15', postcode: '31542', city: 'Bad Nenndorf', latitude: 52.3430423, longitude: 9.4003711 },
  'bsv "hannovera" gleidingen e.v.': { street: 'Jahnweg 1', postcode: '30880', city: 'Laatzen', latitude: 52.2661179, longitude: 9.8472274 },
  'die oldenbouler, pc oldenburg e.v.': { street: 'Otterweg 36', postcode: '26123', city: 'Oldenburg', latitude: 53.1502831, longitude: 8.2416931 },
  'faire les boules hohnstorf/elbe e.v.': { street: 'Am Boulepark', postcode: '21522', city: 'Hohnstorf (Elbe)', latitude: 53.3607102, longitude: 10.5646178 },
  'fc burgwedel von 1950 e.v.': { street: 'Auf der Ramhorst', postcode: '30938', city: 'Burgwedel', latitude: 52.4824144, longitude: 9.863636 },
  'fc neuwarmbüchen e.v.': { street: 'Buchensahl 15', postcode: '30916', city: 'Isernhagen', latitude: 52.469156, longitude: 9.8841464 },
  'fc schwalbe hannover e.v.': { street: 'Schützenallee 10', postcode: '30519', city: 'Hannover', latitude: 52.3389959, longitude: 9.7555928 },
  'fc schüttorf e.v.': { street: 'Salzberger Straße 80', postcode: '48465', city: 'Schüttorf', latitude: 52.3231078, longitude: 7.2404813 },
  'freizeitverein dittmern von 1972 e.v.': { street: 'Am Wall 5', postcode: '29614', city: 'Soltau', latitude: 53.0148468, longitude: 9.8753894 },
  'fsb salzgitter e.v.': { street: 'Goslarsche Str. 131', postcode: '38259', city: 'Salzgitter', latitude: 52.0301658, longitude: 10.324229 },
  'fsv braunschweig e.v.': { street: 'Parnitzweg 5', postcode: '38108', city: 'Braunschweig', latitude: 52.3088052, longitude: 10.5273633 },
  'fsv füchtenfeld e.v.': { street: 'Wartburgstraße 1', postcode: '49835', city: 'Wietmarschen-Füchtenfeld', latitude: 52.5587235, longitude: 7.1141014 },
  'hannoverscher sport-club von 1893 e.v.': { street: 'Constantinstr. 86', postcode: '30177', city: 'Hannover', latitude: 52.4027214, longitude: 9.7696454 },
  'hansa-sportverein stöckte e.v.': { street: 'Sportplatzweg', postcode: '21423', city: 'Winsen (Luhe)-Stöckte', latitude: 53.3792083, longitude: 10.1943052 },
  'jever pétanque club e.v.': { street: 'Karl-Peters-Straße 2', postcode: '26441', city: 'Jever', latitude: 53.5785495, longitude: 7.8944344 },
  'klub für den boule- und pétanquesport klack 95 e.v.': { street: 'Bröcker Weg 83', postcode: '49082', city: 'Osnabrück', latitude: 52.2489974, longitude: 8.0547219 },
  'koldinger sportverein v. 1946 e.v.': { street: 'Redener Str. 11', postcode: '30982', city: 'Pattensen', latitude: 52.2737725, longitude: 9.7913387 },
  'les pétangueules hannover e.v.': { street: 'Kleine Düwelstraße 10', postcode: '30171', city: 'Hannover', latitude: 52.3635384, longitude: 9.7551651 },
  'mtv borstel-sangenstedt von 1910 e.v.': { street: 'Heidlandsweg 100', postcode: '21423', city: 'Winsen (Luhe)', latitude: 53.3412783, longitude: 10.2405384 },
  'mtv engelbostel - schulenburg von 1907 e.v.': { street: 'Stadtweg 43', postcode: '30855', city: 'Langenhagen', latitude: 52.4429417, longitude: 9.6635041 },
  'mtv von 1892 e.v. boffzen': { street: 'Jahnstraße 4', postcode: '37691', city: 'Boffzen', latitude: 51.7505431, longitude: 9.3921173 },
  'mtv-moisburg e.v.': { street: 'Liethberg 9 a', postcode: '21647', city: 'Moisburg', latitude: 53.4028031, longitude: 9.6989315 },
  'nino-sport e.v.': { street: 'Westfalenstrasse 27', postcode: '48529', city: 'Nordhorn', latitude: 52.417138, longitude: 7.0768023 },
  'nordstädter turn-verein von 1909 hannover e.v.': { street: 'Rübekamp 50', postcode: '30165', city: 'Hannover', latitude: 52.4097377, longitude: 9.7184587 },
  'polizei-sv hannover e.v.': { street: 'An der breiten Wiese 70', postcode: '30625', city: 'Hannover', latitude: 52.3763785, longitude: 9.8242936 },
  'postsportverein alfeld (leine) e.v.': { street: 'Ziegelmasch 19', postcode: '31061', city: 'Alfeld (Leine)', latitude: 51.9781566, longitude: 9.8319152 },
  'postsportverein leer e.v.': { street: 'An den Gärten 6', postcode: '26789', city: 'Leer (Ostfriesland)', latitude: 53.234668, longitude: 7.4348769 },
  'pétanque club wilhelmshaven e.v.': { street: 'Banter Deich 16', postcode: '26382', city: 'Wilhelmshaven', latitude: 53.5134549, longitude: 8.1134241 },
  'sc langenhagen e.v.': { street: 'Leibnizstr. 56', postcode: '30853', city: 'Langenhagen', latitude: 52.4481858, longitude: 9.7500242 },
  'sg fulde': { street: 'Fulde 2b', postcode: '29664', city: 'Walsrode-Fulde', latitude: 52.8714961, longitude: 9.5429016 },
  'sg letter von 1905 e.v. - pétanque-abteilung': { street: 'Nico-Flatau-Platz 1', postcode: '30926', city: 'Seelze', latitude: 52.4062269, longitude: 9.6390688 },
  'sg liekwegen/sülbeck/südhorsten e.v.': { street: 'Am Schierbach 14', postcode: '31688', city: 'Obernkirchen', latitude: 52.2817686, longitude: 9.1706726 },
  'sg von 1874 hannover e.v.': { street: 'In der Steintormasch 48', postcode: '30167', city: 'Hannover', latitude: 52.3822748, longitude: 9.6939952 },
  'sportgemeinschaft buxtehude-altkloster e.v.': { street: 'Apensener Straße 5', postcode: '21614', city: 'Buxtehude', latitude: 53.4681145, longitude: 9.6839929 },
  'sportverein düdinghausen-auhagen e.v.': { street: 'Aschenweg 26 b', postcode: '31553', city: 'Auhagen', latitude: 52.3933282, longitude: 9.2921009 },
  'ssv gristede 1974 e.v.': { street: 'Schulstraße (Sportplatz)', postcode: '26215', city: 'Wiefelstede-Gristede', latitude: 53.2271583, longitude: 8.057455 },
  'sv ahlem von 1908 e.v.': { street: 'Petit-Couronne-Straße 23', postcode: '30453', city: 'Hannover', latitude: 52.379394, longitude: 9.6568443 },
  'sv bad bentheim e.v. von 1894': { street: 'Gutenbergstraße 8', postcode: '48455', city: 'Bad Bentheim', latitude: 52.2956435, longitude: 7.1650258 },
  'sv essel e.v.': { street: 'Bothmerscher Weg 9', postcode: '29690', city: 'Essel', latitude: 52.6921025, longitude: 9.6369241 },
  'sv fuhrberg von 1954 e.v.': { street: 'Kahlsweg 5', postcode: '30938', city: 'Burgwedel', latitude: 52.5697915, longitude: 9.8425648 },
  'sv grenzland laarwald e.v.': { street: 'Riddergoar 1', postcode: '49824', city: 'Laar', latitude: 52.6269733, longitude: 6.7782263 },
  'sv innerstetal e.v.': { street: 'Wasserstraße 1', postcode: '38271', city: 'Baddeckenstedt', latitude: 52.0806907, longitude: 10.234468 },
  'sv manslagt e.v.': { street: 'Am Sportplatz 1', postcode: '26736', city: 'Krummhörn-Manslagt', latitude: 53.4574639, longitude: 7.0716766 },
  'sv niedersachsen von 1912 düshorn e.v.': { street: 'Mühlenstraße 46', postcode: '29664', city: 'Walsrode-Düshorn', latitude: 52.823836, longitude: 9.635188 },
  'sv odin hannover von 1905 e.v.': { street: 'An der Graft 1', postcode: '30167', city: 'Hannover', latitude: 52.3837826, longitude: 9.7014443 },
  'sv suddendorf-samern 1959 e.v.': { street: 'Postweg (Sportplatz)', postcode: '48465', city: 'Schüttorf-Suddendorf', latitude: 52.2991215, longitude: 7.2158914 },
  'sv veldhausen 07 e.v.': { street: 'Zum Sportplatz (Sportpark Veldhausen)', postcode: '49828', city: 'Neuenhaus', latitude: 52.5111295, longitude: 6.9978959 },
  'sv wacker osterwald von 1924 e.v.': { street: 'Robert Koch Str. 71', postcode: '30826', city: 'Garbsen', latitude: 52.4526815, longitude: 9.5800631 },
  'tc altenberge-erika e.v.': { street: 'Tengestraße 32', postcode: '49733', city: 'Haren (Ems)', latitude: 52.8243365, longitude: 7.1387649 },
  'tc oldenburg süd e.v.': { street: 'Klingenbergstraße 193', postcode: '26133', city: 'Oldenburg', latitude: 53.1092821, longitude: 8.2328286 },
  'tennis-club hämelerwald e.v.': { street: 'Am Hainwald 14', postcode: '31275', city: 'Lehrte', latitude: 52.3469288, longitude: 10.1190585 },
  'tennisverein sparta 87 nordhorn e.v.': { street: 'Schulstraße 39', postcode: '48527', city: 'Nordhorn', latitude: 52.4345873, longitude: 7.051129 },
  'tsg echte e.v.': { street: 'In der Trift 15', postcode: '37589', city: 'Kalefeld-Echte', latitude: 51.7871585, longitude: 10.0588878 },
  'tsv buchholz 08 e.v.': { street: 'Seppenser Mühlenweg 44', postcode: '21244', city: 'Buchholz in der Nordheide', latitude: 53.3141686, longitude: 9.8654335 },
  'tsv egestorf e.v.': { street: 'Ammerke 1', postcode: '30890', city: 'Barsinghausen-Egestorf', latitude: 52.2864875, longitude: 9.5102603 },
  'tsv georgsdorf e.v.': { street: 'Finkenstraße 20', postcode: '49828', city: 'Georgsdorf', latitude: 52.566246, longitude: 7.0785734 },
  'tsv halle e.v.': { street: 'Am Sportplatz', postcode: '37620', city: 'Halle (Weserbergland)', latitude: 51.9896737, longitude: 9.5623322 },
  'tsv krankenhagen e.v.': { street: 'Extertalstraße 8', postcode: '31737', city: 'Rinteln', latitude: 52.1513001, longitude: 9.0822343 },
  'tsv rethen e.v.': { street: 'Peiner Str.100', postcode: '30880', city: 'Laatzen', latitude: 52.2933621, longitude: 9.8356969 },
  'tsv stelingen 1926 e.v.': { street: 'Forstweg 10', postcode: '30827', city: 'Garbsen', latitude: 52.4522467, longitude: 9.6295917 },
  'tsv wallhöfen e.v.': { street: 'Am Waldstadion 9a', postcode: '27729', city: 'Vollersode-Wallhöfen', latitude: 53.3232199, longitude: 8.8662042 },
  'turn und rasensportverein bremen e.v.': { street: 'Lissaer Str. 60', postcode: '28237', city: 'Bremen', latitude: 53.1148823, longitude: 8.7734177 },
  'turn- und sportgemeinschaft wettbergen 1909 e.v.': { street: 'Deveser Straße 32', postcode: '30457', city: 'Hannover', latitude: 52.3221186, longitude: 9.7010318 },
  'turn- und sportgemeinschaft wiedensahl von 1906 e.v.': { street: 'Hauptstraße 158', postcode: '31719', city: 'Wiedensahl', latitude: 52.3917977, longitude: 9.1187627 },
  'turn- und sportverein blau weiß adelebsen 1895 e.v.': { street: 'Zum Ahrenskamp', postcode: '37139', city: 'Adelebsen', latitude: 51.5821996, longitude: 9.7422912 },
  'turn- und sportverein kemnade e.v.': { street: 'Fährstr. 21', postcode: '37619', city: 'Bodenwerder', latitude: 51.9838615, longitude: 9.5171489 },
  'turn- und sportverein krähenwinkel/kaltenweide e.v.': { street: 'Sportplatzweg 71', postcode: '30855', city: 'Langenhagen', latitude: 52.4749077, longitude: 9.7526711 },
  'turn- und sportverein neuenhaus von 1907 e.v.': { street: 'Schulstr. 2', postcode: '49828', city: 'Neuenhaus', latitude: 52.4950643, longitude: 6.9642552 },
  'turn- und sportverein warzen e.v.': { street: 'Am Rettberg', postcode: '31061', city: 'Alfeld (Leine)', latitude: 51.9806362, longitude: 9.7932395 },
  'turn-club bissendorf e.v.': { street: 'Am Mühlenberg 16', postcode: '30900', city: 'Wedemark-Bissendorf', latitude: 52.5268729, longitude: 9.7508993 },
  'turngemeinschaft freden e.v.': { street: 'Maschstraße (Sportplatz)', postcode: '31084', city: 'Freden (Leine)', latitude: 51.9331223, longitude: 9.8972418 },
  'turnverein nordhorn von 1894 e.v.': { street: 'Promenadenweg 7', postcode: '48527', city: 'Nordhorn', latitude: 52.4365365, longitude: 7.0592104 },
  'tus hermannsburg e. v.': { street: 'Auteriver Platz', postcode: '29320', city: 'Südheide-Hermannsburg', latitude: 52.8311781, longitude: 10.0941082 },
  'tus nenndorf e.v.': { street: 'Vaenser Grund', postcode: '21224', city: 'Rosengarten-Nenndorf', latitude: 53.3781249, longitude: 9.8950096 },
  'tus von 1862 wunstorf e.v.': { street: 'Rudolf-Harbig-Str. 2', postcode: '31515', city: 'Wunstorf', latitude: 52.4121794, longitude: 9.4323536 },
  'tv badenstedt von 1891 e.v.': { street: 'Salzhemmendorfer Straße 12', postcode: '30455', city: 'Hannover', latitude: 52.3592502, longitude: 9.6746209 },
  'tv grün-weiß goltern e.v.': { street: 'Ohweg 21', postcode: '30890', city: 'Barsinghausen', latitude: 52.3352199, longitude: 9.5092979 },
  'verein für leibesübungen rastede von 1859 e.v.': { street: 'Schlossstraße 33', postcode: '26180', city: 'Rastede', latitude: 53.2422064, longitude: 8.1929859 },
  'verein für rasensport weddel 1910 e.v.': { street: 'Ahornallee 9', postcode: '38162', city: 'Weddel', latitude: 52.2768763, longitude: 10.6283215 },
  'vfb hannover wülfel e.v.': { street: 'Paderbornerstr.7', postcode: '30539', city: 'Hannover', latitude: 52.340237, longitude: 9.8077413 },
  'vfl eintracht hannover von 1848 e.v.': { street: 'Hoppenstedtstr.8', postcode: '30173', city: 'Hannover', latitude: 52.3505042, longitude: 9.760678 },
  'vfl weiße elf 1919 nordhorn e.v.': { street: 'Ootmarsumer Weg 155', postcode: '48527', city: 'Nordhorn', latitude: 52.4258564, longitude: 7.0394446 },
  // Hausnummerngenauer Nominatim-Treffer der NPV-Adresse (Quellkoordinate war Orts-/Stadtteilmitte).
  'boule-club-stadthagen e.v.': { street: 'St. Annen 68', postcode: '31655', city: 'Stadthagen', latitude: 52.3069529, longitude: 9.1898272 },
  'boule-freunde goslar e.v.': { street: 'Bornhardtstr. 16', postcode: '38644', city: 'Goslar', latitude: 51.9220796, longitude: 10.4237142 },
  'die klosterbouler - petanque-club hude e.v.': { street: 'Vielstedter Kirchweg 1a', postcode: '27798', city: 'Hude (Oldenburg)', latitude: 53.1115448, longitude: 8.4467196 },
  'djk eintracht papenburg e.v.': { street: 'Splitting links 198', postcode: '26871', city: 'Papenburg', latitude: 53.0414049, longitude: 7.4678015 },
  'esv fortuna celle e.v.': { street: 'Kampstraße 52', postcode: '29223', city: 'Celle', latitude: 52.6235069, longitude: 10.0629048 },
  'fanny pitboule e.v.': { street: 'Kleestrasse 50', postcode: '30625', city: 'Hannover', latitude: 52.3820767, longitude: 9.7908721 },
  'freie turnerschaft groß-midlum 1985 e.v.': { street: 'Am Burggarten 18', postcode: '26759', city: 'Hinte', latitude: 53.409519, longitude: 7.1583373 },
  'fsg sturmvögel hilten-lemke e.v.': { street: 'Schüürmannsweg 6', postcode: '49828', city: 'Neuenhaus', latitude: 52.5006654, longitude: 6.9444672 },
  'grafschafter petanque+boule sport e.v.': { street: 'Am Sportplatz 2', postcode: '49828', city: 'Lage', latitude: 52.4672259, longitude: 6.9645715 },
  'gymnastikverein reppner e.v.': { street: 'Liebermannstr. 2', postcode: '38228', city: 'Salzgitter', latitude: 52.1496198, longitude: 10.2885443 },
  'hannover stampeders american football club e.v.': { street: 'Sportplatz am Kanal 10', postcode: '30559', city: 'Hannover', latitude: 52.3695916, longitude: 9.8538525 },
  'hsg nordhorn e.v.': { street: 'Resum 58', postcode: '48527', city: 'Nordhorn', latitude: 52.4572207, longitude: 7.0179477 },
  'lehrter pètanque/boule gruppe e.v.': { street: 'Everner Straße 38', postcode: '31275', city: 'Lehrte', latitude: 52.3675765, longitude: 9.9943167 },
  'luhdener sport verein e.v.': { street: 'Harrlallee 2 (Kurpark, Konzertmuschel)', postcode: '31707', city: 'Bad Eilsen', latitude: 52.2412976, longitude: 9.1004656 },
  'magni bouler braunschweig e.v.': { street: 'Madamenweg 70', postcode: '38120', city: 'Braunschweig', latitude: 52.2597286, longitude: 10.4860048 },
  'mtv 1862 e.v. vorsfelde': { street: 'Carl-Grete-Straße 41', postcode: '38448', city: 'Wolfsburg', latitude: 52.444549, longitude: 10.8285594 },
  'mtv luhdorf-roydorf e.v.': { street: 'Höllenberg 2', postcode: '21423', city: 'Winsen (Luhe)', latitude: 53.3273107, longitude: 10.2014013 },
  'polizeisportverein braunschweig e.v.': { street: 'Georg-Westermann-Allee 36', postcode: '38104', city: 'Braunschweig', latitude: 52.2645994, longitude: 10.5614855 },
  'sc osterbrock e.v.': { street: 'Gutshof 30', postcode: '49744', city: 'Geeste-Osterbrock', latitude: 52.6113596, longitude: 7.3136536 },
  'sg findorff e.v. bremen': { street: 'Franz-Böhmert-Straße 1c (Bürgerplatz)', postcode: '28205', city: 'Bremen', latitude: 53.0670511, longitude: 8.8388807 },
  'spiel-und sportclub grasdorf 94 e.v.': { street: 'Goldammerweg 17', postcode: '49828', city: 'Neuenhaus', latitude: 52.4866882, longitude: 6.9798902 },
  'sportgemeinschaft adenstedt von 1894 e.v.': { street: 'Bültener Str. 16', postcode: '31246', city: 'Ilsede', latitude: 52.2584056, longitude: 10.1726438 },
  'ssv ohne e.v.': { street: 'Dorf 4', postcode: '48465', city: 'Ohne', latitude: 52.2723807, longitude: 7.2799409 },
  'ssv quendorf 1998 e.v.': { street: 'Laudiek 7', postcode: '48465', city: 'Isterberg', latitude: 52.3461915, longitude: 7.1626628 },
  'sv eintracht nordhorn e.v.': { street: 'Heideweg 18', postcode: '48529', city: 'Nordhorn', latitude: 52.4179379, longitude: 7.0778134 },
  'sv falke rosenthal e.v.': { street: 'Pechschwarte 56', postcode: '31226', city: 'Peine', latitude: 52.3028903, longitude: 10.1617052 },
  'sv fortuna fresenburg e.v.': { street: 'Schützenweg 1', postcode: '49762', city: 'Fresenburg', latitude: 52.8935672, longitude: 7.3005511 },
  'sv hattendorf e.v.': { street: 'Langenfelderstraße 47', postcode: '31749', city: 'Hattendorf', latitude: 52.2313594, longitude: 9.2795905 },
  'sv olympia uelsen e.v. 1909': { street: 'Zum Waldbad 8', postcode: '49843', city: 'Uelsen', latitude: 52.4857913, longitude: 6.8878107 },
  'tsv horst von 1910 e.v.': { street: 'Scharnhorststr. 2', postcode: '30826', city: 'Garbsen', latitude: 52.4394337, longitude: 9.5444799 },
  'tsv sibbesse e.v.': { street: 'Steinberg 9', postcode: '31079', city: 'Sibbesse', latitude: 52.0560809, longitude: 9.9303413 },
  'tura von 1865 braunschweig e.v.': { street: 'Bienroder Weg 51', postcode: '38112', city: 'Braunschweig', latitude: 52.2933817, longitude: 10.5386321 },
  'turn- und sportklub von 1900 empelde e.v.': { street: 'Am Sportpark (Sportpark Empelde)', postcode: '30952', city: 'Ronnenberg', latitude: 52.338733, longitude: 9.6739177 },
  'turn- und sportverein engter e.v.': { street: 'Engter Kirchweg 25', postcode: '49565', city: 'Bramsche', latitude: 52.3859228, longitude: 8.0489132 },
  'turn- und sportvereinigung burgdorf e.v.': { street: 'Im langen Mühlenfeld 9', postcode: '31303', city: 'Burgdorf', latitude: 52.4502914, longitude: 10.0155682 },
  'turnerschaft wienhausen von 1910 e.v.': { street: 'Pommernweg 7', postcode: '29342', city: 'Wienhausen', latitude: 52.5771038, longitude: 10.1826785 },
  'tus eintracht hinte 1910 e.v.': { street: 'Mittelstr. 1', postcode: '26759', city: 'Hinte', latitude: 53.4194451, longitude: 7.1863945 },
  'tus gildehaus 1906 e.v.': { street: 'Hengeloer Straße 8', postcode: '48455', city: 'Bad Bentheim', latitude: 52.2951366, longitude: 7.106814 },
  'tus ricklingen von 1896 e.v.': { street: 'Meisenwinkel 9', postcode: '30459', city: 'Hannover', latitude: 52.3378649, longitude: 9.7262372 },
  'verein für rasensport hehlen von 1929 e.v.': { street: 'Schäferbrink 18', postcode: '37619', city: 'Hehlen', latitude: 51.9820815, longitude: 9.4723291 },
  'vfb lingen 1958 e.v.': { street: 'Grenzweg 22', postcode: '49811', city: 'Lingen (Ems)', latitude: 52.546007, longitude: 7.3631441 },
  'wilde-boule, pétanque club wildeshausen e.v.': { street: 'Krandel, Parkplatz Glaner Straße 4', postcode: '27793', city: 'Wildeshausen', latitude: 52.8985211, longitude: 8.4256342 },
  // Einzeln geprüft (Vereinswebsite, Reverse-Geokodierung).
  'fsb hildesheim e.v.': { street: 'Rottsberg 1 (Sportpark, Zufahrt Triftstraße)', postcode: '31139', city: 'Hildesheim', latitude: 52.143512, longitude: 9.9048418 },
  'ftsv „jahn“ brinkum e.v.': { street: 'Jahnstraße 24', postcode: '28816', city: 'Stuhr', latitude: 53.0144123, longitude: 8.7919101 },
  'pétanque-club „jadeboule“ varel e.v.': { street: 'Windallee (ehemalige Weberei)', postcode: '26316', city: 'Varel', latitude: 53.391751, longitude: 8.1339202 },
  'sc union emlichheim e.v.': { street: 'Am Kanal (Sportplatz)', postcode: '49824', city: 'Emlichheim', latitude: 52.618442, longitude: 6.8445396 },
  'sv rasensport lathen e.v.': { street: 'Zur Waage (am Tennisplatz)', postcode: '49762', city: 'Lathen', latitude: 52.8593348, longitude: 7.3221487 },
  'tsv eintracht dungelbeck von 1893 e.v.': { street: 'Dachwiesen 4a', postcode: '31226', city: 'Peine', latitude: 52.2906885, longitude: 10.2651172 },
  'turn- und sportverein ottersberg e.v.': { street: 'Fährwisch (Sportplatz)', postcode: '28870', city: 'Ottersberg', latitude: 53.1063222, longitude: 9.137864 },
  'tus ebstorf von 1866 e.v.': { street: 'Am Winkelplatz', postcode: '29574', city: 'Ebstorf', latitude: 53.0293238, longitude: 10.4155136 },
  // Quellkoordinate genau (Reverse-Geokodierung: Sportplatz).
  'sv lindwedel-hope e.v.': { street: 'Hoper Straße 12 (hinter dem Sportheim)', postcode: '29690', city: 'Lindwedel', latitude: 52.6143586, longitude: 9.6715311 },
  'tennisverein rot-gold sögel e.v.': { street: 'Rothenbacher Weg 3', postcode: '49751', city: 'Sögel', latitude: 52.849998, longitude: 7.5167 },
  // Nur Straße bekannt: Nominatim-Straßentreffer.
  'boule club altenhagen ii e.v.': { street: 'Im Unterdorf', postcode: '31867', city: 'Messenkamp-Altenhagen II', latitude: 52.2637884, longitude: 9.3947939 },
  'boulefreunde rinteln e. v.': { street: 'Dankerser Straße', postcode: '31737', city: 'Rinteln', latitude: 52.1928138, longitude: 9.077459 },
  'fc oldersum e.v. von 1929': { street: 'Kreuzweg 9', postcode: '26802', city: 'Oldersum', latitude: 53.342121, longitude: 7.3339245 },
  'mtv tostedt von 1878 e.v.': { street: 'Schützenstraße 55', postcode: '21255', city: 'Tostedt', latitude: 53.2742331, longitude: 9.7099019 },
  'pétanque club emden „darteihn liggt“ e.v.': { street: 'Gorch-Fock-Straße 30', postcode: '26721', city: 'Emden', latitude: 53.3856075, longitude: 7.2246216 },
  'rugby ricklingen e.v.': { street: 'Horst-Schweimler-Weg 5', postcode: '30459', city: 'Hannover', latitude: 52.3448657, longitude: 9.732668 },
  'sg kirchwehren lathwehren e.v.': { street: 'An der Schweineweide 1', postcode: '30926', city: 'Seelze-Kirchwehren', latitude: 52.3704676, longitude: 9.561608 },
  'sportverein „grün-weiß“ hodenhagen von 1921 e.v.': { street: 'Am Sportplatz 1', postcode: '29693', city: 'Hodenhagen', latitude: 52.7506171, longitude: 9.5973758 },
  'sv wymeer-boen e.v.': { street: 'Hooge Land 4', postcode: '26831', city: 'Wymeer', latitude: 53.1296688, longitude: 7.2102005 },
  'tsv kirchdorf e.v.': { street: 'Max Planck Str. 4', postcode: '30890', city: 'Barsinghausen', latitude: 52.2885459, longitude: 9.4804387 },
  'turn- und sportverein hollern-twielenfleth e.v.': { street: 'Bassenfleth 20a', postcode: '21723', city: 'Hollern-Twielenfleth', latitude: 53.6148117, longitude: 9.5272292 },
  'turnverein greetsiel von 1925': { street: 'Okko-tom-Brook-Strasse 1', postcode: '26736', city: 'Krummhörn-Greetsiel', latitude: 53.5008555, longitude: 7.1050474 },
  'tus varrel e.v.': { street: 'Mühlenweg 5', postcode: '28816', city: 'Stuhr', latitude: 53.0271165, longitude: 8.6995834 },
  'vfl westercelle e.v.': { street: 'Steinbecksweg 1', postcode: '29223', city: 'Celle', latitude: 52.6406348, longitude: 10.0384544 },
};

const args = new Set(process.argv.slice(2));
const target = args.has('--remote') ? '--remote' : args.has('--local') ? '--local' : null;
if (!target) {
  console.error('Bitte --local oder --remote angeben.');
  process.exit(1);
}

function query(sql) {
  const output = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--json', '--command', sql], { encoding: 'utf8' });
  return JSON.parse(output)[0].results;
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const multiline = (value) => String(value ?? '').split('\n').map(clean).filter(Boolean).join('\n');
const key = (name) => clean(name).toLowerCase();
const quote = (value) => (value === null || value === undefined || value === '' ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);

function url(value) {
  // „https//host“ (fehlender Doppelpunkt) reparieren.
  const raw = clean(value).replace(/^(https?)\/\//i, '$1://');
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host in WEBSITE_FIXES) return WEBSITE_FIXES[host];
    return ['http:', 'https:'].includes(parsed.protocol) && host.includes('.') ? parsed.href : null;
  } catch { return null; }
}

function placeDescription(entry) {
  const parts = [multiline(entry.about)].filter(Boolean);
  if (clean(entry.Trainingszeiten)) parts.push(`Trainingszeiten: ${multiline(entry.Trainingszeiten)}`);
  return parts.join('\n\n') || null;
}

const response = await fetch(VEREINE_URL);
if (!response.ok) throw new Error(`${VEREINE_URL}: HTTP ${response.status}`);
const entries = JSON.parse((await response.text()).replace(/^﻿/, ''));
if (entries.length < 100) throw new Error(`Vereinskarte unvollständig (${entries.length} Einträge) – Datenaufbau geändert?`);
const clubs = entries.filter((entry) => !EXCLUDED.has(key(entry.name)));
const unchecked = clubs.filter((entry) => !PLACES[key(entry.name)]).map((entry) => clean(entry.name));
if (unchecked.length) throw new Error(`Neue Vereine ohne geprüften Spielort (PLACES ergänzen): ${unchecked.join('; ')}`);

const [owner] = query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
if (!owner) throw new Error('Kein Admin-Konto als Owner gefunden.');
// In JS normalisieren: SQLites lower() lässt Umlaute wie Ö groß.
const existing = new Set(query('SELECT name FROM clubs').map((row) => key(row.name)));

const status = args.has('--publish') ? 'published' : 'pending';
const now = new Date().toISOString();
const statements = [];
const skipped = [];
const checklist = [];
let placeCount = 0;

for (const entry of clubs) {
  const name = clean(entry.name);
  if (existing.has(key(name))) {
    skipped.push(name);
    continue;
  }
  const clubId = crypto.randomUUID();
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(name)}, 'club', ${quote(multiline(entry.Beschreibung))}, ${quote(url(entry.Homepage))}, NULL, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, ${quote(clean(entry.email))}, NULL, ${quote(status)}, ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );

  const { street, postcode, city, latitude, longitude } = PLACES[key(name)];
  const address = [street, [postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  checklist.push([name, address, latitude, longitude].join(' | '));
  // Vereinsplätze nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
  statements.push(
    'INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, address_unverified, created_at, updated_at) '
    + `SELECT ${quote(crypto.randomUUID())}, ${quote(clubId)}, NULL, ${quote(name)}, ${quote(address)}, ${latitude}, ${longitude}, 'outdoor', 0, ${quote(placeDescription(entry))}, 0, '[]', ${quote(status)}, NULL, 1, ${quote(now)}, ${quote(now)} `
    + `WHERE EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)}) AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(name)})) AND lower(trim(address)) = lower(trim(${quote(address)})) AND venue_type = 'outdoor');`,
  );
  placeCount += 1;
}

console.log(`${entries.length} Karteneinträge, ${clubs.length} Vereine: ${clubs.length - skipped.length} neu, ${placeCount} Plätze, ${skipped.length} übersprungen, ${EXCLUDED.size} zurückgestellt.`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);
if (args.has('--checklist')) console.log(checklist.join('\n'));

const file = join(mkdtempSync(join(tmpdir(), 'ptm-npv-clubs-')), 'import.sql');
writeFileSync(file, `${statements.join('\n')}\n`);
console.log(`SQL: ${file}`);
console.log(statements.slice(0, 2).join('\n'));

if (args.has('--apply')) {
  const counts = () => query("SELECT (SELECT COUNT(*) FROM clubs) AS clubs, (SELECT COUNT(*) FROM boule_places) AS places, (SELECT COUNT(*) FROM tournaments) AS tournaments")[0];
  const before = counts();
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--yes', '--file', file], { stdio: 'inherit' });
  const after = counts();
  console.log(`Vorher: ${JSON.stringify(before)}`);
  console.log(`Nachher: ${JSON.stringify(after)}`);
  if (after.tournaments !== before.tournaments) process.exit(1);
}
