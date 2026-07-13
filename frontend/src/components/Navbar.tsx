import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../api/auth";
import type { CurrentUser } from "../types/user";
import ConfirmDialog from "./ConfirmDialog";

export default function Navbar() {
    const navigate = useNavigate();
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isLogoutOpen, setIsLogoutOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getCurrentUser()
            .then(setUser)
            .catch((err) => console.error("Error loading user in navbar:", err));
    }, []);

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/login", { replace: true });
    };

    return (
        <header className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-white h-16 px-8 flex items-center justify-between sticky top-0 z-40 transition-colors duration-300 select-none flex-shrink-0">
            <div>
                <span className="text-zinc-500 dark:text-zinc-400 text-sm">System Status: </span>
                <span className="text-emerald-600 dark:text-emerald-500 text-xs font-bold bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20">
                    Online
                </span>
            </div>

            {/* Profile Dropdown */}
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-850 transition-all border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 focus:outline-none cursor-pointer"
                >
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-blue-600 dark:text-blue-400 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-bold text-sm shadow-sm">
                        {user?.sub ? user.sub.slice(0, 2).toUpperCase() : "U"}
                    </div>
                    <div className="hidden sm:flex flex-col text-left">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">
                            {user?.sub || "Loading..."}
                        </span>
                        <span className="text-xs text-zinc-500 leading-none">
                            {user?.role || "USER"}
                        </span>
                    </div>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-xl shadow-2xl py-2 z-50 transform origin-top-right animate-scale-up">
                        <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-850 flex flex-col gap-0.5">
                            <p className="text-xs text-zinc-500">Logged in as</p>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{user?.sub}</p>
                            <span className="text-[10px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 self-start px-2 py-0.5 rounded-md mt-1">
                                {user?.role}
                            </span>
                        </div>

                        <Link
                            to="/profile"
                            onClick={() => setIsDropdownOpen(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 hover:bg-zinc-50 dark:hover:text-white dark:hover:bg-zinc-800/50 transition-colors"
                        >
                            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Your Profile
                        </Link>

                        <button
                            onClick={() => {
                                setIsDropdownOpen(false);
                                setIsLogoutOpen(true);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 dark:hover:text-rose-400 transition-colors text-left cursor-pointer"
                        >
                            <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Logout
                        </button>
                    </div>
                )}
            </div>

            {/* Logout Confirm Dialog */}
            <ConfirmDialog
                isOpen={isLogoutOpen}
                onClose={() => setIsLogoutOpen(false)}
                onConfirm={handleLogout}
                title="Logout Confirmation"
                message="Are you sure you want to end your active session?"
                confirmText="Logout"
                isDanger
            />
        </header>
    );
}