/* filters.js — show/hide project cards by category, then re-flow the bento grid */
(function () {
  'use strict';
  var bar = document.querySelector('.filters');
  var grid = document.querySelector('.proj-grid');
  if (!bar || !grid) return;
  var buttons = Array.prototype.slice.call(bar.querySelectorAll('button[data-filter]'));
  var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-category]'));

  function setSpan(el, span) {
    el.setAttribute('data-span', span);
    var body = el.querySelector('.proj');
    if (body) body.classList.toggle('wide', span >= 7);
  }

  /* same rule as index.astro: featured card and the GitHub strip full width, the rest pair up 7/5 then 5/7, a lone last card spans the row */
  function layout() {
    var visible = Array.prototype.slice.call(grid.children).filter(function (el) { return !el.hidden; });
    var rest = [];
    visible.forEach(function (el) {
      if (el.classList.contains('feat') || el.classList.contains('more')) setSpan(el, 12); else rest.push(el);
    });
    var n = rest.length;
    rest.forEach(function (el, k) {
      var span = (n % 2 === 1 && k === n - 1) ? 12 : (Math.floor(k / 2) % 2 === 0 ? [7, 5] : [5, 7])[k % 2];
      setSpan(el, span);
    });
  }

  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    var f = btn.getAttribute('data-filter');
    buttons.forEach(function (b) {
      var on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    cards.forEach(function (c) {
      c.hidden = f !== 'all' && c.getAttribute('data-category') !== f;
    });
    layout();
  });
})();
