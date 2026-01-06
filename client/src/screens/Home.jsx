import { Link } from "react-router-dom";

export default function Home() {
    const menuItems = ["profile", "library", "lab", "shop", "storage", "swapomat"];

    const icons = {
        profile: "👤",
        library: "📚",
        lab: "🧪",
        shop: "🛒",
        storage: "📦",
        swapomat: "🔄",
    };

    return (
        <div className="flex flex-col items-center justify-start min-h-screen p-6 overflow-y-auto">
            <h1 className="text-3xl font-bold mb-8 mt-4 text-white uppercase tracking-widest">Dashboard</h1>

            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                {menuItems.map((item) => (
                    <Link
                        key={item}
                        to={`/${item}`}
                        className="flex flex-col items-center justify-center p-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl transition-all active:scale-95 hover:bg-white/20"
                    >
                        <span className="text-4xl mb-2">{icons[item] || "🌀"}</span>
                        <span className="text-white font-medium uppercase text-sm tracking-wider">{item}</span>
                    </Link>
                ))}
            </div>

            <div className="mt-auto py-6">
                <p className="text-white/50 text-xs italic">Select a module to continue</p>
            </div>
        </div>
    );
}
