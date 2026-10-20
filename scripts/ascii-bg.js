/*
 * ASCII protein background.
 *
 * A MISATO MD trajectory (AlphaSurf mesh recomputed on every frame) is
 * rasterised into a grid of monospace cells and shaded with a glyph ramp:
 * sparse glyphs where the surface faces the light, dense glyphs in shadow.
 * Around it, a faint field of dots ripples where the pointer moves and
 * splashes on click. The ligand atoms show up as red glyphs.
 *
 * Falls back to the static 1A27 AlphaSurf mesh if the trajectory is missing.
 * Honours prefers-reduced-motion (single still frame) and pauses when the
 * tab is hidden or the poster modal is open.
 */
(() => {
  const MD_MANIFEST = "assets/md/misato_md.json";
  const FALLBACK_PLY = "assets/meshes/1A27_AB_alpha0.ply";
  const FONT_PX = 12;
  const FONT = `500 ${FONT_PX}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
  const RAMP = ":;t%SX8#@"; // bright skin -> shadow
  const EDGE = ".',`";
  const INK = "10,10,10";
  const LIG = "195,51,51";
  const FPS = 30;
  const MD_FRAME_MS = 130;

  const canvas = document.createElement("canvas");
  canvas.className = "ascii-bg";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const g = canvas.getContext("2d");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const modal = document.getElementById("modal");

  let W = 0, H = 0, dpr = 1, cw = 7, ch = 13, cols = 0, rows = 0;
  let depth, shade, fill, wake, wakeNext; // per-cell buffers
  let frames = []; // [{pos: Float32Array, idx: Uint16Array|Uint32Array, lig: Float32Array}]
  let radius = 30;
  let frameIdx = 0, frameDir = 1, lastFrameSwitch = 0;
  let t = 0, last = 0, raf = 0;
  const pointer = { x: -1e4, y: -1e4, active: false, nx: 0, ny: 0 };
  let yawOffset = 0, pitchOffset = 0;
  const splashes = [];

  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = FONT;
    g.textBaseline = "top";
    cw = Math.max(5, g.measureText("M").width);
    ch = Math.round(FONT_PX * 1.15);
    cols = Math.ceil(W / cw);
    rows = Math.ceil(H / ch);
    const n = cols * rows;
    depth = new Float32Array(n);
    shade = new Float32Array(n);
    fill = new Uint8Array(n);
    wake = new Float32Array(n);
    wakeNext = new Float32Array(n);
    if (reduced.matches) draw(performance.now());
  }

  // ---- data -------------------------------------------------------------
  function loadMd() {
    return fetch(MD_MANIFEST)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m) =>
        fetch("assets/md/" + m.bin)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
          .then((buf) => {
            const Idx = m.index_dtype === "uint16" ? Uint16Array : Uint32Array;
            frames = m.frames.map((f) => ({
              pos: new Float32Array(buf, f.v_off, f.nv * 3),
              idx: new Idx(buf, f.f_off, f.nf * 3),
              lig: f.nl ? new Float32Array(buf, f.lig_off, f.nl * 3) : new Float32Array(0),
            }));
            radius = m.radius || 30;
          }),
      );
  }

  function loadPly() {
    return fetch(FALLBACK_PLY)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((txt) => {
        const lines = txt.split(/\r?\n/);
        let i = 0, nv = 0, nf = 0;
        for (; i < lines.length; i++) {
          const l = lines[i].trim();
          if (l.startsWith("element vertex")) nv = +l.split(/\s+/)[2];
          else if (l.startsWith("element face")) nf = +l.split(/\s+/)[2];
          else if (l === "end_header") { i++; break; }
        }
        const pos = new Float32Array(nv * 3);
        let cx = 0, cy = 0, cz = 0;
        for (let v = 0; v < nv; v++, i++) {
          const p = lines[i].trim().split(/\s+/);
          pos[v * 3] = +p[0]; pos[v * 3 + 1] = +p[1]; pos[v * 3 + 2] = +p[2];
          cx += +p[0]; cy += +p[1]; cz += +p[2];
        }
        cx /= nv; cy /= nv; cz /= nv;
        let r = 0;
        for (let v = 0; v < nv; v++) {
          pos[v * 3] -= cx; pos[v * 3 + 1] -= cy; pos[v * 3 + 2] -= cz;
          r = Math.max(r, Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
        }
        const idx = [];
        for (let f = 0; f < nf; f++, i++) {
          const p = (lines[i] || "").trim().split(/\s+/).map(Number);
          for (let k = 2; k < p[0]; k++) idx.push(p[1], p[k], p[k + 1]);
        }
        frames = [{ pos, idx: new Uint32Array(idx), lig: new Float32Array(0) }];
        radius = r;
      });
  }

  // ---- rendering ----------------------------------------------------------
  let tx = new Float32Array(0);

  function layout() {
    const wide = W >= 1000;
    const scale = (Math.min(H * 0.42, W * (wide ? 0.3 : 0.45)) / radius);
    const drift = reduced.matches ? 0 : 1;
    const cx = (wide ? W * 0.74 : W * 0.5) + drift * Math.sin(t * 0.07) * W * 0.03;
    const cy = H * 0.56 + drift * Math.sin(t * 0.11 + 1) * H * 0.04;
    return { scale, cx, cy, alpha: wide ? 1 : 0.6 };
  }

  function rasterise(frame, L) {
    depth.fill(-1e9);
    fill.fill(0);
    const { pos, idx } = frame;
    const nv = pos.length / 3;
    if (tx.length < nv * 3) tx = new Float32Array(nv * 3);

    const yaw = t * 0.12 + yawOffset;
    const pitch = 0.35 + pitchOffset;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const x1 = x * cyw + z * syw;
      const z1 = -x * syw + z * cyw;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      tx[v * 3] = (L.cx + x1 * L.scale) / cw; // cell units
      tx[v * 3 + 1] = (L.cy - y2 * L.scale) / ch;
      tx[v * 3 + 2] = z2;
    }

    // light from upper-left, towards the viewer
    const lx = -0.45, ly = 0.6, lz = 0.66;
    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
      const ax = tx[a], ay = tx[a + 1], az = tx[a + 2];
      const bx = tx[b], by = tx[b + 1], bz = tx[b + 2];
      const qx = tx[c], qy = tx[c + 1], qz = tx[c + 2];
      // normal in screen-ish space (y down, fix aspect)
      const ux = (bx - ax) * cw, uy = -(by - ay) * ch, uz = (bz - az) * L.scale;
      const vx = (qx - ax) * cw, vy = -(qy - ay) * ch, vz = (qz - az) * L.scale;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; } // double-sided
      const lum = Math.max(0, nx * lx + ny * ly + nz * lz);

      const minX = Math.max(0, Math.floor(Math.min(ax, bx, qx)));
      const maxX = Math.min(cols - 1, Math.ceil(Math.max(ax, bx, qx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, qy)));
      const maxY = Math.min(rows - 1, Math.ceil(Math.max(ay, by, qy)));
      if (minX > maxX || minY > maxY) continue;
      const den = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const w0 = ((by - qy) * (px - qx) + (qx - bx) * (py - qy)) / den;
          const w1 = ((qy - ay) * (px - qx) + (ax - qx) * (py - qy)) / den;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
          const z = w0 * az + w1 * bz + w2 * qz;
          const k = y * cols + x;
          if (z > depth[k]) {
            depth[k] = z;
            shade[k] = lum;
            fill[k] = 1;
          }
        }
      }
    }
  }

  function stepWake(dt) {
    // diffuse + decay
    const decay = Math.exp(-dt * 1.6);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const k = y * cols + x;
        let s = wake[k] * 4;
        if (x > 0) s += wake[k - 1];
        if (x < cols - 1) s += wake[k + 1];
        if (y > 0) s += wake[k - cols];
        if (y < rows - 1) s += wake[k + cols];
        wakeNext[k] = (s / 8) * decay;
      }
    }
    const tmp = wake; wake = wakeNext; wakeNext = tmp;
    if (pointer.active) {
      const px = Math.floor(pointer.x / cw), py = Math.floor(pointer.y / ch);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const x = px + dx, y = py + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const k = y * cols + x;
          wake[k] = Math.min(1, wake[k] + 0.35 * (1 - Math.hypot(dx / 3, dy / 2) * 0.6));
        }
    }
  }

  function draw(now) {
    g.clearRect(0, 0, W, H);
    if (!frames.length || !cols) return;
    const L = layout();
    rasterise(frames[frameIdx], L);

    const zmin = -radius, zrange = 2 * radius;
    for (let y = 0; y < rows; y++) {
      const py = y * ch;
      for (let x = 0; x < cols; x++) {
        const k = y * cols + x;
        const px = x * cw;
        if (fill[k]) {
          const edge =
            (x > 0 && !fill[k - 1]) || (x < cols - 1 && !fill[k + 1]) ||
            (y > 0 && !fill[k - cols]) || (y < rows - 1 && !fill[k + cols]);
          const near = Math.min(1, Math.max(0, (depth[k] - zmin) / zrange));
          let glyph;
          if (edge) {
            glyph = EDGE[(hash(x, y) * EDGE.length) | 0];
          } else {
            const s = shade[k];
            const i = Math.min(RAMP.length - 1, Math.max(0, Math.round((1 - s) * (RAMP.length - 1))));
            glyph = RAMP[i];
          }
          const a = (0.08 + 0.18 * near) * L.alpha;
          g.fillStyle = `rgba(${INK},${a.toFixed(3)})`;
          g.fillText(glyph, px, py);
        } else {
          // sea of dots + wake + splashes
          let e = wake[k];
          for (const s of splashes) {
            const d = Math.hypot(px - s.x, py - s.y);
            const r = s.age * 260;
            const band = 1 - Math.min(1, Math.abs(d - r) / 18);
            if (band > 0) e = Math.max(e, band * (1 - s.age / 1.6));
          }
          const dot = hash(x, y) < 0.055;
          if (e > 0.08) {
            g.fillStyle = `rgba(${INK},${(0.06 + 0.22 * e).toFixed(3)})`;
            g.fillText(e > 0.5 ? ":" : e > 0.25 ? "·" : ".", px, py);
          } else if (dot) {
            g.fillStyle = `rgba(${INK},0.07)`;
            g.fillText(".", px, py);
          }
        }
      }
    }

    // ligand atoms, depth-tested against the surface
    const lig = frames[frameIdx].lig;
    if (lig.length) {
      const yaw = t * 0.12 + yawOffset, pitch = 0.35 + pitchOffset;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      g.fillStyle = `rgba(${LIG},${(0.55 * L.alpha).toFixed(3)})`;
      for (let a = 0; a < lig.length; a += 3) {
        const x = lig[a], yv = lig[a + 1], z = lig[a + 2];
        const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
        const y2 = yv * cp - z1 * sp, z2 = yv * sp + z1 * cp;
        const cx = Math.floor((L.cx + x1 * L.scale) / cw);
        const cy = Math.floor((L.cy - y2 * L.scale) / ch);
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        const k = cy * cols + cx;
        if (fill[k] && depth[k] > z2 + 1.5) continue;
        g.fillText("o", cx * cw, cy * ch);
      }
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - last < 1000 / FPS) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden || (modal && modal.classList.contains("open"))) return;
    t += dt;
    // ease the model towards the pointer
    const ty = pointer.active ? pointer.nx * 0.6 : 0;
    const tp = pointer.active ? pointer.ny * 0.35 : 0;
    yawOffset += (ty - yawOffset) * Math.min(1, dt * 1.5);
    pitchOffset += (tp - pitchOffset) * Math.min(1, dt * 1.5);
    if (frames.length > 1 && now - lastFrameSwitch > MD_FRAME_MS) {
      lastFrameSwitch = now;
      if (frameIdx + frameDir >= frames.length || frameIdx + frameDir < 0) frameDir = -frameDir;
      frameIdx += frameDir;
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      splashes[i].age += dt;
      if (splashes[i].age > 1.6) splashes.splice(i, 1);
    }
    stepWake(dt);
    draw(now);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduced.matches) {
      t = 6;
      draw(performance.now());
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.nx = e.clientX / W - 0.5;
    pointer.ny = e.clientY / H - 0.5;
    pointer.active = e.pointerType !== "touch";
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => (pointer.active = false));
  window.addEventListener("pointerdown", (e) => {
    if (reduced.matches) return;
    splashes.push({ x: e.clientX, y: e.clientY, age: 0 });
    if (splashes.length > 4) splashes.shift();
  }, { passive: true });
  window.addEventListener("resize", resize);
  reduced.addEventListener("change", start);

  const fontReady = document.fonts ? document.fonts.load(FONT).catch(() => {}) : Promise.resolve();
  fontReady.then(() => {
    resize();
    loadMd()
      .catch(loadPly)
      .then(start)
      .catch(() => canvas.remove());
  });
})();
