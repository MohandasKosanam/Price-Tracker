(function () {
  'use strict';

  const status = document.getElementById('glass-status');
  const engine = window.LocalPriceVisuals?.engine;
  if (engine?.renderer?.fluid.available) status.textContent = 'WebGL2 shader + GPU wave field';
  else status.textContent = 'CSS fallback · GPU render target unavailable';

  const toggle = document.getElementById('theme-toggle');
  toggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    toggle.textContent = theme === 'dark' ? 'Switch to light' : 'Switch to dark';
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#09121e' : '#e8edf2';
    document.documentElement.dispatchEvent(new Event('themechange'));
  });

  const nav = document.querySelector('.lab-nav');
  const indicator = document.getElementById('lab-indicator');
  const navItems = [...document.querySelectorAll('.lab-nav-item')];
  function moveIndicator(active) {
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft - nav.clientLeft - 6}px)`;
  }
  navItems.forEach((item) => item.addEventListener('click', () => {
    navItems.forEach((other) => other.classList.toggle('active', other === item));
    moveIndicator(item);
  }));
  moveIndicator(navItems[0]);
  window.addEventListener('resize', () => moveIndicator(navItems.find((item) => item.classList.contains('active'))));

  const waveButton = document.getElementById('wave-button');
  const waveState = document.getElementById('wave-state');
  waveButton.addEventListener('click', () => {
    const rect = waveButton.getBoundingClientRect();
    engine?.createImpulse(rect.left + rect.width * .5, rect.top + rect.height * .5, .9);
    waveState.textContent = 'Wave propagating';
    window.setTimeout(() => { waveState.textContent = 'Settled'; }, 1300);
  });

  const backdrop = document.getElementById('lab-modal-backdrop');
  const open = document.getElementById('open-lab-modal');
  const close = document.getElementById('close-lab-modal');
  open.addEventListener('click', () => {
    backdrop.classList.remove('is-hidden');
    backdrop.setAttribute('aria-hidden', 'false');
    close.focus();
  });
  function closeModal() {
    backdrop.classList.add('is-hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    open.focus();
  }
  close.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
  document.getElementById('modal-ripple').addEventListener('click', () => {
    const panel = backdrop.querySelector('.modal');
    const rect = panel.getBoundingClientRect();
    engine?.createImpulse(rect.left + rect.width * .5, rect.top + rect.height * .5, .86);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !backdrop.classList.contains('is-hidden')) closeModal(); });
})();
