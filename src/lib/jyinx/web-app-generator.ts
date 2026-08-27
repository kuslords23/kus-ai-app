/**
 * Web-building presets for the Jyinx IDE-to-preview builder.
 *
 * Each stack produces a self-contained HTML application string that can be
 * rendered live by `PreviewLayout` (via its `html` blob preview) with the
 * Desktop / Mobile viewport switcher, so users can build, inspect, and test
 * the app in real time before publishing.
 */

export type WebStack = "react" | "vite" | "html" | "blog";

export const WEB_STACK_LABELS: Record<WebStack, string> = {
  react: "React (inline)",
  vite: "Vite-style (module)",
  html: "HTML / CSS / JS",
  blog: "Blog / post",
};

export const WEB_STACKS: WebStack[] = ["react", "vite", "html", "blog"];

export type WebAppProject = {
  stack: WebStack;
  title: string;
  html: string;
  files: Record<string, string>;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(styles: string, body: string, scripts: string, extraHead = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Jyinx Preview</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #0d0917; color: #e7e2f0; line-height: 1.6; }
${styles}
</style>
${extraHead}
</head>
<body>
${body}
<script>${scripts}</script>
</body>
</html>`;
}

/**
 * Generates a runnable HTML document for the given stack. Fast, deterministic,
 * zero external requests (frameworks are inline/bundled as strings), so the
 * preview works offline and in the sandboxed iframe.
 */
export function generateWebApp(stack: WebStack, promptInput: string, title: string): WebAppProject {
  const cleaned = promptInput.trim().slice(0, 2_000);

  if (stack === "html") {
    const html = shell(
      `main { max-width: 720px; margin: 0 auto; padding: 32px 20px; } h1 { color: #f6c945; } .card { border: 1px solid #2a2440; border-radius: 14px; padding: 20px; background: #141024; margin-top: 20px; } button { background: #f6c945; color: #0d0917; border: 0; padding: 10px 16px; border-radius: 10px; font-weight: 600; cursor: pointer; } button:hover { background: #ffd76a; } .muted { color: #8d85aa; }`,
      `<main>
<h1>${escapeHtml(title)}</h1>
<div class="card">
<p class="muted">Built with Jyinx — HTML/CSS/JS stack</p>
<h2>${escapeHtml(cleaned || "Your app")}</h2>
<p id="out">This is a live, editable preview.</p>
<button onclick="document.getElementById('out').textContent='Hello from Jyinx! '+new Date().toLocaleTimeString()">Tap to test</button>
</div>
</main>`,
      ``
    );
    return { stack, title, html, files: { "index.html": html } };
  }

  if (stack === "react") {
    // Inline React/ReactDOM at runtime via UMD so the "React" stack has real
    // components without a build step.
    const body = `<div id="root"></div>`;
    const scripts = `(() => {
  function App() {
    const [n, setN] = React.useState(0);
    return (
      React.createElement('main', { style: { maxWidth: 720, margin: '0 auto', padding: 32 } },
        React.createElement('h1', { style: { color: '#f6c945' } }, ${JSON.stringify(title)}),
        React.createElement('div', { className: 'card', style: { border: '1px solid #2a2440', borderRadius: 14, padding: 20, background: '#141024', marginTop: 20 } },
          React.createElement('p', null, ${JSON.stringify(cleaned || 'Build & preview React apps live.')}),
          React.createElement('p', { id: 'count' }, 'Count: ' + n),
          React.createElement('button', { onClick: () => setN(n + 1), style: { background: '#f6c945', color: '#0d0917', border: 0, padding: '10px 16px', borderRadius: 10, fontWeight: 600, cursor: 'pointer' } }, 'Increment')
        )
      )
    );
  }
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();`;
    const extraHead = `<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>`;
    const html = shell(`main { margin: 0 auto; } .card { } `, body, scripts, extraHead);
    return { stack, title, html, files: { "index.html": html, "jsx/app.jsx": "// Inline React (library via CDN) renders live in the preview." } };
  }

  if (stack === "vite") {
    // Vite-style: ES modules index + a small JS module, assembled into one doc.
    const moduleSrc = `export function greeting(name) { return "Hello, " + name + "!"; }`;
    const appJs = `import { greeting } from './app.js';
document.getElementById('out').textContent = greeting(${JSON.stringify(title)});
document.getElementById('btn').addEventListener('click', () => {
  document.getElementById('out').innerHTML = "Request at " + new Date().toLocaleTimeString();
});`;
    const body = `<main>
<h1>${escapeHtml(title)}</h1>
<div class="card">
<p class="muted">Vite-style ES module stack</p>
<p id="out">${escapeHtml(cleaned || "Loading…")}</p>
<button id="btn">Refresh time</button>
</div>
</main>`;
    const scripts = `${moduleSrc}
${appJs}`;
    const html = shell(
      `main { max-width: 720px; margin: 0 auto; padding: 32px 20px; } h1 { color: #f6c945; } .card { border: 1px solid #2a2440; border-radius: 14px; padding: 20px; background: #141024; margin-top: 20px; } button { background: #f6c945; color: #0d0917; border: 0; padding: 10px 16px; border-radius: 10px; font-weight: 600; cursor: pointer; }`,
      body,
      scripts
    );
    return { stack, title, html, files: { "index.html": html, "src/app.js": "" } };
  }

  // blog
  const blogBody = `<main>
<header class="hero">
<h1>${escapeHtml(title)}</h1>
<p class="muted">${escapeHtml(cleaned || "A Jyinx blog post")}</p>
</header>
<article>
<h2>Welcome</h2>
<p>This post was generated by the Jyinx dynamic blog engine.</p>
<p>Edit the markdown and publish to get a live SEO-optimized URL.</p>
</article>
</main>`;
  const html = shell(
    `main { max-width: 720px; margin: 0 auto; padding: 32px 20px; } .hero { padding: 24px 0; border-bottom: 1px solid #2a2440; } h1 { color: #f6c945; } h2 { color: #cfc6ea; } .muted { color: #8d85aa; } article { line-height: 1.8; }`,
    blogBody,
    ``
  );
  return { stack, title, html, files: { "blog.md": `# ${title}\n\n${cleaned}` } };
}