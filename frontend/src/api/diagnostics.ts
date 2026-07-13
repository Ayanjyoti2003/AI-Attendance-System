import api from "./axios";

// ─── Interfaces ─────────────────────────────────────────────

export interface ApplicationHealth {
    version: string;
    uptime: string;
}

export interface DatabaseHealth {
    provider: string;
    connected: boolean;
    latency_ms: number;
    migration_status: string;
    size_bytes: number;
    size_display: string;
}

export interface CameraSystemHealth {
    manager_running: boolean;
    total_cameras: number;
    online: number;
    offline: number;
    error: number;
    last_heartbeat: string | null;
}

export interface BackupHealth {
    enabled: boolean;
    automatic: boolean;
    last_backup: string | null;
    status: string;
    backup_folder: string;
    backup_count: number;
    storage_used: string;
}

export interface StorageHealth {
    used: string;
    available: string;
    total: string;
    percentage: number;
}

export interface AIEngineHealth {
    device: string;
    model_loaded: boolean;
    known_faces: number;
}

export interface SystemHealthResponse {
    status: string; // "healthy" | "warning" | "error"
    application: ApplicationHealth;
    database: DatabaseHealth;
    camera_system: CameraSystemHealth;
    backup: BackupHealth;
    storage: StorageHealth;
    ai_engine: AIEngineHealth;
}

export interface LogFileInfo {
    name: string;
    size_bytes: number;
    modified_at: string;
}

export interface LogContentResponse {
    name: string;
    lines: string[];
}

// ─── API Requests ────────────────────────────────────────────

export const getSystemHealth = async (forceRefresh = false): Promise<SystemHealthResponse> => {
    const res = await api.get("/api/system/health", {
        params: forceRefresh ? { force_refresh: true } : {},
    });
    return res.data;
};

export const listLogs = async (): Promise<LogFileInfo[]> => {
    const res = await api.get("/api/system/logs");
    return res.data;
};

export const getLogContent = async (name: string): Promise<LogContentResponse> => {
    const res = await api.get(`/api/system/logs/${encodeURIComponent(name)}`);
    return res.data;
};

export const exportDiagnostics = async (): Promise<Blob> => {
    const res = await api.post("/api/system/export-diagnostics", {}, { responseType: "blob" });
    return res.data;
};
