# Monitoring Maps - WebGIS Feature

## Overview
Fitur Monitoring Maps menggunakan WebGIS dengan Leaflet.js untuk menampilkan lokasi geografis pelanggan dan ODP secara real-time pada peta interaktif.

## Features

### 1. Interactive Map
- **Base Map**: OpenStreetMap tiles
- **Initial View**: Koordinat -5.6342425, 105.5631682 (Lampung) dengan zoom level 14
- **Height**: 600px full-width responsive

### 2. Markers
- **ODP Markers** (Blue circles - 30px):
  - Menampilkan semua ODP yang memiliki koordinat latitude/longitude
  - Icon: Layered network symbol (3 layers)
  - Popup info: Nama ODP, rasio distribusi, rasio spesial, jumlah pelanggan, koordinat
  
- **Customer Markers** (24px circles):
  - Green: Pelanggan online (terhubung ke MikroTik)
  - Red: Pelanggan offline
  - Icon: Location pin symbol
  - Popup info: Nama, username PPPoE, paket, ODP, alamat, telepon, status online/offline, IP address (jika online), koordinat

### 3. Filter Controls
- **Show/Hide ODP**: Toggle visibility ODP markers
- **Show/Hide Pelanggan**: Toggle visibility customer markers
- **Online Saja**: Filter untuk hanya menampilkan pelanggan yang sedang online
- **Refresh Button**: Reload data dari server

### 4. Statistics Cards
- **Total ODP**: Jumlah ODP yang memiliki koordinat
- **Total Pelanggan**: Jumlah pelanggan yang memiliki koordinat
- **Pelanggan Online**: Jumlah dan persentase pelanggan online

### 5. Legend
- Blue circle (30px): ODP
- Green circle (24px): Pelanggan Online
- Red circle (24px): Pelanggan Offline

## Technical Implementation

### Frontend Component
**File**: `resources/js/pages/MonitoringMaps.jsx`
- React hooks: useState, useEffect, useRef
- Dynamic Leaflet.js loading from CDN (v1.9.4)
- Real-time marker updates based on filters
- Responsive design with Tailwind CSS

### Backend Controller
**File**: `app/Http/Controllers/MonitoringMapsController.php`
- Fetch customers with coordinates (latitude IS NOT NULL)
- Fetch ODPs with coordinates and customer count (withCount)
- Check online status via MikroTik API
- Map IP addresses and uptime for online users
- Graceful fallback if MikroTik connection fails

### API Endpoint
**Route**: `GET /api/monitoring-maps`
**Auth**: Required (middleware: auth)
**Response**:
```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": 1,
        "name": "John Doe",
        "address": "Jl. Example",
        "phone": "081234567890",
        "pppoe_username": "GLM001",
        "package_type": "50 Mbps",
        "odp": "ODP-GUNUNG LURU",
        "latitude": "-5.634242",
        "longitude": "105.563168",
        "is_online": true,
        "ip_address": "10.10.10.1",
        "uptime": "1d2h30m"
      }
    ],
    "odps": [
      {
        "id": 1,
        "nama": "ODP-GUNUNG LURU",
        "rasio_distribusi": "1:8",
        "rasio_spesial": "1:16",
        "latitude": "-5.634000",
        "longitude": "105.563000",
        "customers_count": 15
      }
    ]
  }
}
```

### Database Requirements
- **customers table**: columns `latitude`, `longitude` (decimal 10,7)
- **odps table**: columns `latitude`, `longitude` (decimal 10,8 for lat, 11,8 for lng)

### Navigation
**Menu**: "Monitoring Maps" dengan icon MapPin
**Locations**:
- Desktop: Dropdown menu Settings
- Mobile: Main menu navigation
**Route**: `/monitoring-maps`

## Usage

1. **Akses Menu**: Klik "Monitoring Maps" di navbar
2. **Lihat Peta**: Peta akan load dengan semua marker ODP dan pelanggan
3. **Klik Marker**: Popup akan menampilkan detail lokasi
4. **Filter**: Gunakan toggle buttons untuk filter tampilan
5. **Refresh**: Klik tombol refresh untuk update data real-time

## Data Flow

```
MonitoringMaps.jsx (Frontend)
  ↓ fetch('/api/monitoring-maps')
MonitoringMapsController@getMapData
  ↓ Query DB
Customer::whereNotNull('latitude')
Odp::whereNotNull('latitude')->withCount('customers')
  ↓ Check MikroTik
MikroTikService->getActiveUsers()
  ↓ Map status
customers->is_online, ip_address, uptime
  ↓ Return JSON
{ success: true, data: { customers, odps } }
  ↓ Render markers
Leaflet markers + popups
```

## Fallback Handling

### MikroTik Connection Failed
- Log warning: "MikroTik connection failed in MonitoringMaps"
- Set all customers as offline (is_online: false)
- Continue rendering map with offline status

### No Coordinates Data
- Only customers/ODPs with coordinates are fetched
- Statistics show "0" if no data
- Map still displays with initial view

## Dependencies
- **Leaflet.js**: 1.9.4 (CDN)
- **Icons**: lucide-react (MapPin, Users, Network, Eye, EyeOff, Loader)
- **Styling**: Tailwind CSS
- **MikroTik**: app/Services/MikroTikService.php

## Future Enhancements
- Clustering markers for better performance with large datasets
- Heatmap layer untuk density visualization
- Route planning between ODP and customers
- Export map as PDF/Image
- Custom marker icons per package type
- Search/filter by area, ODP, atau package
- Draw tools untuk menandai area maintenance
- Historical location tracking
