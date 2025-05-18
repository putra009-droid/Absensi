// File Lokasi: src/lib/locationUtils.ts

/**
 * Menghitung jarak antara dua titik koordinat geografis menggunakan formula Haversine.
 * @param lat1 Latitude titik pertama.
 * @param lon1 Longitude titik pertama.
 * @param lat2 Latitude titik kedua.
 * @param lon2 Longitude titik kedua.
 * @returns Jarak dalam meter.
 */
export function calculateDistanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Radius bumi dalam meter
  const phi1 = lat1 * Math.PI / 180; // φ, λ dalam radian
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // dalam meter
  return distance;
}
