import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import privyLogo from "../assets/privy.jpg";

export default function Signup() {
    const { ready, authenticated, user, login } = usePrivy();

    useEffect(() => {
        if (authenticated && user) {
            localStorage.setItem(
                "user",
                JSON.stringify({
                    email: user.email,
                    wallet: user.wallet?.address,
                })
            );
        }
    }, [authenticated, user]);

    return (
        <div className="flex-grow  flex flex-col items-center px-6">
            <div className="flex-grow flex flex-col gap-4 items-center justify-center ">
                <h2 className="font-bold text-center">Sign up to save your card and start your collection</h2>
                <h1 className="text-2xl text-center font-bold">Get your official BORFOLOGIST ID number</h1>
                <div className="w-full flex flex-col gap-2">
                    <label className="text-white font-bold">Name</label>
                    <input className="w-full rounded-md p-4 shadow-md text-black" type="text" placeholder="Your name" />
                </div>

                <div className="w-full flex flex-col gap-2">
                    <label className="text-white font-bold">Email</label>
                    <input
                        className="w-full rounded-md p-4 shadow-md text-black"
                        type="email"
                        placeholder="you@example.com"
                    />
                </div>

                <button
                    onClick={login}
                    disabled={!ready}
                    className="w-full uppercase bg-purple-700 text-white rounded-md p-4 hover:bg-purple-600 transition-all active:scale-95"
                >
                    Next
                </button>
            </div>
            <img src={privyLogo} alt="powered by privy" className="mt-auto rounded-md" />
        </div>
    );
}
