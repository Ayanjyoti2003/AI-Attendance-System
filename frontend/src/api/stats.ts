import api from "./axios";
import type { DashboardStats } from "../types/stats";

export async function getStats(): Promise<DashboardStats> {
    const response = await api.get<DashboardStats>("/api/stats");
    return response.data;
}