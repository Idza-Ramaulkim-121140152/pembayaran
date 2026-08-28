const cn = (...values) => values.filter(Boolean).join(' ');

export const adminConsoleInputClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export const adminConsoleSelectClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export const adminConsoleTextareaClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export const adminConsoleReadOnlyClassName =
    'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-sm';

export const adminConsoleCheckboxClassName =
    'mt-1 h-4 w-4 rounded border border-slate-300 bg-white text-orange-500 focus:ring-2 focus:ring-orange-200';

export const adminConsoleActionRowClassName =
    'flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end';

export const adminConsoleButtonClassNames = {
    primary:
        'border-transparent bg-orange-500 text-white shadow-sm hover:bg-orange-600 focus:ring-orange-300 focus:ring-offset-white',
    secondary:
        'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus:ring-slate-300 focus:ring-offset-white',
    success:
        'border-transparent bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus:ring-emerald-300 focus:ring-offset-white',
    warning:
        'border-transparent bg-amber-500 text-white shadow-sm hover:bg-amber-600 focus:ring-amber-300 focus:ring-offset-white',
    danger:
        'border-transparent bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus:ring-rose-300 focus:ring-offset-white',
};

const surfaceAccentClasses = {
    cyan: 'bg-blue-100/70',
    emerald: 'bg-emerald-100/70',
    violet: 'bg-orange-100/70',
    amber: 'bg-amber-100/70',
    rose: 'bg-rose-100/70',
    slate: 'bg-slate-100/70',
};

const noticeToneClasses = {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-rose-200 bg-rose-50 text-rose-800',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
};

export function AdminConsoleSurface({ children, className = '', accent = 'cyan' }) {
    return (
        <div
            className={cn(
                'group relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 text-slate-800 shadow-sm transition duration-300 hover:border-slate-300',
                className
            )}
        >
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-orange-200 to-transparent opacity-80" />
            <div
                className={cn(
                    'pointer-events-none absolute -right-8 top-3 h-24 w-24 rounded-full blur-3xl',
                    surfaceAccentClasses[accent] || surfaceAccentClasses.cyan
                )}
            />
            {children}
        </div>
    );
}

export function AdminConsoleField({ label, hint, children, className = '' }) {
    return (
        <label className={cn('block space-y-2', className)}>
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                {hint && <span className="text-xs text-slate-500">{hint}</span>}
            </div>
            {children}
        </label>
    );
}

export function AdminConsoleNotice({ title, children, tone = 'info', className = '' }) {
    return (
        <div className={cn('rounded-[22px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', noticeToneClasses[tone] || noticeToneClasses.info, className)}>
            {title && <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-80">{title}</p>}
            <div className={cn(title && 'mt-2', 'text-sm leading-6')}>{children}</div>
        </div>
    );
}

export function AdminConsoleActionRow({ children, className = '' }) {
    return <div className={cn(adminConsoleActionRowClassName, className)}>{children}</div>;
}
