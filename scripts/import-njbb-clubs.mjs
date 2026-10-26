// Importiert die Mitgliedsvereine des Nederlandse Jeu de Boules Bond (NJBB) als Organisationen. Quelle: njbb.nl/verenigingen
// bettet eine Google-My-Maps-Karte ein (KML_URL), Ordner „Verenigingen“: je Verein Ver.nr, Spielortadresse, Postcode, Stad,
// Website – aber keine Koordinaten. PLACES enthält darum je Ver.nr den geprüften Spielort (Stand 2026-10-26): Adresse per
// PDOK-Locatieserver geocodiert und per BAG-Nutzungszweck geprüft; wo die BAG eine Wohnung meldet, Spielort von der
// Vereinswebsite bzw. OSM-Platz mit Vereinsnamen, sonst null (Verein ohne Platz). hall = an der Adresse liegt ein Boule-
// bzw. Sportgebäude (BAG-Sportnutzung ab 400 m², OSM-Gebäude mit sport=boules oder laut Website) → zusätzlich Indoor-Platz.
// Vereine werden mit Owner = Admin und Status 'pending' angelegt, mit --publish gleich freigegeben (wie die Admin-Freigabe).
//
//   node scripts/import-njbb-clubs.mjs --local                       # SQL erzeugen und anzeigen
//   node scripts/import-njbb-clubs.mjs --local --apply               # zusätzlich ausführen
//   node scripts/import-njbb-clubs.mjs --remote --apply --publish    # Produktion, gleich freigegeben
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KML_URL = 'https://www.google.com/maps/d/kml?mid=1ymUsigybKxf8VTMCCA_adD8BXlfSKeg&forcekml=1';
const MEMBER_OF = ['Nederlandse Jeu de Boules Bond'];
// Tote (DNS/404) oder fremd gewordene Vereinsseiten (geprüft 2026-10-26), nach Hostname.
const BAD_WEBSITES = new Set([
  'jdbcoevorden.nl', 'boulesdoar.nl', 'karrodeux.nl', 'jbcz.nl', 'petanqueclubeindhoven.nl', 'dommelsboeleke.nl',
  'lechateau-wijchen.nl', 'jeudeboules-stiphout.eu', 'jbvhelmond2010.nl', 'jbctreech42.nl', 'cdpheerlen', 'jbcamby.punt.nl',
  'members.home.nl', 'vopudenhout.nl', 'boulendeschaep.nl', 'psvlesprit.nl', 'pub-badhoevedorp.nl', 'jeudeboules-zandvoort.nl',
  'lesbohemiensdepetanque.co.nr', 'boelskik.webklik.nl', 'ketsup.nl',
]);
// Geprüfter Spielort je Ver.nr; null = Verein ohne Platz (BAG meldet Wohnung, Website nennt keinen Spielort).
const PLACES = {
  '1001': { street: 'Paviljoenlaan 5', postcode: '9727 KE', city: 'Groningen', latitude: 53.200222, longitude: 6.5440341 },
  '1002': { street: 'Julianapark Hobbemastraat', postcode: '8932 LE', city: 'Leeuwarden', latitude: 53.1893654, longitude: 5.7893928 },
  '1003': { street: 'Sportlaan', postcode: '9203 NV', city: 'Drachten', latitude: 53.0951735, longitude: 6.0890598 },
  '1004': { street: 'Gagelsweg 27', postcode: '8331 CM', city: 'Steenwijk', latitude: 52.7887645, longitude: 6.1296315, hall: true },
  '1005': { street: 'Ullevi 20', postcode: '7825 SE', city: 'Emmen', latitude: 52.7760528, longitude: 6.9462413 },
  '1006': { street: 'Jetting 5', postcode: '8862 AK', city: 'Harlingen', latitude: 53.1614875, longitude: 5.4317047 },
  '1007': { street: 'J.W. Frisostraat 114', postcode: '8606 XH', city: 'Sneek', latitude: 53.0252498, longitude: 5.6685509 },
  '1008': { street: 'De Boshoek', postcode: '7771 RH', city: 'Hardenberg', latitude: 52.5685527, longitude: 6.5889948 },
  '1009': { street: 'Rode Heklaan 7', postcode: '9401 SB', city: 'Assen', latitude: 52.9915418, longitude: 6.5477698 },
  '1010': { street: 'Nordhornerstraat 25', postcode: '7742 VZ', city: 'Coevorden', latitude: 52.6577303, longitude: 6.7488172 },
  '1011': { street: 'Flevostraat', postcode: '8531 KP', city: 'Lemmer', latitude: 52.8474194, longitude: 5.7079414 },
  '1013': { street: 'De Kampen 20', postcode: '7761 CK', city: 'Schoonebeek', latitude: 52.6602626, longitude: 6.8936479, hall: true },
  '1014': { street: 'Oosterboerweg 35b', postcode: '7943 KE', city: 'Meppel', latitude: 52.7009483, longitude: 6.2390629 },
  '1015': { street: 'Blaauwhoflaan', postcode: '8501 EM', city: 'Joure', latitude: 52.9627389, longitude: 5.7889652 },
  '1016': { street: 'Middenweg 11 c', postcode: '8381 XM', city: 'Vledder', latitude: 52.8614556, longitude: 6.1983578 },
  '1017': null, // JBV De Blêde Boulers
  '1019': null, // JdB Vereniging Boules Doar
  '1021': { street: 'Sportlaan 87A (Tennispark ATC Emelwerth)', postcode: '8302 AX', city: 'Emmeloord', latitude: 52.7176902, longitude: 5.7615747 },
  '2001': { street: 'Bredenhorst 189', postcode: '7414 HE', city: 'Deventer', latitude: 52.2790539, longitude: 6.1469916, hall: true },
  '2002': { street: 'Adelaarshoek 22', postcode: '8051 GR', city: 'Hattem', latitude: 52.4733986, longitude: 6.0702831, hall: true },
  '2004': { street: 'Badweg 24', postcode: '7604 PN', city: 'Almelo', latitude: 52.3579783, longitude: 6.6179906 },
  '2005': { street: 'Roessinghsbleekweg 30B', postcode: '7522 AJ', city: 'Enschede', latitude: 52.2292408, longitude: 6.880441 },
  '2006': { street: 'Adm. Helfrichlaan 101', postcode: '6952 GD', city: 'Dieren', latitude: 52.0543992, longitude: 6.0820676 },
  '2007': { street: 'Hengelder 7', postcode: '6902 PA', city: 'Zevenaar', latitude: 51.9280893, longitude: 6.0954651, hall: true },
  '2008': { street: 'Vondellaan 14', postcode: '7576 AC', city: 'Oldenzaal', latitude: 52.3123198, longitude: 6.9116164 },
  '2010': { street: 'Lochemseweg 35', postcode: '7244 RR', city: 'Lochem', latitude: 52.1375827, longitude: 6.4246171 },
  '2011': { street: 'Landdrostlaan 44', postcode: '7327 GM', city: 'Apeldoorn', latitude: 52.1842799, longitude: 6.0029478 },
  '2012': { street: 'Stokhorstweg 9', postcode: '7006 GA', city: 'Doetinchem', latitude: 51.9654719, longitude: 6.2766556, hall: true },
  '2013': { street: 'Leenhofweg 27', postcode: '8161 ZM', city: 'Epe', latitude: 52.3371773, longitude: 5.9911499 },
  '2014': { street: 'Hyacinthstraat 68A', postcode: '8013 XZ', city: 'Zwolle', latitude: 52.5017245, longitude: 6.1195943 },
  '2015': { street: 'Hazenberg 22C', postcode: '6971 LC', city: 'Brummen', latitude: 52.0952548, longitude: 6.1457419 },
  '2016': { street: 'Horsterpark / Westsingel', postcode: '6921 RX', city: 'Duiven', latitude: 51.9540571, longitude: 6.0045519 },
  '2017': { street: 'Schoonbroeksweg 5', postcode: '7323 AN', city: 'Apeldoorn', latitude: 52.235939, longitude: 5.9786921, hall: true },
  '2018': { street: 'Eijerdijk', postcode: '8051 MR', city: 'Hattem', latitude: 52.4732314, longitude: 6.0635266 },
  '2019': { street: 'Nijverheidsweg 1 a', postcode: '8084 GV', city: '\'t Harde', latitude: 52.419057, longitude: 5.8748777 },
  '2020': { street: 'Gildepad 3', postcode: '7038 CL', city: 'Zeddam', latitude: 51.9044279, longitude: 6.2525382 },
  '3001': { street: 'Polderdijk 10A', postcode: '5534 AB', city: 'Netersel', latitude: 51.3995535, longitude: 5.2095585 },
  '3002': { street: 'Goffertweg 20 A', postcode: '6532 AA', city: 'Nijmegen', latitude: 51.8295026, longitude: 5.8384167, hall: true },
  '3003': { street: 'Sportlaan 3', postcode: '5404 NM', city: 'Uden', latitude: 51.6537428, longitude: 5.6305938 },
  '3004': { street: 'Zegenwerp 1 C', postcode: '5271 NC', city: 'Sint-Michielsgestel', latitude: 51.6357689, longitude: 5.3490148 },
  '3005': { street: 'Speulpark 1', postcode: '5801 HR', city: 'Venray', latitude: 51.5251734, longitude: 5.9596199, hall: true },
  '3007': { street: 'Vijfkamplaan 12', postcode: '5624 EB', city: 'Eindhoven', latitude: 51.4764717, longitude: 5.4576382, hall: true },
  '3008': { street: 'Macharenseweg 20', postcode: '5346 JM', city: 'Oss', latitude: 51.7797632, longitude: 5.5289096 },
  '3009': { street: 'van Heemstraweg-West 31', postcode: '5301 PZ', city: 'Zaltbommel', latitude: 51.7979469, longitude: 5.2356 },
  '3010': { street: 'Ambachtsweg 5', postcode: '5683 CD', city: 'Best', latitude: 51.5026806, longitude: 5.4018084 },
  '3011': { street: 'Mater Lemmensstraat 27', postcode: '5492 BJ', city: 'Sint-Oedenrode', latitude: 51.560231, longitude: 5.4562759, hall: true },
  '3012': { street: 'Linze 11', postcode: '5667 AH', city: 'Geldrop', latitude: 51.4303918, longitude: 5.5578491 },
  '3013': { street: 'Leemputtenweg 3', postcode: '5482 ZZ', city: 'Schijndel', latitude: 51.635114, longitude: 5.4254364, hall: true },
  '3014': { street: 'Galberg 4', postcode: '5431 KZ', city: 'Cuijk', latitude: 51.7431991, longitude: 5.8719745 },
  '3015': { street: 'Selissenwal 25', postcode: '5282 SJ', city: 'Boxtel', latitude: 51.599278, longitude: 5.3138234, hall: true },
  '3016': null, // PC Dommels Boeleke
  '3017': { street: 'Sportlaan 25', postcode: '5421 SK', city: 'Gemert', latitude: 51.5614118, longitude: 5.6957581 },
  '3018': { street: 'Braakse Bosdijk 5', postcode: '5703 HZ', city: 'Helmond', latitude: 51.4864306, longitude: 5.6755974, hall: true },
  '3020': { street: 'Weivelden 1', postcode: '5721 WD', city: 'Asten', latitude: 51.401997, longitude: 5.7307615 },
  '3021': { street: 'Bernhardstraat 74', postcode: '5427 AN', city: 'Boekel', latitude: 51.6044837, longitude: 5.6782132, hall: true },
  '3022': { street: 'Groenstraat 14 C', postcode: '5258 TH', city: 'Berlicum', latitude: 51.6714398, longitude: 5.4137905, hall: true },
  '3024': { street: 'Kampstuk 23b (ehem. Gemeentewerf)', postcode: '6852 AC', city: 'Huissen', latitude: 51.9368156, longitude: 5.9286043 },
  '3025': { street: 'Alde Weteringweg 3', postcode: '6573 AZ', city: 'Beek', latitude: 51.8283549, longitude: 5.9403283 },
  '3027': { street: 'Hoge Weiden 18', postcode: '5324 JC', city: 'Ammerzoden', latitude: 51.7519653, longitude: 5.2188175 },
  '3029': { street: 'Veenseweg 17', postcode: '6603 AN', city: 'Wijchen', latitude: 51.8059602, longitude: 5.7527731, hall: true },
  '3030': { street: 'Gasthuisstraat 1', postcode: '5708 HG', city: 'Helmond', latitude: 51.4865828, longitude: 5.6145926 },
  '3032': { street: 'Lovinckplein 1', postcode: '5813 CC', city: 'Ysselsteyn', latitude: 51.4905119, longitude: 5.8954411 },
  '3033': null, // Jbv Helmond2010
  '3035': { street: 'De Fuik 10', postcode: '5223 KT', city: '\'s-Hertogenbosch', latitude: 51.6936227, longitude: 5.27815, hall: true },
  '4001': { street: 'Hoge Kanaaldijk 70', postcode: '6212 XS', city: 'Maastricht', latitude: 50.833864, longitude: 5.6961255 },
  '4002': { street: 'Sportcentrumlaan 32', postcode: '6136 KX', city: 'Sittard', latitude: 51.0109315, longitude: 5.8756221, hall: true },
  '4003': { street: 'Graanmarkt', postcode: '6211 HG', city: 'Maastricht', latitude: 50.8470974, longitude: 5.6943369 },
  '4004': { street: 'Varenbeukerweg 44', postcode: '6414 NK', city: 'Heerlen', latitude: 50.9236141, longitude: 5.9593022 },
  '4006': { street: 'Hertog van Brabantlaan', postcode: '6223 CG', city: 'Maastricht', latitude: 50.8798726, longitude: 5.6870087 },
  '4008': { street: 'Discusworp 4', postcode: '6225 XP', city: 'Maastricht', latitude: 50.8582844, longitude: 5.7216727, hall: true },
  '4009': { street: 'Platijkweg 2', postcode: '6171 XA', city: 'Stein', latitude: 50.963338, longitude: 5.777383, hall: true },
  '4010': { street: 'Severenstraat 201', postcode: '6225 DA', city: 'Maastricht', latitude: 50.8612996, longitude: 5.7223792, hall: true },
  '5001': { street: 'Deken Batenburgstraat 2c', postcode: '5104 CR', city: 'Dongen', latitude: 51.6197132, longitude: 4.9523329 },
  '5002': { street: 'Koudekerkseweg 139', postcode: '4335 SM', city: 'Middelburg', latitude: 51.4902221, longitude: 3.5956877 },
  '5003': { street: 'Buijenstraat 14', postcode: '4705 RD', city: 'Roosendaal', latitude: 51.5505278, longitude: 4.4786566, hall: true },
  '5004': { street: 'Charlotte Cuypersdreef 1', postcode: '4834 SR', city: 'Breda', latitude: 51.5591814, longitude: 4.8020877 },
  '5005': { street: 'Gershwinstraat 22', postcode: '5012 AR', city: 'Tilburg', latitude: 51.5767063, longitude: 5.1016348 },
  '5006': { street: 'Beukenlaan 16a', postcode: '4624 AE', city: 'Bergen op Zoom', latitude: 51.4832982, longitude: 4.3057477 },
  '5007': { street: 'Kattendijksedijk 23', postcode: '4463 AL', city: 'Goes', latitude: 51.5125781, longitude: 3.8979782 },
  '5009': { street: 'Nieuwe Inslag 89', postcode: '4817 GN', city: 'Breda', latitude: 51.5842218, longitude: 4.8091163, hall: true },
  '5010': { street: 'Moergestelseweg 32d', postcode: '5062 JW', city: 'Oisterwijk', latitude: 51.5736345, longitude: 5.1797555, hall: true },
  '5011': { street: 'Gershwinstraat 16', postcode: '5012 AR', city: 'Tilburg', latitude: 51.5763366, longitude: 5.1014406 },
  '5012': { street: 'Pagnevaartweg 82b', postcode: '4731 AE', city: 'Oudenbosch', latitude: 51.5852117, longitude: 4.5418527 },
  '5014': { street: 'Julianalaan 3c', postcode: '5161 BA', city: 'Sprang-Capelle', latitude: 51.6744677, longitude: 5.0101446 },
  '5015': { street: 'Sportlaan 15e', postcode: '5071 CB', city: 'Udenhout', latitude: 51.6028545, longitude: 5.1446576 },
  '5016': { street: 'Klokkenlaan 31', postcode: '5175 NV', city: 'Loon op Zand', latitude: 51.6208184, longitude: 5.0728556 },
  '5017': { street: 'Griendweg', postcode: '5254 CR', city: 'Sleeuwijk', latitude: 51.8146649, longitude: 4.9552095 },
  '5018': { street: 'Meidoornstraat 5', postcode: '4941 KX', city: 'Raamsdonksveer', latitude: 51.6967685, longitude: 4.88137, hall: true },
  '6001': { street: 'Sportring 10', postcode: '2616 LK', city: 'Delft', latitude: 52.0289863, longitude: 4.3724145, hall: true },
  '6002': { street: 'Dr.J.W. Paltelaan 105', postcode: '2712 PT', city: 'Zoetermeer', latitude: 52.0484304, longitude: 4.4904716 },
  '6003': { street: 'Hengelolaan 1061', postcode: '2544 GH', city: 'Den Haag', latitude: 52.0401946, longitude: 4.2536429, hall: true },
  '6004': { street: 'Molenweg 21', postcode: '1182 CK', city: 'Amstelveen', latitude: 52.3076036, longitude: 4.8483741 },
  '6005': { street: 'Middelweg 16', postcode: '3312 AL', city: 'Dordrecht', latitude: 51.8124705, longitude: 4.7026649 },
  '6006': { street: 'Lupinepad 1', postcode: '2285 LL', city: 'Rijswijk', latitude: 52.0369794, longitude: 4.2980346 },
  '6007': { street: 'Van Alkemadelaan 16', postcode: '2171 DH', city: 'Sassenheim', latitude: 52.2173898, longitude: 4.5185968, hall: true },
  '6008': { street: 'Stadhouderslaan 119', postcode: '3116 HM', city: 'Schiedam', latitude: 51.9091998, longitude: 4.3897444 },
  '6009': { street: 'Bar vd Oyeln 39', postcode: '2252 EA', city: 'Voorschoten', latitude: 52.1223096, longitude: 4.4372413 },
  '6010': { street: 'Fluitpolderplein', postcode: '2262 ED', city: 'Leidschendam', latitude: 52.0938143, longitude: 4.3929635 },
  '6012': { street: 'Snelliuslaan 37', postcode: '1171 CZ', city: 'Badhoevedorp', latitude: 52.3417775, longitude: 4.7722723 },
  '6013': { street: 'Olympiaweg 2b', postcode: '2406 LG', city: 'Alphen aan den Rijn', latitude: 52.1269439, longitude: 4.6744783, hall: true },
  '6014': { street: 'Harwichweg 25', postcode: '3151 BP', city: 'Hoek van Holland', latitude: 51.9831022, longitude: 4.1308136, hall: true },
  '6015': { street: 'Watersportweg 7', postcode: '3138 HD', city: 'Vlaardingen', latitude: 51.9206975, longitude: 4.3370882, hall: true },
  '6017': { street: 'Hazelaarweg 38', postcode: '3053 PM', city: 'Rotterdam', latitude: 51.9663438, longitude: 4.4793217 },
  '6018': { street: 'Uiterwaardseweg 4', postcode: '2807 CD', city: 'Gouda', latitude: 52.0038148, longitude: 4.7452835 },
  '6019': { street: 'Sportlaan 7', postcode: '2641 AZ', city: 'Pijnacker', latitude: 52.0234087, longitude: 4.4146876, hall: true },
  '6020': { street: 'Alberdingk Thymlaan 2a', postcode: '2741 AA', city: 'Waddinxveen', latitude: 52.0582877, longitude: 4.6494023 },
  '6021': { street: 'Vuurlijn 24', postcode: '1424 NR', city: 'De Kwakel', latitude: 52.2425388, longitude: 4.8006629 },
  '6023': { street: 'Sportpark Dorrestein 1', postcode: '2912 BC', city: 'Nieuwerkerk aan den IJssel', latitude: 51.9659347, longitude: 4.6076415 },
  '6024': { street: 'v.d.Marckstraat 19a', postcode: '2352 RA', city: 'Leiderdorp', latitude: 52.1607567, longitude: 4.5202845 },
  '6025': { street: 'Gerard Doustraat 52', postcode: '2162 CP', city: 'Lisse', latitude: 52.2452337, longitude: 4.5631612, hall: true },
  '6026': { street: 'Bataafsekade 4A', postcode: '4204 AX', city: 'Gorinchem', latitude: 51.8399472, longitude: 4.9447569 },
  '6027': { street: 'Dr. Albert Schweitzerdreef 473', postcode: '3146 TA', city: 'Maassluis', latitude: 51.9422449, longitude: 4.2249596 },
  '6029': { street: 'Heidekruid 5', postcode: '3068 RT', city: 'Rotterdam', latitude: 51.9566246, longitude: 4.5603602 },
  '6030': null, // JBV Nederlek
  '6031': { street: 'Schipholweg 649', postcode: '1175 KR', city: 'Lijnden', latitude: 52.3474181, longitude: 4.7498461 },
  '6032': { street: 'Sportpad 4', postcode: '2371 PP', city: 'Roelofarendsveen', latitude: 52.2078076, longitude: 4.6359845, hall: true },
  '6033': { street: 'Wikkestraat 45', postcode: '2153 CD', city: 'Nieuw-Vennep', latitude: 52.2596194, longitude: 4.6362311, hall: true },
  '6034': { street: 'Van den Endelaan', postcode: '2181 EK', city: 'Hillegom', latitude: 52.2940825, longitude: 4.578605 },
  '6035': { street: 'Groene Zoom 6', postcode: '2411 SL', city: 'Bodegraven', latitude: 52.0758056, longitude: 4.7409279, hall: true },
  '6036': { street: 'van Leeuwenhoekstraat 40', postcode: '2693 BG', city: '\'s-Gravenzande', latitude: 51.993532, longitude: 4.1784197 },
  '6037': { street: 'Thomsonstraat 3', postcode: '2041 TA', city: 'Zandvoort', latitude: 52.3804115, longitude: 4.5480831 },
  '7001': { street: 'Museumplein', postcode: '1071 DJ', city: 'Amsterdam', latitude: 52.3573507, longitude: 4.8827601 },
  '7003': { street: 'v.d. Aartweg 31', postcode: '2026 ZM', city: 'Haarlem', latitude: 52.4259463, longitude: 4.6503822 },
  '7004': { street: 'Castricummerweg 12', postcode: '1911 GA', city: 'Uitgeest', latitude: 52.5300869, longitude: 4.7107978 },
  '7005': { street: 'Buziaustraat 32', postcode: '1068 KM', city: 'Amsterdam', latitude: 52.3523127, longitude: 4.8115646 },
  '7006': { street: 'Belgiëlaan 6', postcode: '2034 AX', city: 'Haarlem', latitude: 52.3643763, longitude: 4.6452766 },
  '7007': { street: 'Leekerpad 8', postcode: '1689 VP', city: 'Zwaag', latitude: 52.6653332, longitude: 5.036309 },
  '7008': { street: 'Perenpad 3', postcode: '1033 BV', city: 'Amsterdam', latitude: 52.6613735, longitude: 5.5951703 },
  '7009': { street: 'Dorpsstraat 214 A', postcode: '1531 HS', city: 'Wormer', latitude: 52.4987976, longitude: 4.823868 },
  '7010': { street: 'De Vork 6', postcode: '1704 BX', city: 'Heerhugowaard', latitude: 52.679782, longitude: 4.838628, hall: true },
  '7011': { street: 'Sportlaan 7', postcode: '1871 EP', city: 'Schoorl', latitude: 52.7042965, longitude: 4.6936869 },
  '7013': { street: 'Laan van Meerestein 1', postcode: '1945 TA', city: 'Beverwijk', latitude: 52.4905218, longitude: 4.6626699 },
  '7014': { street: 'Potjesdam 12', postcode: '1722 XN', city: 'Zuid-Scharwoude', latitude: 52.7001596, longitude: 4.8220423 },
  '7015': { street: 'Flevostraat 253', postcode: '1442 PX', city: 'Purmerend', latitude: 52.5196517, longitude: 4.9759672 },
  '7016': { street: 'Schapendijkje 5', postcode: '1782 TG', city: 'Den Helder', latitude: 52.9629802, longitude: 4.7436037 },
  '7017': { street: 'v. Haerlemlaan 31 a', postcode: '1901 JM', city: 'Castricum', latitude: 52.5608294, longitude: 4.661529 },
  '7019': { street: 'Adelaertlaan 1', postcode: '1967 NN', city: 'Heemskerk', latitude: 52.5046622, longitude: 4.6943576 },
  '7020': null, // Boel Skik 92
  '7021': null, // PON
  '7022': { street: 'Wezelstraat 5', postcode: '1541 LZ', city: 'Koog aan de Zaan', latitude: 52.4672137, longitude: 4.8001897 },
  '7023': { street: 'Harlingenlaan 27', postcode: '1131 JP', city: 'Volendam', latitude: 52.5089166, longitude: 5.0738124 },
  '7024': { street: 'Klaas Bootpad 8', postcode: '1827 CX', city: 'Alkmaar', latitude: 52.6630937, longitude: 4.7587155 },
  '7028': { street: 'Populierenlaan 31 (bij ijsbaan Jan Woudenberg)', postcode: '1766 JD', city: 'Wieringerwaard', latitude: 52.8367209, longitude: 4.8683263 },
  '8001': { street: 'Hollandseweg 328', postcode: '6704 PK', city: 'Wageningen', latitude: 51.9789514, longitude: 5.6819014, hall: true },
  '8002': { street: 'Koelaan 1', postcode: '3703 CS', city: 'Zeist', latitude: 52.0769356, longitude: 5.2304219 },
  '8003': { street: 'Zomerdijk 41b', postcode: '3402 MJ', city: 'IJsselstein', latitude: 52.0289656, longitude: 5.0407673 },
  '8004': null, // Kets Up
  '8005': { street: 'Molenweg 19B', postcode: '1391 CH', city: 'Abcoude', latitude: 52.268858, longitude: 4.9814754 },
  '8006': { street: 'Jagerspaadje 34', postcode: '1231 KJ', city: 'Loosdrecht', latitude: 52.211593, longitude: 5.12816 },
  '8007': { street: 't Sluisje 6', postcode: '3831 JV', city: 'Leusden', latitude: 52.1377649, longitude: 5.4479827, hall: true },
  '8009': { street: 'Parelhoenstraat 12', postcode: '3815 AG', city: 'Amersfoort', latitude: 52.1686795, longitude: 5.3975446, hall: true },
  '8010': { street: 'Kanonnenpad 2', postcode: '6717 XE', city: 'Ede', latitude: 52.0143297, longitude: 5.66311 },
  '8011': { street: 'Gelreweg 15', postcode: '3771 AL', city: 'Barneveld', latitude: 52.1379898, longitude: 5.5919747 },
  '8012': { street: 'Parkweg 6a', postcode: '3842 AD', city: 'Harderwijk', latitude: 52.3406299, longitude: 5.6294349 },
  '8013': { street: 'Laan van Maarschalkerweerd 14', postcode: '3585 LJ', city: 'Utrecht', latitude: 52.0749378, longitude: 5.1507139, hall: true },
  '8014': { street: 'Lekdijk-Oost 13a', postcode: '3961 MB', city: 'Wijk bij Duurstede', latitude: 51.9660096, longitude: 5.3376831, hall: true },
  '8015': { street: 'Steenovenslaan 16', postcode: '4101 AM', city: 'Culemborg', latitude: 51.9603854, longitude: 5.2167597 },
  '8016': { street: 'Eemweg 2c', postcode: '3764 DG', city: 'Soest', latitude: 52.1773136, longitude: 5.3193378 },
  '8017': { street: 'Klein Brandt Sportpark /Muziekdreef 2', postcode: '1312 JW', city: 'Almere', latitude: 52.3725506, longitude: 5.2003492, hall: true },
  '8018': { street: 'Wageningselaan', postcode: '3903 LA', city: 'Veenendaal', latitude: 52.011368, longitude: 5.5710852 },
  '8019': { street: 'Laan van Westroijen 3', postcode: '4003 AX', city: 'Tiel', latitude: 51.8977199, longitude: 5.4345907 },
  '8020': { street: 'Horsterweg 216', postcode: '3893 AA', city: 'Zeewolde', latitude: 52.3262695, longitude: 5.5204707 },
  '8022': { street: 'Galecopperzoom 1', postcode: '3437 PJ', city: 'Nieuwegein', latitude: 52.0591148, longitude: 5.0776276, hall: true },
  '8023': { street: 'Bavoortseweg 31', postcode: '3833 BM', city: 'Leusden', latitude: 52.1317996, longitude: 5.4137104, hall: true },
  '8024': { street: 'Watergoorweg 48a', postcode: '3861 MA', city: 'Nijkerk', latitude: 52.226303, longitude: 5.4739017, hall: true },
  '8025': { street: 'De Kronkels 12b', postcode: '3752 LM', city: 'Bunschoten-Spakenburg', latitude: 52.233353, longitude: 5.3632561, hall: true },
  '8026': { street: 'Schouw 4505', postcode: '8232 AZ', city: 'Lelystad', latitude: 52.508135, longitude: 5.4605936 },
  '8027': { street: 'Willem Arntszlaan 96', postcode: '3734 EJ', city: 'Den Dolder', latitude: 52.1390521, longitude: 5.2317118, hall: true },
  '8028': { street: 'Componistenlaan 1', postcode: '3451 SX', city: 'Vleuten', latitude: 52.1104354, longitude: 5.0291786, hall: true },
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
const key = (name) => clean(name).toLowerCase();
const quote = (value) => (value === null || value === undefined || value === '' ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);
const decode = (value) => clean(value.replace(/^<!\[CDATA\[(.*)\]\]>$/s, '$1'))
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  .replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

function url(value) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = parsed.hostname.replace(/^www\./, '');
    return ['http:', 'https:'].includes(parsed.protocol) && host.includes('.') && !BAD_WEBSITES.has(host) ? parsed.href : null;
  } catch { return null; }
}

// Ordner „Verenigingen“ (der Ordner davor enthält die District-Polygone).
function parseKml(kml) {
  const folder = kml.slice(kml.indexOf('<name>Verenigingen</name>'));
  return [...folder.matchAll(/<Placemark>(.*?)<\/Placemark>/gs)].map(([, placemark]) => {
    const data = Object.fromEntries([...placemark.matchAll(/<Data name="([^"]+)">\s*<value>(.*?)<\/value>/gs)]
      .map(([, name, value]) => [name, decode(value)]));
    return { name: decode(placemark.match(/<name>(.*?)<\/name>/s)[1]), number: String(Math.round(Number(data['Ver.nr']))), website: data.Website };
  });
}

const response = await fetch(KML_URL);
if (!response.ok) throw new Error(`${KML_URL}: HTTP ${response.status}`);
const clubs = parseKml(await response.text());
if (clubs.length < 150) throw new Error(`Vereinskarte unvollständig (${clubs.length} Vereine) – Datenaufbau geändert?`);
const unchecked = clubs.filter((club) => !(club.number in PLACES)).map((club) => `${club.number} ${club.name}`);
if (unchecked.length) throw new Error(`Neue Vereine ohne geprüften Spielort (PLACES ergänzen): ${unchecked.join('; ')}`);

const [owner] = query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
if (!owner) throw new Error('Kein Admin-Konto als Owner gefunden.');
// In JS normalisieren: SQLites lower() lässt Umlaute wie Ö groß.
const existing = new Set(query('SELECT name FROM clubs').map((row) => key(row.name)));

const status = args.has('--publish') ? 'published' : 'pending';
const now = new Date().toISOString();
const statements = [];
const skipped = [];
const withoutPlace = [];
const checklist = [];
let placeCount = 0;

for (const club of clubs) {
  if (existing.has(key(club.name))) {
    skipped.push(club.name);
    continue;
  }
  const clubId = crypto.randomUUID();
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(club.name)}, 'club', NULL, ${quote(url(club.website))}, NULL, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, NULL, NULL, ${quote(status)}, ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );
  const place = PLACES[club.number];
  if (!place) {
    withoutPlace.push(club.name);
    continue;
  }
  const { street, postcode, city, latitude, longitude, hall = false } = place;
  const address = `${street}, ${postcode} ${city}`;
  for (const venueType of hall ? ['outdoor', 'indoor'] : ['outdoor']) {
    checklist.push([club.number, club.name, venueType, address, latitude, longitude].join(' | '));
    // Vereinsplätze nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
    statements.push(
      'INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, address_unverified, created_at, updated_at) '
      + `SELECT ${quote(crypto.randomUUID())}, ${quote(clubId)}, NULL, ${quote(club.name)}, ${quote(address)}, ${latitude}, ${longitude}, ${quote(venueType)}, 0, NULL, 0, '[]', ${quote(status)}, NULL, 1, ${quote(now)}, ${quote(now)} `
      + `WHERE EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)}) AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(club.name)})) AND lower(trim(address)) = lower(trim(${quote(address)})) AND venue_type = ${quote(venueType)});`,
    );
    placeCount += 1;
  }
}

console.log(`${clubs.length} Vereine: ${clubs.length - skipped.length} neu, ${placeCount} Plätze, ${skipped.length} übersprungen.`);
if (withoutPlace.length) console.log(`Ohne Platz: ${withoutPlace.join('; ')}`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);
if (args.has('--checklist')) console.log(checklist.join('\n'));

const file = join(mkdtempSync(join(tmpdir(), 'ptm-njbb-clubs-')), 'import.sql');
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
