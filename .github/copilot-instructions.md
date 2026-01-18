# GitHub Copilot Instructions

## Project Overview
ISP (Internet Service Provider) billing & management system with hybrid Laravel 12 + React 18 SPA architecture. Manages customers, invoicing, MikroTik router integration, WhatsApp notifications, and public landing pages.

## Architecture

### Hybrid SPA Pattern
- **Backend**: Laravel 12 API (PHP 8.2) - session-based auth with Laravel Breeze
- **Frontend**: React 18 SPA via Vite - client-side routing with react-router-dom v6
- **Single Entry**: All routes return `view('app')` (resources/views/app.blade.php) → mounts React
- **API Convention**: All API endpoints prefixed with `/api/` return JSON

### Key Integration Points
1. **MikroTik RouterOS**: `app/Services/MikroTikService.php` - manages PPPoE users, profiles, isolation
2. **WhatsApp Gateway**: FastAPI service at `:8001` + Node.js whatsapp-web.js at `:3001` - sends network notices
3. **Database**: MySQL - main models: Customer, Invoice, Odp, Pengeluaran, NetworkNotice, Complaint

## File Structure Conventions

```
app/Http/Controllers/          # Laravel controllers - return JSON for /api/* routes
app/Models/                    # Eloquent models with accessor methods (e.g., getNamaAttribute)
app/Services/MikroTikService.php  # MikroTik API integration (RouterOS v6.43+)
resources/js/
  ├── pages/                   # React pages (Dashboard, Billing, Customers, etc.)
  ├── components/
  │   ├── common/              # Reusable UI (Button, Alert, Modal, Table)
  │   └── layouts/             # Navbar, footer
  └── App.jsx                  # Root router with conditional navbar logic
routes/
  ├── web.php                  # Public + protected routes (all return view('app'))
  ├── auth.php                 # Auth routes (login, register, password reset)
  └── customers.php            # Customer-specific routes
fastapi/                       # WhatsApp notification service (Python FastAPI)
```

## Critical Patterns

### 1. React Router + Laravel Session Auth
- **Public routes**: `/`, `/status-jaringan`, `/invoice/{link}`, `/customer/login`
- **Protected routes**: Wrapped in `Route::middleware('auth')` - check `window.isAuthenticated`
- **No navbar routes**: `['/login', '/register', '/', '/customer/login', '/customer/dashboard', '/status-jaringan']` + `/invoice/*`
- Auth check: `@auth` in Blade → sets `window.isAuthenticated = true`

### 2. API Request Pattern
```javascript
const response = await fetch('/api/endpoint', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
        'Accept': 'application/json',
    },
    body: JSON.stringify(data),
});
```

### 3. MikroTik Integration
- **Profile "isolir"**: Used for customers with unpaid invoices
- **Isolation flow**: `isolateUser()` changes profile to "isolir", `restoreUser()` reverts to package profile
- **Connection**: Direct socket to RouterOS API (port 8728) - credentials in MikroTikService constructor
- **Key methods**: `createPPPoESecret()`, `isolateUser()`, `getIsolatedSecrets()`, `disconnect()`

### 4. Invoice System
- **Public invoices**: Shareable link `/invoice/{invoice_link}` - no auth required
- **Payment flow**: Customer uploads `bukti_pembayaran` → status "menunggu konfirmasi" → admin confirms → status "paid" + due_date +30 days
- **Rejection**: Admin can reject with `tolak_info` → status back to "pending"
- **Auto isolation**: Billing page shows isolation status from MikroTik in real-time

### 5. Customer Model Compatibility
Uses accessor methods for legacy field names:
- `name` → `getNamaAttribute()`
- `address` → `getAlamatAttribute()`
- `phone` → `getNoTelpAttribute()`
- `pppoe_username` → `getUserPppoeAttribute()`
- `package_type` → `getPaketAttribute()`

### 6. WhatsApp Notification Service
- **FastAPI**: Port 8001 - `/send-notification`, `/send-custom-notification`
- **WA Gateway**: Port 3001 (Node.js) - handles WhatsApp Web connection via whatsapp-web.js
- **Session**: LocalAuth - QR scan persisted in `fastapi/wa-gateway/.wwebjs_auth/`
- **Usage**: Send network notices to customers by ODP or broadcast to all active

## Development Workflow

### Start Development Server
```bash
composer run dev  # Runs: Laravel serve + queue + pail + vite concurrently
```

### Manual Start (alternative)
```bash
php artisan serve          # Backend :8000
npm run dev                # Vite :5173
php artisan queue:listen   # Background jobs
```

### WhatsApp Service (optional)
```bash
cd fastapi
python -m venv venv
.\venv\Scripts\activate    # Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8001  # FastAPI
cd wa-gateway && npm install && npm start        # WA Gateway :3001
```

### Database Migrations
```bash
php artisan migrate
php artisan db:seed        # Seed initial data
```

## Common Tasks

### Add New React Page
1. Create page in `resources/js/pages/NewPage.jsx`
2. Import in `resources/js/App.jsx`
3. Add `<Route path="/new-page" element={<NewPage />} />`
4. Add backend route in `routes/web.php`: `Route::get('/new-page', fn() => view('app'))`
5. Add API endpoint if needed: `Route::get('/api/new-page', [Controller::class, 'method'])`

### Add New API Endpoint
1. Create controller method returning JSON
2. Add route in `routes/web.php` under `Route::middleware('auth')->group()`
3. Prefix with `/api/` for consistency
4. Use `Request $request` injection, return `response()->json()`

### MikroTik Operations
```php
$mikrotik = new MikroTikService();
$mikrotik->connect();
$mikrotik->createPPPoESecret($username, $password, $profile);
$mikrotik->isolateUser($username);  // Changes profile to "isolir"
$mikrotik->disconnect();
```

### Send WhatsApp Notification
```bash
# Via FastAPI endpoint
curl -X POST http://localhost:8001/send-notification \
  -H "Content-Type: application/json" \
  -d '{"type":"gangguan","title":"Gangguan Jaringan","odp":"ODP-01"}'
```

## Important Notes

- **CSRF Token**: Required for all POST/PUT/DELETE - included in `app.blade.php` meta tag
- **Customer Phone**: Format `08xxxxxxxxxx` (Indonesian mobile) - validated before WhatsApp send
- **Due Date Logic**: +30 days on payment confirmation (from old due_date if not isolated, from today if isolated)
- **ODP**: Optical Distribution Point - used for grouping customers by physical location
- **Invoice Link**: Unique shareable link - never expires, no authentication
- **Isolation**: MikroTik profile change only - customer PPPoE secret remains, just limited bandwidth

## Tech Stack Reference
- **Backend**: Laravel 12, PHP 8.2, MySQL
- **Frontend**: React 18, React Router 6, Tailwind CSS 3, Vite 7
- **Icons**: lucide-react
- **Charts**: chart.js + react-chartjs-2
- **External**: MikroTik RouterOS API (port 8728), FastAPI (Python 3.x), whatsapp-web.js (Node.js)
- **Dev Tools**: Composer, NPM, Laravel Pint (code style)
