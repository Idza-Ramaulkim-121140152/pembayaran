import { Loader } from 'lucide-react';

export function LoadingSpinner({ size = 'md', text = 'Loading...' }) {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
    };

    return (
        <div className="flex items-center justify-center gap-2">
            <Loader className={`${sizeClasses[size]} animate-spin`} />
            {text && <span className="text-gray-600">{text}</span>}
        </div>
    );
}

export default LoadingSpinner;
