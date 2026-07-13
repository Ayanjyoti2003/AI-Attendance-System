export interface Camera {
    id: number;
    name: string;
    location: string;
    camera_type: string;
    source: string;
    status: string;
    last_seen: string | null;
}
