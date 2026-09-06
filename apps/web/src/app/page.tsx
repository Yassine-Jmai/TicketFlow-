export default function HomePage() {
  return (
    <main>
      <div className="shell hero">
        <section className="panel hero-copy">
          <p className="eyebrow">TicketFlow platform scaffold</p>
          <h1>Next.js frontend wired for the ticketing domain.</h1>
          <p className="lede">
            This workspace is organized for a Next.js client, a NestJS API, and shared
            ticketing types so the UI and backend stay aligned with the class diagram.
          </p>
        </section>

        <aside className="hero-aside">
          <div className="panel structure">
            <h2>Workspace</h2>
            <ul>
              <li>apps/web for the Next app</li>
              <li>apps/api for the Nest API</li>
              <li>packages/shared for shared domain types</li>
            </ul>
          </div>
          <div className="stats">
            <div className="stat panel">
              <strong>3</strong>
              <span>workspace roots</span>
            </div>
            <div className="stat panel">
              <strong>1</strong>
              <span>ticket domain model</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
