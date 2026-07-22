import api from "./axios";

export async function getSetupStatus(): Promise<{
    setup_completed: boolean;
    first_run_complete?: boolean;
    admin_created?: boolean;
}> {
    const response = await api.get("/api/setup-status");
    return response.data;
}

export async function getSetupConfig(): Promise<{
    schema_version: number;
    storage: { provider: string };
    database: {
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
        ssl: boolean;
        path: string;
    };
    application: {
        theme: string;
        first_run_complete: boolean;
        setup_complete: boolean;
    };
}> {
    const response = await api.get("/api/setup/config");
    return response.data;
}

export async function updateSetupConfig(data: {
    provider: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
    path: string;
}): Promise<{
    status: string;
    errors?: { field: string; message: string }[];
}> {
    const response = await api.put("/api/setup/config", data);
    return response.data;
}

export async function testDatabaseConnection(data: {
    provider: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
    path: string;
}): Promise<{
    success: boolean;
    message: string;
    error_type?: string;
    details?: {
        provider: string;
        host: string;
        port: number;
        database: string;
    };
}> {
    const response = await api.post("/api/setup/database/test", data);
    return response.data;
}

export async function initializeDatabase(): Promise<{
    status: string;
    message: string;
    tables_created?: string[];
}> {
    const response = await api.post("/api/setup/database/initialize");
    return response.data;
}

export async function setupAdmin(data: {
    username: string;
    password: string;
}): Promise<{ status?: string; error?: string; recovery_key?: string }> {
    const response = await api.post("/api/setup/admin", data);
    return response.data;
}

export async function setupCamera(data: {
    name: string;
    location: string;
    camera_type: string;
    source: string;
}): Promise<{ status?: string; error?: string }> {
    const response = await api.post("/api/setup/camera", data);
    return response.data;
}

export async function setupComplete(): Promise<{ status?: string }> {
    const response = await api.post("/api/setup/complete");
    return response.data;
}
