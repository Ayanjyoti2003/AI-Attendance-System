import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import { getCurrentUser } from "../api/auth";
import type { CurrentUser } from "../types/user";
import LoadingSpinner from "../components/LoadingSpinner";
import { useToast } from "../components/Toast";
import api from "../api/axios";

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

export default function Profile() {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [changing, setChanging] = useState(false);
    const [profileError, setProfileError] = useState("");

    const strength = getPasswordStrength(newPassword);

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileError("");

        if (newPassword.length < 8) {
            setProfileError("New password must be at least 8 characters.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setProfileError("Passwords do not match.");
            return;
        }

        setChanging(true);
        try {
            await api.post("/api/users/change-password", {
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            });

            showToast("Password updated successfully! Please log in again.", "success");
            localStorage.removeItem("token");
            localStorage.removeItem("must_change_password");
            navigate("/login", { replace: true });
        } catch (err: any) {
            console.error("Error updating password:", err);
            const msg = err.response?.data?.detail || "Failed to update password. Verify current password.";
            setProfileError(msg);
        } finally {
            setChanging(false);
        }
    };

    useEffect(() => {
        getCurrentUser()
            .then(setUser)
            .catch((err) => {
                console.error("Error loading user profile:", err);
                showToast("Failed to fetch account metadata.", "error");
            })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-64 items-center justify-center">
                    <LoadingSpinner size="lg" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto flex flex-col gap-6 select-none animate-fade-in">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">Account Details</h1>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                        View authorization role and local session parameters for your operator account.
                    </p>
                </div>

                {/* Profile Detail Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-xl flex flex-col sm:flex-row gap-8 items-center transition-colors duration-250">
                    {/* Big Avatar */}
                    <div className="w-24 h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-4xl text-blue-600 dark:text-blue-500 font-black shadow-lg shadow-blue-500/5 transition-colors duration-250">
                        {user?.sub ? user.sub.slice(0, 2).toUpperCase() : "U"}
                    </div>

                    <div className="flex-1 flex flex-col gap-3 text-center sm:text-left">
                        <div>
                            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white leading-tight">{user?.sub}</h2>
                            <p className="text-sm text-zinc-500 mt-1">Operator Profile</p>
                        </div>

                        <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-2">
                            <div className="flex flex-col gap-0.5 px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 min-w-[120px] transition-colors duration-250">
                                <span className="text-[10px] text-zinc-550 dark:text-zinc-500 uppercase font-bold tracking-wider">Access Role</span>
                                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 mt-0.5">{user?.role}</span>
                            </div>
                            
                            <div className="flex flex-col gap-0.5 px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 min-w-[120px] transition-colors duration-250">
                                <span className="text-[10px] text-zinc-550 dark:text-zinc-500 uppercase font-bold tracking-wider">Session Status</span>
                                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-500 mt-0.5 flex items-center gap-1.5 justify-center sm:justify-start">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Active
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Metadata details list */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4 transition-colors duration-250">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-3 transition-colors duration-250">
                        Security Overview
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-500 font-medium">Username identifier</span>
                            <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{user?.sub}</span>
                        </div>

                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-500 font-medium">Operator privileges</span>
                            <span className="text-zinc-800 dark:text-zinc-200 font-semibold">
                                {user?.role === "SUPER_ADMIN"
                                    ? "Full Administration & Account Configuration"
                                    : "Standard Administration & Log Management"}
                            </span>
                        </div>

                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-500 font-medium">Local workspace host</span>
                            <span className="text-zinc-800 dark:text-zinc-200 font-mono text-xs select-all">{import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}</span>
                        </div>

                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-500 font-medium">Authentication method</span>
                            <span className="text-zinc-800 dark:text-zinc-200 font-semibold">JSON Web Tokens (JWT)</span>
                        </div>
                    </div>
                </div>

                {/* Change Password Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5 transition-colors duration-250">
                    <div>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-3 transition-colors duration-250">
                            Update Password
                        </h3>
                        <p className="text-zinc-550 dark:text-zinc-400 text-xs mt-1">
                            Revise the security credentials for your dashboard access. Changing your password will invalidate all other active sessions.
                        </p>
                    </div>

                    {profileError && (
                        <div className="px-4 py-3 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-sm font-medium flex items-center gap-2">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {profileError}
                        </div>
                    )}

                    <form onSubmit={handlePasswordChange} className="flex flex-col gap-4 max-w-md">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-zinc-650 dark:text-zinc-400">Current Password</label>
                            <input
                                type="password"
                                placeholder="Enter current password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none transition-all placeholder-zinc-400 dark:placeholder-zinc-650"
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-zinc-650 dark:text-zinc-400">New Password</label>
                            <input
                                type="password"
                                placeholder="Minimum 8 characters"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none transition-all placeholder-zinc-400 dark:placeholder-zinc-650"
                                required
                            />
                            {newPassword.length > 0 && (
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="flex gap-1 flex-1">
                                        {[1, 2, 3, 4].map((bar) => (
                                            <div
                                                key={bar}
                                                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                                    bar <= strength.level ? strength.color : "bg-zinc-200 dark:bg-zinc-800"
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

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-zinc-655 dark:text-zinc-400">Confirm New Password</label>
                            <input
                                type="password"
                                placeholder="Confirm new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none transition-all placeholder-zinc-400 dark:placeholder-zinc-650"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={changing}
                            className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-600/10 cursor-pointer flex items-center justify-center gap-2 max-w-max disabled:opacity-60"
                        >
                            {changing ? (
                                <>
                                    <LoadingSpinner size="sm" />
                                    Updating...
                                </>
                            ) : (
                                "Change Password"
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </DashboardLayout>
    );
}
