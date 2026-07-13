import { useEffect, useState } from "react";
import useAttendanceSocket from "../hooks/UseAttendanceSocket";
import { getCameras } from "../api/cameras";

export default function AttendanceFeed() {
    const events = useAttendanceSocket();
    const [cameraMap, setCameraMap] = useState<Record<number, string>>({});

    useEffect(() => {
        getCameras()
            .then((cameras) => {
                const map: Record<number, string> = {};
                cameras.forEach((cam) => {
                    map[cam.id] = cam.name;
                });
                setCameraMap(map);
            })
            .catch((err) => console.error("Error loading cameras for feed:", err));
    }, []);

    // Helper to format timestamp
    const formatTime = (ts: string) => {
        try {
            const date = new Date(ts);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return ts;
        }
    };

    return (
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl transition-colors duration-250">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Activity Feed
                </h2>
                <span className="text-xs text-zinc-500">Real-time updates</span>
            </div>

            {events.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <p className="text-sm">No activity detected yet today.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-2">
                    {events.map((event, index) => (
                        <div
                            key={index}
                            className="flex items-start justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 hover:border-zinc-300 dark:hover:border-zinc-800 transition-all duration-200"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                                    {event.employee.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                        {event.employee} checked in
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        {cameraMap[event.camera_id] || `Camera ${event.camera_id}`}
                                    </p>
                                </div>
                            </div>
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                {formatTime(event.timestamp)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}