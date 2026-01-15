export default function Page() {
  return (
    <main style={{padding:24}}>
      <h1>OFA Calculator Host</h1>
      
      <section style={{marginBottom: 32}}>
        <h2>Forms</h2>
        <ul>
          <li><a href="/embed/impact">Impact Analysis Form</a></li>
          <li><a href="/embed/community">Return-on-Community Form</a></li>
        </ul>
      </section>

      <section style={{marginBottom: 32}}>
        <h2>Math Checkers</h2>
        <ul>
          <li><a href="/math-checker/impact">Impact Analysis Math Checker</a></li>
          <li><a href="/math-checker/community">Return-on-Community Math Checker</a></li>
        </ul>
      </section>

      <section style={{marginBottom: 32}}>
        <h2>Other Pages</h2>
        <ul>
          <li><a href="/demo">Demo Page</a></li>
        </ul>
      </section>

      <section>
        <h2>Info</h2>
        <p>Use <code>/embed/impact</code> and <code>/embed/community</code> as iframe sources.</p>
        <p>Loader scripts will be served from <code>/cdn/leadcalc-impact.min.js</code> and <code>/cdn/leadcalc-community.min.js</code> after you run <code>npm run build</code>.</p>
        <p>API routes available at <code>/api/config</code>, <code>/api/submit/impact</code>, <code>/api/submit/community</code>, and <code>/api/lookup/population</code>.</p>
      </section>
    </main>
  );
}
