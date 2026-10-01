export default function LoadingScreen({ label = "Preparing your monster..." }) {
    return (
        <div className="flex flex-col items-center justify-center gap-4 w-full h-full bg-black text-white">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="text-sm uppercase tracking-wide opacity-80">{label}</span>
        </div>
    );
}
