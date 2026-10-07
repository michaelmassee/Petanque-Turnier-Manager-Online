export function filterTournaments(tournaments, query, statusFilter) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return tournaments.filter((tournament) => (!statusFilter || tournament.status === statusFilter) && (!normalizedQuery || [tournament.name, tournament.location].some((value) => (value || '').toLowerCase().includes(normalizedQuery))));
}

export function filterRegistrations(registrations, query, statusFilter, { organizerMessageFilter = '', questionFilter = '', feeFilter = '' } = {}) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return registrations.filter((registration) => {
    const matchesStatus = !statusFilter || registration.status === statusFilter;
    const matchesQuery = !normalizedQuery || [registration.firstName, registration.lastName, registration.teamName].some((value) => (value || '').toLowerCase().includes(normalizedQuery));
    const hasMessage = Boolean(registration.organizerMessage);
    const matchesMessage = !organizerMessageFilter ||
      (organizerMessageFilter === 'with_message' && hasMessage) ||
      (organizerMessageFilter === 'without_message' && !hasMessage);
    const matchesQuestion = !questionFilter || (registration.registrationAnswers || []).some((answer) => answer.questionId === questionFilter && answer.checked);
    const matchesFee = !feeFilter || (registration.feeSelections || []).some((selection) => selection.tariffId === feeFilter);
    return matchesStatus && matchesQuery && matchesMessage && matchesQuestion && matchesFee;
  });
}

export function filterUsers(users, query, roleFilter, statusFilter) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return users.filter((user) => {
    const matchesQuery = !normalizedQuery || [user.firstName, user.lastName, user.email, user.username, user.username && `@${user.username}`, user.club].some((value) => (value || '').toLowerCase().includes(normalizedQuery));
    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesStatus = !statusFilter ||
      (statusFilter === 'verified' && Boolean(user.emailVerifiedAt)) ||
      (statusFilter === 'unverified' && !user.emailVerifiedAt) ||
      (statusFilter === 'password_change_required' && Boolean(user.passwordChangeRequired));
    return matchesQuery && matchesRole && matchesStatus;
  });
}

export function filterApiKeys(apiKeys, query, statusFilter) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return apiKeys.filter((key) => {
    const matchesQuery = !normalizedQuery || [key.label, key.userName, key.userEmail].some((value) => (value || '').toLowerCase().includes(normalizedQuery));
    const matchesStatus = !statusFilter || key.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
}
