import { useNavigate } from "react-router-dom";
import borflabLogo from "../assets/logo.svg";

export default function Welcome({ authenticated }) {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col gap-6 items-center justify-center min-h-screen p-6">
            <img src={borflabLogo} alt="Logo" className="w-32 h-auto" />
            <button
                onClick={() => {
                    navigate(authenticated ? "/" : "/signup");
                }}
                className="w-full uppercase bg-purple-700 text-white rounded-md p-4 hover:bg-purple-600 transition-all active:scale-95"
            >
                start
            </button>
        </div>
    );
}
