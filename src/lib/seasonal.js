// Herbst-Deko erscheint automatisch im Oktober und November.
export function isAutumnSeason(date = new Date()) {
  const month = date.getMonth();
  return month === 9 || month === 10;
}

// Root-Klasse für rein CSS-basierte Saison-Deko (z. B. an .empty-state).
export function applySeasonClass(root = document.documentElement, date = new Date()) {
  root.classList.toggle('season-autumn', isAutumnSeason(date));
}
