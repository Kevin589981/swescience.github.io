import hard70Data from "@/data/hard70.json";
import matrixData from "@/data/task-matrix.json";
import { benchmarkData, getModelDisplayName } from "@/lib/benchmark";

type MatrixTask = {
  publishedTaskId: string;
  results: Record<string, { reward: number }>;
};

const hard70 = hard70Data as { taskIds: string[]; modelIds: string[] };
const matrix = matrixData as { tasks: MatrixTask[] };

export function Hard70Leaderboard() {
  const tasksById = new Map(matrix.tasks.map((task) => [task.publishedTaskId, task]));
  const rows = hard70.modelIds.map((modelId, order) => {
    const model = benchmarkData.models.find((candidate) => candidate.id === modelId);
    if (!model) throw new Error(`Hard70 model is missing from benchmark data: ${modelId}`);

    const passed = hard70.taskIds.reduce((total, taskId) => {
      return total + (tasksById.get(taskId)?.results[modelId]?.reward === 1 ? 1 : 0);
    }, 0);

    return {
      model,
      order,
      passed,
      score: (passed / hard70.taskIds.length) * 100,
    };
  }).sort((left, right) => right.passed - left.passed || left.order - right.order);

  return (
    <section className="hard70-section" id="hard70" aria-labelledby="hard70-title">
      <div className="section-heading">
        <div>
          <span className="section-number">03</span>
          <h2 id="hard70-title">Hard70</h2>
        </div>
        <p>Pass@1 on the 70-task hard subset.</p>
      </div>

      <div className="hard70-table-wrap">
        <table className="hard70-table">
          <thead>
            <tr>
              <th scope="col" className="hard70-rank-column">Rank</th>
              <th scope="col" className="hard70-model-column">Model</th>
              <th scope="col" className="hard70-agent-column">Agent</th>
              <th scope="col" className="hard70-score-column">Pass@1</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rank = rows.findIndex((candidate) => candidate.passed === row.passed) + 1;
              const score = `${row.score.toFixed(2)}%`;
              return (
                <tr key={row.model.id}>
                  <td className="hard70-rank-column"><span className={rank <= 3 ? "top-rank" : ""}>{String(rank).padStart(2, "0")}</span></td>
                  <th scope="row" className="hard70-model-column">{getModelDisplayName(row.model)}</th>
                  <td className="hard70-agent-column">{row.model.harness}</td>
                  <td className="hard70-score-column">
                    <div className="hard70-score" title={`${row.passed} of ${hard70.taskIds.length} tasks passed`}>
                      <strong>{score}</strong>
                      <span
                        className="hard70-bar"
                        role="progressbar"
                        aria-label={`${getModelDisplayName(row.model)} Hard70 Pass@1`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Number(row.score.toFixed(2))}
                      >
                        <i style={{ width: score }} />
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
