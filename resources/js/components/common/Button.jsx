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
        'font-semibold rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';

    const variantStyles = {
        primary:
            'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 focus:ring-blue-500',
        secondary:
            'bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100 focus:ring-gray-500',
        danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 focus:ring-red-500',
        warning: 'bg-yellow-500 text-white hover:bg-yellow-600 disabled:bg-yellow-300 focus:ring-yellow-500',
        success: 'bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300 focus:ring-green-500',
        ghost:
            'bg-transparent text-gray-700 hover:bg-gray-100 disabled:text-gray-400 focus:ring-gray-500',
    };

    const sizeStyles = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
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
