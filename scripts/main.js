const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-links a[data-section]');
let threeLoadPromise = null;

const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('active'));
      const l = document.querySelector(`.nav-links a[data-section="${e.target.id}"]`);
      if (l) l.classList.add('active');
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => io.observe(s));

function ensureThreeLoaded() {
  if (window.THREE) return Promise.resolve();
  if (threeLoadPromise) return threeLoadPromise;
  threeLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Three.js'));
    document.head.appendChild(script);
  });
  return threeLoadPromise;
}

function openPoster() {
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  ensureThreeLoaded()
    .then(() => {
      if (window.initMeshViewerOnce) window.initMeshViewerOnce();
    })
    .catch(() => {
      if (window.initMeshViewerOnce) window.initMeshViewerOnce();
    });
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}

const openPosterBtn = document.getElementById('openPosterBtn');
if (openPosterBtn) {
  openPosterBtn.addEventListener('click', openPoster);
}

const closePosterBtn = document.getElementById('closePosterBtn');
if (closePosterBtn) {
  closePosterBtn.addEventListener('click', closeModal);
}

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

const lastUpdated = document.getElementById('lastUpdated');
if (lastUpdated) {
  const now = new Date();
  const dateText = now.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  lastUpdated.textContent = `Last updated ${dateText}`;
}
