const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
loadEnvFile(path.resolve(__dirname, '../../.env'));
loadEnvFile(path.resolve(__dirname, '../.env'));
loadEnvFile(path.resolve(__dirname, '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

app.use(express.json({ limit: '25mb' }));

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled promise rejection pada WA gateway:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception pada WA gateway:', error);
});

// Status WhatsApp
let waStatus = {
    ready: false,
    qr: null,
    qrBase64: null,
    phone: null,
    error: null,
    lastState: null,
    readyAt: null,
    qrGeneratedAt: null,
    lastErrorAt: null,
};

const PAYMENT_WEBHOOK_URL = process.env.WA_PAYMENT_WEBHOOK_URL || ((process.env.APP_URL || 'http://localhost').replace(/\/+$/, '') + '/api/whatsapp/webhooks/payments');
const PAYMENT_WEBHOOK_SECRET = process.env.WA_PAYMENT_WEBHOOK_SECRET || '';
const PAYMENT_FORWARD_ENABLED = String(process.env.WA_PAYMENT_FORWARD_ENABLED || 'true').toLowerCase() !== 'false';
const SUPPORTED_PAYMENT_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/jfif',
    'image/pjpeg',
    'application/pdf',
];
const GATEWAY_LOG_PATH = path.resolve(__dirname, 'logs/payment-forward.log');
const RECENT_GATEWAY_EVENTS_LIMIT = 200;
const CIPHERTEXT_RESOLUTION_TIMEOUT_MS = 30000;
const LOCAL_AUTH_DATA_PATH = path.resolve(__dirname, 'sessions');
const WWEBJS_CACHE_PATH = path.resolve(__dirname, '.wwebjs_cache');
const processedInboundMessageIds = new Map();
const pendingCiphertextMessages = new Map();

// Cari executable Chrome/Chromium yang tersedia di sistem
function findChromiumExecutable() {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
    ].filter(Boolean);

    for (const p of candidates) {
        try {
            if (require('fs').existsSync(p)) {
                return p;
            }
        } catch (_) { /* ignore */ }
    }
    return null;
}

let client = null;
let isReinitializing = false;

function cleanSessionFolder() {
    try {
        if (fs.existsSync(WWEBJS_CACHE_PATH)) {
            fs.rmSync(WWEBJS_CACHE_PATH, { recursive: true, force: true });
            console.log('🧹 Cache .wwebjs_cache dibersihkan.');
        }
        if (fs.existsSync(LOCAL_AUTH_DATA_PATH)) {
            fs.rmSync(LOCAL_AUTH_DATA_PATH, { recursive: true, force: true });
            console.log('🧹 Folder session LocalAuth dibersihkan.');
        }
    } catch (e) {
        console.warn('⚠️ Gagal membersihkan folder session:', e.message);
    }
}

async function initWhatsAppClient(cleanSession = false) {
    if (isReinitializing) {
        console.log('⏳ Inisialisasi WhatsApp sedang berlangsung, abaikan pemanggilan berulang...');
        return;
    }
    isReinitializing = true;

    if (client) {
        try {
            console.log('🛑 Menghentikan instance WhatsApp client lama...');
            await client.destroy();
        } catch (e) {
            console.warn('⚠️ client.destroy() warning:', e.message);
        }
        client = null;
    }

    if (cleanSession) {
        cleanSessionFolder();
    }

    resetRuntimeState();

    const chromiumPath = findChromiumExecutable();
    if (chromiumPath) {
        console.log(`🌐 Menggunakan Chrome/Chromium: ${chromiumPath}`);
    } else {
        console.log('🌐 Chrome/Chromium tidak ditemukan di path sistem, menggunakan bundled puppeteer.');
    }

    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './sessions'
        }),
        webVersionCache: {
            type: 'none'
        },
        puppeteer: {
            headless: true,
            ...(chromiumPath ? { executablePath: chromiumPath } : {}),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    // Event: QR Code
    client.on('qr', async (qr) => {
        console.log('\n📱 SCAN QR CODE INI DENGAN WHATSAPP ANDA:');
        qrcode.generate(qr, { small: true });
        waStatus.qrGeneratedAt = new Date().toISOString();
        waStatus.error = null;
        
        // Generate base64 QR untuk API
        try {
            waStatus.qrBase64 = await QRCode.toDataURL(qr);
            waStatus.qr = qr;
        } catch (err) {
            console.error('Error generating QR:', err);
        }
    });

    // Event: Ready
    client.on('ready', () => {
        console.log('\n✅ WhatsApp Client siap!');
        waStatus.ready = true;
        waStatus.qr = null;
        waStatus.qrBase64 = null;
        waStatus.error = null;
        waStatus.readyAt = new Date().toISOString();
        waStatus.lastState = 'CONNECTED';
        
        // Ambil info nomor
        const info = client.info;
        if (info && info.wid) {
            waStatus.phone = info.wid.user;
            console.log(`📞 Terhubung sebagai: ${waStatus.phone}`);
        }
    });

    // Event: Authenticated
    client.on('authenticated', () => {
        console.log('🔐 Autentikasi berhasil!');
        waStatus.error = null;
        waStatus.lastErrorAt = null;
    });

    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ Loading WhatsApp ${percent}%: ${message}`);
    });

    // Event: Connection state change
    client.on('change_state', (state) => {
        console.log(`🔄 State berubah: ${state}`);
        waStatus.lastState = state;

        if (state === 'CONNECTED') {
            waStatus.ready = true;
            waStatus.error = null;
            waStatus.lastErrorAt = null;
            waStatus.readyAt = new Date().toISOString();

            if (client.info && client.info.wid) {
                waStatus.phone = client.info.wid.user;
            }
        } else if (state === 'UNPAIRED' || state === 'UNPAIRED_IDLE') {
            waStatus.ready = false;
            waStatus.phone = null;
            waStatus.readyAt = null;
        }
    });

    // Event: Auth Failure
    client.on('auth_failure', async (msg) => {
        console.error('❌ Autentikasi gagal (sesi tidak valid / kedaluwarsa):', msg);
        waStatus.error = 'Authentication failed: ' + msg;
        waStatus.ready = false;
        waStatus.lastErrorAt = new Date().toISOString();

        // Otomatis reset sesi lama & generate QR code baru tanpa perlu CLI
        console.log('🔄 Otomatis membersihkan sesi kedaluwarsa & menyiapkan QR baru...');
        setTimeout(() => {
            isReinitializing = false;
            initWhatsAppClient(true);
        }, 3000);
    });

    // Event: Disconnected
    client.on('disconnected', async (reason) => {
        console.log('🔌 WhatsApp terputus:', reason);
        waStatus.ready = false;
        waStatus.phone = null;
        waStatus.error = 'Disconnected: ' + reason;
        waStatus.lastErrorAt = new Date().toISOString();
        waStatus.readyAt = null;

        const reasonStr = String(reason || '').toUpperCase();
        const isLoggedOut = reasonStr.includes('LOGOUT') ||
                            reasonStr.includes('UNPAIRED') ||
                            reasonStr.includes('CONFLICT') ||
                            reasonStr.includes('NAVIGATION') ||
                            reasonStr.includes('INTENTIONAL');

        setTimeout(() => {
            isReinitializing = false;
            if (isLoggedOut) {
                console.log('🧹 Status LOGOUT/UNPAIRED terdeteksi. Otomatis reset session agar QR code baru langsung tersedia.');
                initWhatsAppClient(true);
            } else {
                console.log('🔄 Mencoba reconnect WhatsApp...');
                initWhatsAppClient(false);
            }
        }, 3000);
    });

    // Tangkap pesan masuk
    client.on('message', async (msg) => {
        await handleInboundCandidate('message', msg);
    });

    client.on('message_create', async (msg) => {
        await handleInboundCandidate('message_create', msg);
    });

    client.on('message_ciphertext', async (msg) => {
        await handleCiphertextCandidate(msg);
    });

    try {
        console.log('⏳ Menginisialisasi Puppeteer / WhatsApp Web...');
        await client.initialize();
    } catch (initErr) {
        console.error('❌ Error client.initialize():', initErr.message);
        waStatus.error = 'Init error: ' + initErr.message;
        // Jika error saat inisialisasi session lama, coba bersihkan session
        if (cleanSession === false) {
            console.log('🔄 Mencoba ulang dengan pembersihan session...');
            setTimeout(() => {
                isReinitializing = false;
                initWhatsAppClient(true);
            }, 5000);
            return;
        }
    } finally {
        isReinitializing = false;
    }
}

// Keep-Alive Heartbeat: Memastikan koneksi WhatsApp Web tetap aktif & tidak logout karena idle
setInterval(async () => {
    if (client && waStatus.ready) {
        try {
            const state = await client.getState();
            if (state !== 'CONNECTED') {
                console.log(`⚠️ Keep-alive check: status saat ini adalah ${state}`);
            }
        } catch (err) {
            // Ignore temporary eval issues
        }
    }
}, 3 * 60 * 1000);

// Derive status from runtime state to avoid relying only on event timing.
async function getRealtimeStatus() {
    let state = null;

    try {
        state = await client.getState();
    } catch (err) {
        // getState() can throw while client is still initializing.
    }

    if (!waStatus.phone && client.info && client.info.wid) {
        waStatus.phone = client.info.wid.user;
    }

    if (state === 'CONNECTED' || !!waStatus.phone) {
        waStatus.ready = true;
        waStatus.error = null;
        waStatus.qr = null;
        waStatus.qrBase64 = null;
    }

    return {
        ready: waStatus.ready,
        phone: waStatus.phone,
        hasQR: !!waStatus.qrBase64,
        error: waStatus.error,
        state,
        pid: process.pid,
        uptime_seconds: Math.round(process.uptime()),
        session_path: LOCAL_AUTH_DATA_PATH,
        ready_at: waStatus.readyAt,
        qr_generated_at: waStatus.qrGeneratedAt,
        last_state: waStatus.lastState,
        last_error_at: waStatus.lastErrorAt,
    };
}

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        if (!line || line.trim().startsWith('#') || !line.includes('=')) {
            continue;
        }

        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        if (!key || process.env[key] !== undefined) {
            continue;
        }

        let value = line.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        process.env[key] = value;
    }
}

function normalizeInboundPhone(rawPhone) {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) {
        return '';
    }

    if (digits.startsWith('62')) {
        return `0${digits.slice(2)}`;
    }

    return digits.startsWith('0') ? digits : `0${digits}`;
}

function shouldForwardMimeType(mimeType) {
    if (!mimeType) return false;
    const clean = String(mimeType).split(';')[0].trim().toLowerCase();
    return clean.startsWith('image/') || clean === 'application/pdf' || SUPPORTED_PAYMENT_MIME_TYPES.includes(clean);
}

function normalizeMimeType(rawMime) {
    if (!rawMime) return 'image/jpeg';
    const clean = String(rawMime).split(';')[0].trim().toLowerCase();
    if (clean === 'image/jpg' || clean === 'image/jfif' || clean === 'image/pjpeg') {
        return 'image/jpeg';
    }
    return clean;
}

function isSelfChatMessage(msg) {
    if (!msg) return false;

    const fromStr = String(msg.from || '');
    const toStr = String(msg.to || '');
    if (fromStr.includes('@g.us') || toStr.includes('@g.us') || fromStr === 'status@broadcast') {
        return false;
    }

    const clean = (val) => String(val || '').replace(/@.*$/, '').replace(/\D/g, '');
    const fromNum = clean(msg.from);
    const toNum = clean(msg.to);
    const remoteNum = clean(msg.id?.remote);
    const botNum = clean(waStatus?.phone || client?.info?.wid?.user || '');

    // 1. If from and to numbers are identical and non-empty
    if (fromNum && toNum && fromNum === toNum) {
        return true;
    }

    // 2. If toNum or remoteNum matches the bot's own phone number
    if (botNum) {
        if (toNum === botNum && fromNum === botNum) return true;
        if (remoteNum === botNum && msg.fromMe) return true;
        if (toNum === botNum && msg.fromMe) return true;
    }

    // 3. Fallback: if fromStr equals toStr and not empty
    if (fromStr && toStr && fromStr === toStr) {
        return true;
    }

    return false;
}

function isLidIdentifier(val) {
    if (!val) return false;
    const str = String(val);
    if (str.includes('@lid')) return true;
    const digits = str.replace(/\D/g, '');
    return (digits.length >= 14 && (digits.startsWith('1') || digits.startsWith('2') || digits.startsWith('01') || digits.startsWith('02')));
}

function cleanLidDigits(val) {
    if (!val) return '';
    const digits = String(val).replace('@lid', '').replace(/\D/g, '');
    if (digits.length >= 15 && digits.startsWith('0')) {
        return digits.slice(1);
    }
    return digits;
}

async function resolveSenderDetails(msg) {
    const fromStr = String(msg?.from || '');
    const authorStr = String(msg?.author || '');
    const remoteStr = String(msg?._data?.id?.remote || '');
    const isSelf = isSelfChatMessage(msg);

    let senderLid = '';
    let isLid = false;
    if (fromStr.includes('@lid') || isLidIdentifier(fromStr)) {
        isLid = true;
        senderLid = cleanLidDigits(fromStr);
    } else if (authorStr.includes('@lid') || isLidIdentifier(authorStr)) {
        isLid = true;
        senderLid = cleanLidDigits(authorStr);
    } else if (remoteStr.includes('@lid') || isLidIdentifier(remoteStr)) {
        isLid = true;
        senderLid = cleanLidDigits(remoteStr);
    }

    // 1. Extract pushname / display name
    let senderName = '';
    let contact = null;
    try {
        if (typeof msg.getContact === 'function') {
            contact = await msg.getContact();
            if (contact) {
                senderName = contact.pushname || contact.name || '';
                if (!senderLid && contact.id?.server === 'lid') {
                    isLid = true;
                    senderLid = cleanLidDigits(contact.id.user || contact.number);
                }
            }
        }
    } catch (_) {}

    if (!senderName && msg._data) {
        senderName = msg._data.notifyName || msg._data.pushname || '';
    }

    // 2. Real phone number resolution
    let resolvedPhone = '';

    if (isSelf) {
        const bodyText = String(msg.body || '');
        const phoneMatch = bodyText.match(/(?:\+62|62|0)8[1-9][0-9]{7,11}/);
        if (phoneMatch) {
            resolvedPhone = normalizeInboundPhone(phoneMatch[0]);
        }
    }

    if (!resolvedPhone) {
        if (authorStr.endsWith('@c.us')) {
            resolvedPhone = normalizeInboundPhone(authorStr.replace('@c.us', ''));
        } else if (fromStr.endsWith('@c.us')) {
            resolvedPhone = normalizeInboundPhone(fromStr.replace('@c.us', ''));
        } else if (remoteStr.endsWith('@c.us')) {
            resolvedPhone = normalizeInboundPhone(remoteStr.replace('@c.us', ''));
        } else if (contact && contact.id?.server === 'c.us' && contact.number) {
            const p = normalizeInboundPhone(contact.number);
            if (p && p.length >= 10 && p.length <= 14) {
                resolvedPhone = p;
            }
        }
    }

    // 3. Query Puppeteer WA Web Store for LID to Phone mapping
    if (!resolvedPhone && (isLid || fromStr.includes('@lid')) && client && client.pupPage) {
        try {
            const lidQuery = fromStr.includes('@lid') ? fromStr : (senderLid ? `${senderLid}@lid` : fromStr);
            const queriedPhone = await client.pupPage.evaluate((targetLid, rawDigits) => {
                try {
                    const clean = String(targetLid || '').trim();
                    const full = clean.includes('@') ? clean : `${clean}@lid`;

                    if (window.Store?.LidContact) {
                        const lc = window.Store.LidContact.get ? window.Store.LidContact.get(full) : null;
                        if (lc?.phoneNumber) return String(lc.phoneNumber);
                        if (lc?.wid?.user && lc?.wid?.server === 'c.us') return String(lc.wid.user);
                    }

                    if (window.Store?.Contact) {
                        const c = window.Store.Contact.get ? window.Store.Contact.get(full) : null;
                        if (c?.phoneNumber) return String(c.phoneNumber);
                        if (c?.id?.server === 'c.us' && c?.id?.user) return String(c.id.user);
                        if (c?.wid?.server === 'c.us' && c?.wid?.user) return String(c.wid.user);
                    }

                    if (window.Store?.LidUtils?.getPhoneNumber) {
                        const num = window.Store.LidUtils.getPhoneNumber(full);
                        if (num) return String(num);
                    }

                    if (window.Store?.Chat) {
                        const chat = window.Store.Chat.get ? window.Store.Chat.get(full) : null;
                        if (chat?.contact?.phoneNumber) return String(chat.contact.phoneNumber);
                        if (chat?.id?.server === 'c.us' && chat?.id?.user) return String(chat.id.user);
                    }

                    if (window.Store?.Contact?.models) {
                        const found = window.Store.Contact.models.find(m =>
                            (m.lid === full || m.id?._serialized === full || m.lid?._serialized === full || (rawDigits && String(m.id?.user) === String(rawDigits))) &&
                            (m.phoneNumber || (m.id?.server === 'c.us' && m.id?.user))
                        );
                        if (found?.phoneNumber) return String(found.phoneNumber);
                        if (found?.id?.server === 'c.us' && found?.id?.user) return String(found.id.user);
                    }

                    return null;
                } catch (e) {
                    return null;
                }
            }, lidQuery, senderLid);

            if (queriedPhone) {
                const norm = normalizeInboundPhone(queriedPhone);
                if (norm && norm.length >= 10 && norm.length <= 14) {
                    resolvedPhone = norm;
                    console.log(`🔍 [LID Resolver] Berhasil menemukan nomor HP asli dari LID ${senderLid}: ${resolvedPhone}`);
                }
            }
        } catch (_) {}
    }

    return {
        phone: resolvedPhone,
        lid: senderLid,
        name: String(senderName || '').trim(),
        isLid: isLid || !resolvedPhone,
        rawSender: fromStr,
    };
}

async function resolveSenderPhone(msg) {
    const details = await resolveSenderDetails(msg);
    return details.phone || (details.lid ? `0${details.lid}` : normalizeInboundPhone(msg.from));
}

function getMessageId(msg) {
    return msg?.id?._serialized || msg?.id?.id || 'unknown';
}

function buildMessageContext(msg, sourceEvent = null) {
    const preview = String(msg?.body || '').substring(0, 80);

    return {
        source_event: sourceEvent,
        message_id: getMessageId(msg),
        from: msg?.from || null,
        to: msg?.to || null,
        author: msg?.author || null,
        from_me: !!msg?.fromMe,
        is_self: isSelfChatMessage(msg),
        has_media: !!msg?.hasMedia,
        type: msg?.type || msg?._data?.type || null,
        mime_type: msg?._data?.mimetype || null,
        timestamp: msg?.timestamp || null,
        body_preview: preview,
        chat_scope: classifyChatScope(msg),
    };
}

function classifyChatScope(msg) {
    if (isSelfChatMessage(msg)) {
        return 'self_chat';
    }

    if (msg?.fromMe) {
        return 'outbound_message';
    }

    if (msg?.from === 'status@broadcast') {
        return 'status_broadcast';
    }

    if (msg?.from?.includes('@g.us')) {
        return 'group';
    }

    if (msg?.from?.endsWith('@c.us') || msg?.from?.endsWith('@lid')) {
        return 'external_private_chat';
    }

    return 'unknown';
}

function logGatewayEvent(event, payload = {}) {
    const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...payload,
    });

    try {
        fs.mkdirSync(path.dirname(GATEWAY_LOG_PATH), { recursive: true });
        fs.appendFileSync(GATEWAY_LOG_PATH, `${line}\n`);
    } catch (err) {
        console.error('❌ Gagal menulis gateway log:', err.message);
    }
}

function getRecentGatewayEvents(limit = 50) {
    if (!fs.existsSync(GATEWAY_LOG_PATH)) {
        return [];
    }

    const lines = fs.readFileSync(GATEWAY_LOG_PATH, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean);

    return lines
        .slice(-Math.max(1, Math.min(limit, RECENT_GATEWAY_EVENTS_LIMIT)))
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch (err) {
                return { timestamp: new Date().toISOString(), event: 'parse_error', raw: line };
            }
        });
}

function buildGatewayDiagnostics(events, windowMinutes = 15) {
    const now = Date.now();
    const windowMs = Math.max(1, windowMinutes) * 60 * 1000;
    const recentEvents = events.filter((event) => {
        const timestamp = Date.parse(event.timestamp || '');
        return Number.isFinite(timestamp) && (now - timestamp) <= windowMs;
    });

    const summary = {
        window_minutes: windowMinutes,
        total_events: events.length,
        recent_events: recentEvents.length,
        event_counts: {},
        skipped_by_reason: {},
        inbound_from_me: 0,
        inbound_external_private: 0,
        inbound_group: 0,
        inbound_status: 0,
        inbound_unknown: 0,
        ciphertext_seen: 0,
        ciphertext_unresolved: 0,
        decryption_resolved: 0,
        forward_attempt: 0,
        forward_succeeded: 0,
        forward_failed: 0,
        latest_event_at: events.length > 0 ? events[events.length - 1].timestamp || null : null,
        latest_external_inbound_at: null,
        latest_ciphertext_seen_at: null,
        latest_decryption_resolved_at: null,
        latest_forward_attempt_at: null,
        latest_forward_success_at: null,
        latest_forward_failed_at: null,
        actionable_state: 'no_recent_events',
    };

    for (const event of recentEvents) {
        const eventName = String(event.event || 'unknown');
        summary.event_counts[eventName] = (summary.event_counts[eventName] || 0) + 1;

        if (eventName === 'incoming') {
            switch (event.chat_scope) {
                case 'self_message':
                    summary.inbound_from_me += 1;
                    break;
                case 'external_private_chat':
                    summary.inbound_external_private += 1;
                    summary.latest_external_inbound_at = event.timestamp || summary.latest_external_inbound_at;
                    break;
                case 'group':
                    summary.inbound_group += 1;
                    break;
                case 'status_broadcast':
                    summary.inbound_status += 1;
                    break;
                default:
                    summary.inbound_unknown += 1;
                    break;
            }
        }

        if (eventName === 'skipped') {
            const reason = String(event.reason || 'unknown');
            summary.skipped_by_reason[reason] = (summary.skipped_by_reason[reason] || 0) + 1;
            if (reason === 'ciphertext_unresolved') {
                summary.ciphertext_unresolved += 1;
            }
        }

        if (eventName === 'ciphertext_seen') {
            summary.ciphertext_seen += 1;
            summary.latest_ciphertext_seen_at = event.timestamp || summary.latest_ciphertext_seen_at;
        }

        if (eventName === 'decryption_resolved') {
            summary.decryption_resolved += 1;
            summary.latest_decryption_resolved_at = event.timestamp || summary.latest_decryption_resolved_at;
        }

        if (eventName === 'forward_attempt') {
            summary.forward_attempt += 1;
            summary.latest_forward_attempt_at = event.timestamp || summary.latest_forward_attempt_at;
        }

        if (eventName === 'forward_succeeded') {
            summary.forward_succeeded += 1;
            summary.latest_forward_success_at = event.timestamp || summary.latest_forward_success_at;
        }

        if (eventName === 'forward_failed') {
            summary.forward_failed += 1;
            summary.latest_forward_failed_at = event.timestamp || summary.latest_forward_failed_at;
        }
    }

    if (summary.recent_events === 0) {
        summary.actionable_state = 'no_recent_events';
    } else if (summary.ciphertext_unresolved > 0 && summary.forward_attempt === 0) {
        summary.actionable_state = 'ciphertext_seen_waiting_resolution';
    } else if (summary.inbound_external_private > 0 && summary.forward_attempt === 0) {
        summary.actionable_state = 'external_inbound_seen_but_not_forwarded';
    } else if (summary.forward_attempt > 0 && summary.forward_succeeded === 0) {
        summary.actionable_state = 'forward_attempt_failed_or_pending';
    } else if (summary.forward_succeeded > 0) {
        summary.actionable_state = 'forward_succeeded';
    } else if (summary.inbound_from_me > 0 && summary.inbound_external_private === 0) {
        summary.actionable_state = 'self_chat_only';
    } else {
        summary.actionable_state = 'recent_events_without_external_private_forward';
    }

    return summary;
}

function markMessageAsProcessed(messageId, sourceEvent) {
    if (!messageId || messageId === 'unknown') {
        return;
    }

    processedInboundMessageIds.set(messageId, {
        source_event: sourceEvent,
        processed_at: Date.now(),
    });

    const expiration = Date.now() - (10 * 60 * 1000);
    for (const [id, meta] of processedInboundMessageIds.entries()) {
        if ((meta?.processed_at || 0) < expiration) {
            processedInboundMessageIds.delete(id);
        }
    }
}

function wasMessageAlreadyProcessed(messageId) {
    if (!messageId || messageId === 'unknown') {
        return false;
    }

    return processedInboundMessageIds.has(messageId);
}

function rememberPendingCiphertext(messageId, context) {
    if (!messageId || messageId === 'unknown') {
        return;
    }

    pendingCiphertextMessages.set(messageId, {
        context,
        seen_at: Date.now(),
    });
}

function consumePendingCiphertext(messageId) {
    if (!messageId || messageId === 'unknown') {
        return null;
    }

    const existing = pendingCiphertextMessages.get(messageId) || null;
    if (existing) {
        pendingCiphertextMessages.delete(messageId);
    }

    return existing;
}

function sweepPendingCiphertextMessages() {
    const expiration = Date.now() - CIPHERTEXT_RESOLUTION_TIMEOUT_MS;

    for (const [messageId, entry] of pendingCiphertextMessages.entries()) {
        if ((entry?.seen_at || 0) > expiration) {
            continue;
        }

        logGatewayEvent('skipped', {
            ...(entry?.context || { message_id: messageId }),
            reason: 'ciphertext_unresolved',
        });
        pendingCiphertextMessages.delete(messageId);
    }
}

async function handleCiphertextCandidate(msg) {
    const isSelf = isSelfChatMessage(msg);
    const context = buildMessageContext(msg, 'message_ciphertext');
    logGatewayEvent('ciphertext_seen', context);

    if (context.from_me && !isSelf) {
        logGatewayEvent('skipped', {
            ...context,
            reason: 'from_me_outbound',
        });
        return;
    }

    rememberPendingCiphertext(context.message_id, context);
    sweepPendingCiphertextMessages();
}

const MEDIA_HKDF_MAP = {
    image: 'WhatsApp Image Keys',
    video: 'WhatsApp Video Keys',
    audio: 'WhatsApp Audio Keys',
    document: 'WhatsApp Document Keys',
    sticker: 'WhatsApp Image Keys',
};

async function decryptWhatsAppMediaFromCdn(directPath, mediaKeyRaw, mediaType = 'image') {
    if (!directPath || !mediaKeyRaw) return null;

    let mediaKey;
    try {
        if (Buffer.isBuffer(mediaKeyRaw)) {
            mediaKey = mediaKeyRaw;
        } else if (typeof mediaKeyRaw === 'string') {
            mediaKey = Buffer.from(mediaKeyRaw, 'base64');
        } else if (mediaKeyRaw && typeof mediaKeyRaw === 'object' && Array.isArray(mediaKeyRaw.data)) {
            mediaKey = Buffer.from(mediaKeyRaw.data);
        } else {
            return null;
        }
    } catch (_) {
        return null;
    }

    if (!mediaKey || mediaKey.length !== 32) {
        console.warn(`⚠️ [Media CDN] Panjang mediaKey (${mediaKey?.length}) bukan 32 bytes.`);
        return null;
    }

    const infoLabel = MEDIA_HKDF_MAP[mediaType] || MEDIA_HKDF_MAP['image'];
    const salt = Buffer.alloc(32, 0);
    const derived = Buffer.from(crypto.hkdfSync('sha256', mediaKey, salt, Buffer.from(infoLabel), 112));

    const iv = derived.subarray(0, 16);
    const cipherKey = derived.subarray(16, 48);

    const candidates = [];
    if (directPath.startsWith('http')) {
        candidates.push(directPath);
    } else {
        const cleanPath = directPath.startsWith('/') ? directPath : `/${directPath}`;
        candidates.push(`https://mmg.whatsapp.net${cleanPath}`);
        candidates.push(`https://pps.whatsapp.net${cleanPath}`);
    }

    for (const url of candidates) {
        try {
            console.log(`🌐 [Media CDN] Mengunduh encrypted payload dari CDN WhatsApp: ${url.substring(0, 65)}...`);
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'WhatsApp/2.24.12.78 i',
                },
                signal: AbortSignal.timeout(15000),
            });

            if (res.ok) {
                const fileBuffer = Buffer.from(await res.arrayBuffer());
                if (fileBuffer.length > 20) {
                    const encryptedPayload = fileBuffer.subarray(0, fileBuffer.length - 10);
                    const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
                    const decrypted = Buffer.concat([
                        decipher.update(encryptedPayload),
                        decipher.final(),
                    ]);

                    if (decrypted && decrypted.length > 500) {
                        console.log(`🎉 [Media CDN] SUKSES! File asli terdekripsi penuh (${decrypted.length} bytes, high-res)`);
                        return decrypted;
                    }
                }
            } else {
                console.warn(`⚠️ [Media CDN] Gagal unduh dari ${url.substring(0, 45)}: HTTP ${res.status}`);
            }
        } catch (fetchErr) {
            console.warn(`⚠️ [Media CDN] Exception saat request ${url.substring(0, 45)}: ${fetchErr.message}`);
        }
    }

    return null;
}

async function downloadMediaWithRetry(msg, maxAttempts = 5, delayMs = 1500) {
    if (!msg || !msg.hasMedia) return null;

    // TIER 0 (PRIORITAS UTAMA): Direct Native CDN Download & Decrypt via Node.js Crypto
    // Kebal terhadap bug Puppeteer, kebal terhadap bug @lid multi-device, dan langsung mengambil
    // file gambar asli resolusi penuh 100% tanpa kompresi / blur!
    try {
        let directPath = msg._data?.directPath || msg.directPath;
        let mediaKey = msg._data?.mediaKey || msg.mediaKey;
        let mediaType = msg._data?.type || msg.type || 'image';
        let mimeType = msg._data?.mimetype || msg.mimetype || 'image/jpeg';
        let filename = msg._data?.filename || msg.filename || 'payment.jpg';

        if ((!directPath || !mediaKey) && client && client.pupPage) {
            try {
                const meta = await client.pupPage.evaluate((msgId, rawId) => {
                    let m = window.Store?.Msg?.get ? window.Store.Msg.get(msgId) : null;
                    if (!m && window.Store?.Msg?.models) {
                        m = window.Store.Msg.models.find((x) =>
                            x.id?._serialized === msgId ||
                            x.id?.id === rawId ||
                            (rawId && x.id?._serialized && x.id._serialized.includes(rawId))
                        );
                    }
                    if (!m) return null;
                    return {
                        directPath: m.directPath || m.mediaData?.directPath,
                        mediaKey: m.mediaKey || m.mediaData?.mediaKey,
                        type: m.type || m.mediaData?.type,
                        mimetype: m.mimetype || m.mediaData?.mimetype,
                    };
                }, msg.id._serialized, msg.id.id);

                if (meta) {
                    directPath = directPath || meta.directPath;
                    mediaKey = mediaKey || meta.mediaKey;
                    mediaType = mediaType || meta.type;
                    mimeType = mimeType || meta.mimetype;
                }
            } catch (_) {}
        }

        if (directPath && mediaKey) {
            console.log(`🚀 [Media] Mencoba Direct Native CDN Decrypt untuk ${msg.id?._serialized || 'pesan'}...`);
            const decryptedBuffer = await decryptWhatsAppMediaFromCdn(directPath, mediaKey, mediaType);
            if (decryptedBuffer && decryptedBuffer.length > 2000) {
                console.log(`✅ [Media] BERHASIL UNDUH FILE ASLI RESOLUSI PENUH via CDN (${mimeType}, size: ${decryptedBuffer.length} bytes, high-res)`);
                return {
                    data: decryptedBuffer.toString('base64'),
                    mimetype: mimeType,
                    filename: filename,
                };
            }
        }
    } catch (cdnErr) {
        console.warn(`⚠️ Direct CDN Decrypt gagal, beralih ke fallback internal: ${cdnErr.message}`);
    }

    // Jeda 600ms awal agar media selesai streaming dari server WA
    await new Promise((resolve) => setTimeout(resolve, 600));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // TIER 1: Method bawaan whatsapp-web.js (dengan memastikan chat ter-load terlebih dahulu)
        try {
            await msg.getChat().catch(() => null);
            const media = await msg.downloadMedia();
            if (media && media.data && media.mimetype && media.data.length > 8000) {
                console.log(`✅ [Media] Berhasil unduh gambar resolusi penuh via whatsapp-web.js (${media.mimetype}, length: ${media.data.length})`);
                return media;
            }
        } catch (err) {
            console.warn(`⚠️ downloadMedia percobaan ke-${attempt} gagal: ${err.message || err}`);
        }

        // TIER 2: Injeksi Puppeteer Evaluate langsung ke store WA Web (mengatasi bug @lid & error 'r')
        try {
            if (client && client.pupPage) {
                const browserMedia = await client.pupPage.evaluate(async (msgId, rawId) => {
                    try {
                        let msgModel = window.Store?.Msg?.get ? window.Store.Msg.get(msgId) : null;
                        if (!msgModel && window.Store?.Msg?.models) {
                            msgModel = window.Store.Msg.models.find((m) =>
                                m.id?._serialized === msgId ||
                                m.id?.id === rawId ||
                                (rawId && m.id?._serialized && m.id._serialized.includes(rawId))
                            );
                        }

                        if (!msgModel) return null;

                        const md = msgModel.mediaData;

                        // Jika mediaData sudah memiliki base64 data langsung (resolusi penuh > 8000 chars)
                        if (md && md.data && typeof md.data === 'string' && md.data.length > 8000) {
                            return {
                                data: md.data.replace(/^data:[^;]+;base64,/, ''),
                                mimetype: msgModel.mimetype || md.mimetype || 'image/jpeg',
                                filename: msgModel.filename || 'payment.jpg',
                            };
                        }

                        // Coba unduh via fungsi model dengan try...catch aman
                        if (typeof msgModel.downloadMedia === 'function') {
                            try {
                                await msgModel.downloadMedia({
                                    downloadEvenIfExpensive: true,
                                    rmrReason: 1,
                                });
                            } catch (_) {}
                        } else if (md && typeof md.downloadMedia === 'function') {
                            try {
                                await md.downloadMedia({
                                    downloadEvenIfExpensive: true,
                                    rmrReason: 1,
                                });
                            } catch (_) {}
                        }

                        // Coba ambil blob url dari renderableUrl
                        if (md && md.renderableUrl) {
                            try {
                                const resp = await fetch(md.renderableUrl);
                                const blob = await resp.blob();
                                const b64 = await new Promise((res) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => res(reader.result ? reader.result.split(',')[1] : null);
                                    reader.readAsDataURL(blob);
                                });
                                if (b64 && b64.length > 8000) {
                                    return {
                                        data: b64,
                                        mimetype: msgModel.mimetype || md.mimetype || 'image/jpeg',
                                        filename: msgModel.filename || 'payment.jpg',
                                    };
                                }
                            } catch (_) {}
                        }

                        // Coba dekripsi via DownloadManager
                        const dm = window.Store?.DownloadManager || window.Store?.mediaContent;
                        const decryptFn = dm && (dm.downloadAndMaybeDecrypt || dm.downloadAndDecrypt);
                        if (decryptFn && md && md.directPath && md.encFilehash && md.mediaKey) {
                            try {
                                const mockQpl = {
                                    addAnnotations: function () { return this; },
                                    addPoint: function () { return this; },
                                };
                                const decrypted = await decryptFn.call(dm, {
                                    directPath: md.directPath,
                                    encFilehash: md.encFilehash,
                                    filehash: md.filehash,
                                    mediaKey: md.mediaKey,
                                    mediaKeyTimestamp: md.mediaKeyTimestamp,
                                    type: msgModel.type || 'image',
                                    signal: new AbortController().signal,
                                    downloadQpl: mockQpl,
                                });

                                if (decrypted) {
                                    let b64 = null;
                                    if (window.WWebJS && typeof window.WWebJS.arrayBufferToBase64Async === 'function') {
                                        b64 = await window.WWebJS.arrayBufferToBase64Async(decrypted);
                                    } else {
                                        const blob = new Blob([decrypted], { type: msgModel.mimetype || 'image/jpeg' });
                                        const reader = new FileReader();
                                        b64 = await new Promise((res) => {
                                            reader.onloadend = () => res(reader.result ? reader.result.split(',')[1] : null);
                                            reader.readAsDataURL(blob);
                                        });
                                    }

                                    if (b64 && b64.length > 8000) {
                                        return {
                                            data: b64,
                                            mimetype: msgModel.mimetype || 'image/jpeg',
                                            filename: msgModel.filename || 'payment.jpg',
                                        };
                                    }
                                }
                            } catch (_) {}
                        }

                        return null;
                    } catch (e) {
                        return null;
                    }
                }, msg.id._serialized, msg.id.id);

                if (browserMedia && browserMedia.data && browserMedia.data.length > 8000) {
                    console.log(`✅ [Media] Berhasil diekstrak via Puppeteer store WA Web (${browserMedia.mimetype}, length: ${browserMedia.data.length})`);
                    return browserMedia;
                }
            }
        } catch (pupErr) {
            console.warn(`⚠️ Puppeteer media extraction fallback gagal: ${pupErr.message}`);
        }

        if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    // PENTING: JANGAN gunakan fallback preview thumbnail (msg._data.body) karena berukuran ~80x80px dan sangat blur.
    // Menghindari pengiriman thumbnail blur agar pesan dapat dicoba ulang (canRetry: true).
    console.warn('⚠️ [Media] Gagal mengunduh gambar resolusi penuh dari semua metode. Menghindari pengiriman thumbnail blur.');
    return null;
}

function getWebhookCandidateUrls() {
    const urls = [];
    if (process.env.WA_PAYMENT_WEBHOOK_URL) {
        urls.push(process.env.WA_PAYMENT_WEBHOOK_URL.trim());
    }
    if (process.env.APP_URL) {
        const appUrl = process.env.APP_URL.trim().replace(/\/+$/, '');
        urls.push(`${appUrl}/api/whatsapp/webhooks/payments`);
    }
    urls.push('http://127.0.0.1/api/whatsapp/webhooks/payments');
    urls.push('http://localhost/api/whatsapp/webhooks/payments');
    urls.push('http://127.0.0.1:8000/api/whatsapp/webhooks/payments');

    return [...new Set(urls.filter(Boolean))];
}

async function postToWebhook(payload, headers) {
    const candidateUrls = getWebhookCandidateUrls();
    let lastError = null;

    for (const targetUrl of candidateUrls) {
        try {
            console.log(`🚚 Mencoba forward payment webhook ke ${targetUrl}...`);
            let res = await fetch(targetUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                redirect: 'manual',
            });

            // Handle HTTP 301/302/307/308 redirects manually to preserve POST body & method
            if ([301, 302, 307, 308].includes(res.status) && res.headers.has('location')) {
                const redirectedUrl = new URL(res.headers.get('location'), targetUrl).toString();
                console.log(`🔄 Webhook redirected [${res.status}] -> ${redirectedUrl}, re-posting payload...`);
                res = await fetch(redirectedUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                });
            }

            const bodyText = await res.text();
            if (res.ok) {
                return { ok: true, status: res.status, url: targetUrl, body: bodyText };
            }

            console.warn(`⚠️ Target webhook ${targetUrl} mengembalikan [${res.status}]: ${bodyText.substring(0, 150)}`);
            lastError = new Error(`HTTP ${res.status}: ${bodyText}`);
        } catch (err) {
            console.warn(`⚠️ Gagal menghubungi webhook target ${targetUrl}: ${err.message}`);
            lastError = err;
        }
    }

    throw lastError || new Error('Semua target webhook URL gagal dihubungi.');
}

async function handleInboundCandidate(sourceEvent, msg) {
    const isSelf = isSelfChatMessage(msg);
    const context = buildMessageContext(msg, sourceEvent);
    logGatewayEvent('incoming', context);
    sweepPendingCiphertextMessages();

    // Lewati pesan outbound ke kontak/grup lain (tetapi izinkan jika di chat Diri Sendiri)
    if (context.from_me && !isSelf) {
        logGatewayEvent('skipped', {
            ...context,
            reason: 'from_me_outbound',
        });
        return;
    }

    if (wasMessageAlreadyProcessed(context.message_id)) {
        logGatewayEvent('skipped', {
            ...context,
            reason: 'duplicate_event',
        });
        return;
    }

    const pendingCiphertext = consumePendingCiphertext(context.message_id);
    if (pendingCiphertext) {
        logGatewayEvent('decryption_resolved', {
            ...context,
            ciphertext_seen_at: new Date(pendingCiphertext.seen_at).toISOString(),
        });
    }

    const senderDisplay = isSelf ? 'Diri Sendiri (Self-chat)' : context.from;
    console.log(`📩 [${sourceEvent}] Pesan terdeteksi dari ${senderDisplay} (media: ${context.has_media}): "${context.body_preview}"`);

    try {
        const result = await maybeForwardPaymentMessage(msg, sourceEvent, context);
        if (result?.forwarded || result?.canRetry === false) {
            markMessageAsProcessed(context.message_id, sourceEvent);
        }
    } catch (err) {
        logGatewayEvent('forward_exception', {
            ...context,
            error: err.message,
        });
        console.error(`❌ Error forwarding payment webhook dari ${sourceEvent}:`, err.message);
    }
}

async function maybeForwardPaymentMessage(msg, sourceEvent = null, baseContext = null) {
    const context = baseContext || buildMessageContext(msg, sourceEvent);

    if (!PAYMENT_FORWARD_ENABLED) {
        logGatewayEvent('skipped', {
            ...context,
            reason: 'forward_disabled',
        });
        return { forwarded: false, canRetry: false };
    }

    if (!msg || !msg.from || msg.from.includes('@g.us') || msg.from === 'status@broadcast') {
        let reason = 'not_eligible';
        if (msg?.from?.includes('@g.us')) {
            reason = 'group_message';
        } else if (msg?.from === 'status@broadcast') {
            reason = 'status_broadcast';
        }

        logGatewayEvent('skipped', {
            ...context,
            reason,
        });
        return { forwarded: false, canRetry: false };
    }

    if (!msg.hasMedia) {
        logGatewayEvent('skipped', {
            ...context,
            reason: 'no_media',
        });
        console.log(`ℹ️ Pesan dari ${context.from || 'pengirim'} tidak memiliki lampiran media (bukan bukti bayar gambar), dilewati.`);
        return { forwarded: false, canRetry: false };
    }

    const senderDisplay = context.is_self ? 'Diri Sendiri' : (msg.from || 'pengirim');
    console.log(`📸 Terdeteksi media dari ${senderDisplay}, mulai mengunduh file...`);
    logGatewayEvent('media_download_started', context);
    const media = await downloadMediaWithRetry(msg, 4, 1500);
    if (!media || !media.data || !media.mimetype) {
        logGatewayEvent('skipped', {
            ...context,
            reason: !media ? 'media_download_empty' : 'media_data_empty',
            mime_type: media?.mimetype || null,
        });
        console.log(`ℹ️ Media dari ${senderDisplay} belum dapat diunduh, tidak menandai processed agar bisa dicoba ulang.`);
        return { forwarded: false, canRetry: true };
    }

    if (!shouldForwardMimeType(media.mimetype)) {
        logGatewayEvent('skipped', {
            ...context,
            reason: 'unsupported_mime_type',
            mime_type: media.mimetype,
        });
        console.log(`ℹ️ Media dari ${senderDisplay} dilewati karena mime type tidak didukung: ${media.mimetype}`);
        return { forwarded: false, canRetry: false };
    }

    const cleanMime = normalizeMimeType(media.mimetype);
    const senderDetails = await resolveSenderDetails(msg);
    const senderPhone = senderDetails.phone || (senderDetails.lid ? `0${senderDetails.lid}` : normalizeInboundPhone(msg.from));
    const mediaSize = Buffer.byteLength(media.data || '', 'base64');

    logGatewayEvent('media_download_succeeded', {
        ...context,
        mime_type: cleanMime,
        raw_mime: media.mimetype,
        sender_phone: senderPhone,
        sender_lid: senderDetails.lid || null,
        sender_name: senderDetails.name || null,
        media_size: mediaSize,
    });
    console.log(`✅ Media berhasil diunduh (${cleanMime}, ${mediaSize} bytes, pengirim: ${senderPhone}, lid: ${senderDetails.lid || '-'}, nama: ${senderDetails.name || '-'}). Meneruskan ke webhook...`);

    const payload = {
        message_id: getMessageId(msg) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sender_phone: senderPhone,
        sender_lid: senderDetails.lid || null,
        sender_name: senderDetails.name || null,
        sent_at: new Date((msg.timestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        media_base64: media.data,
        caption: msg.body || '',
        mime_type: cleanMime,
    };

    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };

    if (PAYMENT_WEBHOOK_SECRET) {
        headers['X-Webhook-Secret'] = PAYMENT_WEBHOOK_SECRET;
    }

    logGatewayEvent('forward_attempt', {
        ...context,
        message_id: payload.message_id,
        from: msg.from,
        sender_phone: payload.sender_phone,
        mime_type: payload.mime_type,
    });

    try {
        const postResult = await postToWebhook(payload, headers);

        logGatewayEvent('forward_succeeded', {
            ...context,
            message_id: payload.message_id,
            status: postResult.status,
            target_url: postResult.url,
            response_body: postResult.body,
        });
        console.log(`🎉 Webhook pembayaran berhasil [${postResult.status}] via ${postResult.url}: ${postResult.body}`);
        return { forwarded: true, canRetry: false };
    } catch (err) {
        logGatewayEvent('forward_failed', {
            ...context,
            message_id: payload.message_id,
            error: err.message,
        });
        console.error(`❌ Payment webhook gagal ke semua target: ${err.message}`);
        return { forwarded: false, canRetry: true };
    }
}

function resetRuntimeState() {
    waStatus.ready = false;
    waStatus.qr = null;
    waStatus.qrBase64 = null;
    waStatus.phone = null;
    waStatus.error = null;
    waStatus.lastState = null;
    waStatus.readyAt = null;
    waStatus.qrGeneratedAt = null;
    waStatus.lastErrorAt = null;
    processedInboundMessageIds.clear();
    pendingCiphertextMessages.clear();
}

// ==================== API ENDPOINTS ====================

// Status endpoint
app.get('/status', async (req, res) => {
    const current = await getRealtimeStatus();
    res.json(current);
});

// QR Code endpoint
app.get('/qr', (req, res) => {
    if (waStatus.ready) {
        return res.json({ 
            success: true, 
            message: 'WhatsApp sudah terhubung',
            phone: waStatus.phone 
        });
    }
    
    if (waStatus.qrBase64) {
        return res.json({ 
            success: true, 
            qr: waStatus.qrBase64 
        });
    }
    
    res.json({ 
        success: false, 
        message: 'QR Code belum tersedia, tunggu beberapa detik...' 
    });
});

app.get('/debug/payment-forward-log', (req, res) => {
    const requestedLimit = Number.parseInt(String(req.query.limit || '50'), 10);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
    const requestedWindow = Number.parseInt(String(req.query.window_minutes || '15'), 10);
    const windowMinutes = Number.isFinite(requestedWindow) ? requestedWindow : 15;
    const events = getRecentGatewayEvents(limit);

    res.json({
        success: true,
        path: GATEWAY_LOG_PATH,
        diagnostics: buildGatewayDiagnostics(events, windowMinutes),
        events,
    });
});

app.get('/groups', async (req, res) => {
    const current = await getRealtimeStatus();

    if (!current.ready) {
        return res.status(503).json({
            success: false,
            groups: [],
            error: current.hasQR
                ? 'WhatsApp belum siap. Silakan scan QR code terlebih dahulu.'
                : `WhatsApp belum siap (state: ${current.state || 'unknown'})`
        });
    }

    try {
        const chats = await client.getChats();
        const groups = (chats || [])
            .filter(c => {
                if (!c) return false;
                const serializedId = c.id ? (c.id._serialized || c.id) : '';
                return c.isGroup === true || String(serializedId).includes('@g.us');
            })
            .map(c => {
                const serializedId = c.id ? (c.id._serialized || c.id) : '';
                return {
                    id: serializedId,
                    name: c.name || c.formattedTitle || 'Grup WhatsApp',
                    unread_count: c.unreadCount || 0,
                };
            });

        res.json({
            success: true,
            groups,
            count: groups.length
        });
    } catch (err) {
        console.error('❌ Error mengambil daftar grup:', err.message);
        res.status(500).json({
            success: false,
            groups: [],
            error: err.message
        });
    }
});

app.post('/groups/resolve-invite', async (req, res) => {
    const { inviteUrl, joinIfNecessary } = req.body;
    if (!inviteUrl) {
        return res.status(400).json({ success: false, error: 'Parameter inviteUrl diperlukan' });
    }

    // Pastikan WA client sudah siap sebelum mencoba operasi grup
    const current = await getRealtimeStatus();
    if (!current.ready) {
        return res.status(503).json({
            success: false,
            error: current.hasQR
                ? 'WhatsApp belum siap. Silakan scan QR code terlebih dahulu.'
                : `WhatsApp belum siap (state: ${current.state || 'unknown'}). Coba lagi setelah bot terhubung.`
        });
    }

    try {
        // Ekstrak kode undangan dari URL
        const match = String(inviteUrl).match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
        const code = match ? match[1] : String(inviteUrl).trim();

        let groupId = null;
        let groupName = null;
        let participantsCount = 0;
        let joined = false;

        if (joinIfNecessary) {
            // Coba bergabung ke grup — acceptInvite() mengembalikan group chatId string
            try {
                const joinedChatId = await client.acceptInvite(code);
                joined = true;
                console.log(`✅ Bot berhasil bergabung ke grup: ${joinedChatId}`);

                // Tunggu sebentar agar chat muncul di daftar
                await new Promise(r => setTimeout(r, 1500));

                // Ambil detail grup dari chat yang baru diikuti
                try {
                    const chat = await client.getChatById(joinedChatId);
                    groupId = joinedChatId;
                    groupName = chat.name || chat.formattedTitle || 'Grup WhatsApp';
                    participantsCount = chat.participants ? chat.participants.length : 0;
                } catch (chatErr) {
                    // Fallback: gunakan ID yang dikembalikan acceptInvite
                    console.warn('⚠️ Tidak bisa baca detail chat setelah join:', chatErr.message);
                    groupId = typeof joinedChatId === 'string' ? joinedChatId : String(joinedChatId);
                    groupName = 'Grup WhatsApp';
                }
            } catch (joinErr) {
                const errMsg = joinErr.message || '';
                const alreadyMember = errMsg.includes('already') || errMsg.includes('member') ||
                    errMsg.includes('already a participant') || errMsg.includes('already in group');
                // WA internal API error (WWebJS.joinGroupViaInvite undefined) — fallback ke getInviteInfo
                const isInternalWAError = errMsg.includes('joinGroupViaInvite') ||
                    errMsg.includes('Cannot read properties of undefined') ||
                    errMsg.includes('WWebJS');

                if (!alreadyMember && !isInternalWAError) {
                    // Error bukan karena sudah member dan bukan internal WA error — lempar ulang
                    throw joinErr;
                }
                if (alreadyMember) {
                    console.log('ℹ️ Bot sudah bergabung ke grup ini sebelumnya.');
                } else {
                    console.warn('⚠️ acceptInvite gagal (WA internal API error), fallback ke getInviteInfo:', errMsg);
                }
            }
        }

        // Jika belum dapat info grup (tidak join, atau sudah member), ambil via getInviteInfo
        if (!groupId) {
            const inviteInfo = await client.getInviteInfo(code);
            groupId = inviteInfo.id
                ? (inviteInfo.id._serialized || String(inviteInfo.id))
                : null;
            groupName = inviteInfo.subject || 'Grup WhatsApp';
            participantsCount = inviteInfo.size || 0;
        }

        if (!groupId) {
            throw new Error('Tidak dapat membaca ID grup dari link undangan ini.');
        }

        res.json({
            success: true,
            group: {
                id: groupId,
                name: groupName || 'Grup WhatsApp',
                participants_count: participantsCount,
                joined
            }
        });
    } catch (err) {
        console.error('❌ Error resolve invite:', err.message);
        res.status(400).json({
            success: false,
            error: err.message || 'Gagal membaca link undangan grup'
        });
    }
});

/**
 * Normalisasi dan resolusi nomor telepon ke chatId WhatsApp
 * Mendukung group ID (@g.us) serta nomor perorangan (@c.us)
 * Menggunakan getNumberId() jika tersedia untuk mendeteksi ID resmi (LID/phone WID)
 */
async function resolveChatId(phoneStr) {
    if (!phoneStr) {
        throw new Error('Parameter nomor atau ID WhatsApp diperlukan');
    }

    const rawStr = phoneStr.toString().trim();

    // Jika sudah berbentuk WhatsApp Group ID (@g.us)
    if (rawStr.includes('@g.us')) {
        return { chatId: rawStr, formattedPhone: rawStr };
    }

    let formattedPhone = rawStr.replace(/\D/g, '');

    // Konversi format Indonesia
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '62' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('8')) {
        formattedPhone = '62' + formattedPhone;
    }

    // Validasi panjang
    if (formattedPhone.length < 10 || formattedPhone === '0' || formattedPhone === '62') {
        throw new Error('Nomor telepon tidak valid');
    }

    const defaultChatId = formattedPhone + '@c.us';

    // Cek dengan getNumberId jika didukung (paling akurat untuk WhatsApp Web 2.3000+)
    try {
        if (typeof client.getNumberId === 'function') {
            const numberId = await client.getNumberId(formattedPhone);
            if (numberId && numberId._serialized) {
                return { chatId: numberId._serialized, formattedPhone };
            }
        }
    } catch (err) {
        console.warn(`⚠️ getNumberId(${formattedPhone}) warning:`, err.message);
    }

    // Fallback: cek via isRegisteredUser jika didukung
    try {
        if (typeof client.isRegisteredUser === 'function') {
            const isRegistered = await client.isRegisteredUser(defaultChatId);
            if (!isRegistered) {
                throw new Error('Nomor tidak terdaftar di WhatsApp');
            }
        }
    } catch (err) {
        if (err.message && err.message.includes('Nomor tidak terdaftar')) {
            throw err;
        }
        console.warn(`⚠️ isRegisteredUser(${defaultChatId}) warning:`, err.message);
    }

    return { chatId: defaultChatId, formattedPhone };
}

/**
 * Kirim pesan teks dengan retry jika terjadi context evaluation error
 */
async function sendTextMessageSafe(chatId, message, options = { sendSeen: false }) {
    try {
        return await client.sendMessage(chatId, message, options);
    } catch (err) {
        const isEvalError = err.message && (
            err.message.includes('getChat') ||
            err.message.includes('Evaluation failed') ||
            err.message.includes('Execution context was destroyed')
        );

        if (isEvalError) {
            console.warn(`⚠️ client.sendMessage gagal (${err.message}). Mencoba retry dalam 1.5 detik...`);
            await new Promise(r => setTimeout(r, 1500));
            return await client.sendMessage(chatId, message, options);
        }

        throw err;
    }
}

/**
 * Kirim media/file dengan retry jika terjadi context evaluation error
 */
async function sendMediaMessageSafe(chatId, media, options = { sendSeen: false }) {
    try {
        return await client.sendMessage(chatId, media, options);
    } catch (err) {
        const isEvalError = err.message && (
            err.message.includes('getChat') ||
            err.message.includes('Evaluation failed') ||
            err.message.includes('Execution context was destroyed')
        );

        if (isEvalError) {
            console.warn(`⚠️ client.sendMessage media gagal (${err.message}). Mencoba retry dalam 1.5 detik...`);
            await new Promise(r => setTimeout(r, 1500));
            return await client.sendMessage(chatId, media, options);
        }

        throw err;
    }
}

// Kirim pesan
app.post('/send', async (req, res) => {
    const { phone, message } = req.body;

    const current = await getRealtimeStatus();

    if (!current.ready) {
        return res.status(503).json({
            success: false,
            error: current.hasQR
                ? 'WhatsApp belum siap. Silakan scan QR code terlebih dahulu.'
                : `WhatsApp belum siap (state: ${current.state || 'unknown'})`
        });
    }
    
    if (!phone || !message) {
        return res.status(400).json({
            success: false,
            error: 'Parameter phone dan message diperlukan'
        });
    }
    
    try {
        const { chatId, formattedPhone } = await resolveChatId(phone);

        // Kirim pesan
        await sendTextMessageSafe(chatId, message, { sendSeen: false });
        
        console.log(`✅ Pesan terkirim ke ${formattedPhone} (${chatId})`);
        
        res.json({
            success: true,
            phone: formattedPhone,
            message: 'Pesan berhasil terkirim'
        });
        
    } catch (error) {
        console.error('❌ Error mengirim pesan:', error);
        res.json({
            success: false,
            phone: phone,
            error: error.message
        });
    }
});

// Kirim media/dokumen ke satu nomor
app.post('/send-media', async (req, res) => {
    const { phone, message, file_url, filename } = req.body;

    const current = await getRealtimeStatus();

    if (!current.ready) {
        return res.status(503).json({
            success: false,
            error: current.hasQR
                ? 'WhatsApp belum siap. Silakan scan QR code terlebih dahulu.'
                : `WhatsApp belum siap (state: ${current.state || 'unknown'})`
        });
    }

    if (!phone || !file_url) {
        return res.status(400).json({
            success: false,
            error: 'Parameter phone dan file_url diperlukan'
        });
    }

    try {
        const { chatId, formattedPhone } = await resolveChatId(phone);

        const media = await MessageMedia.fromUrl(file_url, {
            unsafeMime: true,
            filename: filename || 'dokumen.pdf'
        });

        await sendMediaMessageSafe(chatId, media, {
            caption: message || '',
            sendSeen: false
        });

        console.log(`✅ Media terkirim ke ${formattedPhone} (${chatId})`);

        res.json({
            success: true,
            phone: formattedPhone,
            message: 'Media berhasil terkirim'
        });
    } catch (error) {
        console.error('❌ Error mengirim media:', error);
        res.json({
            success: false,
            phone: phone,
            error: error.message
        });
    }
});

// Kirim bulk (multiple recipients)
app.post('/send-bulk', async (req, res) => {
    const { recipients, message, delay = 2000 } = req.body;

    const current = await getRealtimeStatus();

    if (!current.ready) {
        return res.status(503).json({
            success: false,
            error: current.hasQR
                ? 'WhatsApp belum siap. Silakan scan QR code terlebih dahulu.'
                : `WhatsApp belum siap (state: ${current.state || 'unknown'})`
        });
    }
    
    if (!recipients || !Array.isArray(recipients) || !message) {
        return res.status(400).json({
            success: false,
            error: 'Parameter recipients (array) dan message diperlukan'
        });
    }
    
    const results = [];
    
    for (const recipient of recipients) {
        const phone = recipient.phone;
        const name = recipient.name || 'Pelanggan';
        
        // Personalize message
        let personalizedMessage = message
            .replace(/{name}/g, name)
            .replace(/{nama}/g, name);
        
        try {
            const { chatId, formattedPhone } = await resolveChatId(phone);

            // Kirim
            await sendTextMessageSafe(chatId, personalizedMessage, { sendSeen: false });
            
            console.log(`✅ Terkirim ke ${name} (${formattedPhone})`);
            
            results.push({
                phone: formattedPhone,
                customer_name: name,
                success: true,
                error: null
            });
            
            // Delay untuk menghindari spam detection
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
        } catch (error) {
            console.error(`❌ Gagal kirim ke ${name}:`, error.message);
            results.push({
                phone: phone,
                customer_name: name,
                success: false,
                error: error.message
            });
        }
    }
    
    res.json({
        success: true,
        total: recipients.length,
        sent: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
    });
});

// Restart WhatsApp
app.post('/restart', async (req, res) => {
    console.log('🔄 Restart WhatsApp client...');
    res.json({ success: true, message: 'WhatsApp sedang direstart' });

    setTimeout(() => {
        initWhatsAppClient(false);
    }, 100);
});

// Logout
app.post('/logout', async (req, res) => {
    console.log('🚪 Logout WhatsApp...');
    try {
        if (client) {
            await client.logout();
        }
        resetRuntimeState();
        res.json({ success: true, message: 'Berhasil logout' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/reset-session', async (req, res) => {
    console.log('🧹 Reset sesi WhatsApp & siapkan QR baru...');

    res.json({
        success: true,
        message: 'Reset sesi WhatsApp dimulai. QR Code baru akan segera siap di-scan.',
    });

    setTimeout(() => {
        initWhatsAppClient(true);
    }, 100);
});

// ==================== START SERVER ====================

const PORT = process.env.WA_GATEWAY_PORT || 3001;

const server = app.listen(PORT, () => {
    console.log(`\n🚀 WhatsApp Gateway berjalan di http://localhost:${PORT}`);
    console.log('📖 Endpoints:');
    console.log(`   GET  /status     - Cek status WhatsApp`);
    console.log(`   GET  /qr         - Ambil QR Code (base64)`);
    console.log(`   POST /send       - Kirim pesan ke satu nomor`);
    console.log(`   POST /send-media - Kirim dokumen/media ke satu nomor`);
    console.log(`   POST /send-bulk  - Kirim pesan ke banyak nomor`);
    console.log(`   POST /restart    - Restart WhatsApp client`);
    console.log(`   POST /logout     - Logout dari WhatsApp`);
    console.log(`   POST /reset-session - Reset LocalAuth & minta scan QR ulang`);
    console.log(`   Payment webhook  - ${PAYMENT_FORWARD_ENABLED ? (PAYMENT_WEBHOOK_URL || 'URL belum di-set') : 'disabled'}`);
    console.log('\n⏳ Menginisialisasi WhatsApp Client...\n');
    
    // Initialize WhatsApp client
    initWhatsAppClient(false);
});

server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} sudah dipakai proses lain. Pastikan hanya satu WA gateway yang berjalan.`);
        process.exit(1);
    }

    console.error('❌ HTTP server WA gateway gagal start:', error);
    process.exit(1);
});
