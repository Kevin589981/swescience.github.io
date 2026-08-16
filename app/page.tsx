import { BenchmarkExplorer } from "./BenchmarkExplorer";

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
            <div><dt>Tasks</dt><dd>119</dd></div>
            <div><dt>Repositories</dt><dd>98</dd></div>
            <div><dt>Domains</dt><dd>33</dd></div>
          </dl>
        </div>
      </section>

      <BenchmarkExplorer />

      <footer>
        <span>SWE-bench Science</span>
        <span>OpenMOSS · 2026</span>
      </footer>
    </main>
  );
}
