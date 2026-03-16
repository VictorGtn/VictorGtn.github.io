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

const alphaFigureState = {
  initialized: false,
  dragIndex: -1,
  points: [
    { x: 82, y: 220, r: 46, label: 'x5' },
    { x: 130, y: 130, r: 56, label: 'x4' },
    { x: 225, y: 170, r: 62, label: 'x0' },
    { x: 292, y: 85, r: 48, label: 'x3' },
    { x: 336, y: 135, r: 34, label: 'x2' },
    { x: 338, y: 232, r: 28, label: 'x1' }
  ],
  bounds: { minX: 25, maxX: 435, minY: 28, maxY: 262 }
};

function clipPolygonHalfPlane(poly, a, b, c) {
  const out = [];
  if (poly.length === 0) return out;
  const eps = 1e-9;
  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curVal = a * cur.x + b * cur.y - c;
    const prevVal = a * prev.x + b * prev.y - c;
    const curIn = curVal <= eps;
    const prevIn = prevVal <= eps;

    if (curIn !== prevIn) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const denom = a * dx + b * dy;
      if (Math.abs(denom) > eps) {
        const t = (c - a * prev.x - b * prev.y) / denom;
        out.push({ x: prev.x + t * dx, y: prev.y + t * dy });
      }
    }
    if (curIn) out.push(cur);
  }
  return out;
}

function buildPowerCell(i, balls, bounds) {
  let poly = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ];

  const bi = balls[i];
  const wi = bi.R * bi.R;

  for (let j = 0; j < balls.length; j += 1) {
    if (j === i) continue;
    const bj = balls[j];
    const wj = bj.R * bj.R;
    const a = 2 * (bj.x - bi.x);
    const b = 2 * (bj.y - bi.y);
    const c = (bj.x * bj.x + bj.y * bj.y - wj) - (bi.x * bi.x + bi.y * bi.y - wi);
    poly = clipPolygonHalfPlane(poly, a, b, c);
    if (poly.length === 0) break;
  }

  return poly;
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
  const points = alphaFigureState.points;
  const { balls, edges, triangles } = buildIntersectionComplex(points, alpha);

  balls.forEach((_, i) => {
    const cell = buildPowerCell(i, balls, alphaFigureState.bounds);
    if (cell.length < 3) return;
    svg.appendChild(svgEl('polygon', {
      points: cell.map(p => `${p.x},${p.y}`).join(' '),
      fill: 'rgba(51, 160, 255, 0.07)',
      stroke: 'rgba(30, 110, 170, 0.35)',
      'stroke-width': 0.8
    }));
  });

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

  points.forEach((p, idx) => {
    const handle = svgEl('circle', {
      cx: p.x,
      cy: p.y,
      r: 8.5,
      fill: 'rgba(10,10,10,0)',
      stroke: 'rgba(10,10,10,0)',
      'stroke-width': 1,
      'data-point-index': idx,
      style: 'cursor: grab;'
    });
    svg.appendChild(handle);
  });

  const note = svgEl('text', {
    x: 10, y: 292,
    fill: '#555',
    'font-size': 9,
    'font-family': 'IBM Plex Mono, monospace'
  });
  note.textContent = 'Dashed red circles = solvent offset; blue cells = power diagram; drag points to move balls';
  svg.appendChild(note);

  const summary = document.getElementById('alphaSummary');
  if (summary) {
    summary.textContent = `Alpha=${alpha.toFixed(1)}: ${edges.length} intersecting pairs, ${triangles.length} filled 2-simplex faces, ${balls.length} power cells.`;
  }
}

function getSvgPointer(svg, evt) {
  const rect = svg.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * 460;
  const y = ((evt.clientY - rect.top) / rect.height) * 300;
  return { x, y };
}

function installAlphaFigureInteractions() {
  const svg = document.getElementById('alphaSvg');
  const alphaSlider = document.getElementById('alphaSlider');
  if (!svg || !alphaSlider || alphaFigureState.initialized) return;
  alphaFigureState.initialized = true;

  const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
  const render = () => drawAlphaFigure(Number(alphaSlider.value));

  svg.addEventListener('pointerdown', evt => {
    const t = evt.target;
    if (!(t instanceof Element)) return;
    const idx = t.getAttribute('data-point-index');
    if (idx == null) return;
    alphaFigureState.dragIndex = Number(idx);
    svg.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  });

  svg.addEventListener('pointermove', evt => {
    if (alphaFigureState.dragIndex < 0) return;
    const pos = getSvgPointer(svg, evt);
    const b = alphaFigureState.bounds;
    const p = alphaFigureState.points[alphaFigureState.dragIndex];
    p.x = clamp(pos.x, b.minX, b.maxX);
    p.y = clamp(pos.y, b.minY, b.maxY);
    render();
  });

  const stopDrag = () => {
    alphaFigureState.dragIndex = -1;
  };
  svg.addEventListener('pointerup', stopDrag);
  svg.addEventListener('pointercancel', stopDrag);
}

document.querySelectorAll('.p-tb[data-panel]').forEach(tab => {
  tab.addEventListener('click', () => {
    setPosterPanel(tab.dataset.panel);
  });
});

const alphaSlider = document.getElementById('alphaSlider');
const alphaValue = document.getElementById('alphaValue');
if (alphaSlider && alphaValue) {
  installAlphaFigureInteractions();
  const render = () => {
    const alpha = Number(alphaSlider.value);
    alphaValue.textContent = alpha.toFixed(1);
    drawAlphaFigure(alpha);
  };
  alphaSlider.addEventListener('input', render);
  render();
}

function initMeshViewer() {
  const singleView = document.getElementById('meshSingleView');
  const splitView = document.getElementById('meshSplitView');
  const singleCanvas = document.getElementById('meshCanvas');
  const msmsSplitCanvas = document.getElementById('meshCanvasMsms');
  const alphaSplitCanvas = document.getElementById('meshCanvasAlpha');
  const summary = document.getElementById('meshSummary');
  const meshTabsRow = document.getElementById('meshTabsRow');
  const meshTabs = Array.from(document.querySelectorAll('.p-tb[data-mesh]'));
  const zoomInBtn = document.getElementById('meshZoomInBtn');
  const zoomOutBtn = document.getElementById('meshZoomOutBtn');
  const playPauseBtn = document.getElementById('meshPlayPauseBtn');
  const splitBtn = document.getElementById('meshSplitBtn');
  if (!singleView || !splitView || !singleCanvas || !msmsSplitCanvas || !alphaSplitCanvas || !summary || !meshTabsRow || meshTabs.length === 0) return;
  if (!window.THREE) {
    summary.textContent = '3D viewer unavailable in this browser session.';
    return;
  }

  const meshPaths = {
    msms: 'assets/meshes/1A27_AB_msms.ply',
    alpha0: 'assets/meshes/1A27_AB_alpha0.ply'
  };
  const geometryCache = {};
  const geometryPromise = {};
  const meshStats = {};

  let mode = 'single';
  let currentKey = 'msms';
  let rotationEnabled = true;
  let rotationY = 0;
  let zoomFactor = 1;

  function parseAsciiPly(plyText) {
    const lines = plyText.split(/\r?\n/);
    let i = 0;
    let vertexCount = 0;
    let faceCount = 0;

    for (; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (line.startsWith('element vertex')) {
        vertexCount = Number(line.split(/\s+/)[2]);
      } else if (line.startsWith('element face')) {
        faceCount = Number(line.split(/\s+/)[2]);
      } else if (line === 'end_header') {
        i += 1;
        break;
      }
    }

    const vertices = new Float32Array(vertexCount * 3);
    const indexList = [];

    for (let v = 0; v < vertexCount; v += 1, i += 1) {
      const parts = lines[i].trim().split(/\s+/);
      vertices[v * 3] = Number(parts[0]);
      vertices[v * 3 + 1] = Number(parts[1]);
      vertices[v * 3 + 2] = Number(parts[2]);
    }

    for (let f = 0; f < faceCount; f += 1, i += 1) {
      const line = (lines[i] || '').trim();
      if (!line) continue;
      const parts = line.split(/\s+/).map(Number);
      const n = parts[0];
      if (!Number.isFinite(n) || n < 3 || parts.length < n + 1) continue;
      const face = parts.slice(1, n + 1);
      for (let k = 1; k < face.length - 1; k += 1) {
        indexList.push(face[0], face[k], face[k + 1]);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indexList);
    return geometry;
  }

  function createContext(canvasEl) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    const lightA = new THREE.AmbientLight(0xffffff, 0.9);
    const lightB = new THREE.DirectionalLight(0xffffff, 0.9);
    const lightC = new THREE.DirectionalLight(0xffffff, 0.45);
    lightB.position.set(1.1, 1.3, 1.4);
    lightC.position.set(-1.0, -0.7, 0.6);
    scene.add(lightA, lightB, lightC);
    const root = new THREE.Group();
    scene.add(root);
    return {
      canvas: canvasEl,
      renderer,
      scene,
      camera,
      root,
      currentMeshObject: null,
      currentRadius: 1,
      fitDistance: 2.5
    };
  }

  const singleCtx = createContext(singleCanvas);
  const splitMsmsCtx = createContext(msmsSplitCanvas);
  const splitAlphaCtx = createContext(alphaSplitCanvas);

  function resizeContext(ctx) {
    const w = Math.floor(ctx.canvas.clientWidth || 0);
    const h = Math.floor(ctx.canvas.clientHeight || 0);
    if (w < 2 || h < 2) return;
    ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    ctx.renderer.setSize(w, h, false);
    ctx.camera.aspect = w / h;
    ctx.camera.updateProjectionMatrix();
  }

  function setActiveMeshTab(key) {
    meshTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.mesh === key));
  }

  function normalizeGeometry(geometry) {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingSphere();
    return geometry;
  }

  function fitCameraToGeometry(ctx, geometry) {
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere || !Number.isFinite(sphere.radius) || sphere.radius <= 0) return;

    ctx.currentRadius = sphere.radius;
    const vFov = THREE.MathUtils.degToRad(ctx.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * ctx.camera.aspect);
    const fitDistanceV = ctx.currentRadius / Math.sin(vFov / 2);
    const fitDistanceH = ctx.currentRadius / Math.sin(hFov / 2);
    ctx.fitDistance = 1.18 * Math.max(fitDistanceV, fitDistanceH);
  }

  function applyZoomToContext(ctx) {
    const distance = ctx.fitDistance * zoomFactor;
    ctx.camera.position.set(0, 0, distance);
    ctx.camera.near = Math.max(0.01, distance - ctx.currentRadius * 3.2);
    ctx.camera.far = distance + ctx.currentRadius * 3.2;
    ctx.camera.updateProjectionMatrix();
  }

  function applyZoom(nextZoomFactor) {
    zoomFactor = Math.min(2.8, Math.max(0.55, nextZoomFactor));
    if (singleCtx.currentMeshObject) applyZoomToContext(singleCtx);
    if (splitMsmsCtx.currentMeshObject) applyZoomToContext(splitMsmsCtx);
    if (splitAlphaCtx.currentMeshObject) applyZoomToContext(splitAlphaCtx);
  }

  function disposeMeshObject(meshObject) {
    if (!meshObject) return;
    meshObject.traverse(node => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) node.material.dispose();
    });
  }

  function buildMeshObject(geometry) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xd4dae2,
      roughness: 0.8,
      metalness: 0,
      flatShading: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    const wire = new THREE.WireframeGeometry(geometry);
    const edgeLines = new THREE.LineSegments(
      wire,
      new THREE.LineBasicMaterial({
        color: 0x1a1a1b,
        transparent: true,
        opacity: 0.22
      })
    );
    edgeLines.frustumCulled = false;
    const meshObject = new THREE.Group();
    meshObject.add(mesh);
    meshObject.add(edgeLines);
    meshObject.rotation.y = rotationY;
    return meshObject;
  }

  function updateSummary() {
    if (mode === 'split') {
      const a = meshStats.msms;
      const b = meshStats.alpha0;
      if (a && b) {
        summary.textContent = `MSMS · ${a.v} vertices · ${a.f} faces  |  Alpha α=0 · ${b.v} vertices · ${b.f} faces`;
      }
      return;
    }
    const stats = meshStats[currentKey];
    if (!stats) return;
    summary.textContent = `${currentKey === 'msms' ? 'MSMS' : 'Alpha α=0'} · ${stats.v} vertices · ${stats.f} faces`;
  }

  function ensureGeometry(key) {
    if (geometryCache[key]) return Promise.resolve(geometryCache[key]);
    if (geometryPromise[key]) return geometryPromise[key];
    const path = meshPaths[key];
    if (!path) return Promise.reject(new Error('Unknown mesh key'));
    geometryPromise[key] = fetch(path)
      .then(resp => {
        if (!resp.ok) throw new Error('Mesh fetch failed');
        return resp.text();
      })
      .then(plyText => {
        const geometry = parseAsciiPly(plyText);
        const normalized = normalizeGeometry(geometry);
        const vertCount = normalized.getAttribute('position').count;
        const faceCount = normalized.index ? normalized.index.count / 3 : vertCount / 3;
        meshStats[key] = { v: vertCount, f: Math.round(faceCount) };
        geometryCache[key] = normalized;
        return normalized;
      })
      .catch(() => {
        summary.textContent = 'Unable to load mesh file.';
        throw new Error('Unable to load mesh file.');
      });
    return geometryPromise[key];
  }

  async function setContextMesh(ctx, key) {
    const geometry = await ensureGeometry(key);
    fitCameraToGeometry(ctx, geometry);
    applyZoomToContext(ctx);
    if (ctx.currentMeshObject) {
      ctx.root.remove(ctx.currentMeshObject);
      disposeMeshObject(ctx.currentMeshObject);
    }
    ctx.currentMeshObject = buildMeshObject(geometry);
    ctx.root.add(ctx.currentMeshObject);
  }

  async function setSingleMesh(key) {
    currentKey = key;
    setActiveMeshTab(key);
    await setContextMesh(singleCtx, key);
    updateSummary();
  }

  async function setSplitMeshes() {
    await Promise.all([
      setContextMesh(splitMsmsCtx, 'msms'),
      setContextMesh(splitAlphaCtx, 'alpha0')
    ]);
    updateSummary();
  }

  function updateModeUI() {
    const isSplit = mode === 'split';
    singleView.hidden = isSplit;
    splitView.hidden = !isSplit;
    meshTabsRow.style.display = isSplit ? 'none' : '';
    if (splitBtn) {
      splitBtn.textContent = isSplit ? '1x' : '2x';
      splitBtn.setAttribute('aria-label', isSplit ? 'Disable split-screen mode' : 'Enable split-screen mode');
    }
  }

  function resizeAll() {
    resizeContext(singleCtx);
    resizeContext(splitMsmsCtx);
    resizeContext(splitAlphaCtx);
    if (singleCtx.currentMeshObject && geometryCache[currentKey]) {
      fitCameraToGeometry(singleCtx, geometryCache[currentKey]);
      applyZoomToContext(singleCtx);
    }
    if (splitMsmsCtx.currentMeshObject && geometryCache.msms) {
      fitCameraToGeometry(splitMsmsCtx, geometryCache.msms);
      applyZoomToContext(splitMsmsCtx);
    }
    if (splitAlphaCtx.currentMeshObject && geometryCache.alpha0) {
      fitCameraToGeometry(splitAlphaCtx, geometryCache.alpha0);
      applyZoomToContext(splitAlphaCtx);
    }
  }

  meshTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      if (mode !== 'single') return;
      if (btn.dataset.mesh && btn.dataset.mesh !== currentKey) {
        setSingleMesh(btn.dataset.mesh);
      }
    });
  });

  if (splitBtn) {
    splitBtn.addEventListener('click', () => {
      mode = mode === 'single' ? 'split' : 'single';
      updateModeUI();
      resizeAll();
      if (mode === 'split') {
        setSplitMeshes();
      } else {
        setSingleMesh(currentKey);
      }
    });
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => applyZoom(zoomFactor * 0.88));
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => applyZoom(zoomFactor * 1.14));
  }
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      rotationEnabled = !rotationEnabled;
      playPauseBtn.textContent = rotationEnabled ? '||' : '>';
      playPauseBtn.setAttribute('aria-label', rotationEnabled ? 'Pause rotation' : 'Resume rotation');
    });
  }

  function frame() {
    requestAnimationFrame(frame);
    if (rotationEnabled) rotationY += 0.003;
    if (singleCtx.currentMeshObject) singleCtx.currentMeshObject.rotation.y = rotationY;
    if (splitMsmsCtx.currentMeshObject) splitMsmsCtx.currentMeshObject.rotation.y = rotationY;
    if (splitAlphaCtx.currentMeshObject) splitAlphaCtx.currentMeshObject.rotation.y = rotationY;
    if (mode === 'split') {
      splitMsmsCtx.renderer.render(splitMsmsCtx.scene, splitMsmsCtx.camera);
      splitAlphaCtx.renderer.render(splitAlphaCtx.scene, splitAlphaCtx.camera);
    } else {
      singleCtx.renderer.render(singleCtx.scene, singleCtx.camera);
    }
  }

  updateModeUI();
  resizeAll();
  window.addEventListener('resize', resizeAll);
  setSingleMesh('msms');
  frame();
}

let meshViewerInitialized = false;
window.initMeshViewerOnce = function initMeshViewerOnce() {
  if (meshViewerInitialized) return;
  meshViewerInitialized = true;
  initMeshViewer();
};
