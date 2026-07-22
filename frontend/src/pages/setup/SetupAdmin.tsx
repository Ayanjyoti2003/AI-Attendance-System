import { useState } from "react";
import { setupAdmin } from "../../api/setup";
import LoadingSpinner from "../../components/LoadingSpinner";

interface Props {
    onSuccess: () => void;
    onBack: () => void;
    showToast: (msg: string, type: "success" | "error" | "warning" | "info") => void;
    /** Pre-filled values when navigating back */
    initialUsername?: string;
    adminCreated?: boolean;
}

function getPasswordStrength(password: string): { level: number; label: string; color: string } {
    if (password.length === 0) return { level: 0, label: "", color: "" };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { level: 1, label: "Weak", color: "bg-red-500" };
    if (score <= 2) return { level: 2, label: "Fair", color: "bg-amber-500" };
    if (score <= 3) return { level: 3, label: "Good", color: "bg-blue-500" };
    return { level: 4, label: "Strong", color: "bg-emerald-500" };
}

export default function SetupAdmin({ onSuccess, onBack, showToast, initialUsername = "", adminCreated = false }: Props) {
    const [username, setUsername] = useState(initialUsername);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
    const [confirmedStored, setConfirmedStored] = useState(false);

    if (recoveryKey) {
        return (
            <div className="animate-fade-in flex flex-col items-center text-center select-none">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/5">
                    <svg className="w-8 h-8 text-amber-450" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                    Save Administrator Recovery Key
                </h2>
                <p className="text-zinc-400 text-sm mt-2 leading-relaxed max-w-sm mb-6">
                    This key can be used to recover administrator access if you forget your password.
                    <span className="text-amber-500 font-bold block mt-1">This key cannot be shown again.</span>
                </p>

                {/* Key Display & Copy */}
                <div className="w-full flex flex-col gap-3 mb-6">
                    <div className="py-4 px-6 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-lg font-bold tracking-widest text-zinc-100 select-all flex items-center justify-between">
                        <span>{recoveryKey}</span>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(recoveryKey);
                                showToast("Recovery Key copied to clipboard!", "success");
                            }}
                            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer flex items-center justify-center"
                            title="Copy Key"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Confirmation Checkbox */}
                <label className="flex items-center gap-3 cursor-pointer group mb-6 text-left w-full p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
                    <input
                        type="checkbox"
                        checked={confirmedStored}
                        onChange={(e) => setConfirmedStored(e.target.checked)}
                        className="w-5 h-5 rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-blue-500/20 focus:ring-offset-zinc-900 transition-colors cursor-pointer"
                    />
                    <span className="text-zinc-400 group-hover:text-zinc-300 text-sm font-medium transition-colors select-none">
                        I have copied and saved this recovery key safely
                    </span>
                </label>

                {/* Actions */}
                <button
                    type="button"
                    onClick={onSuccess}
                    disabled={!confirmedStored}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                    Continue Setup
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                </button>
            </div>
        );
    }

    if (adminCreated) {
        return (
            <div className="animate-fade-in flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/5">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                    Administrator Configured
                </h2>
                <p className="text-zinc-400 text-sm mt-2 leading-relaxed max-w-sm mb-8">
                    An administrator account has already been registered for this system. You can safely proceed to the next configuration step.
                </p>
                <div className="flex gap-3 w-full">
                    <button
                        type="button"
                        onClick={onBack}
                        className="py-3 px-5 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                    >
                        Back
                    </button>
                    <button
                        type="button"
                        onClick={onSuccess}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/25 cursor-pointer flex items-center justify-center gap-2"
                    >
                        Continue Setup
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }

    const strength = getPasswordStrength(password);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!username.trim()) {
            setError("Username is required.");
            return;
        }

        if (username.trim().length < 3) {
            setError("Username must be at least 3 characters.");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            const res = await setupAdmin({
                username: username.trim(),
                password
            });

            if (res.error) {
                setError(res.error);
                return;
            }

            showToast("Administrator account created!", "success");
            if (res.recovery_key) {
                setRecoveryKey(res.recovery_key);
            } else {
                onSuccess();
            }
        } catch {
            setError("Failed to create administrator. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex flex-col items-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-violet-600/20 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                    Create Administrator
                </h2>
                <p className="text-zinc-400 text-sm mt-1.5 text-center">
                    This will be your initial Super Admin account.
                </p>
            </div>

            {error && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-sm font-medium flex items-center gap-2 animate-fade-in">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* Username */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Username
                    </label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            placeholder="e.g. admin"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 transition-all"
                            required
                            autoFocus
                        />
                    </div>
                </div>

                {/* Password */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Password
                    </label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </span>
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Minimum 8 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-12 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 transition-all"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                            tabIndex={-1}
                        >
                            {showPassword ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            )}
                        </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {password.length > 0 && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <div className="flex gap-1 flex-1">
                                {[1, 2, 3, 4].map((bar) => (
                                    <div
                                        key={bar}
                                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                            bar <= strength.level ? strength.color : "bg-zinc-800"
                                        }`}
                                    />
                                ))}
                            </div>
                            <span className={`text-xs font-semibold ${
                                strength.level <= 1 ? "text-red-400"
                                    : strength.level === 2 ? "text-amber-400"
                                    : strength.level === 3 ? "text-blue-400"
                                    : "text-emerald-400"
                            }`}>
                                {strength.label}
                            </span>
                        </div>
                    )}
                </div>

                {/* Confirm Password */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Confirm Password
                    </label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </span>
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Re-enter your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 transition-all"
                            required
                        />
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                        <p className="text-red-400 text-xs font-medium animate-fade-in">
                            Passwords do not match
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-1">
                    <button
                        type="button"
                        onClick={onBack}
                        className="py-3 px-5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                    >
                        Back
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <LoadingSpinner size="sm" />
                                Creating Account...
                            </>
                        ) : (
                            <>
                                Create Administrator
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
