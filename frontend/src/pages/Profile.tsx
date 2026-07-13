import { useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { getCurrentUser } from "../api/auth";
import type { CurrentUser } from "../types/user";
import LoadingSpinner from "../components/LoadingSpinner";
import { useToast } from "../components/Toast";

export default function Profile() {
    const { showToast } = useToast();
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);

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
            </div>
        </DashboardLayout>
    );
}
