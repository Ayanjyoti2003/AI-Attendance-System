interface Props {
    title: string;
    value: number;
    icon?: React.ReactNode;
    accentColor?: string;
}

const defaultIcons: Record<string, React.ReactNode> = {
    "Total Employees": (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
    ),
    "Active Employees": (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    "Attendance Today": (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
    ),
    "Total Cameras": (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
    ),
    "Total Users": (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
};

const accentColors: Record<string, { bg: string; text: string; glow: string }> = {
    "Total Employees": {
        bg: "bg-blue-500/10 dark:bg-blue-500/10",
        text: "text-blue-600 dark:text-blue-400",
        glow: "shadow-blue-500/5",
    },
    "Active Employees": {
        bg: "bg-emerald-500/10 dark:bg-emerald-500/10",
        text: "text-emerald-600 dark:text-emerald-400",
        glow: "shadow-emerald-500/5",
    },
    "Attendance Today": {
        bg: "bg-violet-500/10 dark:bg-violet-500/10",
        text: "text-violet-600 dark:text-violet-400",
        glow: "shadow-violet-500/5",
    },
    "Total Cameras": {
        bg: "bg-amber-500/10 dark:bg-amber-500/10",
        text: "text-amber-600 dark:text-amber-400",
        glow: "shadow-amber-500/5",
    },
    "Total Users": {
        bg: "bg-rose-500/10 dark:bg-rose-500/10",
        text: "text-rose-600 dark:text-rose-400",
        glow: "shadow-rose-500/5",
    },
};

export default function StatsCard({ title, value, icon }: Props) {
    const resolvedIcon = icon ?? defaultIcons[title] ?? null;
    const colors = accentColors[title] ?? {
        bg: "bg-zinc-500/10",
        text: "text-zinc-500",
        glow: "",
    };

    return (
        <div
            className={`
                bg-white dark:bg-zinc-900
                p-5 rounded-2xl
                border border-zinc-200 dark:border-zinc-800
                shadow-lg ${colors.glow}
                hover:shadow-xl
                transition-all duration-300
                group
            `}
        >
            <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                        {title}
                    </p>
                    <h2 className="text-3xl font-black text-zinc-900 dark:text-white mt-1 tabular-nums">
                        {value.toLocaleString()}
                    </h2>
                </div>

                {resolvedIcon && (
                    <div
                        className={`
                            w-10 h-10 rounded-xl ${colors.bg} ${colors.text}
                            flex items-center justify-center
                            group-hover:scale-110 transition-transform duration-300
                        `}
                    >
                        {resolvedIcon}
                    </div>
                )}
            </div>
        </div>
    );
}