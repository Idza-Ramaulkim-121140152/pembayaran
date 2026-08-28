export const HOME_ROUTER_PRESETS = {
    mikrotik: {
        value: 'mikrotik',
        label: 'MikroTik API',
        defaultPort: '8728',
        defaultUsername: 'admin',
        defaultPassword: '',
        managementMode: 'api',
        helper: 'RouterOS API langsung ke port 8728. Cocok untuk traffic WAN dan hitung perangkat otomatis.',
    },
    vsol_v2801rgw: {
        value: 'vsol_v2801rgw',
        label: 'VSOL V2801RGW',
        defaultPort: '80',
        defaultUsername: 'admin',
        defaultPassword: 'rumahkita69',
        managementMode: 'web',
        helper: 'Preset web admin ONT VSOL. Saat ini portal akan probe panel web dan menyiapkan parser model-specific.',
    },
    global_gl01: {
        value: 'global_gl01',
        label: 'Global GL-01',
        defaultPort: '80',
        defaultUsername: 'admin',
        defaultPassword: 'rumahkita69',
        managementMode: 'web',
        helper: 'Preset web admin GL-01. Dipakai untuk probing panel router dan pengembangan parser berikutnya.',
    },
    cdata: {
        value: 'cdata',
        label: 'CDATA',
        defaultPort: '80',
        defaultUsername: 'admin',
        defaultPassword: 'rumahkita69',
        managementMode: 'web',
        helper: 'Preset router CDATA untuk penentuan direct link ubah password WiFi pelanggan.',
    },
};

export const HOME_ROUTER_OPTIONS = Object.values(HOME_ROUTER_PRESETS);

export function getHomeRouterPreset(type) {
    return HOME_ROUTER_PRESETS[type] || HOME_ROUTER_PRESETS.mikrotik;
}
