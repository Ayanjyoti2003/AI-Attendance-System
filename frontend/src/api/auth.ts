import api from "./axios";
import type { CurrentUser } from "../types/user";

export async function getCurrentUser(): Promise<CurrentUser> {
    const response = await api.get<CurrentUser>("/api/current-user");
    return response.data;
}