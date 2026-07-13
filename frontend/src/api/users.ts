import api from "./axios";
import type { User } from "../types/user";

export async function getUsers(): Promise<User[]> {
    const response = await api.get<User[]>("/api/users");
    return response.data;
}

export async function createUser(data: Omit<User, "id" | "status"> & { password?: string }): Promise<any> {
    const response = await api.post("/api/users", data);
    return response.data;
}

export async function updateUserStatus(userId: number, status: User["status"]): Promise<any> {
    const response = await api.patch(`/api/users/${userId}/status`, { status });
    return response.data;
}

export async function updateUserRole(userId: number, role: User["role"]): Promise<any> {
    const response = await api.patch(`/api/users/${userId}/role`, { role });
    return response.data;
}
