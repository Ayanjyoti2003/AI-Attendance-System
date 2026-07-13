export interface Camera {
    id: number;
    name: string;
    location: string;
    camera_type: string;
    source: string;
    status: string;
    last_seen: string | null;
    last_error?: string | null;
    last_successful_frame?: string | null;
    device_name?: string | null;
    reconnect_attempts?: number;
    reconnect_countdown?: number | null;
    last_reconnect_attempt?: string | null;
}
