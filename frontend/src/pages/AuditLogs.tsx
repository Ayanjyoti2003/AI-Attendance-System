import { useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { getAuditLogs } from "../api/auditLogs";
import type { AuditLog } from "../types/auditLog";
import LoadingSpinner from "../components/LoadingSpinner";
import { useToast } from "../components/Toast";

export default function AuditLogsPage() {
    const { showToast } = useToast();

    // Data states
    const [logsList, setLogsList] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [selectedUser, setSelectedUser] = useState("");
    const [selectedAction, setSelectedAction] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 12;

    async function loadLogs() {
        setLoading(true);
        try {
            const data = await getAuditLogs();
            setLogsList(data);
        } catch (err) {
            console.error("Error loading audit logs:", err);
            showToast("Failed to fetch security audit logs.", "error");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadLogs();
    }, []);

    // Filter logic
    const filteredLogs = logsList.filter((log) => {
        const matchesUser = selectedUser === "" || log.user.toLowerCase().includes(selectedUser.toLowerCase());
        const matchesAction = selectedAction === "" || log.action === selectedAction;
        
        let matchesDate = true;
        if (log.timestamp) {
            const logDate = new Date(log.timestamp).toISOString().split('T')[0];
            if (startDate && logDate < startDate) matchesDate = false;
            if (endDate && logDate > endDate) matchesDate = false;
        }

        return matchesUser && matchesAction && matchesDate;
    });

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedUser, selectedAction, startDate, endDate]);

    // Pagination calculations
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentLogs = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

    // Date formatting helper
    const formatTimestamp = (ts: string) => {
        try {
            const d = new Date(ts);
            return d.toLocaleString();
        } catch {
            return ts;
        }
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 select-none animate-fade-in">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">Security Audit Logs</h1>
                        <p className="text-zinc-550 dark:text-zinc-400 text-sm mt-1">
                            Review system actions, login sessions, and administrative record updates.
                        </p>
                    </div>

                    <button
                        onClick={loadLogs}
                        disabled={loading}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium transition-colors cursor-pointer"
                    >
                        <svg className={`w-4 h-4 ${loading ? "animate-spin text-zinc-500" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12" />
                        </svg>
                        Refresh Logs
                    </button>
                </div>

                {/* Filters Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 bg-white dark:bg-zinc-900/60 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors duration-250">
                    {/* User search */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">User Search</label>
                        <input
                            type="text"
                            placeholder="Search user..."
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-zinc-800 dark:text-zinc-300 text-sm focus:border-blue-500 focus:outline-none placeholder-zinc-450 dark:placeholder-zinc-600 transition-all"
                        />
                    </div>

                    {/* Action dropdown */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Action Type</label>
                        <select
                            value={selectedAction}
                            onChange={(e) => setSelectedAction(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-zinc-800 dark:text-zinc-300 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="">All Actions</option>
                            <option value="LOGIN">LOGIN</option>
                            <option value="LOGOUT">LOGOUT</option>
                            <option value="CREATE_USER">CREATE_USER</option>
                            <option value="UPDATE_USER_ROLE">UPDATE_ROLE</option>
                            <option value="UPDATE_USER_STATUS">UPDATE_STATUS</option>
                            <option value="CREATE_EMPLOYEE">CREATE_EMPLOYEE</option>
                            <option value="UPDATE_EMPLOYEE_STATUS">UPDATE_EMPLOYEE_STATUS</option>
                            <option value="ATTENDANCE_MARKED">ATTENDANCE_MARKED</option>
                            <option value="CREATE_CAMERA">CREATE_CAMERA</option>
                        </select>
                    </div>

                    {/* Start Date */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-855 text-zinc-800 dark:text-zinc-300 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                        />
                    </div>

                    {/* End Date */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-855 text-zinc-800 dark:text-zinc-300 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                        />
                    </div>

                    {/* Reset Button */}
                    <div className="flex items-end">
                        <button
                            onClick={() => {
                                setSelectedUser("");
                                setSelectedAction("");
                                setStartDate("");
                                setEndDate("");
                            }}
                            className="w-full py-2 rounded-lg border border-zinc-200 dark:border-zinc-850 hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-sm font-medium transition-colors cursor-pointer"
                        >
                            Reset
                        </button>
                    </div>
                </div>

                {/* Table Section */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xl transition-colors duration-250">
                    {loading ? (
                        <div className="p-12">
                            <LoadingSpinner />
                        </div>
                    ) : currentLogs.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500">
                            <p className="text-sm">No audit logs found matching criteria.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-zinc-50 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-300 uppercase tracking-wider text-xs border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-250">
                                        <th className="p-4 font-semibold">User</th>
                                        <th className="p-4 font-semibold">Action</th>
                                        <th className="p-4 font-semibold">Details</th>
                                        <th className="p-4 font-semibold text-right">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {currentLogs.map((log) => (
                                        <tr
                                            key={log.id}
                                            className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/30 text-zinc-800 dark:text-zinc-200 transition-colors"
                                        >
                                            <td className="p-4 font-semibold text-zinc-900 dark:text-white">{log.user}</td>
                                            <td className="p-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                                <span className="bg-zinc-100 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 rounded">
                                                    {log.action.replace("UPDATE_USER_", "UPDATE_").replace("UPDATE_EMPLOYEE_", "UPDATE_")}
                                                </span>
                                            </td>
                                            <td className="p-4 text-zinc-650 dark:text-zinc-300 max-w-sm truncate" title={log.details}>
                                                {log.details}
                                            </td>
                                            <td className="p-4 text-right text-zinc-500 dark:text-zinc-450 font-medium whitespace-nowrap">
                                                {formatTimestamp(log.timestamp)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    {!loading && totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 transition-colors duration-250">
                            <span className="text-xs text-zinc-500">
                                Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredLogs.length)} of {filteredLogs.length} logs
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850 disabled:opacity-40 disabled:hover:bg-zinc-950 text-xs font-semibold cursor-pointer transition-colors duration-250"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850 disabled:opacity-40 disabled:hover:bg-zinc-950 text-xs font-semibold cursor-pointer transition-colors duration-250"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}