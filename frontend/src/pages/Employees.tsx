import { useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { getEmployees, updateEmployeeStatus, enrollEmployee } from "../api/employees";
import type { Employee } from "../types/employee";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import LoadingSpinner from "../components/LoadingSpinner";
import { useToast } from "../components/Toast";

export default function Employees() {
    const { showToast } = useToast();

    // Data states
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter/Pagination states
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    // Modal & Form states
    const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
    const [enrollName, setEnrollName] = useState("");
    const [enrollImage, setEnrollImage] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function loadEmployees() {
        setLoading(true);
        try {
            const data = await getEmployees();
            setEmployees(data);
        } catch (err) {
            console.error("Error loading employees:", err);
            showToast("Failed to fetch employees list.", "error");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadEmployees();
    }, []);

    // Filtered data list
    const filteredEmployees = employees.filter((emp) => {
        const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "" || emp.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Pagination calculations
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentEmployees = filteredEmployees.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    // Handle status change API
    const handleStatusChange = async (employeeId: number, newStatus: Employee["status"]) => {
        try {
            await updateEmployeeStatus(employeeId, newStatus);
            setEmployees((prev) =>
                prev.map((emp) => (emp.id === employeeId ? { ...emp, status: newStatus } : emp))
            );
            showToast(`Employee status updated to ${newStatus}.`, "success");
        } catch (err) {
            console.error("Error updating employee status:", err);
            showToast("Failed to update status. Please try again.", "error");
        }
    };

    // Handle enrollment submission
    const handleEnrollSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!enrollName.trim()) {
            showToast("Please enter an employee name.", "warning");
            return;
        }
        if (!enrollImage) {
            showToast("Please select a photo.", "warning");
            return;
        }

        setSubmitting(true);
        try {
            const res = await enrollEmployee(enrollName, enrollImage);
            if (res.error) {
                showToast(res.error, "error");
            } else {
                showToast(`Employee '${enrollName}' enrolled successfully!`, "success");
                setIsEnrollModalOpen(false);
                setEnrollName("");
                setEnrollImage(null);
                loadEmployees(); // Reload list
            }
        } catch (err) {
            console.error("Error enrolling employee:", err);
            showToast("Failed to enroll employee. Please verify connection and try again.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 select-none animate-fade-in">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">Employees</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                            Register and manage active profiles for facial recognition authentication.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsEnrollModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-lg shadow-blue-600/10 cursor-pointer"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Enroll Employee
                    </button>
                </div>

                {/* Filters Section */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white dark:bg-zinc-900/60 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors duration-250">
                    <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                        {/* Search Input */}
                        <div className="relative w-full sm:w-64">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </span>
                            <input
                                type="text"
                                placeholder="Search by name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 focus:border-blue-500 focus:outline-none text-zinc-850 dark:text-zinc-300 placeholder-zinc-450 dark:placeholder-zinc-500 text-sm transition-all"
                            />
                        </div>

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full sm:w-44 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-zinc-800 dark:text-zinc-300 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="">All Statuses</option>
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="INACTIVE">INACTIVE</option>
                            <option value="SUSPENDED">SUSPENDED</option>
                            <option value="TERMINATED">TERMINATED</option>
                        </select>
                    </div>

                    <button
                        onClick={loadEmployees}
                        disabled={loading}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm transition-colors cursor-pointer"
                    >
                        <svg className={`w-4 h-4 ${loading ? "animate-spin text-zinc-500" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12" />
                        </svg>
                        Refresh
                    </button>
                </div>

                {/* Table Section */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xl transition-colors duration-250">
                    {loading ? (
                        <div className="p-12">
                            <LoadingSpinner />
                        </div>
                    ) : currentEmployees.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500">
                            <p className="text-sm">No employees match your search criteria.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-zinc-50 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-300 uppercase tracking-wider text-xs border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-250">
                                        <th className="p-4 font-semibold">ID</th>
                                        <th className="p-4 font-semibold">Name</th>
                                        <th className="p-4 font-semibold">Status</th>
                                        <th className="p-4 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {currentEmployees.map((employee) => (
                                        <tr
                                            key={employee.id}
                                            className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/30 text-zinc-800 dark:text-zinc-200 transition-colors"
                                        >
                                            <td className="p-4 font-medium text-zinc-400 dark:text-zinc-500">{employee.id}</td>
                                            <td className="p-4 font-semibold text-zinc-900 dark:text-white">{employee.name}</td>
                                            <td className="p-4">
                                                <StatusBadge status={employee.status} />
                                            </td>
                                            <td className="p-4 text-right">
                                                <select
                                                    value={employee.status}
                                                    onChange={(e) =>
                                                        handleStatusChange(
                                                            employee.id,
                                                            e.target.value as Employee["status"]
                                                        )
                                                    }
                                                    className="px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                                                >
                                                    <option value="ACTIVE">ACTIVE</option>
                                                    <option value="INACTIVE">INACTIVE</option>
                                                    <option value="SUSPENDED">SUSPENDED</option>
                                                    <option value="TERMINATED">TERMINATED</option>
                                                </select>
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
                                Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredEmployees.length)} of {filteredEmployees.length} employees
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

            {/* Enroll Employee Modal */}
            <Modal
                isOpen={isEnrollModalOpen}
                onClose={() => {
                    setIsEnrollModalOpen(false);
                    setEnrollName("");
                    setEnrollImage(null);
                }}
                title="Enroll New Employee"
            >
                <form onSubmit={handleEnrollSubmit} className="flex flex-col gap-5">
                    {/* Name Field */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Employee Name
                        </label>
                        <input
                            type="text"
                            placeholder="Enter full name"
                            value={enrollName}
                            onChange={(e) => setEnrollName(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-600 transition-all"
                            required
                        />
                    </div>

                    {/* Image Upload Field */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Profile Photo
                        </label>
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 rounded-2xl p-6 text-center transition-colors relative cursor-pointer group">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                        setEnrollImage(e.target.files[0]);
                                    }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                required
                            />
                            
                            <svg className="w-8 h-8 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-400 mb-2 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            
                            {enrollImage ? (
                                <div className="text-zinc-800 dark:text-zinc-200 text-sm font-semibold max-w-[200px] truncate">
                                    {enrollImage.name}
                                </div>
                            ) : (
                                <>
                                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-semibold">Upload face photo</span>
                                    <span className="text-zinc-400 dark:text-zinc-650 text-xs mt-1">JPEG/PNG formatted file</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Submit Actions */}
                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            type="button"
                            onClick={() => {
                                setIsEnrollModalOpen(false);
                                setEnrollName("");
                                setEnrollImage(null);
                            }}
                            className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/10 flex items-center gap-2 cursor-pointer"
                        >
                            {submitting ? (
                                <>
                                    <LoadingSpinner size="sm" />
                                    Enrolling...
                                </>
                            ) : (
                                "Confirm Enrollment"
                            )}
                        </button>
                    </div>
                </form>
            </Modal>
        </DashboardLayout>
    );
}