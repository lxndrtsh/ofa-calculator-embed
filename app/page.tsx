export default function Page() {
  return (
    <main style={{padding:24}}>
      <h1>OFA Calculator Host</h1>
      <p>Use <code>/embed/impact</code> and <code>/embed/community</code> as iframe sources.</p>
      <p>Loader scripts will be served from <code>/cdn/leadcalc-impact.min.js</code> and <code>/cdn/leadcalc-community.min.js</code> after you run <code>npm run build</code>.</p>
      <p>API routes available at <code>/api/config</code>, <code>/api/submit/impact</code>, <code>/api/submit/community</code>, and <code>/api/lookup/population</code>.</p>
    </main>
  );
}
