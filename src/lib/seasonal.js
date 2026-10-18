// Herbst-Deko erscheint automatisch im Oktober und November.
export function isAutumnSeason(date = new Date()) {
  const month = date.getMonth();
  return month === 9 || month === 10;
}

// Halloween-Badges erscheinen automatisch im Oktober.
export function isHalloweenSeason(date = new Date()) {
  return date.getMonth() === 9;
}

// Root-Klassen für rein CSS-basierte Saison-Deko.
export function applySeasonClass(root = document.documentElement, date = new Date()) {
  root.classList.toggle('season-autumn', isAutumnSeason(date));
  root.classList.toggle('season-halloween', isHalloweenSeason(date));
}
