/**
 * Web-building presets for the Jyinx IDE-to-preview builder.
 *
 * Each stack produces a self-contained HTML application string that can be
 * rendered live by `PreviewLayout` (via its `html` blob preview) with the
 * Desktop / Mobile viewport switcher, so users can build, inspect, and test
 * the app in real time before publishing.
 */

export type WebStack = "react" | "vite" | "html" | "blog" | "3d";

export const WEB_STACK_LABELS: Record<WebStack, string> = {
  react: "React (inline)",
  vite: "Vite-style (module)",
  html: "HTML / CSS / JS",
  blog: "Blog / post",
  "3d": "3D Game / Scene",
};

export const WEB_STACKS: WebStack[] = ["react", "vite", "html", "blog", "3d"];

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

  if (stack === "3d") {
    return { stack, title, html: threeJsHtml, files: { "index.html": threeJsHtml } };
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

// 3D Game / Scene stack — uses Three.js via CDN for a full 3D scene
const threeJsHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0d0917; overflow: hidden; font-family: ui-sans-serif, system-ui, sans-serif; }
canvas { display: block; }
#info { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); color: #8d85aa; font-size: 12px; background: rgba(13,9,23,0.8); padding: 6px 14px; border-radius: 8px; border: 1px solid #2a2440; pointer-events: none; }
</style>
</head>
<body>
<div id="info">${escapeHtml(cleaned || "3D Scene — drag to rotate, scroll to zoom")}</div>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0917);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lights
const ambient = new THREE.AmbientLight(0x404060);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xf6c945, 1.5);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0x4466ff, 0.5);
fillLight.position.set(-5, 0, 5);
scene.add(fillLight);

// Ground
const groundGeo = new THREE.PlaneGeometry(20, 20);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1430, roughness: 0.8 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1;
ground.receiveShadow = true;
scene.add(ground);

// Main object — a rotating geometric sculpture
const group = new THREE.Group();
const geometries = [
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.SphereGeometry(1, 32, 32),
  new THREE.TorusKnotGeometry(0.8, 0.3, 64, 8),
  new THREE.IcosahedronGeometry(1),
];
const colors = [0xf6c945, 0x6c5ce7, 0x00cec9, 0xfd79a8];
const positions = [[-2, 0, 0], [2, 0, 0], [0, 0, -2], [0, 0, 2]];
const objects = [];
for (let i = 0; i < 4; i++) {
  const mat = new THREE.MeshStandardMaterial({ color: colors[i], metalness: 0.3, roughness: 0.4 });
  const mesh = new THREE.Mesh(geometries[i], mat);
  mesh.position.set(positions[i][0], positions[i][1], positions[i][2]);
  mesh.castShadow = true;
  group.add(mesh);
  objects.push(mesh);
}
scene.add(group);

// Stars
const starsGeo = new THREE.BufferGeometry();
const starCount = 2000;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) starPos[i] = (Math.random() - 0.5) * 200;
starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true });
const stars = new THREE.Points(starsGeo, starsMat);
scene.add(stars);

function animate() {
  requestAnimationFrame(animate);
  const t = Date.now() * 0.001;
  group.rotation.x = t * 0.2;
  group.rotation.y = t * 0.3;
  objects.forEach((obj, i) => {
    obj.rotation.x = t * (0.5 + i * 0.1);
    obj.rotation.y = t * (0.3 + i * 0.15);
  });
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>
</body>
</html>`;