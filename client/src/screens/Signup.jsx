import privyLogo from "@images/privy.jpg";

export default function Signup({ login }) {
    return (
        <div className="flex-grow flex flex-col items-center px-6">
            <div className="flex-grow flex flex-col gap-4 items-center justify-center">
                <h1 className={`text-2xl text-center font-bold`}>{"Sign up to start your journey"}</h1>
                <button
                    onClick={login}
                    className="mt-6 w-full uppercase bg-purple-700 text-white rounded-md p-4 hover:bg-purple-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    start
                </button>
            </div>
            <img src={privyLogo} alt="powered by privy" className="mt-auto rounded-md" />
        </div>
    );
}
