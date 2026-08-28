const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
loadEnvFile(path.resolve(__dirname, '../../.env'));

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

const PAYMENT_WEBHOOK_URL = process.env.WA_PAYMENT_WEBHOOK_URL || '';
const PAYMENT_WEBHOOK_SECRET = process.env.WA_PAYMENT_WEBHOOK_SECRET || '';
const PAYMENT_FORWARD_ENABLED = String(process.env.WA_PAYMENT_FORWARD_ENABLED || 'true').toLowerCase() !== 'false';
const SUPPORTED_PAYMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const GATEWAY_LOG_PATH = path.resolve(__dirname, 'logs/payment-forward.log');
const RECENT_GATEWAY_EVENTS_LIMIT = 200;
const CIPHERTEXT_RESOLUTION_TIMEOUT_MS = 30000;
const LOCAL_AUTH_DATA_PATH = path.resolve(__dirname, 'sessions');
const processedInboundMessageIds = new Map();
const pendingCiphertextMessages = new Map();

// Inisialisasi WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './sessions'
    }),
    puppeteer: {
        headless: true,
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
client.on('auth_failure', (msg) => {
    console.error('❌ Autentikasi gagal:', msg);
    waStatus.error = 'Authentication failed: ' + msg;
    waStatus.ready = false;
    waStatus.lastErrorAt = new Date().toISOString();
});

// Event: Disconnected
client.on('disconnected', (reason) => {
    console.log('🔌 WhatsApp terputus:', reason);
    waStatus.ready = false;
    waStatus.phone = null;
    waStatus.error = 'Disconnected: ' + reason;
    waStatus.lastErrorAt = new Date().toISOString();
    waStatus.readyAt = null;
    
    // Reconnect
    setTimeout(() => {
        console.log('🔄 Mencoba reconnect...');
        client.initialize();
    }, 5000);
});

// Tangkap lebih dari satu event karena beberapa tipe media lebih konsisten muncul di message_create.
client.on('message', async (msg) => {
    await handleInboundCandidate('message', msg);
});

client.on('message_create', async (msg) => {
    await handleInboundCandidate('message_create', msg);
});

client.on('message_ciphertext', async (msg) => {
    await handleCiphertextCandidate(msg);
});

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
    return SUPPORTED_PAYMENT_MIME_TYPES.includes(mimeType);
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
        has_media: !!msg?.hasMedia,
        type: msg?.type || msg?._data?.type || null,
        mime_type: msg?._data?.mimetype || null,
        timestamp: msg?.timestamp || null,
        body_preview: preview,
        chat_scope: classifyChatScope(msg),
    };
}

function classifyChatScope(msg) {
    if (msg?.fromMe) {
        return 'self_message';
    }

    if (msg?.from === 'status@broadcast') {
        return 'status_broadcast';
    }

    if (msg?.from?.includes('@g.us')) {
        return 'group';
    }

    if (msg?.from?.endsWith('@c.us')) {
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
    const context = buildMessageContext(msg, 'message_ciphertext');
    logGatewayEvent('ciphertext_seen', context);

    if (context.from_me) {
        logGatewayEvent('skipped', {
            ...context,
            reason: 'from_me',
        });
        return;
    }

    rememberPendingCiphertext(context.message_id, context);
    sweepPendingCiphertextMessages();
}

async function handleInboundCandidate(sourceEvent, msg) {
    const context = buildMessageContext(msg, sourceEvent);
    logGatewayEvent('incoming', context);
    sweepPendingCiphertextMessages();

    if (context.from_me) {
        logGatewayEvent('skipped', {
            ...context,
            reason: 'from_me',
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

    console.log(`📩 [${sourceEvent}] Pesan masuk dari ${context.from}: ${context.body_preview}...`);

    try {
        await maybeForwardPaymentMessage(msg, sourceEvent, context);
        markMessageAsProcessed(context.message_id, sourceEvent);
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
        return;
    }

    if (!PAYMENT_WEBHOOK_URL) {
        logGatewayEvent('skipped', {
            ...context,
            reason: 'missing_webhook_url',
        });
        console.warn('⚠️ WA payment webhook URL belum di-set, inbound payment forwarding dilewati.');
        return;
    }

    if (!msg || !msg.hasMedia || !msg.from || msg.from.includes('@g.us') || msg.from === 'status@broadcast') {
        let reason = 'not_eligible';
        if (!msg?.hasMedia) {
            reason = 'no_media';
        } else if (msg?.from?.includes('@g.us')) {
            reason = 'group_message';
        } else if (msg?.from === 'status@broadcast') {
            reason = 'status_broadcast';
        }

        logGatewayEvent('skipped', {
            ...context,
            reason,
        });
        return;
    }

    logGatewayEvent('media_download_started', context);
    const media = await msg.downloadMedia();
    if (!media || !media.data || !media.mimetype || !shouldForwardMimeType(media.mimetype)) {
        logGatewayEvent('skipped', {
            ...context,
            reason: !media ? 'media_download_empty' : (!media.data ? 'media_data_empty' : (!media.mimetype ? 'media_mime_missing' : 'unsupported_mime_type')),
            mime_type: media?.mimetype || null,
        });
        console.log(`ℹ️ Media dari ${msg.from} dilewati karena mime type tidak didukung: ${media?.mimetype || 'unknown'}`);
        return;
    }

    logGatewayEvent('media_download_succeeded', {
        ...context,
        mime_type: media.mimetype,
        media_size: Buffer.byteLength(media.data || '', 'base64'),
    });

    const payload = {
        message_id: getMessageId(msg) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sender_phone: normalizeInboundPhone(msg.from),
        sent_at: new Date((msg.timestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        media_base64: media.data,
        caption: msg.body || '',
        mime_type: media.mimetype,
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
        target_url: PAYMENT_WEBHOOK_URL,
    });
    console.log(`🚚 Forward inbound payment media ${payload.message_id} -> ${PAYMENT_WEBHOOK_URL}`);

    const response = await fetch(PAYMENT_WEBHOOK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    if (!response.ok) {
        logGatewayEvent('forward_failed', {
            ...context,
            message_id: payload.message_id,
            status: response.status,
            response_body: bodyText,
        });
        console.error(`❌ Payment webhook gagal [${response.status}] ${bodyText}`);
        return;
    }

    logGatewayEvent('forward_succeeded', {
        ...context,
        message_id: payload.message_id,
        status: response.status,
        response_body: bodyText,
    });
    console.log(`✅ Payment webhook berhasil [${response.status}] ${bodyText}`);
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
        // Format nomor ke format WhatsApp (628xxx@c.us)
        let formattedPhone = phone.toString().replace(/\D/g, '');
        
        // Konversi format Indonesia
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('8')) {
            formattedPhone = '62' + formattedPhone;
        }
        
        // Validasi
        if (formattedPhone.length < 10 || formattedPhone === '0' || formattedPhone === '62') {
            return res.json({
                success: false,
                phone: phone,
                error: 'Nomor telepon tidak valid'
            });
        }
        
        const chatId = formattedPhone + '@c.us';
        
        // Cek apakah nomor terdaftar di WhatsApp
        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
            return res.json({
                success: false,
                phone: formattedPhone,
                error: 'Nomor tidak terdaftar di WhatsApp'
            });
        }
        
        // Kirim pesan
        await client.sendMessage(chatId, message, { sendSeen: false });
        
        console.log(`✅ Pesan terkirim ke ${formattedPhone}`);
        
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
        let formattedPhone = phone.toString().replace(/\D/g, '');

        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('8')) {
            formattedPhone = '62' + formattedPhone;
        }

        if (formattedPhone.length < 10 || formattedPhone === '0' || formattedPhone === '62') {
            return res.json({
                success: false,
                phone: phone,
                error: 'Nomor telepon tidak valid'
            });
        }

        const chatId = formattedPhone + '@c.us';
        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
            return res.json({
                success: false,
                phone: formattedPhone,
                error: 'Nomor tidak terdaftar di WhatsApp'
            });
        }

        const media = await MessageMedia.fromUrl(file_url, {
            unsafeMime: true,
            filename: filename || 'dokumen.pdf'
        });

        await client.sendMessage(chatId, media, {
            caption: message || '',
            sendSeen: false
        });

        console.log(`✅ Media terkirim ke ${formattedPhone}`);

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
            // Format nomor
            let formattedPhone = phone.toString().replace(/\D/g, '');
            
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '62' + formattedPhone.substring(1);
            } else if (formattedPhone.startsWith('8')) {
                formattedPhone = '62' + formattedPhone;
            }
            
            // Validasi
            if (formattedPhone.length < 10 || formattedPhone === '0' || formattedPhone === '62' || !formattedPhone) {
                results.push({
                    phone: phone,
                    customer_name: name,
                    success: false,
                    error: 'Nomor tidak valid atau 0'
                });
                continue;
            }
            
            const chatId = formattedPhone + '@c.us';
            
            // Cek registrasi
            const isRegistered = await client.isRegisteredUser(chatId);
            if (!isRegistered) {
                results.push({
                    phone: formattedPhone,
                    customer_name: name,
                    success: false,
                    error: 'Nomor tidak terdaftar di WhatsApp'
                });
                continue;
            }
            
            // Kirim
            await client.sendMessage(chatId, personalizedMessage, { sendSeen: false });
            
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
    resetRuntimeState();
    
    try {
        await client.destroy();
        setTimeout(() => {
            client.initialize();
        }, 2000);
        
        res.json({ success: true, message: 'WhatsApp sedang direstart' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Logout
app.post('/logout', async (req, res) => {
    console.log('🚪 Logout WhatsApp...');
    try {
        await client.logout();
        resetRuntimeState();
        res.json({ success: true, message: 'Berhasil logout' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/reset-session', async (req, res) => {
    console.log('🧹 Reset sesi WhatsApp...');

    res.json({
        success: true,
        message: 'Reset sesi WhatsApp dimulai. Scan ulang QR mungkin diperlukan.',
    });

    setTimeout(async () => {
        try {
            await client.destroy();
        } catch (error) {
            console.warn('⚠️ Client destroy saat reset-session gagal:', error.message);
        }

        resetRuntimeState();

        if (fs.existsSync(LOCAL_AUTH_DATA_PATH)) {
            fs.rmSync(LOCAL_AUTH_DATA_PATH, { recursive: true, force: true });
        }

        setTimeout(() => {
            client.initialize();
        }, 2000);
    }, 50);
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
    client.initialize();
});

server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} sudah dipakai proses lain. Pastikan hanya satu WA gateway yang berjalan.`);
        process.exit(1);
    }

    console.error('❌ HTTP server WA gateway gagal start:', error);
    process.exit(1);
});
