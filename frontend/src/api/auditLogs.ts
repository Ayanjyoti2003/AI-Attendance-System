import api from "./axios";
import type { AuditLog } from "../types/auditLog";

export async function getAuditLogs(): Promise<AuditLog[]> {
    const response = await api.get<AuditLog[]>("/api/audit-logs");
    return response.data;
}
