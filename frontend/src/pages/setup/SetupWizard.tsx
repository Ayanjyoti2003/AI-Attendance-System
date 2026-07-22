import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SetupAdmin from "./SetupAdmin";
import SetupStorage from "./SetupStorage";
import SetupDatabase from "./SetupDatabase";
import SetupInitialize from "./SetupInitialize";
import SetupCamera from "./SetupCamera";
import SetupComplete from "./SetupComplete";
import { useToast } from "../../components/Toast";
import { getSetupConfig, getSetupStatus } from "../../api/setup";

// ─── Step Definition ────────────────────────────────────────
const STEPS = [
    { id: "welcome",    label: "Welcome" },
    { id: "admin",      label: "Administrator" },
    { id: "storage",    label: "Storage" },
    { id: "database",   label: "Database" },
    { id: "initialize", label: "Initialize" },
    { id: "camera",     label: "Camera" },
    { id: "complete",   label: "Complete" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ─── Wizard State ───────────────────────────────────────────
interface WizardData {
    adminUsername: string;
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
}

const DEFAULT_DB_CONFIG = {
    host: "localhost",
    port: 5432,
    database: "attendance",
    username: "",
    password: "",
    ssl: false,
    path: "attendance.db",
};

export default function SetupWizard() {
    const [currentStep, setCurrentStep] = useState<StepId>("welcome");
    const [adminCreated, setAdminCreated] = useState(false);
    const [initialProvider, setInitialProvider] = useState<string>("");
    const [wizardData, setWizardData] = useState<WizardData>({
        adminUsername: "",
        provider: "local_postgres",
        dbConfig: { ...DEFAULT_DB_CONFIG },
    });
    const navigate = useNavigate();
    const { showToast } = useToast();

    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

    // Load setup status and existing config on mount
    useEffect(() => {
        getSetupStatus()
            .then((status) => {
                setAdminCreated(!!status.admin_created);
                if (status.admin_created && !status.setup_completed) {
                    setCurrentStep("database");
                }
            })
            .catch(() => {});

        getSetupConfig()
            .then((config) => {
                const prov = config.storage.provider || "local_postgres";
                setInitialProvider(prov);
                setWizardData((prev) => ({
                    ...prev,
                    provider: prov,
                    dbConfig: {
                        host: config.database.host,
                        port: config.database.port,
                        database: config.database.database,
                        username: config.database.username,
                        password: config.database.password,
                        ssl: config.database.ssl,
                        path: config.database.path || "attendance.db",
                    },
                }));
            })
            .catch(() => {
                // Config not available yet — use defaults
            });
    }, []);

    const goTo = (step: StepId) => setCurrentStep(step);
    const goNext = () => {
        if (currentIndex < STEPS.length - 1) {
            setCurrentStep(STEPS[currentIndex + 1].id);
        }
    };
    const goBack = () => {
        if (currentIndex > 0) {
            setCurrentStep(STEPS[currentIndex - 1].id);
        }
    };

    const handleFinish = () => {
        navigate("/login", { replace: true });
    };

    return (
        <div className="min-h-full flex items-center justify-center bg-zinc-950 relative overflow-hidden select-none">
            {/* Ambient background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-600/8 blur-[140px]" />
                <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-violet-600/8 blur-[140px]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-emerald-600/5 blur-[120px]" />
            </div>

            <div className="relative w-full max-w-lg mx-4 animate-slide-up">
                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-1.5 mb-8">
                    {STEPS.map((step, i) => (
                        <div key={step.id} className="flex items-center gap-1.5">
                            <div
                                className={`
                                    w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300
                                    ${i < currentIndex
                                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                        : i === currentIndex
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                            : "bg-zinc-800 text-zinc-500"
                                    }
                                `}
                                title={step.label}
                            >
                                {i < currentIndex ? (
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    i + 1
                                )}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`w-5 h-0.5 transition-colors duration-300 ${
                                    i < currentIndex ? "bg-emerald-500" : "bg-zinc-800"
                                }`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step label */}
                <div className="text-center mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                        Step {currentIndex + 1} of {STEPS.length} — {STEPS[currentIndex].label}
                    </span>
                </div>

                {/* Card */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl shadow-black/50 p-8 md:p-10 transition-colors duration-300">
                    {/* ─── Welcome ─── */}
                    {currentStep === "welcome" && (
                        <div className="flex flex-col items-center text-center animate-fade-in">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-blue-600/25 mb-6">
                                A
                            </div>
                            <h1 className="text-2xl font-black text-white tracking-tight mb-3">
                                Welcome to AI Attendance
                            </h1>
                            <p className="text-zinc-400 text-sm leading-relaxed mb-8 max-w-sm">
                                This wizard will help you configure the system for first use.
                                You'll set up your database, create an administrator account,
                                and optionally configure your first camera.
                            </p>

                            <button
                                onClick={goNext}
                                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 cursor-pointer flex items-center justify-center gap-2"
                            >
                                Get Started
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {/* ─── Administrator ─── */}
                    {currentStep === "admin" && (
                        <SetupAdmin
                            onSuccess={() => {
                                setAdminCreated(true);
                                goNext();
                            }}
                            onBack={goBack}
                            showToast={showToast}
                            initialUsername={wizardData.adminUsername}
                            adminCreated={adminCreated}
                        />
                    )}

                    {/* ─── Storage Provider ─── */}
                    {currentStep === "storage" && (
                        <SetupStorage
                            selectedProvider={wizardData.provider}
                            initialProvider={initialProvider}
                            onSelect={(provider) =>
                                setWizardData((prev) => ({ ...prev, provider }))
                            }
                            onNext={goNext}
                            onBack={goBack}
                        />
                    )}

                    {/* ─── Database Configuration + Test Connection ─── */}
                    {currentStep === "database" && (
                        <SetupDatabase
                            provider={wizardData.provider}
                            dbConfig={wizardData.dbConfig}
                            onConfigChange={(dbConfig) =>
                                setWizardData((prev) => ({ ...prev, dbConfig }))
                            }
                            onConnectionSuccess={goNext}
                            onBack={goBack}
                            showToast={showToast}
                        />
                    )}

                    {/* ─── Initialize Database ─── */}
                    {currentStep === "initialize" && (
                        <SetupInitialize
                            provider={wizardData.provider}
                            dbConfig={wizardData.dbConfig}
                            onSuccess={goNext}
                            onBack={() => goTo("database")}
                            showToast={showToast}
                        />
                    )}

                    {/* ─── Camera ─── */}
                    {currentStep === "camera" && (
                        <SetupCamera
                            onSuccess={goNext}
                            onSkip={goNext}
                            onBack={goBack}
                            showToast={showToast}
                        />
                    )}

                    {/* ─── Complete ─── */}
                    {currentStep === "complete" && (
                        <SetupComplete onFinish={handleFinish} showToast={showToast} />
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-zinc-600 text-xs mt-6">
                    AI Attendance System v1.0.0 • First-Time Setup
                </p>
            </div>
        </div>
    );
}
