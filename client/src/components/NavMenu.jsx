import { Link } from "react-router-dom";

export default function NavMenu() {
    return (
        <div className="px-4 py-2 bg-gray-100 flex items-center justify-between">
            {[
                ["/", "🌀"],
                ["/profile", "🪪"],
                ["/library", "🗂️"],
                ["/lab", "🔬"],
                ["/shop", "🛒"],
                ["/storage", "🗄️"],
                ["/swapomat", "♻️"],
            ].map(([link, icon]) => {
                return (
                    <Link key={link} to={`${link}`} className="text-xl">
                        {icon}
                    </Link>
                );
            })}
        </div>
    );
}
