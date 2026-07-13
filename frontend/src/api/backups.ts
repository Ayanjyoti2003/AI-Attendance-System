import api from "./axios";

// ─── Types ──────────────────────────────────────────────────

export interface BackupInfo {
    filename: string;
    size_bytes: number;
    size_display: string;
    created_at: string;
}

export interface BackupResult {
    status: string;
    file?: string;
    created_at?: string;
    message: string;
    restart_required?: boolean;
}

export interface BackupSettings {
    enabled: boolean;
    automatic: boolean;
    frequency: string;  // "daily" | "weekly" | "monthly"
    keep: number;
    destination: string;
    backup_time: string; // "HH:MM"
}

// ─── API Calls ──────────────────────────────────────────────

export const createBackup = async (): Promise<BackupResult> => {
    const res = await api.post("/api/backups/create");
    return res.data;
};

export const listBackups = async (): Promise<BackupInfo[]> => {
    const res = await api.get("/api/backups");
    return res.data;
};

export const restoreBackup = async (
    filename: string,
    restoreDbConnection: boolean = false,
): Promise<BackupResult> => {
    const res = await api.post("/api/backups/restore", {
        filename,
        restore_db_connection: restoreDbConnection,
    });
    return res.data;
};

export const deleteBackup = async (filename: string): Promise<{ status: string; message: string }> => {
    const res = await api.delete(`/api/backups/${encodeURIComponent(filename)}`);
    return res.data;
};

export const getBackupSettings = async (): Promise<BackupSettings> => {
    const res = await api.get("/api/backups/settings");
    return res.data;
};

export const updateBackupSettings = async (settings: BackupSettings): Promise<{ status: string; message: string }> => {
    const res = await api.put("/api/backups/settings", settings);
    return res.data;
};
