import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

interface Props {
    children: React.ReactNode;
}

export default function DashboardLayout({ children }: Props) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        const savedCollapsedState = localStorage.getItem("sidebar-collapsed") === "true";
        setIsCollapsed(savedCollapsedState);
    }, []);

    const toggleCollapse = () => {
        setIsCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem("sidebar-collapsed", String(next));
            return next;
        });
    };

    return (
        <div className="flex h-full overflow-hidden bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
            {/* Sidebar */}
            <Sidebar isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                <Navbar />

                <main className="flex-1 p-4 md:p-6 lg:p-8 pr-4 md:pr-6 lg:pr-10">
                    {children}
                </main>
            </div>
        </div>
    );
}