/* pokko.js — chat widget: open/close, blink animation, streaming answers from /api/chat */
(function () {
  'use strict';
  var root = document.getElementById('pokko');
  if (!root) return;

  var fab = document.getElementById('pokkoFab');
  var win = document.getElementById('pokkoWin');
  var closeBtn = document.getElementById('pokkoClose');
  var log = document.getElementById('pokkoLog');
  var chips = document.getElementById('pokkoChips');
  var form = document.getElementById('pokkoForm');
  var input = document.getElementById('pokkoInput');
  var send = document.getElementById('pokkoSend');
  var img = document.getElementById('pokkoImg');
  var tip = document.getElementById('pokkoTip');

  var MAX = 500;
  var history = []; // {role: 'user' | 'assistant', content}
  var busy = false;
  var greeted = false;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- blink ---------- */
  var OPEN = '/pokko/pokko.png', SHUT = '/pokko/pokko-blink.png';
  if (!reduced) {
    new Image().src = SHUT;
    (function blink() {
      setTimeout(function () {
        img.src = SHUT;
        setTimeout(function () { img.src = OPEN; blink(); }, 150);
      }, 3000 + Math.random() * 3500);
    })();
  }

  /* hide the speech tip after a few seconds */
  var tipTimer = setTimeout(function () { tip.hidden = true; }, 9000);
  function hideTip() { clearTimeout(tipTimer); tip.hidden = true; }

  /* ---------- open / close ---------- */
  function setOpen(open) {
    root.dataset.open = open ? 'true' : 'false';
    win.hidden = !open;
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      hideTip();
      if (!greeted) {
        greeted = true;
        addMsg('bot', "Meow! I'm Pokko, Harshit's assistant cat. Ask me about his projects, experience, skills, or how to reach him.");
      }
      setTimeout(function () { input.focus(); }, 0);
    } else {
      fab.focus();
    }
  }
  fab.addEventListener('click', function () { setOpen(win.hidden); });
  closeBtn.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !win.hidden) setOpen(false);
  });

  /* ---------- messages ---------- */
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  /* turn URLs and email addresses into safe links (built with DOM nodes, never innerHTML) */
  function fill(el, text) {
    el.textContent = '';
    var re = /(https?:\/\/[^\s<>"]+|[\w.+-]+@[\w-]+\.[\w.-]+)/g, last = 0, m;
    while ((m = re.exec(text))) {
      var raw = m[0], trail = (raw.match(/[.,;:!?)\]]+$/) || [''])[0], link = raw.slice(0, raw.length - trail.length);
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement('a');
      var isMail = link.indexOf('@') > -1 && !/^https?:/.test(link);
      a.href = isMail ? 'mailto:' + link : link;
      a.textContent = link;
      if (!isMail) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      el.appendChild(a);
      if (trail) el.appendChild(document.createTextNode(trail));
      last = m.index + raw.length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }

  function addMsg(who, text) {
    var el = document.createElement('div');
    el.className = 'msg ' + who;
    if (text) fill(el, text);
    log.appendChild(el);
    scrollDown();
    return el;
  }

  function typing(el) {
    el.classList.add('typing');
    el.innerHTML = '<span class="dots" aria-label="Pokko is thinking"><i></i><i></i><i></i></span>';
  }

  function setBusy(b) {
    busy = b;
    send.disabled = b;
    input.disabled = b;
    if (!b) input.focus();
  }

  /* ---------- ask ---------- */
  async function ask(question) {
    question = question.trim();
    if (!question || busy) return;
    if (question.length > MAX) { addMsg('bot err', 'Please keep your question under ' + MAX + ' characters.'); return; }

    chips.hidden = true;
    addMsg('me', question);
    history.push({ role: 'user', content: question });
    var bubble = addMsg('bot', '');
    typing(bubble);
    setBusy(true);

    var answer = '';
    try {
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-6) }),
      });

      if (!res.ok || !res.body) {
        var msg = 'Pokko is having trouble right now. Please try again later.';
        try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
        bubble.classList.remove('typing'); bubble.classList.add('err');
        fill(bubble, msg);
        history.pop();
        return;
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      for (;;) {
        var chunk = await reader.read();
        if (chunk.done) break;
        answer += decoder.decode(chunk.value, { stream: true });
        bubble.classList.remove('typing');
        bubble.textContent = answer;
        scrollDown();
      }
      answer += decoder.decode();
      answer = answer.trim();
      if (!answer) answer = "Meow? I couldn't answer that one. Try asking it differently.";
      bubble.classList.remove('typing');
      fill(bubble, answer);
      history.push({ role: 'assistant', content: answer });
    } catch (e) {
      bubble.classList.remove('typing'); bubble.classList.add('err');
      fill(bubble, "I can't connect right now. Please check your connection and try again.");
      history.pop();
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value;
    input.value = '';
    ask(q);
  });
  chips.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-q]');
    if (b) ask(b.getAttribute('data-q'));
  });
})();
