import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getCurrentUser } from "../api/auth";
import type { CurrentUser } from "../types/user";

interface SidebarProps {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

export default function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
    const location = useLocation();
    const [user, setUser] = useState<CurrentUser | null>(null);

    useEffect(() => {
        getCurrentUser()
            .then(setUser)
            .catch((err) => console.error("Error loading user in sidebar:", err));
    }, []);

    const isSuperAdmin = user?.role === "SUPER_ADMIN";

    const menuItems = [
        {
            path: "/dashboard",
            name: "Dashboard",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
                </svg>
            )
        },
        {
            path: "/employees",
            name: "Employees",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            )
        },
        {
            path: "/attendance",
            name: "Attendance",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2m-6 9l2 2 4-4" />
                </svg>
            )
        },
        {
            path: "/cameras",
            name: "Cameras",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            )
        },
        {
            path: "/users",
            name: "Users",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a6 6 0 009-5.197M5.197 9.003a6 6 0 006 6M15 21a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            )
        },
        {
            path: "/audit-logs",
            name: "Audit Logs",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        },
        {
            path: "/settings",
            name: "Settings",
            icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            )
        }
    ];

    return (
        <aside
            className={`
                bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-r border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 
                flex flex-col h-screen sticky top-0 transition-all duration-300 z-30 select-none
                ${isCollapsed ? "w-20" : "w-64"}
            `}
        >
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-5 border-b border-zinc-200 dark:border-zinc-800 gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                        A
                    </div>
                    {!isCollapsed && (
                        <span className="font-bold text-lg tracking-wider text-zinc-900 dark:text-white truncate">
                            AI Attendance
                        </span>
                    )}
                </div>

                <button
                    onClick={onToggleCollapse}
                    className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                    <svg
                        className={`w-5 h-5 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 px-3 py-6 flex flex-col gap-1.5 overflow-y-auto">
                {menuItems
                    .filter((item) => item.path !== "/users" || isSuperAdmin)
                    .map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                title={isCollapsed ? item.name : undefined}
                                className={`
                                    flex items-center gap-3 px-3.5 py-3 rounded-xl font-medium text-sm transition-all duration-200 relative group
                                    ${
                                        isActive
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10"
                                            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                                    }
                                `}
                            >
                                {item.icon}
                                
                                {!isCollapsed && <span className="truncate">{item.name}</span>}

                                {/* Collapse Floating Tooltip */}
                                {isCollapsed && (
                                    <span className="absolute left-20 scale-0 group-hover:scale-100 transition-all duration-150 origin-left bg-zinc-950 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl border border-zinc-800 pointer-events-none whitespace-nowrap z-50">
                                        {item.name}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
            </nav>

            {/* Footer */}
            {!isCollapsed && (
                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-center">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">v1.0.0 • Production</span>
                </div>
            )}
        </aside>
    );
}