import api from "./axios";
import type { Employee } from "../types/employee";

export async function getEmployees(): Promise<Employee[]> {
    const response = await api.get<Employee[]>("/api/employees");
    return response.data;
}

export async function updateEmployeeStatus(
    employeeId: number,
    status: Employee["status"]
): Promise<{ status: string; employee_id: number; new_status: string }> {
    const response = await api.patch<{ status: string; employee_id: number; new_status: string }>(
        `/api/employees/${employeeId}/status`,
        { status }
    );
    return response.data;
}

export async function enrollEmployee(name: string, imageFile: File): Promise<any> {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("image", imageFile);

    const response = await api.post("/api/employees", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });
    return response.data;
}