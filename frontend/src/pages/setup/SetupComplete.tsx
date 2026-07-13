import { useState } from "react";
import { setupComplete } from "../../api/setup";
import LoadingSpinner from "../../components/LoadingSpinner";

interface Props {
    onFinish: () => void;
    showToast: (msg: string, type: "success" | "error" | "warning" | "info") => void;
}

export default function SetupComplete({ onFinish, showToast }: Props) {
    const [loading, setLoading] = useState(false);

    const handleFinish = async () => {
        setLoading(true);
        try {
            await setupComplete();
            showToast("Setup completed successfully!", "success");
            onFinish();
        } catch {
            showToast("Failed to finalize setup. Please try again.", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center text-center animate-fade-in">
            {/* Success Icon */}
            <div className="w-20 h-20 rounded-full bg-emerald-600/15 flex items-center justify-center mb-6">
                <div className="w-14 h-14 rounded-full bg-emerald-600/25 flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            </div>

            <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight mb-3">
                Setup Complete!
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-2 max-w-sm">
                Your AI Attendance Management System is now ready to use.
            </p>
            <p className="text-zinc-600 dark:text-zinc-500 text-xs leading-relaxed mb-8 max-w-sm">
                You can now sign in with the administrator account you just created.
                Add employees, configure cameras, and start tracking attendance.
            </p>

            <button
                onClick={handleFinish}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
                {loading ? (
                    <>
                        <LoadingSpinner size="sm" />
                        Finalizing...
                    </>
                ) : (
                    <>
                        Go to Login
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </>
                )}
            </button>
        </div>
    );
}
