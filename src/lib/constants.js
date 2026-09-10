export const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
];

export const TOURNAMENT_TYPES = [
  { value: 'formule_x', label: 'Formule X' },
  { value: 'jeder_gegen_jeden', label: 'Jeder gegen Jeden' },
  { value: 'ko', label: 'K.O.' },
  { value: 'kaskaden', label: 'Kaskaden-KO' },
  { value: 'liga', label: 'Liga' },
  { value: 'maastrichter', label: 'Maastrichter' },
  { value: 'poule_ab', label: 'Poule A/B' },
  { value: 'rangliste', label: 'Rangliste' },
  { value: 'schweizer', label: 'Schweizer' },
  { value: 'trip_tete', label: 'Trip-Tête' },
];

export const FORMATIONS = [
  { value: 'tete', label: 'Tête' },
  { value: 'doublette', label: 'Doublette' },
  { value: 'triplette', label: 'Triplette' },
  { value: 'andere', label: 'Andere (siehe Beschreibung)' },
];

export const REGISTRATION_TYPES = [
  { value: 'supermelee', label: 'Supermêlée' },
  { value: 'melee', label: 'Mêlée' },
  { value: 'forme', label: 'Formée' },
];

export const MONTHS = [
  { value: '01', label: 'Januar' },
  { value: '02', label: 'Februar' },
  { value: '03', label: 'März' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Dezember' },
];

export const TOURNAMENT_STATUSES = [
  { value: 'draft', label: 'Entwurf' },
  { value: 'registration', label: 'Anmeldung offen' },
  { value: 'running', label: 'Läuft' },
  { value: 'finished', label: 'Abgeschlossen' },
];

export const VISIBILITIES = [
  { value: 'public', label: 'Öffentlich' },
  { value: 'private', label: 'Privat' },
];

export const REGISTRATION_STATUSES = [
  { value: 'pending', label: 'Offen' },
  { value: 'confirmed', label: 'Bestätigt' },
  { value: 'waitlist', label: 'Warteliste' },
  { value: 'cancelled', label: 'Storniert' },
];

export const RADIUS_OPTIONS = [
  { value: '5', label: '5 km' },
  { value: '10', label: '10 km' },
  { value: '25', label: '25 km' },
  { value: '50', label: '50 km' },
  { value: '100', label: '100 km' },
  { value: '200', label: '200 km' },
  { value: '500', label: '500 km' },
];

export const DEFAULT_TOURNAMENT_LIMIT = 5;

export const EMPTY_USER_FORM = {
  id: '',
  firstName: '',
  lastName: '',
  email: '',
  role: 'user',
  password: '',
  emailVerified: true,
  passwordChangeRequired: false,
  tournamentLimit: DEFAULT_TOURNAMENT_LIMIT,
  mailEnabled: false,
};

export const EMPTY_PROFILE_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  club: '',
  licenseNr: '',
  currentPassword: '',
  newPassword: '',
  newPasswordConfirm: '',
};

export const EMPTY_AUTH_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  passwordConfirm: '',
  token: '',
  website: '',
};

export const EMPTY_TOURNAMENT_FORM = {
  id: '',
  managerId: '',
  club: '',
  name: '',
  date: '',
  startTime: '',
  location: '',
  latitude: '',
  longitude: '',
  overrideCoordinates: false,
  locationConfirmed: false,
  description: '',
  type: 'formule_x',
  formation: 'doublette',
  registrationType: 'forme',
  status: 'draft',
  maxRegistrations: 0,
  registrationDeadline: '',
  registrationOpensAt: '',
  timezone: '',
  entryFeeAmount: '',
  currency: 'EUR',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  visibility: 'private',
  internalNotes: '',
  participantsPublic: false,
  licenseRequired: false,
  teamNameEnabled: false,
  waitlistEnabled: true,
  registrationEnabled: true,
  approvalRequired: false,
  websiteUrl: '',
  logoUrl: '',
  flyerUrl: '',
};

export const EMPTY_TOURNAMENT_REPORT_FORM = {
  club: '',
  name: '',
  location: '',
  date: '',
  startTime: '',
  formation: 'doublette',
  description: '',
  websiteUrl: '',
  contactName: '',
  contactEmail: '',
  consentAccepted: false,
  website: '',
};

export const EMPTY_REGISTRATION_FORM = {
  id: '',
  tournamentId: '',
  firstName: '',
  lastName: '',
  email: '',
  noEmail: false,
  club: '',
  licenseNr: '',
  partnerFirstName: '',
  partnerLastName: '',
  partnerEmail: '',
  partnerLicenseNr: '',
  partner2FirstName: '',
  partner2LastName: '',
  partner2Email: '',
  partner2LicenseNr: '',
  teamName: '',
  seedingPosition: '',
  status: 'pending',
  isVip: false,
  publicationNoticeAccepted: false,
  website: '',
};

export const REGISTER_SUCCESS = 'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.';
export const VERIFY_SUCCESS = 'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.';
export const CANCEL_REGISTRATION_EXPLANATION = 'Möchtest du deine Turnieranmeldung wirklich stornieren?';
export const CANCEL_REGISTRATION_SUCCESS = 'Deine Anmeldung wurde storniert.';
export const PROFILE_UPDATE_SUCCESS = 'Deine Daten wurden gespeichert.';
export const PROFILE_EMAIL_CHANGE_PENDING = 'Deine Daten wurden gespeichert. Bitte bestätige deine neue E-Mail-Adresse über den Link, den wir dir zugeschickt haben.';
