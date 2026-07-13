import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatsCard from "../components/StatsCard";
import AttendanceFeed from "../components/AttendanceFeed";
import DashboardLayout from "../layouts/DashboardLayout";
import { getStats } from "../api/stats";
import { getCurrentUser } from "../api/auth";
import type { DashboardStats } from "../types/stats";
import type { CurrentUser } from "../types/user";
import LoadingSpinner from "../components/LoadingSpinner";

export default function Dashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                const [statsData, userData] = await Promise.all([
                    getStats(),
                    getCurrentUser()
                ]);
                setStats(statsData);
                setUser(userData);
            } catch (err) {
                console.error("Error loading dashboard data:", err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
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

    const isSuperAdmin = user?.role === "SUPER_ADMIN";

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 select-none animate-fade-in">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                        Attendance Dashboard
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                        Monitoring system status, enrollments, and live attendance metrics.
                    </p>
                </div>

                {/* Stats Grid */}
                <div className={`grid grid-cols-1 sm:grid-cols-2 ${isSuperAdmin ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-5`}>
                    <StatsCard
                        title="Total Employees"
                        value={stats?.total_employees ?? 0}
                    />
                    <StatsCard
                        title="Active Employees"
                        value={stats?.active_employees ?? 0}
                    />
                    <StatsCard
                        title="Attendance Today"
                        value={stats?.attendance_today ?? 0}
                    />
                    <StatsCard
                        title="Total Cameras"
                        value={stats?.total_cameras ?? 0}
                    />
                    {isSuperAdmin && (
                        <StatsCard
                            title="Total Users"
                            value={stats?.total_users ?? 0}
                        />
                    )}
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-2">
                        <AttendanceFeed />
                    </div>

                    {/* Quick Shortcuts Panel */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-lg flex flex-col gap-4 transition-colors duration-300">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">Quick Actions</h3>
                        
                        <Link
                            to="/employees"
                            className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-200 dark:hover:border-blue-900/40 transition-all text-sm text-zinc-600 dark:text-zinc-300 hover:text-blue-700 dark:hover:text-blue-400 group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                    </svg>
                                </div>
                                <span className="font-medium">Enroll New Employee</span>
                            </div>
                            <svg className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </Link>

                        <Link
                            to="/cameras"
                            className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:border-amber-200 dark:hover:border-amber-900/40 transition-all text-sm text-zinc-600 dark:text-zinc-300 hover:text-amber-700 dark:hover:text-amber-400 group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <span className="font-medium">Configure Cameras</span>
                            </div>
                            <svg className="w-4 h-4 text-zinc-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </Link>

                        <Link
                            to="/attendance"
                            className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-violet-50 dark:hover:bg-violet-950/20 hover:border-violet-200 dark:hover:border-violet-900/40 transition-all text-sm text-zinc-600 dark:text-zinc-300 hover:text-violet-700 dark:hover:text-violet-400 group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <span className="font-medium">View Detailed Reports</span>
                            </div>
                            <svg className="w-4 h-4 text-zinc-400 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </Link>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}