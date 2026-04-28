(function () {
  if (window.__evolveFeedbackInstalled) return;
  window.__evolveFeedbackInstalled = true;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${window.location.host}/_feedback`);
  let armed = false;
  let highlight = null;

  function el(tag, props, children) {
    const e = document.createElement(tag);
    if (props) Object.assign(e, props);
    if (children) children.forEach(c => e.appendChild(c));
    return e;
  }

  const button = el('button', {
    id: 'evolve-fb-toggle',
    textContent: '💬',
    title: 'Click to comment on a region (Evolve feedback)',
  });
  document.documentElement.appendChild(button);

  const panel = el('div', { id: 'evolve-fb-panel' });
  panel.style.display = 'none';
  document.documentElement.appendChild(panel);

  function arm() {
    armed = true;
    button.textContent = '✕';
    document.documentElement.style.cursor = 'crosshair';
  }
  function disarm() {
    armed = false;
    button.textContent = '💬';
    document.documentElement.style.cursor = '';
    if (highlight) { highlight.remove(); highlight = null; }
  }

  button.addEventListener('click', e => {
    e.stopPropagation();
    if (armed) disarm(); else arm();
  });

  function selectorOf(el) {
    if (!el || !el.tagName) return 'unknown';
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === 'string') {
      return el.tagName.toLowerCase() + '.' + el.className.trim().split(/\s+/).join('.');
    }
    return el.tagName.toLowerCase();
  }

  document.addEventListener('mousemove', e => {
    if (!armed) return;
    const target = e.target;
    if (target === button || target.closest('#evolve-fb-panel')) return;
    if (highlight) highlight.remove();
    const r = target.getBoundingClientRect();
    highlight = el('div', { id: 'evolve-fb-highlight' });
    Object.assign(highlight.style, {
      position: 'fixed',
      left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px',
      pointerEvents: 'none',
    });
    document.documentElement.appendChild(highlight);
  });

  document.addEventListener('click', e => {
    if (!armed) return;
    if (e.target === button || e.target.closest('#evolve-fb-panel')) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    const r = target.getBoundingClientRect();
    showCommentBox(target, r);
  }, true);

  function showCommentBox(target, rect) {
    panel.innerHTML = '';
    const sel = selectorOf(target);
    panel.appendChild(el('h3', { textContent: 'Comment on element' }));
    panel.appendChild(el('div', { className: 'evolve-fb-meta', textContent: sel }));
    const textarea = el('textarea', { rows: 4, placeholder: 'What would you like to change?' });
    panel.appendChild(textarea);
    const typeSel = el('select');
    ['visual', 'layout', 'copy', 'motion', 'a11y'].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSel.appendChild(opt);
    });
    const lab = el('label', { textContent: 'Kind: ' });
    lab.appendChild(typeSel);
    panel.appendChild(lab);
    const send = el('button', { textContent: 'Send to agent', className: 'evolve-fb-send' });
    panel.appendChild(send);
    panel.style.display = 'block';

    send.addEventListener('click', () => {
      const payload = {
        prototypeSlug: window.__evolvePrototypeSlug || 'unknown',
        viewport: window.__evolveViewport || `${window.innerWidth}`,
        region: { selector: sel, x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        comment: textarea.value.trim(),
        type: typeSel.value,
        url: window.location.href,
      };
      if (!payload.comment) return;
      ws.send(JSON.stringify(payload));
      panel.style.display = 'none';
      disarm();
      flashAck();
    });
  }

  function flashAck() {
    const ack = el('div', { id: 'evolve-fb-ack', textContent: '✓ Feedback sent' });
    document.documentElement.appendChild(ack);
    setTimeout(() => ack.remove(), 1500);
  }
})();
