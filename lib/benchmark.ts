import rawBenchmarkData from "@/data/benchmark.json";

export type ReasoningDepth = "default" | "high" | "max" | "xhigh";

export type BenchmarkScores = {
  public: number;
  private: number;
  fail2Pass: number;
  pass2Pass: number;
  overall: number;
  issue: number;
  expert: number;
  engineering: number;
};

export type BenchmarkModel = {
  id: string;
  family: string;
  reasoningDepth: ReasoningDepth;
  harness: string;
  scores: BenchmarkScores;
  tokens: {
    input: number;
    output: number;
  };
};

export type BenchmarkData = {
  version: number;
  updatedAt: string;
  summary: {
    tasks: number;
    repositories: number;
    domains: number;
  };
  models: BenchmarkModel[];
};

export const benchmarkData = rawBenchmarkData as BenchmarkData;

export function getModelDisplayName(model: Pick<BenchmarkModel, "family" | "reasoningDepth">) {
  return model.reasoningDepth === "default" ? model.family : `${model.family} (${model.reasoningDepth})`;
}

export function formatUpdatedAt(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}
