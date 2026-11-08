import { DEFAULT_PARTICIPANT_LIMIT, DEFAULT_TOURNAMENT_LIMIT } from './lib/constants.js';

export function filterTournaments(tournaments, query, statusFilter) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return tournaments.filter((tournament) => (!statusFilter || tournament.status === statusFilter) && (!normalizedQuery || [tournament.name, tournament.location].some((value) => (value || '').toLowerCase().includes(normalizedQuery))));
}

export function filterRegistrations(registrations, query, statusFilter, { organizerMessageFilter = '', questionFilter = '', feeFilter = '', vipFilter = '' } = {}) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return registrations.filter((registration) => {
    const matchesStatus = !statusFilter || registration.status === statusFilter;
    const matchesQuery = !normalizedQuery || [registration.firstName, registration.lastName, registration.teamName].some((value) => (value || '').toLowerCase().includes(normalizedQuery));
    const hasMessage = Boolean(registration.organizerMessage);
    const matchesMessage = !organizerMessageFilter ||
      (organizerMessageFilter === 'with_message' && hasMessage) ||
      (organizerMessageFilter === 'without_message' && !hasMessage);
    // Auswahlfragen filtern pro Eintrag („Frage:Eintrag“), Ankreuzfragen nach „angekreuzt“.
    const [filterQuestionId, filterOptionId] = questionFilter.split(':');
    const matchesQuestion = !questionFilter || (registration.registrationAnswers || []).some((answer) => answer.questionId === filterQuestionId
      && (filterOptionId ? answer.optionId === filterOptionId : answer.checked));
    const matchesFee = !feeFilter || (registration.feeSelections || []).some((selection) => selection.tariffId === feeFilter);
    const matchesVip = !vipFilter ||
      (vipFilter === 'vip' && Boolean(registration.isVip)) ||
      (vipFilter === 'not_vip' && !registration.isVip);
    return matchesStatus && matchesQuery && matchesMessage && matchesQuestion && matchesFee && matchesVip;
  });
}

export function filterUsers(users, query, roleFilter, statusFilter, { tournamentLimitFilter = '', participantLimitFilter = '', mailFilter = '' } = {}) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return users.filter((user) => {
    const matchesQuery = !normalizedQuery || [user.firstName, user.lastName, user.email, user.phone, user.username, user.username && `@${user.username}`, user.club].some((value) => (value || '').toLowerCase().includes(normalizedQuery));
    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesStatus = !statusFilter ||
      (statusFilter === 'verified' && Boolean(user.emailVerifiedAt)) ||
      (statusFilter === 'unverified' && !user.emailVerifiedAt) ||
      (statusFilter === 'password_change_required' && Boolean(user.passwordChangeRequired));
    const matchesLimit = !tournamentLimitFilter || (tournamentLimitFilter === 'unlimited'
      ? user.role === 'admin'
      : user.role !== 'admin' && String(user.tournamentLimit ?? DEFAULT_TOURNAMENT_LIMIT) === tournamentLimitFilter);
    const matchesParticipantLimit = !participantLimitFilter || (participantLimitFilter === 'unlimited'
      ? user.role === 'admin'
      : user.role !== 'admin' && String(user.participantLimit ?? DEFAULT_PARTICIPANT_LIMIT) === participantLimitFilter);
    const mailEnabled = user.role === 'admin' || (user.mailEnabled ?? true);
    const matchesMail = !mailFilter || (mailFilter === 'enabled' && mailEnabled) || (mailFilter === 'disabled' && !mailEnabled);
    return matchesQuery && matchesRole && matchesStatus && matchesLimit && matchesParticipantLimit && matchesMail;
  });
}

const compareText = (left, right) => (left || '').localeCompare(right || '', undefined, { sensitivity: 'base' });
const compareUserNames = (left, right) => compareText(left.firstName, right.firstName) || compareText(left.lastName, right.lastName);

// Admin-Benutzerliste: 'name' (Vorname, Nachname), 'lastSeen' (zuletzt online zuerst) oder 'club' (Verein A–Z).
// Ohne Wert (nie online, kein Verein) stehen Benutzer jeweils am Ende, danach nach Name.
export function sortUsers(users, sortBy = 'name') {
  const missingLast = (left, right) => Number(!left) - Number(!right);
  const comparators = {
    name: compareUserNames,
    lastSeen: (left, right) => missingLast(left.lastSeenAt, right.lastSeenAt)
      || compareText(right.lastSeenAt, left.lastSeenAt) || compareUserNames(left, right),
    club: (left, right) => missingLast(left.club, right.club) || compareText(left.club, right.club) || compareUserNames(left, right),
  };
  return [...users].sort(comparators[sortBy] || comparators.name);
}

export function filterApiKeys(apiKeys, query, statusFilter) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return apiKeys.filter((key) => {
    const matchesQuery = !normalizedQuery || [key.label, key.userName, key.userEmail].some((value) => (value || '').toLowerCase().includes(normalizedQuery));
    const matchesStatus = !statusFilter || key.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
}

// Spieler einer Meldung, die Teilnehmerfragen beantworten (Partner nur, wenn eingetragen).
export function registrationQuestionParticipants(registration) {
  return ['primary',
    ...(registration.partnerFirstName || registration.partnerLastName ? ['partner'] : []),
    ...(registration.partner2FirstName || registration.partner2LastName ? ['partner2'] : [])];
}

// Zählung der Auswahlfragen über die Spieler offener und bestätigter Meldungen (ohne Warteliste), z. B. damit der
// Thekendienst den Einkauf planen kann. „open“ sind Spieler ohne Auswahl (ältere oder von der Turnierleitung
// eingetragene Meldungen).
export function registrationChoiceSummary(registrations, questions) {
  const counted = registrations.filter((registration) => ['pending', 'confirmed'].includes(registration.status));
  return (questions || []).filter((question) => question.type === 'choice').map((question) => {
    const counts = new Map(question.options.map((option) => [option.id, 0]));
    let open = 0;
    for (const registration of counted) {
      for (const participant of registrationQuestionParticipants(registration)) {
        const optionId = (registration.registrationAnswers || []).find((answer) => answer.participant === participant && answer.questionId === question.id)?.optionId;
        if (optionId && counts.has(optionId)) counts.set(optionId, counts.get(optionId) + 1);
        else open += 1;
      }
    }
    return { id: question.id, label: question.label, options: question.options.map((option) => ({ ...option, count: counts.get(option.id) })), open };
  });
}
