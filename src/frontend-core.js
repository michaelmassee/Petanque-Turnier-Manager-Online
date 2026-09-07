export function filterTournaments(tournaments, query, statusFilter) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return tournaments.filter((tournament) => (!statusFilter || tournament.status === statusFilter) && (!normalizedQuery || [tournament.name, tournament.location].some((value) => (value || '').toLowerCase().includes(normalizedQuery))));
}

export function filterRegistrations(registrations, query, statusFilter) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return registrations.filter((registration) => (!statusFilter || registration.status === statusFilter) && (!normalizedQuery || [registration.firstName, registration.lastName, registration.teamName].some((value) => (value || '').toLowerCase().includes(normalizedQuery))));
}

export function filterUsers(users, query, roleFilter, statusFilter) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return users.filter((user) => {
    const matchesQuery = !normalizedQuery || [user.firstName, user.lastName, user.email].some((value) => (value || '').toLowerCase().includes(normalizedQuery));
    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesStatus = !statusFilter ||
      (statusFilter === 'verified' && Boolean(user.emailVerifiedAt)) ||
      (statusFilter === 'unverified' && !user.emailVerifiedAt) ||
      (statusFilter === 'password_change_required' && Boolean(user.passwordChangeRequired));
    return matchesQuery && matchesRole && matchesStatus;
  });
}
