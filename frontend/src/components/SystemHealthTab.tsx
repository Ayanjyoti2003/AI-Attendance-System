import { useState, useEffect, useRef } from "react";
import { useToast } from "./Toast";
import LoadingSpinner from "./LoadingSpinner";
import {
    getSystemHealth,
    listLogs,
    getLogContent,
    exportDiagnostics,
    type SystemHealthResponse,
    type LogFileInfo,
} from "../api/diagnostics";

export default function SystemHealthTab() {
    const { showToast } = useToast();
    const [health, setHealth] = useState<SystemHealthResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Logs state
    const [logFiles, setLogFiles] = useState<LogFileInfo[]>([]);
    const [selectedLog, setSelectedLog] = useState<string>("");
    const [logLines, setLogLines] = useState<string[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [exporting, setExporting] = useState(false);

    const logTerminalRef = useRef<HTMLDivElement>(null);
    const role = getUserRole();
    const isSuperAdmin = role === "SUPER_ADMIN";

    // Load data
    useEffect(() => {
        loadHealthData(true, true);

        // Auto refresh every 30 seconds
        const timer = setInterval(() => {
            loadHealthData(false);
        }, 30000);

        return () => clearInterval(timer);
    }, []);

    // Load logs if super admin
    useEffect(() => {
        if (isSuperAdmin) {
            loadLogFiles();
        }
    }, [isSuperAdmin]);

    // Load log content when selection changes
    useEffect(() => {
        if (selectedLog) {
            fetchLogContent(selectedLog);
        } else {
            setLogLines([]);
        }
    }, [selectedLog]);

    // Scroll to bottom of log viewer
    useEffect(() => {
        if (autoScroll && logTerminalRef.current) {
            logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
        }
    }, [logLines, autoScroll]);

    // Extract user role from JWT token
    function getUserRole(): string | null {
        try {
            const token = localStorage.getItem("token");
            if (!token) return null;
            const payloadBase64 = token.split(".")[1];
            if (!payloadBase64) return null;
            const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split("")
                    .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                    .join("")
            );
            const parsed = JSON.parse(jsonPayload);
            return parsed.role || null;
        } catch {
            return null;
        }
    }

    const loadHealthData = async (initial = false, forceRefresh = false) => {
        try {
            if (initial) setLoading(true);
            else setRefreshing(true);
            const data = await getSystemHealth(forceRefresh);
            setHealth(data);
        } catch (err: any) {
            showToast("Failed to fetch system health diagnostics.", "error");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const loadLogFiles = async () => {
        try {
            const files = await listLogs();
            setLogFiles(files);
            // Default to backend.log if available, otherwise first file
            if (files.length > 0) {
                const hasBackend = files.find((f) => f.name === "backend.log");
                setSelectedLog(hasBackend ? "backend.log" : files[0].name);
            }
        } catch {
            showToast("Failed to retrieve log files list.", "error");
        }
    };

    const fetchLogContent = async (logName: string) => {
        try {
            setLogsLoading(true);
            const res = await getLogContent(logName);
            setLogLines(res.lines);
        } catch {
            showToast(`Failed to load log entries for ${logName}.`, "error");
        } finally {
            setLogsLoading(false);
        }
    };

    const handleExportDiagnostics = async () => {
        try {
            setExporting(true);
            showToast("Generating troubleshooting diagnostics package...", "info");
            const blob = await exportDiagnostics();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            
            const dateStr = new Date().toISOString().split("T")[0];
            link.setAttribute("download", `diagnostics_${dateStr}.zip`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);
            showToast("Diagnostics package downloaded successfully.", "success");
        } catch {
            showToast("Failed to export diagnostics archive.", "error");
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <LoadingSpinner size="lg" />
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">Gathering system diagnostics...</p>
            </div>
        );
    }

    if (!health) {
        return (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-6 text-center">
                <p className="text-rose-600 dark:text-rose-400 font-semibold">Failed to fetch diagnostics report.</p>
                <button
                    onClick={() => loadHealthData(true, true)}
                    className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                    Try Again
                </button>
            </div>
        );
    }

    // Determine Overall Status Banner Styling
    const statusMeta = {
        healthy: {
            bg: "bg-emerald-50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/50",
            text: "text-emerald-800 dark:text-emerald-400",
            indicator: "🟢",
            label: "System Operational",
            desc: "All core services, database connections, and camera feeds are running normally.",
        },
        warning: {
            bg: "bg-amber-50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/50",
            text: "text-amber-800 dark:text-amber-400",
            indicator: "🟡",
            label: "System Warning",
            desc: "One or more non-critical components require attention. Backups might be overdue or a camera is offline.",
        },
        error: {
            bg: "bg-rose-50 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/50",
            text: "text-rose-800 dark:text-rose-400",
            indicator: "🔴",
            label: "System Critical",
            desc: "Critical components have failed. Database disconnected, migrations missing, or camera manager daemon stopped.",
        },
    }[health.status as "healthy" | "warning" | "error"] || {
        bg: "bg-zinc-50 dark:bg-zinc-950/20 border-zinc-200 dark:border-zinc-800",
        text: "text-zinc-800 dark:text-zinc-400",
        indicator: "⚪",
        label: "Unknown Status",
        desc: "Unable to determine overall diagnostics health status.",
    };

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            {/* Header / Overall Status */}
            <div className={`border rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${statusMeta.bg}`}>
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{statusMeta.indicator}</span>
                    <div>
                        <h3 className={`text-lg font-bold leading-tight ${statusMeta.text}`}>
                            {statusMeta.label}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xl">
                            {statusMeta.desc}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                        Uptime: {health.application.uptime} | v{health.application.version}
                    </span>
                    <button
                        onClick={() => loadHealthData(false, true)}
                        disabled={refreshing}
                        className="p-2 rounded-xl bg-white dark:bg-zinc-850 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                    >
                        <svg
                            className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
                        </svg>
                        Refresh
                    </button>
                </div>
            </div>

            {/* Metrics Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* Database Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850 pb-3">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <svg className="w-4.5 h-4.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                            </svg>
                            Database Diagnostics
                        </h4>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            health.database.connected
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400"
                        }`}>
                            {health.database.connected ? "Connected" : "Disconnected"}
                        </span>
                    </div>

                    <div className="flex flex-col gap-2.5 text-xs text-zinc-600 dark:text-zinc-350">
                        <div className="flex justify-between">
                            <span>Provider:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{health.database.provider}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Latency:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">
                                {health.database.connected ? `${health.database.latency_ms} ms` : "N/A"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Database Size:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{health.database.size_display}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Migrations:</span>
                            <span className={`font-semibold ${
                                health.database.migration_status === "UP_TO_DATE"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                            }`}>
                                {health.database.migration_status === "UP_TO_DATE" ? "Up to Date" : "Migration Required"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Camera Engine Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850 pb-3">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <svg className="w-4.5 h-4.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Camera Engine
                        </h4>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            health.camera_system.manager_running
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400"
                                : health.camera_system.total_cameras === 0
                                ? "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400"
                        }`}>
                            {health.camera_system.manager_running ? "Running" : "Stopped"}
                        </span>
                    </div>

                    <div className="flex flex-col gap-2.5 text-xs text-zinc-600 dark:text-zinc-350">
                        <div className="flex justify-between">
                            <span>Configured Feeds:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{health.camera_system.total_cameras}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Status Breakdown:</span>
                            <div className="flex gap-2 font-semibold">
                                <span className="text-emerald-600 dark:text-emerald-400">On: {health.camera_system.online}</span>
                                <span className="text-zinc-400 dark:text-zinc-500">Off: {health.camera_system.offline}</span>
                                <span className="text-rose-500">Err: {health.camera_system.error}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Last Feed Action:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white text-[10px]">
                                {health.camera_system.last_heartbeat
                                    ? new Date(health.camera_system.last_heartbeat).toLocaleTimeString()
                                    : "Never"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* AI Engine Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850 pb-3">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <svg className="w-4.5 h-4.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364.364l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            AI Recognition Engine
                        </h4>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            health.ai_engine.model_loaded
                                ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/20 dark:text-indigo-400"
                                : "bg-amber-100 text-amber-855 dark:bg-amber-950/20 dark:text-amber-400"
                        }`}>
                            {health.ai_engine.model_loaded ? "Model Available" : "Model Missing"}
                        </span>
                    </div>

                    <div className="flex flex-col gap-2.5 text-xs text-zinc-600 dark:text-zinc-350">
                        <div className="flex justify-between">
                            <span>Acceleration Device:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{health.ai_engine.device}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Enrolled Employees:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{health.ai_engine.known_faces}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Status:</span>
                            <span className={`font-semibold ${health.ai_engine.model_loaded ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                                {health.ai_engine.model_loaded ? "Ready" : "Unavailable"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Backups Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850 pb-3">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <svg className="w-4.5 h-4.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            System Backups
                        </h4>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            health.backup.status === "OK"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400"
                        }`}>
                            {health.backup.status === "OK" ? "OK" : "Overdue"}
                        </span>
                    </div>

                    <div className="flex flex-col gap-2.5 text-xs text-zinc-600 dark:text-zinc-350">
                        <div className="flex justify-between">
                            <span>Auto-Backup:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">
                                {health.backup.automatic ? "Enabled" : "Disabled"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Backup Count:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{health.backup.backup_count}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Backup Storage:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{health.backup.storage_used}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Last Run:</span>
                            <span className="font-semibold text-zinc-900 dark:text-white text-[10px]">
                                {health.backup.last_backup
                                    ? new Date(health.backup.last_backup).toLocaleDateString()
                                    : "Never"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Storage Health Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col gap-4 md:col-span-2 lg:col-span-2">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850 pb-3">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <svg className="w-4.5 h-4.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            Disk Storage Space
                        </h4>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold">
                            {health.storage.percentage}% Used
                        </span>
                    </div>

                    <div className="flex flex-col gap-4">
                        {/* Progress Bar */}
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-3.5 rounded-full overflow-hidden flex shadow-inner">
                            <div
                                style={{ width: `${health.storage.percentage}%` }}
                                className={`h-full rounded-full transition-all duration-500 ${
                                    health.storage.percentage > 90
                                        ? "bg-rose-500"
                                        : health.storage.percentage > 70
                                        ? "bg-amber-500"
                                        : "bg-blue-500"
                                }`}
                            />
                        </div>

                        <div className="grid grid-cols-3 text-center text-xs gap-2">
                            <div className="flex flex-col gap-1 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850">
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Used</span>
                                <span className="font-extrabold text-zinc-900 dark:text-white">{health.storage.used}</span>
                            </div>
                            <div className="flex flex-col gap-1 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850">
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Available</span>
                                <span className="font-extrabold text-zinc-900 dark:text-white">{health.storage.available}</span>
                            </div>
                            <div className="flex flex-col gap-1 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850">
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Total Size</span>
                                <span className="font-extrabold text-zinc-900 dark:text-white">{health.storage.total}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Diagnostic Logs & Troubleshooting Export Panel */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col gap-5">
                <div className="flex items-start justify-between flex-wrap gap-4 border-b border-zinc-100 dark:border-zinc-850 pb-4">
                    <div>
                        <h4 className="text-base font-bold text-zinc-900 dark:text-white">
                            Diagnostics & System Logs
                        </h4>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                            Inspect real-time system logs and download troubleshooter diagnostic bundles.
                        </p>
                    </div>

                    {isSuperAdmin && (
                        <button
                            onClick={handleExportDiagnostics}
                            disabled={exporting}
                            className={`
                                inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border
                                ${exporting
                                    ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 cursor-wait"
                                    : "bg-blue-600 hover:bg-blue-500 border-blue-600 text-white shadow-md shadow-blue-900/20"
                                }
                            `}
                        >
                            {exporting ? (
                                <>
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download Diagnostics Package
                                </>
                            )}
                        </button>
                    )}
                </div>

                {!isSuperAdmin ? (
                    <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl text-center text-xs text-zinc-500 border border-zinc-150 dark:border-zinc-850">
                        🔒 Logs and diagnostic exports are restricted to Super Administrators.
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {/* Selector & Actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-zinc-500">Log File:</label>
                                <select
                                    value={selectedLog}
                                    onChange={(e) => setSelectedLog(e.target.value)}
                                    className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                                >
                                    {logFiles.map((file) => (
                                        <option key={file.name} value={file.name}>
                                            {file.name} ({(file.size_bytes / 1024).toFixed(1)} KB)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={autoScroll}
                                        onChange={(e) => setAutoScroll(e.target.checked)}
                                        className="rounded text-blue-600 border-zinc-300 dark:border-zinc-800 outline-none"
                                    />
                                    Auto-scroll to bottom
                                </label>
                                <button
                                    onClick={() => fetchLogContent(selectedLog)}
                                    disabled={logsLoading}
                                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50"
                                >
                                    Refresh Log
                                </button>
                            </div>
                        </div>

                        {/* Monospace Code Log Screen */}
                        <div className="relative border border-zinc-200 dark:border-zinc-850 rounded-2xl bg-zinc-950 shadow-inner overflow-hidden">
                            {logsLoading && logLines.length === 0 && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <LoadingSpinner size="md" />
                                </div>
                            )}

                            <div
                                ref={logTerminalRef}
                                className="h-96 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed text-zinc-350 select-text flex flex-col gap-0.5 scrollbar-thin scrollbar-thumb-zinc-800"
                            >
                                {logLines.length === 0 ? (
                                    <div className="text-zinc-500 italic text-center py-20">Log is empty.</div>
                                ) : (
                                    logLines.map((line, idx) => (
                                        <div key={idx} className="whitespace-pre-wrap break-all hover:bg-zinc-900/60 px-1 rounded">
                                            <span className="text-zinc-600 select-none mr-2">{idx + 1}</span>
                                            {line}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
