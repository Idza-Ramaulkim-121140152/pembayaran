export const BRAND_FULL_NAME = 'RUMAH KITA NETWORK POWERED BY PT. Megarap Mitra Solusi (MMS)';
export const BRAND_SHORT_NAME = 'RUMAH KITA NETWORK';
export const BRAND_POWERED_BY = 'POWERED BY PT. Megarap Mitra Solusi (MMS)';

/**
 * Co-branding logo pair: Logo PT. Megarap Mitra Solusi (MMS) di kiri + Logo Rumah Kita Network di kanan.
 * Sesuai Permenkominfo No. 5/2021 (merek ISP induk utama berdampingan dengan co-branding lokal).
 */
export default function PartnerLogoPair({
    size = 'md',
    dark = false,
    centered = false,
    showCaption = false,
    className = '',
}) {
    const heights = {
        xs: { mms: 'h-6', rkn: 'h-7', div: 'h-5' },
        sm: { mms: 'h-7', rkn: 'h-8', div: 'h-6' },
        md: { mms: 'h-9', rkn: 'h-10', div: 'h-7' },
        lg: { mms: 'h-11', rkn: 'h-12', div: 'h-9' },
    }[size] || { mms: 'h-9', rkn: 'h-10', div: 'h-7' };

    return (
        <div className={`inline-flex flex-col ${centered ? 'items-center text-center' : 'items-start'} ${className}`}>
            <div
                className={`inline-flex items-center gap-2.5 ${
                    dark ? 'bg-white/95 px-3 py-1.5 rounded-xl shadow-sm' : ''
                }`}
            >
                <img
                    src="/logo-mms.png"
                    alt="PT. Megarap Mitra Solusi (MMS)"
                    className={`${heights.mms} w-auto object-contain`}
                />
                <span className={`${heights.div} w-px bg-slate-300 shrink-0`} />
                <img
                    src="/logo_baru.png"
                    alt="Rumah Kita Network"
                    className={`${heights.rkn} w-auto object-contain`}
                />
            </div>
            {showCaption && (
                <p
                    className={`mt-1.5 text-[11px] font-semibold tracking-wide ${
                        dark ? 'text-sky-100/95' : 'text-slate-600'
                    }`}
                >
                    {BRAND_FULL_NAME}
                </p>
            )}
        </div>
    );
}
