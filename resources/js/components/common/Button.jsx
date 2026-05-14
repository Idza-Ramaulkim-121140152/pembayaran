export function Button({
    children,
    variant = 'primary',
    size = 'md',
    disabled = false,
    type = 'button',
    onClick,
    className = '',
    ...props
}) {
    const baseStyles =
        'inline-flex items-center justify-center gap-2 font-semibold rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed';

    const variantStyles = {
        primary:
            'border-transparent bg-gradient-to-r from-sky-600 to-blue-700 text-white hover:from-sky-700 hover:to-blue-800 disabled:from-sky-300 disabled:to-blue-400 shadow-sm focus:ring-sky-500',
        secondary:
            'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400 focus:ring-slate-400',
        danger: 'border-transparent bg-gradient-to-r from-rose-600 to-red-600 text-white hover:from-rose-700 hover:to-red-700 disabled:from-rose-300 disabled:to-red-300 focus:ring-rose-500',
        warning: 'border-transparent bg-gradient-to-r from-amber-500 to-yellow-500 text-white hover:from-amber-600 hover:to-yellow-600 disabled:from-amber-300 disabled:to-yellow-300 focus:ring-amber-500',
        success: 'border-transparent bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 disabled:from-emerald-300 disabled:to-teal-300 focus:ring-emerald-500',
        ghost:
            'border-transparent bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400 focus:ring-slate-400',
    };

    const sizeStyles = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2.5 text-sm',
        lg: 'px-6 py-3 text-base',
    };

    return (
        <button
            type={type}
            disabled={disabled}
            className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
            onClick={onClick}
            {...props}
        >
            {children}
        </button>
    );
}

export default Button;
