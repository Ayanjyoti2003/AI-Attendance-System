interface Props {
    status: string;
}

export default function StatusBadge({
    status,
}: Props) {

    const colors: Record<string, string> = {
        ACTIVE:
            "bg-green-500/20 text-green-400",

        INACTIVE:
            "bg-gray-500/20 text-gray-400",

        SUSPENDED:
            "bg-yellow-500/20 text-yellow-400",

        TERMINATED:
            "bg-red-500/20 text-red-400",

        ONLINE:
            "bg-emerald-500/20 text-emerald-400",

        OFFLINE:
            "bg-zinc-500/20 text-zinc-400",

        ERROR:
            "bg-red-500/20 text-red-400",

        DISABLED:
            "bg-orange-500/20 text-orange-400",
    };

    return (
        <span
            className={`
                px-3
                py-1
                rounded-full
                text-sm
                font-medium
                ${colors[
                status as keyof typeof colors
                ] ??
                "bg-zinc-700 text-zinc-300"
                }
            `}
        >
            {status}
        </span>
    );
}