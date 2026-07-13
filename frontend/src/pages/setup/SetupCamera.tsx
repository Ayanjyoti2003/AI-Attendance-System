import { useState, useEffect } from "react";
import { setupCamera } from "../../api/setup";
import LoadingSpinner from "../../components/LoadingSpinner";

interface Props {
    onSuccess: () => void;
    onSkip: () => void;
    onBack: () => void;
    showToast: (msg: string, type: "success" | "error" | "warning" | "info") => void;
}

export default function SetupCamera({ onSuccess, onSkip, onBack, showToast }: Props) {
    const [cameraName, setCameraName] = useState("");
    const [cameraLocation, setCameraLocation] = useState("");
    const [cameraType, setCameraType] = useState<"USB" | "RTSP">("USB");
    const [cameraSource, setCameraSource] = useState("0");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Reset source when camera type changes
    useEffect(() => {
        if (cameraType === "USB") {
            setCameraSource("0");
        } else {
            setCameraSource("");
        }
    }, [cameraType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!cameraName.trim() || !cameraLocation.trim() || !cameraSource.trim()) {
            setError("Please fill in all fields.");
            return;
        }

        setLoading(true);
        try {
            const res = await setupCamera({
                name: cameraName.trim(),
                location: cameraLocation.trim(),
                camera_type: cameraType,
                source: cameraSource.trim()
            });

            if (res.error) {
                setError(res.error);
                return;
            }

            showToast(`Camera '${cameraName}' configured!`, "success");
            onSuccess();
        } catch {
            setError("Failed to register camera. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex flex-col items-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-emerald-600/20 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                    Configure First Camera
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1.5 text-center">
                    Set up a camera source for face recognition. You can skip this and add cameras later.
                </p>
            </div>

            {error && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-red-950/30 dark:bg-red-950/30 bg-red-50 border border-red-900/50 dark:border-red-900/50 border-red-200 text-red-400 dark:text-red-400 text-red-600 text-sm font-medium flex items-center gap-2 animate-fade-in">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Camera Name */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Camera Name
                    </label>
                    <input
                        type="text"
                        placeholder="e.g. Main Entrance"
                        value={cameraName}
                        onChange={(e) => setCameraName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 dark:bg-zinc-950 bg-zinc-50 border border-zinc-800 dark:border-zinc-800 border-zinc-200 text-zinc-200 dark:text-zinc-200 text-zinc-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 dark:placeholder-zinc-600 placeholder-zinc-400 transition-all"
                        required
                        autoFocus
                    />
                </div>

                {/* Location */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Location
                    </label>
                    <input
                        type="text"
                        placeholder="e.g. Reception Area"
                        value={cameraLocation}
                        onChange={(e) => setCameraLocation(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 dark:bg-zinc-950 bg-zinc-50 border border-zinc-800 dark:border-zinc-800 border-zinc-200 text-zinc-200 dark:text-zinc-200 text-zinc-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 dark:placeholder-zinc-600 placeholder-zinc-400 transition-all"
                        required
                    />
                </div>

                {/* Camera Type + Source — side by side */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Type
                        </label>
                        <select
                            value={cameraType}
                            onChange={(e) => setCameraType(e.target.value as "USB" | "RTSP")}
                            className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 dark:bg-zinc-950 bg-zinc-50 border border-zinc-800 dark:border-zinc-800 border-zinc-200 text-zinc-200 dark:text-zinc-200 text-zinc-900 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="USB">USB</option>
                            <option value="RTSP">RTSP</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Source
                        </label>
                        {cameraType === "USB" ? (
                            <select
                                value={cameraSource}
                                onChange={(e) => setCameraSource(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 dark:bg-zinc-950 bg-zinc-50 border border-zinc-800 dark:border-zinc-800 border-zinc-200 text-zinc-200 dark:text-zinc-200 text-zinc-900 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                            >
                                <option value="0">Device 0</option>
                                <option value="1">Device 1</option>
                                <option value="2">Device 2</option>
                            </select>
                        ) : (
                            <input
                                type="text"
                                placeholder="rtsp://192.168.1.50/live"
                                value={cameraSource}
                                onChange={(e) => setCameraSource(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 dark:bg-zinc-950 bg-zinc-50 border border-zinc-800 dark:border-zinc-800 border-zinc-200 text-zinc-200 dark:text-zinc-200 text-zinc-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 dark:placeholder-zinc-600 placeholder-zinc-400 transition-all font-mono text-xs"
                                required
                            />
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                    >
                        Back
                    </button>
                    <button
                        type="button"
                        onClick={onSkip}
                        className="flex-1 py-3 rounded-xl bg-zinc-800 dark:bg-zinc-800 bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-zinc-700 hover:bg-zinc-200 text-zinc-300 dark:text-zinc-300 text-zinc-600 font-semibold text-sm transition-colors cursor-pointer"
                    >
                        Skip for Now
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <LoadingSpinner size="sm" />
                                Saving...
                            </>
                        ) : (
                            <>
                                Add Camera
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
