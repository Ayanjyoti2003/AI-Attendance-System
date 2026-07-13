import { useState, useEffect } from "react";
import { initializeDatabase, updateSetupConfig } from "../../api/setup";

interface Props {
    provider: string;
    dbConfig: {
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
        ssl: boolean;
        path: string;
    };
    onSuccess: () => void;
    onBack: () => void;
    showToast: (msg: string, type: "success" | "error" | "warning" | "info") => void;
}

type Phase = "idle" | "saving_config" | "creating_tables" | "done" | "error";

export default function SetupInitialize({ provider, dbConfig, onSuccess, onBack, showToast }: Props) {
    const [phase, setPhase] = useState<Phase>("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [tablesCreated, setTablesCreated] = useState<string[]>([]);

    const startInitialization = async () => {
        setPhase("saving_config");
        setErrorMessage("");

        try {
            // Step 1: Save config to ConfigurationManager
            const configResult = await updateSetupConfig({
                provider,
                host: dbConfig.host,
                port: dbConfig.port,
                database: dbConfig.database,
                username: dbConfig.username,
                password: dbConfig.password,
                ssl: dbConfig.ssl,
                path: dbConfig.path,
            });

            if (configResult.status === "error") {
                setPhase("error");
                setErrorMessage("Failed to save configuration. Check your settings.");
                return;
            }

            // Small delay for visual feedback
            await new Promise((r) => setTimeout(r, 600));

            // Step 2: Initialize database tables
            setPhase("creating_tables");
            const initResult = await initializeDatabase();

            if (initResult.status === "error") {
                setPhase("error");
                setErrorMessage(initResult.message);
                return;
            }

            setTablesCreated(initResult.tables_created || []);
            await new Promise((r) => setTimeout(r, 400));
            setPhase("done");
            showToast("Database initialized successfully!", "success");
        } catch {
            setPhase("error");
            setErrorMessage("An unexpected error occurred. Please try again.");
        }
    };

    // Auto-start on mount
    useEffect(() => {
        startInitialization();
    }, []);

    const steps = [
        { id: "saving_config", label: "Saving configuration", done: phase !== "idle" && phase !== "saving_config" },
        { id: "creating_tables", label: "Creating database tables", done: phase === "done" },
    ];

    return (
        <div className="animate-fade-in">
            <div className="flex flex-col items-center mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                    phase === "error" ? "bg-red-600/20" : phase === "done" ? "bg-emerald-600/20" : "bg-blue-600/20"
                }`}>
                    {phase === "error" ? (
                        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ) : phase === "done" ? (
                        <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ) : (
                        <svg className="w-6 h-6 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    )}
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                    {phase === "error" ? "Initialization Failed" : phase === "done" ? "Database Ready" : "Initializing Database"}
                </h2>
                <p className="text-zinc-400 text-sm mt-1.5 text-center">
                    {phase === "error"
                        ? "Something went wrong during initialization."
                        : phase === "done"
                            ? "All required tables have been created."
                            : "Setting up your database. This will only take a moment."
                    }
                </p>
            </div>

            {/* Progress steps */}
            <div className="flex flex-col gap-3 mb-6">
                {steps.map((step, i) => {
                    const isActive =
                        (step.id === "saving_config" && phase === "saving_config") ||
                        (step.id === "creating_tables" && phase === "creating_tables");
                    const isFailed = phase === "error" && (
                        (step.id === "saving_config" && phase === "error" && i === 0 && !steps[0].done) ||
                        (step.id === "creating_tables" && phase === "error" && steps[0].done)
                    );

                    return (
                        <div
                            key={step.id}
                            className={`
                                flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300
                                ${step.done
                                    ? "bg-emerald-950/20 border-emerald-900/30"
                                    : isActive
                                        ? "bg-blue-950/20 border-blue-900/30"
                                        : isFailed
                                            ? "bg-red-950/20 border-red-900/30"
                                            : "bg-zinc-900/30 border-zinc-800/50"
                                }
                            `}
                        >
                            {/* Status icon */}
                            <div className="flex-shrink-0">
                                {step.done ? (
                                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                ) : isActive ? (
                                    <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                ) : isFailed ? (
                                    <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </div>
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full bg-zinc-600" />
                                    </div>
                                )}
                            </div>
                            <span className={`text-sm font-medium ${
                                step.done ? "text-emerald-400" : isActive ? "text-blue-400" : isFailed ? "text-red-400" : "text-zinc-500"
                            }`}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Tables created */}
            {phase === "done" && tablesCreated.length > 0 && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 animate-fade-in">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Tables Created</p>
                    <div className="flex flex-wrap gap-1.5">
                        {tablesCreated.map((table) => (
                            <span key={table} className="px-2 py-0.5 text-xs font-mono rounded bg-zinc-800 text-zinc-400">
                                {table}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Error message */}
            {phase === "error" && errorMessage && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-sm font-medium animate-fade-in">
                    {errorMessage}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
                {phase === "error" && (
                    <>
                        <button
                            type="button"
                            onClick={onBack}
                            className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={() => { setPhase("idle"); startInitialization(); }}
                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 cursor-pointer flex items-center justify-center gap-2"
                        >
                            Retry
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </>
                )}
                {phase === "done" && (
                    <button
                        type="button"
                        onClick={onSuccess}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-2"
                    >
                        Continue
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}
