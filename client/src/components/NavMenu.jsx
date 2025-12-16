import { useState } from "react";
import { Link } from "react-router-dom";

export default function BurgerMenu() {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="font-extrabold text-white bg-black rounded-full w-8 h-8 flex items-center justify-center transition-transform duration-300"
            >
                <span className={`block transition-all duration-300 ${open ? "rotate-90 translate-y-[1px]" : ""}`}>
                    {open ? "✕" : "☰"}
                </span>
            </button>
            <div
                className={` absolute top-full right-0 flex flex-col items-end text-white bg-black/90 rounded-md uppercase transform transition-all duration-300 origin-top-right z-10 ${
                    open ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
                }`}
                style={{ transformOrigin: "top right" }}
            >
                {["profile", "library", "lab", "storage"].map((i) => {
                    return (
                        <Link key={i} to={`/${i}`} className="p-2 text-right" onClick={() => setOpen(false)}>
                            {i}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
