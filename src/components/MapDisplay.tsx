// src/components/MapDisplay.tsx
'use client'; // Wajib client component

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { LatLngExpression } from 'leaflet';

// --- FIX Icon Default Leaflet ---
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
    iconUrl, iconRetinaUrl, shadowUrl,
    iconSize: [25, 41], iconAnchor: [12, 41],
    popupAnchor: [1, -34], shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;
// --- AKHIR FIX Icon ---

interface MapDisplayProps {
  latitude: number;
  longitude: number;
  popupText?: string;
  mapHeight?: string;
  zoomLevel?: number;
}

export default function MapDisplay({
  latitude, longitude,
  popupText = "Lokasi Absensi",
  mapHeight = '250px',
  zoomLevel = 16,
}: MapDisplayProps) {

  // Validasi sederhana
  if (isNaN(latitude) || isNaN(longitude) || latitude === 0 || longitude === 0 ) {
     return (
        <div style={{ height: mapHeight }} className="flex items-center justify-center bg-gray-200 text-gray-500 text-sm italic rounded-md">
            Lokasi tidak tersedia/valid.
        </div>
     );
  }
  const position: LatLngExpression = [latitude, longitude];

  return (
    <MapContainer center={position} zoom={zoomLevel} scrollWheelZoom={false} style={{ height: mapHeight, width: '100%' }} className='rounded-md shadow-sm'>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
      <Marker position={position}>
        <Popup>
          {popupText} <br /> Lat: {latitude.toFixed(5)}, Lon: {longitude.toFixed(5)}
        </Popup>
      </Marker>
    </MapContainer>
  );
}