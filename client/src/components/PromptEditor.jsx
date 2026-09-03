const taClass =
    "w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-gray-100 font-mono resize-y focus:outline-none focus:border-gray-500";

export default function PromptEditor({ prompt, stone, biome, onChange }) {
    const stoneInsert = prompt?.PromptStone?.[stone]?.[biome] ?? "";
    const analyzeTemplate = prompt?.PromptAnalyze?.[biome] ?? "";
    const generation = prompt?.PromptGeneration?.[biome] ?? "";

    function setStoneInsert(val) {
        onChange({
            ...prompt,
            PromptStone: {
                ...prompt.PromptStone,
                [stone]: { ...(prompt.PromptStone?.[stone] ?? {}), [biome]: val },
            },
        });
    }

    function setAnalyzeTemplate(val) {
        onChange({
            ...prompt,
            PromptAnalyze: { ...prompt.PromptAnalyze, [biome]: val },
        });
    }

    function setGeneration(val) {
        onChange({
            ...prompt,
            PromptGeneration: { ...prompt.PromptGeneration, [biome]: val },
        });
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Analyze:</label>
                <textarea
                    className={taClass}
                    rows={18}
                    value={analyzeTemplate}
                    onChange={(e) => setAnalyzeTemplate(e.target.value)}
                />
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Stone:</label>
                <textarea
                    className={taClass}
                    rows={12}
                    value={stoneInsert}
                    onChange={(e) => setStoneInsert(e.target.value)}
                />
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Generation:</label>
                <textarea
                    className={taClass}
                    rows={3}
                    value={generation}
                    onChange={(e) => setGeneration(e.target.value)}
                />
            </div>
        </div>
    );
}
