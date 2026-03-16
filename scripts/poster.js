function setPosterPanel(id) {
  document.querySelectorAll('.p-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.p-tb').forEach(b => b.classList.remove('active'));

  const panel = document.getElementById('pp' + id);
  const tab = document.querySelector(`.p-tb[data-panel="${id}"]`);
  if (panel) panel.classList.add('active');
  if (tab) tab.classList.add('active');
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function buildIntersectionComplex(points, alpha) {
  const balls = points.map(p => ({ ...p, R: p.r + alpha * 1.6 }));
  const edges = [];
  const edgeSet = new Set();

  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      if (distance(balls[i], balls[j]) <= balls[i].R + balls[j].R) {
        edges.push([i, j]);
        edgeSet.add(`${i}-${j}`);
      }
    }
  }

  const triangles = [];
  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      for (let k = j + 1; k < balls.length; k += 1) {
        const ij = edgeSet.has(`${i}-${j}`);
        const ik = edgeSet.has(`${i}-${k}`);
        const jk = edgeSet.has(`${j}-${k}`);
        if (ij && ik && jk) triangles.push([i, j, k]);
      }
    }
  }

  return { balls, edges, triangles };
}

function drawAlphaFigure(alpha) {
  const svg = document.getElementById('alphaSvg');
  if (!svg) return;
  svg.textContent = '';

  const points = [
    { x: 82, y: 220, r: 46, label: 'x5' },
    { x: 130, y: 130, r: 56, label: 'x4' },
    { x: 225, y: 170, r: 62, label: 'x0' },
    { x: 292, y: 85, r: 48, label: 'x3' },
    { x: 336, y: 135, r: 34, label: 'x2' },
    { x: 338, y: 232, r: 28, label: 'x1' }
  ];
  const { balls, edges, triangles } = buildIntersectionComplex(points, alpha);

  points.forEach(p => {
    svg.appendChild(svgEl('circle', {
      cx: p.x, cy: p.y, r: p.r,
      fill: 'rgba(245,245,240,0.9)',
      stroke: '#0a0a0a', 'stroke-width': 1
    }));
  });

  balls.forEach(p => {
    svg.appendChild(svgEl('circle', {
      cx: p.x, cy: p.y, r: p.R,
      fill: 'none',
      stroke: '#c33',
      'stroke-width': 1,
      'stroke-dasharray': '6 4'
    }));
  });

  triangles.forEach(([a, b, c]) => {
    svg.appendChild(svgEl('polygon', {
      points: `${points[a].x},${points[a].y} ${points[b].x},${points[b].y} ${points[c].x},${points[c].y}`,
      fill: 'rgba(47,73,255,0.08)',
      stroke: 'none'
    }));
  });

  edges.forEach(([a, b]) => {
    svg.appendChild(svgEl('line', {
      x1: points[a].x, y1: points[a].y,
      x2: points[b].x, y2: points[b].y,
      stroke: '#2f49ff',
      'stroke-width': 1.4
    }));
  });

  points.forEach(p => {
    svg.appendChild(svgEl('circle', {
      cx: p.x, cy: p.y, r: 3.2, fill: '#0a0a0a'
    }));
    const t = svgEl('text', {
      x: p.x + 6, y: p.y - 8,
      fill: '#0a0a0a',
      'font-size': 10,
      'font-family': 'IBM Plex Mono, monospace'
    });
    t.textContent = p.label;
    svg.appendChild(t);
  });

  const note = svgEl('text', {
    x: 10, y: 292,
    fill: '#555',
    'font-size': 9,
    'font-family': 'IBM Plex Mono, monospace'
  });
  note.textContent = 'Dashed red circles = solvent offset controlled by alpha';
  svg.appendChild(note);

  const summary = document.getElementById('alphaSummary');
  if (summary) {
    summary.textContent = `Blue complex at alpha=${alpha.toFixed(1)}: ${edges.length} intersecting pairs, ${triangles.length} filled 2-simplex faces.`;
  }
}

document.querySelectorAll('.p-tb[data-panel]').forEach(tab => {
  tab.addEventListener('click', () => {
    setPosterPanel(tab.dataset.panel);
  });
});

const alphaSlider = document.getElementById('alphaSlider');
const alphaValue = document.getElementById('alphaValue');
if (alphaSlider && alphaValue) {
  const render = () => {
    const alpha = Number(alphaSlider.value);
    alphaValue.textContent = alpha.toFixed(1);
    drawAlphaFigure(alpha);
  };
  alphaSlider.addEventListener('input', render);
  render();
}

function initMeshViewer() {
  const canvas = document.getElementById('meshCanvas');
  const summary = document.getElementById('meshSummary');
  const meshTabs = Array.from(document.querySelectorAll('.p-tb[data-mesh]'));
  if (!canvas || !summary || meshTabs.length === 0) return;
  if (!window.THREE || !THREE.PLYLoader) {
    summary.textContent = '3D viewer unavailable in this browser session.';
    return;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  const lightA = new THREE.AmbientLight(0xffffff, 0.7);
  const lightB = new THREE.DirectionalLight(0xffffff, 0.55);
  lightB.position.set(0.8, 1, 0.9);
  scene.add(lightA, lightB);
  camera.position.set(0, 0, 2.5);

  const loader = new THREE.PLYLoader();
  const root = new THREE.Group();
  scene.add(root);

  const meshPaths = {
    msms: 'assets/meshes/1A27_AB_msms.ply',
    alpha0: 'assets/meshes/1A27_AB_alpha0.ply'
  };

  let currentMesh = null;
  let currentKey = 'msms';

  function resizeRenderer() {
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 210;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setActiveMeshTab(key) {
    meshTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.mesh === key));
  }

  function normalizeGeometry(geometry) {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const scale = maxSize > 0 ? 1.8 / maxSize : 1;
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  function loadMesh(key) {
    const path = meshPaths[key];
    if (!path) return;
    currentKey = key;
    setActiveMeshTab(key);
    loader.load(
      path,
      geometry => {
        const normalized = normalizeGeometry(geometry);
        const material = new THREE.MeshStandardMaterial({
          color: 0x141414,
          roughness: 1,
          metalness: 0,
          flatShading: true
        });
        const mesh = new THREE.Mesh(normalized, material);
        if (currentMesh) {
          root.remove(currentMesh);
          currentMesh.geometry.dispose();
          currentMesh.material.dispose();
        }
        currentMesh = mesh;
        root.add(mesh);

        const vertCount = normalized.getAttribute('position').count;
        const faceCount = normalized.index ? normalized.index.count / 3 : vertCount / 3;
        summary.textContent = `${key === 'msms' ? 'MSMS' : 'Alpha α=0'} · ${vertCount} vertices · ${Math.round(faceCount)} faces`;
      },
      undefined,
      () => {
        summary.textContent = 'Unable to load mesh file.';
      }
    );
  }

  meshTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mesh && btn.dataset.mesh !== currentKey) {
        loadMesh(btn.dataset.mesh);
      }
    });
  });

  function frame() {
    requestAnimationFrame(frame);
    if (currentMesh) currentMesh.rotation.y += 0.004;
    renderer.render(scene, camera);
  }

  resizeRenderer();
  window.addEventListener('resize', resizeRenderer);
  loadMesh('msms');
  frame();
}

initMeshViewer();
