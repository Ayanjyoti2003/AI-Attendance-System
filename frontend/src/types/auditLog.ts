export interface AuditLog {
    id: number;
    user: string;
    action: string;
    details: string;
    timestamp: string;
}
