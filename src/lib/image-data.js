// Bilder im Browser laden und für SVG/PDF aufbereiten (Flyer, Ranglisten-PDF). Alles bleibt lokal im Browser.

const LOGO_MAX_PIXELS = 1200;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBytes(dataUrl) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Lädt das Logo über den Bild-Proxy und normalisiert es zu PNG: Das SVG braucht eine Data-URL
 * (als <img> lädt es keine externen Bilder), das PDF kann nur PNG/JPEG einbetten.
 */
export async function loadLogo(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`logo: ${response.status}`);
  const image = await loadImage(await blobToDataUrl(await response.blob()));
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const scale = Math.min(1, LOGO_MAX_PIXELS / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');
  return { width: image.naturalWidth, height: image.naturalHeight, dataUrl, png: dataUrlToBytes(dataUrl) };
}

/** Bietet eine im Browser erzeugte Datei zum Herunterladen an. */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
