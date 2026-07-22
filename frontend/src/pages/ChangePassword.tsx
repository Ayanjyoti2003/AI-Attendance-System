import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import LoadingSpinner from "../components/LoadingSpinner";
import { useToast } from "../components/Toast";

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

export default function ChangePassword() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const { showToast } = useToast();
    const navigate = useNavigate();

    const strength = getPasswordStrength(newPassword);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (newPassword.length < 8) {
            setError("New password must be at least 8 characters.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await api.post("/api/users/change-password", {
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            });

            showToast("Password updated successfully. Please log in again.", "success");
            localStorage.removeItem("token");
            localStorage.removeItem("must_change_password");
            navigate("/login", { replace: true });
        } catch (err: any) {
            if (err.response?.data?.detail) {
                setError(err.response.data.detail);
            } else {
                setError("Failed to update password. Please verify your current password.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("must_change_password");
        navigate("/login", { replace: true });
    };

    return (
        <div className="min-h-full flex items-center justify-center bg-zinc-950 relative overflow-hidden select-none">
            {/* Ambient background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px]" />
                <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
            </div>

            {/* Main Card */}
            <div className="relative w-full max-w-md mx-4 animate-slide-up">
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl shadow-black/50 p-8 md:p-10">
                    <div className="flex flex-col items-center mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-black text-white tracking-tight">
                            Password Update Required
                        </h1>
                        <p className="text-zinc-400 text-sm mt-1.5 text-center">
                            You must change your password before continuing
                        </p>
                    </div>

                    {error && (
                        <div className="mb-5 px-4 py-3 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-sm font-medium flex items-center gap-2">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        {/* Current Password */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                                Current Password
                            </label>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter current password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-650 transition-all"
                                required
                            />
                        </div>

                        {/* New Password */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                                New Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="At least 8 characters"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-4 pr-12 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-650 transition-all"
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
                            {newPassword.length > 0 && (
                                <div className="flex items-center gap-2 mt-1">
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
                                    <span className={`text-[10px] font-bold ${
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
                            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                                Confirm Password
                            </label>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Re-enter new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-650 transition-all"
                                required
                            />
                        </div>

                        {/* Submit & Cancel */}
                        <div className="flex flex-col gap-3 mt-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <LoadingSpinner size="sm" />
                                        Updating password...
                                    </>
                                ) : (
                                    "Update Password"
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="w-full py-2.5 rounded-xl border border-zinc-800 bg-transparent hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 font-semibold text-xs transition-colors cursor-pointer"
                            >
                                Back to Sign In
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
