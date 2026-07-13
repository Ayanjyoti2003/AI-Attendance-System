import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { getAttendance } from "../api/attendance";
import { getEmployees } from "../api/employees";
import { getCameras } from "../api/cameras";
import type { Attendance } from "../types/attendance";
import type { Employee } from "../types/employee";
import type { Camera } from "../types/camera";
import LoadingSpinner from "../components/LoadingSpinner";
import { useToast } from "../components/Toast";

export default function AttendancePage() {
    const { showToast } = useToast();

    // Data lists
    const [attendanceList, setAttendanceList] = useState<Attendance[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [cameraMap, setCameraMap] = useState<Record<number, string>>({});
    
    // UI states
    const [loading, setLoading] = useState(true);
    const [loadingData, setLoadingData] = useState(false);

    // Filter states
    const [selectedEmployee, setSelectedEmployee] = useState<string>("");
    const [selectedCamera, setSelectedCamera] = useState<string>("");
    const [selectedDate, setSelectedDate] = useState<string>("");

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Load initial lookup filters
    useEffect(() => {
        async function loadLookups() {
            try {
                const [empData, camData] = await Promise.all([
                    getEmployees(),
                    getCameras()
                ]);
                setEmployees(empData);
                setCameras(camData);

                const map: Record<number, string> = {};
                camData.forEach((cam) => {
                    map[cam.id] = cam.name;
                });
                setCameraMap(map);
            } catch (err) {
                console.error("Error loading lookups:", err);
                showToast("Failed to load filter directories.", "error");
            } finally {
                setLoading(false);
            }
        }
        loadLookups();
    }, []);

    // Load attendance logs
    const loadAttendance = useCallback(async () => {
        setLoadingData(true);
        try {
            const params: { employee_id?: number; camera_id?: number; date?: string } = {};
            if (selectedEmployee) params.employee_id = Number(selectedEmployee);
            if (selectedCamera) params.camera_id = Number(selectedCamera);
            if (selectedDate) params.date = selectedDate;

            const logs = await getAttendance(params);
            // Sort by timestamp descending (newest first)
            logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setAttendanceList(logs);
        } catch (err) {
            console.error("Error fetching attendance logs:", err);
            showToast("Failed to retrieve attendance logs.", "error");
        } finally {
            setLoadingData(false);
        }
    }, [selectedEmployee, selectedCamera, selectedDate]);

    useEffect(() => {
        if (!loading) {
            loadAttendance();
        }
    }, [loading, loadAttendance]);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedEmployee, selectedCamera, selectedDate]);

    // Pagination calculations
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentLogs = attendanceList.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(attendanceList.length / itemsPerPage);

    // CSV Exporter
    const handleExportCSV = () => {
        if (attendanceList.length === 0) {
            showToast("No data available to export.", "warning");
            return;
        }

        const escapeCSV = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
        
        const headers = ["Record ID", "Employee Name", "Camera Name", "Timestamp"];
        const rows = attendanceList.map((log) => [
            escapeCSV(log.id),
            escapeCSV(log.employee),
            escapeCSV(cameraMap[log.camera_id] || `Camera ${log.camera_id}`),
            escapeCSV(log.timestamp)
        ]);

        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `attendance_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("CSV file exported successfully.", "success");
    };

    // Format date string
    const formatDate = (ts: string) => {
        try {
            const date = new Date(ts);
            return date.toLocaleString();
        } catch {
            return ts;
        }
    };

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
            <div className="flex flex-col gap-6 select-none animate-fade-in">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">Attendance Logs</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                            Browse, search, and export historical facial recognition check-in logs.
                        </p>
                    </div>

                    <button
                        onClick={handleExportCSV}
                        className="flex items-center justify-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md cursor-pointer"
                    >
                        <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export CSV
                    </button>
                </div>

                {/* Filters Row */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-white dark:bg-zinc-900/60 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors duration-250">
                    {/* Employee Dropdown */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Employee</label>
                        <select
                            value={selectedEmployee}
                            onChange={(e) => setSelectedEmployee(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-zinc-800 dark:text-zinc-300 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="">All Employees</option>
                            {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Camera Dropdown */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Camera</label>
                        <select
                            value={selectedCamera}
                            onChange={(e) => setSelectedCamera(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-zinc-800 dark:text-zinc-300 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="">All Cameras</option>
                            {cameras.map((cam) => (
                                <option key={cam.id} value={cam.id}>
                                    {cam.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Date Picker */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Date</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-zinc-800 dark:text-zinc-300 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                        />
                    </div>

                    {/* Actions button */}
                    <div className="flex items-end">
                        <button
                            onClick={() => {
                                setSelectedEmployee("");
                                setSelectedCamera("");
                                setSelectedDate("");
                            }}
                            className="w-full py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-855 hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-sm font-medium transition-colors cursor-pointer"
                        >
                            Clear Filters
                        </button>
                    </div>
                </div>

                {/* Table Data */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xl transition-colors duration-250">
                    {loadingData ? (
                        <div className="p-12">
                            <LoadingSpinner />
                        </div>
                    ) : currentLogs.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500">
                            <p className="text-sm">No attendance records found matching filters.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 uppercase tracking-wider text-xs border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-250">
                                        <th className="p-4 font-semibold">Record ID</th>
                                        <th className="p-4 font-semibold">Employee ID</th>
                                        <th className="p-4 font-semibold">Employee</th>
                                        <th className="p-4 font-semibold">Camera Source</th>
                                        <th className="p-4 font-semibold text-right">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {currentLogs.map((log) => (
                                        <tr
                                            key={log.id}
                                            className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 text-zinc-800 dark:text-zinc-200 transition-colors"
                                        >
                                            <td className="p-4 font-medium text-zinc-450 dark:text-zinc-500">{log.id}</td>
                                            <td className="p-4 font-medium text-zinc-450 dark:text-zinc-500">{log.employee_id}</td>
                                            <td className="p-4 font-semibold text-zinc-900 dark:text-white">{log.employee}</td>
                                            <td className="p-4 text-zinc-700 dark:text-zinc-300">
                                                {cameraMap[log.camera_id] || `Camera ${log.camera_id}`}
                                            </td>
                                            <td className="p-4 text-right text-zinc-500 dark:text-zinc-400 font-medium">
                                                {formatDate(log.timestamp)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    {!loadingData && totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 transition-colors duration-250">
                            <span className="text-xs text-zinc-500">
                                Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, attendanceList.length)} of {attendanceList.length} logs
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