import { useState } from "react";
import { testDatabaseConnection } from "../../api/setup";
import LoadingSpinner from "../../components/LoadingSpinner";

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
    onConfigChange: (config: Props["dbConfig"]) => void;
    onConnectionSuccess: () => void;
    onBack: () => void;
    showToast: (msg: string, type: "success" | "error" | "warning" | "info") => void;
}

export default function SetupDatabase({
    provider,
    dbConfig,
    onConfigChange,
    onConnectionSuccess,
    onBack,
    showToast,
}: Props) {
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        success: boolean;
        message: string;
        error_type?: string;
    } | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const isExternal = provider === "external_postgres";
    const isSQLite = provider === "sqlite";

    const updateField = <K extends keyof Props["dbConfig"]>(
        field: K,
        value: Props["dbConfig"][K]
    ) => {
        onConfigChange({ ...dbConfig, [field]: value });
        // Reset test result on any change
        if (testResult) setTestResult(null);
    };

    const canTest =
        isSQLite
            ? dbConfig.path.trim() !== ""
            : dbConfig.host.trim() !== "" &&
              dbConfig.database.trim() !== "" &&
              dbConfig.username.trim() !== "" &&
              dbConfig.port > 0;

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const result = await testDatabaseConnection({
                provider,
                host: dbConfig.host,
                port: dbConfig.port,
                database: dbConfig.database,
                username: dbConfig.username,
                password: dbConfig.password,
                ssl: dbConfig.ssl,
                path: dbConfig.path,
            });

            setTestResult(result);

            if (result.success) {
                showToast("Database connection successful!", "success");
            }
        } catch {
            setTestResult({
                success: false,
                message: "Failed to reach the backend server.",
                error_type: "network",
            });
        } finally {
            setTesting(false);
        }
    };

    const handleContinue = () => {
        if (testResult?.success) {
            onConnectionSuccess();
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex flex-col items-center mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                    isSQLite ? "bg-amber-600/20" : isExternal ? "bg-violet-600/20" : "bg-blue-600/20"
                }`}>
                    {isSQLite ? (
                        <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                    ) : isExternal ? (
                        <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ) : (
                        <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                        </svg>
                    )}
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                    Database Configuration
                </h2>
                <p className="text-zinc-400 text-sm mt-1.5 text-center max-w-sm">
                    {isSQLite
                        ? "Configure your embedded database. SQLite is self-contained and completely offline."
                        : isExternal
                            ? "Enter your remote PostgreSQL connection details. Supports Supabase, Railway, Neon, AWS RDS, Azure PostgreSQL, and any compatible server."
                            : "Configure the connection to your local PostgreSQL server."
                    }
                </p>
            </div>

            <div className="flex flex-col gap-4">
                {isSQLite ? (
                    <div className="flex flex-col gap-4 animate-fade-in">
                        <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-sm">
                            <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px]">Automatic Database Path</span>
                            <span className="font-mono text-zinc-300 break-all select-all font-semibold mt-1">
                                {window.navigator.platform.indexOf("Win") !== -1
                                    ? "C:\\ProgramData\\AI Attendance System\\database\\attendance.db"
                                    : "data/database/attendance.db"}
                            </span>
                            <span className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                                Under development mode, the database file resides locally at <code>data/database/attendance.db</code>.
                            </span>
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer group mt-1">
                            <input
                                type="checkbox"
                                checked={showAdvanced}
                                onChange={(e) => setShowAdvanced(e.target.checked)}
                                className="rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-blue-500/30 w-4 h-4 cursor-pointer"
                            />
                            <div>
                                <span className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">
                                    Advanced: Change location
                                </span>
                                <p className="text-xs text-zinc-500">Provide a custom database path or filename</p>
                            </div>
                        </label>

                        {showAdvanced && (
                            <div className="flex flex-col gap-1.5 animate-fade-in">
                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Database File Location</label>
                                <input
                                    type="text"
                                    value={dbConfig.path}
                                    onChange={(e) => updateField("path", e.target.value)}
                                    placeholder="attendance.db"
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 transition-all"
                                />
                                <p className="text-[10px] text-zinc-500">
                                    Can be relative (e.g. "attendance.db") or absolute.
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Host + Port row */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2 flex flex-col gap-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Host</label>
                                <input
                                    type="text"
                                    value={dbConfig.host}
                                    onChange={(e) => updateField("host", e.target.value)}
                                    placeholder={isExternal ? "db.xxx.supabase.co" : "localhost"}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 transition-all"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Port</label>
                                <input
                                    type="number"
                                    value={dbConfig.port}
                                    onChange={(e) => updateField("port", parseInt(e.target.value) || 0)}
                                    placeholder="5432"
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 transition-all"
                                />
                            </div>
                        </div>

                        {/* Database name */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Database</label>
                            <input
                                type="text"
                                value={dbConfig.database}
                                onChange={(e) => updateField("database", e.target.value)}
                                placeholder="attendance"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 transition-all"
                            />
                        </div>

                        {/* Username */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="db-username" className="text-xs font-bold uppercase tracking-wider text-zinc-400">Username</label>
                            <input
                                id="db-username"
                                name="username"
                                autoComplete="username"
                                type="text"
                                value={dbConfig.username}
                                onChange={(e) => updateField("username", e.target.value)}
                                placeholder="postgres"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 transition-all"
                            />
                        </div>

                        {/* Password */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="db-password" className="text-xs font-bold uppercase tracking-wider text-zinc-400">Password</label>
                            <div className="relative">
                                <input
                                    id="db-password"
                                    name="password"
                                    autoComplete="current-password"
                                    type={showPassword ? "text" : "password"}
                                    value={dbConfig.password}
                                    onChange={(e) => updateField("password", e.target.value)}
                                    placeholder="Database password"
                                    className="w-full px-3.5 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 placeholder-zinc-600 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                                    tabIndex={-1}
                                >
                                    {showPassword ? (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* SSL toggle — only for external */}
                        {isExternal && (
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={dbConfig.ssl}
                                    onClick={() => updateField("ssl", !dbConfig.ssl)}
                                    className={`
                                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0
                                        ${dbConfig.ssl ? "bg-blue-600" : "bg-zinc-700"}
                                    `}
                                >
                                    <span className={`
                                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200
                                        ${dbConfig.ssl ? "translate-x-6" : "translate-x-1"}
                                    `} />
                                </button>
                                <div>
                                    <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
                                        SSL Encryption
                                    </span>
                                    <p className="text-xs text-zinc-500">Required by most cloud providers</p>
                                </div>
                            </label>
                        )}
                    </>
                )}

                {/* Test Connection Result */}
                {testResult && (
                    <div className={`
                        px-4 py-3 rounded-xl border text-sm font-medium flex items-center gap-2.5 animate-fade-in
                        ${testResult.success
                            ? "bg-emerald-950/30 border-emerald-900/50 text-emerald-400"
                            : "bg-red-950/30 border-red-900/50 text-red-400"
                        }
                    `}>
                        {testResult.success ? (
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                        {testResult.message}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-1">
                    <button
                        type="button"
                        onClick={onBack}
                        className="py-3 px-5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                    >
                        Back
                    </button>
                    {!testResult?.success ? (
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={!canTest || testing}
                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                        >
                            {testing ? (
                                <>
                                    <LoadingSpinner size="sm" />
                                    Testing Connection...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    Test Connection
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleContinue}
                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-2"
                        >
                            Continue
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
