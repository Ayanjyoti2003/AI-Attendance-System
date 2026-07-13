import api from "./axios";
import type { Attendance } from "../types/attendance";

interface FetchAttendanceParams {
    employee_id?: number;
    date?: string;
    camera_id?: number;
}

export async function getAttendance(params?: FetchAttendanceParams): Promise<Attendance[]> {
    const response = await api.get<Attendance[]>("/api/attendance", { params });
    return response.data;
}
