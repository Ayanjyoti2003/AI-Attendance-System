export interface Employee {
    id: number;
    name: string;
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "TERMINATED";
    embedding_file: string;
}
