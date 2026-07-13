import { Link } from "react-router-dom";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center select-none">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-rose-500 font-extrabold text-2xl shadow-xl shadow-rose-950/5 mb-6">
                !
            </div>
            
            <h1 className="text-4xl font-black text-white tracking-tight sm:text-5xl">
                404 - Page Not Found
            </h1>
            <p className="text-zinc-400 text-sm mt-3 max-w-sm mx-auto">
                The resource you are attempting to locate does not exist or has been shifted.
            </p>

            <Link
                to="/dashboard"
                className="mt-8 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/10 cursor-pointer"
            >
                Back to Dashboard
            </Link>
        </div>
    );
}
