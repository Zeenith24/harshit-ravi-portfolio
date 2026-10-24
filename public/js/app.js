/* app.js — theme, nav, scroll effects, sprite animation, small interactions */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* ---------- EDIT ME ---------- */
  const CONFIG = {
    name: 'HARSHIT RAVI',
    role: 'AI & ML Engineer',
    email: 'harshitraviofficial01@gmail.com'
  };

  /* ---------- pixel icons ---------- */
  $$('[data-icon]').forEach(el => { el.innerHTML = PIXEL.iconSvg(el.dataset.icon); });

  /* ---------- sprites ---------- */
  const mounted = [];
  $$('canvas[data-sprite]').forEach(cv => {
    const def = PIXEL.sprites[cv.dataset.sprite];
    if (!def) return;
    const item = { cv, def, key: null, visible: true };
    def.build(0).render(cv);
    item.key = def.key(0);
    mounted.push(item);
  });
  let tick = 0;
  if (!reduced && 'IntersectionObserver' in window) {
    const vis = new IntersectionObserver(es => es.forEach(e => {
      const it = mounted.find(m => m.cv === e.target); if (it) it.visible = e.isIntersecting;
    }), { rootMargin: '80px' });
    mounted.forEach(m => vis.observe(m.cv));
  }
  if (!reduced) {
    setInterval(() => {
      if (document.hidden) return;
      tick++;
      mounted.forEach(m => {
        if (!m.visible) return;
        const k = m.def.key(tick);
        if (k !== m.key) { m.key = k; m.def.build(tick).render(m.cv); }
      });
    }, 150);
  }

  /* ---------- hero video: respect reduced motion ---------- */
  const hv = $('.hero-video');
  if (hv && reduced) { hv.removeAttribute('autoplay'); hv.pause(); }

  /* ---------- hobbies: one big icon that cycles on its own ---------- */
  const HOBBIES = [['bike', 'Cycling'], ['swim', 'Swimming'], ['book', 'Reading'], ['travel', 'Travelling'], ['music', 'Music']];
  const cyIcon = $('#cyIcon'), cyName = $('#cyName'), dots = $$('.cy-dots button');
  let cyI = 0, cyTimer = null;
  function showHobby(i) {
    cyI = (i + HOBBIES.length) % HOBBIES.length;
    cyIcon.innerHTML = PIXEL.iconSvg(HOBBIES[cyI][0]);
    const svg = cyIcon.firstChild, v = svg.viewBox.baseVal;
    svg.style.width = v.width * 5 + 'px'; svg.style.height = v.height * 5 + 'px';   // exact 5px per art pixel
    cyName.textContent = HOBBIES[cyI][1];
    dots.forEach((d, k) => d.classList.toggle('on', k === cyI));
    cyIcon.classList.remove('pop'); void cyIcon.offsetWidth; cyIcon.classList.add('pop');
  }
  function startCycle() { stopCycle(); if (!reduced) cyTimer = setInterval(() => showHobby(cyI + 1), 1800); }
  function stopCycle() { clearInterval(cyTimer); }
  dots.forEach(d => d.addEventListener('click', () => { showHobby(+d.dataset.i); startCycle(); }));
  const cy = $('.cycler');
  cy.addEventListener('mouseenter', stopCycle); cy.addEventListener('mouseleave', startCycle);
  cy.addEventListener('focusin', stopCycle); cy.addEventListener('focusout', startCycle);
  showHobby(0); startCycle();

  /* ---------- theme ---------- */
  const themeBtn = $('#themeBtn');
  function setTheme(t, save) {
    root.setAttribute('data-theme', t);
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    if (save) { try { localStorage.setItem('theme', t); } catch (e) {} }
  }
  setTheme(root.getAttribute('data-theme') || 'light', false);
  themeBtn.addEventListener('click', () => setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    let saved = null; try { saved = localStorage.getItem('theme'); } catch (err) {}
    if (!saved) setTheme(e.matches ? 'dark' : 'light', false);
  });

  /* ---------- mobile menu ---------- */
  const burger = $('#burger'), menu = $('#menu');
  function menuState(open) {
    menu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  burger.addEventListener('click', () => menuState(!menu.classList.contains('open')));
  menu.addEventListener('click', e => { if (e.target.closest('a')) menuState(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') menuState(false); });

  /* ---------- scroll: progress bar + scroll-spy ---------- */
  const bar = $('#bar'), links = $$('[data-spy]');
  const sections = ['home', 'projects', 'about', 'contact'].map(id => document.getElementById(id));
  let ticking = false;
  function onScroll() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? scrollY / max : 0;
    bar.style.width = (Math.round(pct * 50) * 2) + '%';       // moves in chunky 2% steps
    const line = scrollY + innerHeight * 0.35;
    let cur = sections[0].id;
    sections.forEach(s => { if (s.offsetTop <= line) cur = s.id; });
    links.forEach(a => {
      const on = a.dataset.spy === cur;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- reveal on scroll + count-up ---------- */
  function countUp(el) {
    const to = +el.dataset.count;
    if (reduced) { el.textContent = to; return; }
    let n = 0; const step = Math.max(1, Math.round(to / 14));
    const id = setInterval(() => { n = Math.min(to, n + step); el.textContent = n; if (n >= to) clearInterval(id); }, 60);
  }
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $$('[data-count]', e.target).forEach(countUp);
      io.unobserve(e.target);
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
    $$('[data-count]').forEach(countUp);
  }

  /* ---------- toast ---------- */
  const toast = $('#toast'); let tt;
  function say(msg) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  /* ---------- contact ---------- */
  $('#mailLink').textContent = CONFIG.email; $('#mailLink').href = 'mailto:' + CONFIG.email;
  $('#copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(CONFIG.email); say('Email copied!'); }
    catch (e) { say(CONFIG.email); }
  });
  $('#form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const subject = encodeURIComponent('Hello from ' + f.name.value);
    const body = encodeURIComponent(f.msg.value + '\n\n— ' + f.name.value + ' (' + f.email.value + ')');
    location.href = 'mailto:' + CONFIG.email + '?subject=' + subject + '&body=' + body;
    $('#formHint').textContent = 'Thanks! Your email app should be opening now.';
    say('Opening your email app...');
  });

  /* ---------- misc ---------- */
  const y = new Date().getFullYear();
  $('#yr').textContent = y; $('#yr2').textContent = y;
  $$('.hl, .f-name').forEach(el => { el.textContent = CONFIG.name; });
  $$('.brand-name').forEach(el => { el.textContent = CONFIG.name.replace(/ /g, ' '); });
  document.title = CONFIG.name.replace(/\b(\w)(\w*)/g, (m, f, r) => f + r.toLowerCase()) + ' — ' + CONFIG.role;
})();

