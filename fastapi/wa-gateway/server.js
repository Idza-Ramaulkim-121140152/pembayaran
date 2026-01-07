const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

// Status WhatsApp
let waStatus = {
    ready: false,
    qr: null,
    qrBase64: null,
    phone: null,
    error: null
};

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
});

// Event: Auth Failure
client.on('auth_failure', (msg) => {
    console.error('❌ Autentikasi gagal:', msg);
    waStatus.error = 'Authentication failed: ' + msg;
    waStatus.ready = false;
});

// Event: Disconnected
client.on('disconnected', (reason) => {
    console.log('🔌 WhatsApp terputus:', reason);
    waStatus.ready = false;
    waStatus.phone = null;
    waStatus.error = 'Disconnected: ' + reason;
    
    // Reconnect
    setTimeout(() => {
        console.log('🔄 Mencoba reconnect...');
        client.initialize();
    }, 5000);
});

// Event: Message (untuk debug)
client.on('message', async (msg) => {
    console.log(`📩 Pesan masuk dari ${msg.from}: ${msg.body.substring(0, 50)}...`);
});

// ==================== API ENDPOINTS ====================

// Status endpoint
app.get('/status', (req, res) => {
    res.json({
        ready: waStatus.ready,
        phone: waStatus.phone,
        hasQR: !!waStatus.qrBase64,
        error: waStatus.error
    });
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

// Kirim pesan
app.post('/send', async (req, res) => {
    const { phone, message } = req.body;
    
    if (!waStatus.ready) {
        return res.status(503).json({
            success: false,
            error: 'WhatsApp belum siap. Silakan scan QR code terlebih dahulu.'
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
        await client.sendMessage(chatId, message);
        
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

// Kirim bulk (multiple recipients)
app.post('/send-bulk', async (req, res) => {
    const { recipients, message, delay = 2000 } = req.body;
    
    if (!waStatus.ready) {
        return res.status(503).json({
            success: false,
            error: 'WhatsApp belum siap'
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
            await client.sendMessage(chatId, personalizedMessage);
            
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
    waStatus.ready = false;
    waStatus.qr = null;
    waStatus.qrBase64 = null;
    waStatus.phone = null;
    waStatus.error = null;
    
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
        waStatus.ready = false;
        waStatus.phone = null;
        res.json({ success: true, message: 'Berhasil logout' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ==================== START SERVER ====================

const PORT = process.env.WA_GATEWAY_PORT || 3001;

app.listen(PORT, () => {
    console.log(`\n🚀 WhatsApp Gateway berjalan di http://localhost:${PORT}`);
    console.log('📖 Endpoints:');
    console.log(`   GET  /status     - Cek status WhatsApp`);
    console.log(`   GET  /qr         - Ambil QR Code (base64)`);
    console.log(`   POST /send       - Kirim pesan ke satu nomor`);
    console.log(`   POST /send-bulk  - Kirim pesan ke banyak nomor`);
    console.log(`   POST /restart    - Restart WhatsApp client`);
    console.log(`   POST /logout     - Logout dari WhatsApp`);
    console.log('\n⏳ Menginisialisasi WhatsApp Client...\n');
    
    // Initialize WhatsApp client
    client.initialize();
});
