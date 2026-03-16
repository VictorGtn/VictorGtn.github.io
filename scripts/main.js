const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-links a[data-section]');

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

function openPoster() {
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
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
