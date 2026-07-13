interface LoadingSpinnerProps {
    size?: "sm" | "md" | "lg";
    className?: string;
}

export default function LoadingSpinner({ size = "md", className = "" }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: "w-5 h-5 border-2",
        md: "w-8 h-8 border-3",
        lg: "w-12 h-12 border-4",
    };

    return (
        <div className={`flex items-center justify-center ${className}`}>
            <div
                className={`
                    border-zinc-800 border-t-blue-500 rounded-full animate-spin
                    ${sizeClasses[size]}
                `}
            />
        </div>
    );
}
