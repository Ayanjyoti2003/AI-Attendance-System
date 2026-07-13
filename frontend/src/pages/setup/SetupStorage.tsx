import { useState } from "react";

interface Props {
    selectedProvider: string;
    initialProvider: string;
    onSelect: (provider: string) => void;
    onNext: () => void;
    onBack: () => void;
}

const PROVIDERS = [
    {
        id: "local_postgres",
        name: "Local PostgreSQL",
        description: "PostgreSQL installed on this machine. Best for large offices or multi-device deployments.",
        icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
        ),
        color: "blue",
        enabled: true,
    },
    {
        id: "external_postgres",
        name: "External PostgreSQL",
        description: "Supabase, Railway, Neon, AWS RDS, Azure PostgreSQL, or any remote server.",
        icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
        color: "violet",
        enabled: true,
    },
    {
        id: "sqlite",
        name: "SQLite",
        description: "Small offices and single attendance station deployments. No server required.",
        icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
        ),
        color: "amber",
        enabled: true,
    },
];

const colorMap: Record<string, { bg: string; border: string; text: string; selected: string; glow: string }> = {
    blue: {
        bg: "bg-blue-600/10",
        border: "border-blue-500/50",
        text: "text-blue-400",
        selected: "bg-blue-600/15 border-blue-500",
        glow: "shadow-blue-500/10",
    },
    violet: {
        bg: "bg-violet-600/10",
        border: "border-violet-500/50",
        text: "text-violet-400",
        selected: "bg-violet-600/15 border-violet-500",
        glow: "shadow-violet-500/10",
    },
    amber: {
        bg: "bg-amber-600/10",
        border: "border-amber-500/50",
        text: "text-amber-400",
        selected: "bg-amber-600/15 border-amber-500",
        glow: "shadow-amber-500/10",
    },
};

export default function SetupStorage({ selectedProvider, initialProvider, onSelect, onNext, onBack }: Props) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    return (
        <div className="animate-fade-in">
            <div className="flex flex-col items-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-cyan-600/20 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                    Storage Provider
                </h2>
                <p className="text-zinc-400 text-sm mt-1.5 text-center">
                    Choose where your data will be stored.
                </p>
            </div>

            <div className="flex flex-col gap-3 mb-6">
                {PROVIDERS.map((provider) => {
                    const colors = colorMap[provider.color];
                    const isSelected = selectedProvider === provider.id;
                    const isHovered = hoveredId === provider.id;

                    return (
                        <button
                            key={provider.id}
                            type="button"
                            disabled={!provider.enabled}
                            onClick={() => provider.enabled && onSelect(provider.id)}
                            onMouseEnter={() => setHoveredId(provider.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            className={`
                                relative w-full text-left px-4 py-4 rounded-xl border transition-all duration-200 cursor-pointer
                                ${isSelected
                                    ? `${colors.selected} shadow-lg ${colors.glow}`
                                    : provider.enabled
                                        ? `bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50`
                                        : "bg-zinc-900/30 border-zinc-800/50 opacity-50 cursor-not-allowed"
                                }
                            `}
                        >
                            <div className="flex items-start gap-3.5">
                                {/* Radio indicator */}
                                <div className={`
                                    mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200
                                    ${isSelected
                                        ? `${colors.border} ${colors.bg}`
                                        : "border-zinc-700"
                                    }
                                `}>
                                    {isSelected && (
                                        <div className={`w-2 h-2 rounded-full ${colors.text.replace("text-", "bg-")} animate-scale-up`} />
                                    )}
                                </div>

                                {/* Icon */}
                                <div className={`
                                    w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-200
                                    ${isSelected || isHovered ? colors.bg : "bg-zinc-800/50"}
                                `}>
                                    <span className={isSelected || isHovered ? colors.text : "text-zinc-500"}>
                                        {provider.icon}
                                    </span>
                                </div>

                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold ${isSelected ? "text-white" : "text-zinc-300"}`}>
                                            {provider.name}
                                        </span>
                                        {!provider.enabled && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                                                Coming Soon
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                                        {provider.description}
                                    </p>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Warning Alert if provider is changed */}
            {initialProvider && selectedProvider !== initialProvider && (
                <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex gap-3 animate-fade-in">
                    <svg className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                        <span className="font-bold block mb-0.5">Database Provider Changed</span>
                        <span>Changing database storage will switch the active database. Existing data will not automatically migrate.</span>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={!selectedProvider}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                    Continue
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
