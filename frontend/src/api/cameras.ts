import api from "./axios";
import type { Camera } from "../types/camera";

export async function getCameras(): Promise<Camera[]> {
    const response = await api.get<Camera[]>("/api/cameras");
    return response.data;
}

export async function createCamera(data: {
    name: string;
    location: string;
    camera_type: string;
    source: string;
}): Promise<Camera> {
    const response = await api.post<Camera>("/api/cameras", data);
    return response.data;
}

export async function editCamera(
    id: number,
    data: {
        name?: string;
        location?: string;
        camera_type?: string;
        source?: string;
    }
): Promise<Camera & { error?: string }> {
    const response = await api.patch(`/api/cameras/${id}`, data);
    return response.data;
}

export async function updateCameraStatus(
    id: number,
    status: string
): Promise<{ status?: string; error?: string }> {
    const response = await api.patch(`/api/cameras/${id}/status`, { status });
    return response.data;
}

export async function deleteCamera(
    id: number
): Promise<{ status?: string; error?: string }> {
    const response = await api.delete(`/api/cameras/${id}`);
    return response.data;
}

export async function testCameraConnection(data: {
    camera_type: string;
    source: string;
}): Promise<{ status: string; error?: string }> {
    const response = await api.post("/api/cameras/test", data);
    return response.data;
}
