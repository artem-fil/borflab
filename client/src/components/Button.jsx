import bg from "@images/button.png";
import bgAlt from "@images/button_alt.png";

export default function Button({ onClick, disabled, label, alt = false }) {
    return (
        <button
            disabled={disabled}
            className="relative h-10 w-20 flex items-center justify-center text-sm"
            onClick={onClick}
        >
            <img className="absolute inset-0 w-full h-full" src={alt ? bgAlt : bg} />
            <span className={`${alt ? "text-white" : "text-black"} z-10`}>{label}</span>
        </button>
    );
}
