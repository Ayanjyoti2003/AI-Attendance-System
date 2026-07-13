import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { getCameras, createCamera, editCamera, updateCameraStatus, deleteCamera, testCameraConnection } from "../api/cameras";
import type { Camera } from "../types/camera";
import LoadingSpinner from "../components/LoadingSpinner";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

type SortOrder = "newest" | "oldest" | "none";

export default function CamerasPage() {
    const { showToast } = useToast();

    // Data
    const [camerasList, setCamerasList] = useState<Camera[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [typeFilter, setTypeFilter] = useState("ALL");
    const [sortOrder, setSortOrder] = useState<SortOrder>("none");

    // Add Modal
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addName, setAddName] = useState("");
    const [addLocation, setAddLocation] = useState("");
    const [addType, setAddType] = useState<"USB" | "RTSP">("USB");
    const [addSource, setAddSource] = useState("0");
    const [submitting, setSubmitting] = useState(false);

    // Edit Modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
    const [editName, setEditName] = useState("");
    const [editLocation, setEditLocation] = useState("");
    const [editType, setEditType] = useState<"USB" | "RTSP">("USB");
    const [editSource, setEditSource] = useState("");
    const [editSubmitting, setEditSubmitting] = useState(false);

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    // Test connection
    const [testingId, setTestingId] = useState<number | null>(null);

    async function loadCameras() {
        setLoading(true);
        try {
            const data = await getCameras();
            setCamerasList(data);
        } catch (err) {
            console.error("Error loading cameras:", err);
            showToast("Failed to fetch camera nodes.", "error");
        } finally {
            setLoading(false);
        }
    }

    const [, setTick] = useState(0);

    useEffect(() => {
        loadCameras();

        // 1-second dynamic tick for countdowns
        const tickInterval = setInterval(() => {
            setTick((t) => t + 1);
        }, 1000);

        // WebSocket listener for live camera status pushes
        const wsUrl = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws/attendance";
        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "camera_status") {
                    setCamerasList((prev) =>
                        prev.map((c) =>
                            c.id === data.camera_id ? { ...c, ...data.data } : c
                        )
                    );
                }
            } catch (err) {
                console.error("Error processing camera websocket update:", err);
            }
        };

        ws.onerror = (err) => {
            console.error("Camera WebSocket error:", err);
        };

        return () => {
            clearInterval(tickInterval);
            ws.close();
        };
    }, []);

    // Reset add source when type changes
    useEffect(() => {
        setAddSource(addType === "USB" ? "0" : "");
    }, [addType]);

    // ─── Filtered & Sorted List ──────────────────────────
    const filteredCameras = useMemo(() => {
        let list = [...camerasList];

        // Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(
                (c) =>
                    c.name.toLowerCase().includes(q) ||
                    c.location.toLowerCase().includes(q)
            );
        }

        // Status filter
        if (statusFilter !== "ALL") {
            list = list.filter((c) => c.status === statusFilter);
        }

        // Type filter
        if (typeFilter !== "ALL") {
            list = list.filter((c) => c.camera_type === typeFilter);
        }

        // Sort by last_seen
        if (sortOrder !== "none") {
            list.sort((a, b) => {
                const aTime = a.last_seen && a.last_seen !== "None" ? new Date(a.last_seen).getTime() : 0;
                const bTime = b.last_seen && b.last_seen !== "None" ? new Date(b.last_seen).getTime() : 0;
                return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
            });
        }

        return list;
    }, [camerasList, searchQuery, statusFilter, typeFilter, sortOrder]);

    // ─── Handlers ──────────────────────────────────────────

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addName.trim() || !addLocation.trim() || !addSource.trim()) {
            showToast("Please fill in all fields.", "warning");
            return;
        }
        setSubmitting(true);
        try {
            const res = await createCamera({ name: addName, location: addLocation, camera_type: addType, source: addSource });
            if ((res as any).error) {
                showToast((res as any).error, "error");
            } else {
                showToast(`Camera '${addName}' added!`, "success");
                resetAddForm();
                loadCameras();
            }
        } catch { showToast("Failed to add camera.", "error"); }
        finally { setSubmitting(false); }
    };

    const resetAddForm = () => {
        setIsAddModalOpen(false);
        setAddName("");
        setAddLocation("");
        setAddType("USB");
        setAddSource("0");
    };

    const openEditModal = (cam: Camera) => {
        setEditingCamera(cam);
        setEditName(cam.name);
        setEditLocation(cam.location);
        setEditType(cam.camera_type as "USB" | "RTSP");
        setEditSource(cam.source);
        setIsEditModalOpen(true);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingCamera || !editName.trim() || !editLocation.trim() || !editSource.trim()) return;
        setEditSubmitting(true);
        try {
            const res = await editCamera(editingCamera.id, {
                name: editName,
                location: editLocation,
                camera_type: editType,
                source: editSource,
            });
            if (res.error) {
                showToast(res.error, "error");
            } else {
                showToast(`Camera '${editName}' updated!`, "success");
                setIsEditModalOpen(false);
                setEditingCamera(null);
                loadCameras();
            }
        } catch { showToast("Failed to edit camera.", "error"); }
        finally { setEditSubmitting(false); }
    };

    const handleToggleStatus = async (cam: Camera) => {
        const newStatus = cam.status === "DISABLED" ? "OFFLINE" : "DISABLED";
        try {
            await updateCameraStatus(cam.id, newStatus);
            showToast(`Camera '${cam.name}' ${newStatus === "DISABLED" ? "disabled" : "enabled"}.`, "success");
            loadCameras();
        } catch { showToast("Failed to update status.", "error"); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleteSubmitting(true);
        try {
            const res = await deleteCamera(deleteTarget.id);
            if (res.error) {
                showToast(res.error, "error");
            } else {
                showToast(`Camera '${deleteTarget.name}' deleted.`, "success");
                setDeleteTarget(null);
                loadCameras();
            }
        } catch { showToast("Failed to delete camera.", "error"); }
        finally { setDeleteSubmitting(false); }
    };

    const handleTestConnection = async (cam: Camera) => {
        setTestingId(cam.id);
        try {
            const res = await testCameraConnection({ camera_type: cam.camera_type, source: cam.source });
            if (res.status === "success") {
                showToast(`✅ Camera '${cam.name}' is reachable!`, "success");
            } else {
                showToast(`❌ Camera '${cam.name}' failed: ${res.error || "Unknown error"}`, "error");
            }
        } catch { showToast("Connection test failed.", "error"); }
        finally { setTestingId(null); }
    };

    const formatLastSeen = (lastSeen: string | null) => {
        if (!lastSeen || lastSeen === "None") return "Never";
        try {
            const date = new Date(lastSeen);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            if (diffMins < 1) return "Just now";
            if (diffMins < 60) return `${diffMins}m ago`;
            const diffHrs = Math.floor(diffMins / 60);
            if (diffHrs < 24) return `${diffHrs}h ago`;
            return `${Math.floor(diffHrs / 24)}d ago`;
        } catch { return "Unknown"; }
    };

    // ─── Render ────────────────────────────────────────────

    const inputClass = "w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-650 transition-all";
    const selectClass = inputClass + " cursor-pointer";

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 select-none animate-fade-in">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">Camera Nodes</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                            Register, monitor, and manage connected camera sources.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-lg shadow-blue-600/10 cursor-pointer"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Camera
                    </button>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            placeholder="Search by name or location..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-550 transition-all"
                        />
                    </div>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm cursor-pointer focus:border-blue-500 focus:outline-none transition-all"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="ONLINE">Online</option>
                        <option value="OFFLINE">Offline</option>
                        <option value="ERROR">Error</option>
                        <option value="DISABLED">Disabled</option>
                    </select>

                    {/* Type Filter */}
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm cursor-pointer focus:border-blue-500 focus:outline-none transition-all"
                    >
                        <option value="ALL">All Types</option>
                        <option value="USB">USB</option>
                        <option value="RTSP">RTSP</option>
                    </select>

                    {/* Sort */}
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm cursor-pointer focus:border-blue-500 focus:outline-none transition-all"
                    >
                        <option value="none">Default Order</option>
                        <option value="newest">Last Seen: Newest</option>
                        <option value="oldest">Last Seen: Oldest</option>
                    </select>
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xl transition-colors duration-250">
                    {loading ? (
                        <div className="p-12"><LoadingSpinner /></div>
                    ) : filteredCameras.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500">
                            <p className="text-sm">{camerasList.length === 0 ? "No cameras registered yet." : "No cameras match your filters."}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-zinc-50 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-300 uppercase tracking-wider text-xs border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-250">
                                        <th className="p-4 font-semibold">ID</th>
                                        <th className="p-4 font-semibold">Name</th>
                                        <th className="p-4 font-semibold">Location</th>
                                        <th className="p-4 font-semibold">Type</th>
                                        <th className="p-4 font-semibold">Source</th>
                                        <th className="p-4 font-semibold">Last Seen</th>
                                        <th className="p-4 font-semibold">Status</th>
                                        <th className="p-4 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {filteredCameras.map((cam) => (
                                        <tr key={cam.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/30 text-zinc-800 dark:text-zinc-200 transition-colors">
                                            <td className="p-4 font-medium text-zinc-400 dark:text-zinc-550">{cam.id}</td>
                                            <td className="p-4">
                                                <div className="font-semibold text-zinc-900 dark:text-white">{cam.name}</div>
                                                {cam.device_name && (
                                                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">
                                                        HW: {cam.device_name}
                                                    </div>
                                                )}
                                                {cam.last_error && (
                                                    <div className="text-xs text-rose-500 font-medium mt-1 max-w-xs break-words" title={cam.last_error}>
                                                        {cam.last_error}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 text-zinc-700 dark:text-zinc-300">{cam.location}</td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                                    cam.camera_type === "USB"
                                                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                                                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                                }`}>
                                                    {cam.camera_type}
                                                </span>
                                            </td>
                                            <td className="p-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">{cam.source}</td>
                                            <td className="p-4 text-xs text-zinc-500 dark:text-zinc-400">{formatLastSeen(cam.last_seen)}</td>
                                            <td className="p-4">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <StatusBadge status={cam.status || "OFFLINE"} />
                                                    {cam.reconnect_countdown && cam.last_reconnect_attempt && (
                                                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium animate-pulse mt-0.5">
                                                            {(() => {
                                                                const attemptTime = new Date(cam.last_reconnect_attempt).getTime();
                                                                const totalWait = cam.reconnect_countdown * 1000;
                                                                const remaining = Math.max(0, Math.ceil((attemptTime + totalWait - Date.now()) / 1000));
                                                                return remaining > 0 
                                                                    ? `Retrying in ${remaining}s (Attempt ${cam.reconnect_attempts || 1})`
                                                                    : `Reconnecting...`;
                                                            })()}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Test */}
                                                    <button
                                                        onClick={() => handleTestConnection(cam)}
                                                        disabled={testingId === cam.id}
                                                        title="Test Connection"
                                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10 transition-all cursor-pointer disabled:opacity-50"
                                                    >
                                                        {testingId === cam.id ? (
                                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" /></svg>
                                                        )}
                                                    </button>
                                                    {/* Edit */}
                                                    <button onClick={() => openEditModal(cam)} title="Edit" className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                    </button>
                                                    {/* Disable / Enable */}
                                                    <button
                                                        onClick={() => handleToggleStatus(cam)}
                                                        title={cam.status === "DISABLED" ? "Enable" : "Disable"}
                                                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                            cam.status === "DISABLED"
                                                                ? "text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10"
                                                                : "text-zinc-400 hover:text-orange-500 hover:bg-orange-500/10"
                                                        }`}
                                                    >
                                                        {cam.status === "DISABLED" ? (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                                        )}
                                                    </button>
                                                    {/* Delete (only if DISABLED) */}
                                                    {cam.status === "DISABLED" && (
                                                        <button onClick={() => setDeleteTarget(cam)} title="Delete" className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Add Camera Modal ──────────────────────────── */}
            <Modal isOpen={isAddModalOpen} onClose={resetAddForm} title="Register Camera Source">
                <form onSubmit={handleAddSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Camera Name</label>
                        <input type="text" placeholder="e.g. Main Entrance Gate" value={addName} onChange={(e) => setAddName(e.target.value)} className={inputClass} required />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Location</label>
                        <input type="text" placeholder="e.g. Building A, Floor 1" value={addLocation} onChange={(e) => setAddLocation(e.target.value)} className={inputClass} required />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Camera Type</label>
                        <select value={addType} onChange={(e) => setAddType(e.target.value as "USB" | "RTSP")} className={selectClass}>
                            <option value="USB">USB Camera</option>
                            <option value="RTSP">RTSP Stream</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Source</label>
                        {addType === "USB" ? (
                            <select value={addSource} onChange={(e) => setAddSource(e.target.value)} className={selectClass}>
                                <option value="0">Device 0 (Default)</option>
                                <option value="1">Device 1</option>
                                <option value="2">Device 2</option>
                                <option value="3">Device 3</option>
                            </select>
                        ) : (
                            <input type="text" placeholder="rtsp://192.168.1.50/live" value={addSource} onChange={(e) => setAddSource(e.target.value)} className={inputClass + " font-mono"} required />
                        )}
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {addType === "USB" ? "Select the USB device index." : "Enter the full RTSP stream URL."}
                        </p>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <button type="button" onClick={resetAddForm} className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm transition-colors cursor-pointer">Cancel</button>
                        <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/10 flex items-center gap-2 cursor-pointer">
                            {submitting ? <><LoadingSpinner size="sm" /> Registering...</> : "Register Camera"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ─── Edit Camera Modal ─────────────────────────── */}
            <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditingCamera(null); }} title="Edit Camera">
                <form onSubmit={handleEditSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Camera Name</label>
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} required />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Location</label>
                        <input type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className={inputClass} required />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Camera Type</label>
                        <select value={editType} onChange={(e) => setEditType(e.target.value as "USB" | "RTSP")} className={selectClass}>
                            <option value="USB">USB Camera</option>
                            <option value="RTSP">RTSP Stream</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Source</label>
                        {editType === "USB" ? (
                            <select value={editSource} onChange={(e) => setEditSource(e.target.value)} className={selectClass}>
                                <option value="0">Device 0 (Default)</option>
                                <option value="1">Device 1</option>
                                <option value="2">Device 2</option>
                                <option value="3">Device 3</option>
                            </select>
                        ) : (
                            <input type="text" placeholder="rtsp://192.168.1.50/live" value={editSource} onChange={(e) => setEditSource(e.target.value)} className={inputClass + " font-mono"} required />
                        )}
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingCamera(null); }} className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm transition-colors cursor-pointer">Cancel</button>
                        <button type="submit" disabled={editSubmitting} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/10 flex items-center gap-2 cursor-pointer">
                            {editSubmitting ? <><LoadingSpinner size="sm" /> Saving...</> : "Save Changes"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ─── Delete Confirm Modal ──────────────────────── */}
            <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion">
                <div className="flex flex-col gap-5">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-zinc-900 dark:text-white font-semibold text-sm">
                                Delete camera "{deleteTarget?.name}"?
                            </p>
                            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                                This action cannot be undone. All associated data may be affected.
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setDeleteTarget(null)} className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm transition-colors cursor-pointer">Cancel</button>
                        <button onClick={handleDelete} disabled={deleteSubmitting} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-all shadow-lg shadow-red-600/10 flex items-center gap-2 cursor-pointer">
                            {deleteSubmitting ? <><LoadingSpinner size="sm" /> Deleting...</> : "Delete Camera"}
                        </button>
                    </div>
                </div>
            </Modal>
        </DashboardLayout>
    );
}