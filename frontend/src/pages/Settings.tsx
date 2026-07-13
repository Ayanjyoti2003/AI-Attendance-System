import { useState, useEffect } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { useToast } from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";
import {
    createBackup,
    listBackups,
    restoreBackup,
    deleteBackup,
    getBackupSettings,
    updateBackupSettings,
    type BackupInfo,
    type BackupSettings,
} from "../api/backups";
import SystemHealthTab from "../components/SystemHealthTab";

type SettingsTab = "general" | "backup" | "health";


export default function Settings() {
    const { showToast } = useToast();
    const [theme, setTheme] = useState<"light" | "dark">("dark");
    const [activeTab, setActiveTab] = useState<SettingsTab>("general");

    useEffect(() => {
        const savedTheme = (localStorage.getItem("theme") as "light" | "dark") || "dark";
        setTheme(savedTheme);
    }, []);

    const handleThemeChange = (newTheme: "light" | "dark") => {
        setTheme(newTheme);
        localStorage.setItem("theme", newTheme);
        if (newTheme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        showToast(`Theme changed to ${newTheme === "dark" ? "Dark" : "Light"} mode.`, "success");
    };

    const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
        {
            id: "general",
            label: "General",
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
        },
        {
            id: "backup",
            label: "Backup & Restore",
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
            ),
        },
        {
            id: "health",
            label: "System Health",
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
            ),
        },
    ];

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-fade-in">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                        Settings
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                        Manage your preferences and application configuration.
                    </p>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex-1 justify-center
                                ${
                                    activeTab === tab.id
                                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                                }
                            `}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === "general" && (
                    <GeneralTab theme={theme} onThemeChange={handleThemeChange} />
                )}
                {activeTab === "backup" && <BackupTab />}
                {activeTab === "health" && <SystemHealthTab />}
            </div>
        </DashboardLayout>
    );
}


// ═════════════════════════════════════════════════════════════
// GENERAL TAB
// ═════════════════════════════════════════════════════════════

function GeneralTab({ theme, onThemeChange }: { theme: "light" | "dark"; onThemeChange: (t: "light" | "dark") => void }) {
    return (
        <>
            {/* Theme Customizer Card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-lg flex flex-col gap-6">
                <div>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Theme Preferences</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Switch between light and dark visual modes. Your selection persists across sessions.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Light Theme Card */}
                    <button
                        onClick={() => onThemeChange("light")}
                        className={`
                            flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all cursor-pointer group
                            ${
                                theme === "light"
                                    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20 dark:ring-amber-500/20"
                                    : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                            }
                        `}
                    >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-110 ${
                            theme === "light"
                                ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-amber-500"
                        }`}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.364l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" />
                            </svg>
                        </div>
                        <div>
                            <h4 className={`font-bold text-sm ${theme === "light" ? "text-amber-700 dark:text-amber-300" : "text-zinc-900 dark:text-white"}`}>
                                Light Mode
                            </h4>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Clean interfaces with bright panels.
                            </p>
                            {theme === "light" && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-1.5">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    Active
                                </span>
                            )}
                        </div>
                    </button>

                    {/* Dark Theme Card */}
                    <button
                        onClick={() => onThemeChange("dark")}
                        className={`
                            flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all cursor-pointer group
                            ${
                                theme === "dark"
                                    ? "bg-blue-950/20 border-blue-500 ring-2 ring-blue-500/20"
                                    : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                            }
                        `}
                    >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-110 ${
                            theme === "dark"
                                ? "bg-blue-900/30 text-blue-400"
                                : "bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 text-blue-400"
                        }`}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                        </div>
                        <div>
                            <h4 className={`font-bold text-sm ${theme === "dark" ? "text-blue-300" : "text-zinc-900 dark:text-white"}`}>
                                Dark Mode
                            </h4>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Modern interfaces with rich zinc tones.
                            </p>
                            {theme === "dark" && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400 mt-1.5">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    Active
                                </span>
                            )}
                        </div>
                    </button>
                </div>
            </div>

            {/* Notifications */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-lg flex flex-col gap-4">
                <div>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Notifications</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Configure system notification behavior and alert thresholds.
                    </p>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                    <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Toast Notifications</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Show success and error alerts on actions</p>
                    </div>
                    <div className="w-11 h-6 bg-blue-600 rounded-full relative cursor-pointer shadow-inner">
                        <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all" />
                    </div>
                </div>
            </div>
        </>
    );
}


// ═════════════════════════════════════════════════════════════
// BACKUP & RESTORE TAB
// ═════════════════════════════════════════════════════════════

function BackupTab() {
    const { showToast } = useToast();

    // State
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [restoring, setRestoring] = useState(false);

    // Settings state
    const [settings, setSettings] = useState<BackupSettings>({
        enabled: false,
        automatic: false,
        frequency: "daily",
        keep: 30,
        destination: "",
        backup_time: "02:00",
    });
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);

    // Dialogs
    const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    // Load data on mount
    useEffect(() => {
        loadBackups();
        loadSettings();
    }, []);

    const loadBackups = async () => {
        try {
            setLoading(true);
            const data = await listBackups();
            setBackups(data);
        } catch {
            showToast("Failed to load backups.", "error");
        } finally {
            setLoading(false);
        }
    };

    const loadSettings = async () => {
        try {
            setSettingsLoading(true);
            const data = await getBackupSettings();
            setSettings(data);
        } catch {
            showToast("Failed to load backup settings.", "error");
        } finally {
            setSettingsLoading(false);
        }
    };

    const handleCreateBackup = async () => {
        try {
            setCreating(true);
            const result = await createBackup();
            showToast(result.message || "Backup created successfully.", "success");
            await loadBackups();
        } catch (err: any) {
            const msg = err?.response?.data?.detail || "Backup failed. Please try again.";
            showToast(msg, "error");
        } finally {
            setCreating(false);
        }
    };

    const handleRestore = async () => {
        if (!restoreTarget) return;
        try {
            setRestoring(true);
            const result = await restoreBackup(restoreTarget);
            if (result.restart_required) {
                showToast("Backup restored. Please restart the application.", "warning");
            } else {
                showToast(result.message || "Restore completed.", "success");
            }
            await loadBackups();
        } catch (err: any) {
            const msg = err?.response?.data?.detail || "Restore failed. Please try again.";
            showToast(msg, "error");
        } finally {
            setRestoring(false);
            setRestoreTarget(null);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteBackup(deleteTarget);
            showToast("Backup deleted.", "success");
            await loadBackups();
        } catch (err: any) {
            const msg = err?.response?.data?.detail || "Delete failed.";
            showToast(msg, "error");
        } finally {
            setDeleteTarget(null);
        }
    };

    const handleSaveSettings = async () => {
        try {
            setSavingSettings(true);
            const result = await updateBackupSettings(settings);
            if (result.status === "error") {
                showToast("Failed to save settings.", "error");
            } else {
                showToast("Backup settings saved.", "success");
            }
        } catch {
            showToast("Failed to save backup settings.", "error");
        } finally {
            setSavingSettings(false);
        }
    };

    // Derive last backup
    const lastBackup = backups.length > 0 ? backups[0] : null;

    const formatDate = (iso: string) => {
        try {
            const d = new Date(iso);
            return d.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return iso;
        }
    };

    return (
        <>
            {/* Manual Backup Card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-lg flex flex-col gap-5">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Manual Backup
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Create a complete system backup including database, employee data, and configuration.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                    <button
                        id="create-backup-btn"
                        onClick={handleCreateBackup}
                        disabled={creating}
                        className={`
                            inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer
                            ${creating
                                ? "bg-emerald-800/50 text-emerald-400/60 cursor-wait"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 hover:shadow-emerald-800/40"
                            }
                        `}
                    >
                        {creating ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Creating Backup…
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Create Backup
                            </>
                        )}
                    </button>

                    {lastBackup && (
                        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Last Backup: <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatDate(lastBackup.created_at)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Available Backups Table */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-lg overflow-hidden">
                <div className="p-6 pb-4">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        Available Backups
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Manage your backup archives. Restoring creates a safety backup automatically.
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12 text-zinc-400">
                        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Loading backups…
                    </div>
                ) : backups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                            <svg className="w-7 h-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No backups yet</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">Create your first backup to protect your data.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-t border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
                                    <th className="text-left py-3 px-6 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Filename</th>
                                    <th className="text-left py-3 px-6 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Date</th>
                                    <th className="text-left py-3 px-6 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Size</th>
                                    <th className="text-right py-3 px-6 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {backups.map((backup, idx) => (
                                    <tr
                                        key={backup.filename}
                                        className={`border-b border-zinc-100 dark:border-zinc-800/50 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/30 ${
                                            idx === backups.length - 1 ? "border-b-0" : ""
                                        }`}
                                    >
                                        <td className="py-3.5 px-6">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                                    backup.filename.startsWith("pre_restore_")
                                                        ? "bg-amber-500"
                                                        : "bg-emerald-500"
                                                }`} />
                                                <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-xs" title={backup.filename}>
                                                    {backup.filename}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-6 text-zinc-600 dark:text-zinc-400">
                                            {formatDate(backup.created_at)}
                                        </td>
                                        <td className="py-3.5 px-6 text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                                            {backup.size_display}
                                        </td>
                                        <td className="py-3.5 px-6 text-right">
                                            <div className="flex items-center gap-2 justify-end">
                                                <button
                                                    onClick={() => setRestoreTarget(backup.filename)}
                                                    disabled={restoring}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 transition-colors cursor-pointer disabled:opacity-50"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                    Restore
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(backup.filename)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/10 text-red-500 hover:bg-red-600/20 transition-colors cursor-pointer"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Automatic Backup Settings */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-lg flex flex-col gap-5">
                <div>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Automatic Backups
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Schedule automatic backups to run in the background.
                    </p>
                </div>

                {settingsLoading ? (
                    <div className="flex items-center justify-center py-8 text-zinc-400 text-sm">Loading settings…</div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {/* Enable Toggle */}
                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                            <div>
                                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Enable Automatic Backup</p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Automatically create backups on a schedule</p>
                            </div>
                            <button
                                onClick={() => setSettings({ ...settings, enabled: !settings.enabled, automatic: !settings.enabled })}
                                className={`
                                    w-11 h-6 rounded-full relative cursor-pointer shadow-inner transition-colors
                                    ${settings.enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-700"}
                                `}
                            >
                                <div className={`
                                    absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all
                                    ${settings.enabled ? "right-0.5" : "left-0.5"}
                                `} />
                            </button>
                        </div>

                        {/* Schedule Settings (visible when enabled) */}
                        {settings.enabled && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-1">
                                {/* Frequency */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Frequency</label>
                                    <select
                                        value={settings.frequency}
                                        onChange={(e) => setSettings({ ...settings, frequency: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none transition-all"
                                    >
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>

                                {/* Backup Time */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Backup Time</label>
                                    <input
                                        type="time"
                                        value={settings.backup_time}
                                        onChange={(e) => setSettings({ ...settings, backup_time: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none transition-all"
                                    />
                                </div>

                                {/* Retention */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Keep Last</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={settings.keep}
                                            onChange={(e) => setSettings({ ...settings, keep: parseInt(e.target.value) || 30 })}
                                            className="w-20 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none transition-all"
                                        />
                                        <span className="text-xs text-zinc-500 dark:text-zinc-400">backups</span>
                                    </div>
                                </div>

                                {/* Destination */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Destination Folder</label>
                                    <input
                                        type="text"
                                        value={settings.destination}
                                        onChange={(e) => setSettings({ ...settings, destination: e.target.value })}
                                        placeholder="Leave empty for default location"
                                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Save Button */}
                        <div className="flex justify-end pt-2">
                            <button
                                id="save-backup-settings-btn"
                                onClick={handleSaveSettings}
                                disabled={savingSettings}
                                className={`
                                    inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer
                                    ${savingSettings
                                        ? "bg-violet-800/50 text-violet-400/60 cursor-wait"
                                        : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30 hover:shadow-violet-800/40"
                                    }
                                `}
                            >
                                {savingSettings ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Saving…
                                    </>
                                ) : (
                                    "Save Settings"
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Restore Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!restoreTarget}
                onClose={() => setRestoreTarget(null)}
                onConfirm={handleRestore}
                title="Restore Backup"
                message={`Are you sure you want to restore "${restoreTarget}"? A safety backup will be created automatically before restoring. The application will need to be restarted after restoration. Database connection settings will be preserved.`}
                confirmText={restoring ? "Restoring…" : "Restore"}
                isDanger
            />

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Backup"
                message={`Are you sure you want to permanently delete "${deleteTarget}"? This action cannot be undone.`}
                confirmText="Delete"
                isDanger
            />
        </>
    );
}
