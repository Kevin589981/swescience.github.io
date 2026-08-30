import { benchmarkData } from "@/lib/benchmark";
import { BenchmarkExplorer } from "./BenchmarkExplorer";
import { AnimatedStat, ThemeToggle } from "./SiteEnhancements";

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="SWE-bench Science home">
          <span className="wordmark-mark" aria-hidden="true">S²</span>
          <span>SWE-bench Science</span>
        </a>
        <nav className="resource-nav" aria-label="Project resources">
          <a href="https://huggingface.co/datasets/OpenMOSS-Team/SWE-bench-Science" target="_blank" rel="noreferrer">
            Hugging Face <span aria-hidden="true">↗</span>
          </a>
          <a href="https://github.com/OpenMOSS/SWE-bench-Science" target="_blank" rel="noreferrer">
            GitHub <span aria-hidden="true">↗</span>
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-kicker"><span /> Scientific software engineering benchmark</div>
        <h1>SWE-bench<br /><em>Science</em></h1>
        <div className="hero-bottom">
          <p>
            Measuring whether coding agents can repair repository-level scientific software while preserving its scientific contracts.
          </p>
          <dl className="benchmark-stats" aria-label="Benchmark statistics">
            <div><dt>Tasks</dt><dd><AnimatedStat value={benchmarkData.summary.tasks} /></dd></div>
            <div><dt>Repositories</dt><dd><AnimatedStat value={benchmarkData.summary.repositories} /></dd></div>
            <div><dt>Domains</dt><dd><AnimatedStat value={benchmarkData.summary.domains} /></dd></div>
          </dl>
        </div>
      </section>

      <BenchmarkExplorer data={benchmarkData} />

      <footer>
        <span>SWE-bench Science</span>
      </footer>
    </main>
  );
}
