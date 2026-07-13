import { useEffect, useState } from "react";

interface AttendanceEvent {
    employee: string;
    camera_id: number;
    timestamp: string;
}

export default function useAttendanceSocket() {

    const [events, setEvents] =
        useState<AttendanceEvent[]>([]);

    useEffect(() => {

        const ws =
            new WebSocket(
                import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws/attendance"
            );

        ws.onmessage = (event) => {

            const data = JSON.parse(
                event.data
            );

            setEvents((prev) => [
                data,
                ...prev,
            ]);
        };

        ws.onerror = (error) => {
            console.error(
                "WebSocket error:",
                error
            );
        };

        return () => {
            ws.close();
        };

    }, []);

    return events;
}