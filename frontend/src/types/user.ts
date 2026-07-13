export interface User {
    id: number;
    username: string;
    role: "SUPER_ADMIN" | "ADMIN" | "HR" | "VIEWER";
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
}

export interface CurrentUser {
    sub: string;
    role: "SUPER_ADMIN" | "ADMIN" | "HR" | "VIEWER";
}
