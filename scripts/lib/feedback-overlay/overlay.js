(function () {
  if (window.__supervibeFeedbackInstalled) return;
  window.__supervibeFeedbackInstalled = true;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${window.location.host}/_feedback`);
  const pendingPayloads = [];
  let armed = false;
  let highlight = null;

  ws.addEventListener('open', () => {
    while (pendingPayloads.length > 0 && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(pendingPayloads.shift()));
    }
  });

  function el(tag, props, children) {
    const e = document.createElement(tag);
    if (props) Object.assign(e, props);
    if (children) children.forEach(c => e.appendChild(c));
    return e;
  }

  const button = el('button', {
    id: 'supervibe-fb-toggle',
    textContent: 'Feedback',
    title: 'Click to comment on a region and send it to the agent',
    ariaLabel: 'Send design feedback to the agent',
  });
  document.documentElement.appendChild(button);

  const panel = el('div', { id: 'supervibe-fb-panel' });
  panel.style.display = 'none';
  document.documentElement.appendChild(panel);

  function arm() {
    armed = true;
    button.textContent = 'Cancel';
    document.documentElement.style.cursor = 'crosshair';
  }
  function disarm() {
    armed = false;
    button.textContent = 'Feedback';
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
    if (target === button || target.closest('#supervibe-fb-panel')) return;
    if (highlight) highlight.remove();
    const r = target.getBoundingClientRect();
    highlight = el('div', { id: 'supervibe-fb-highlight' });
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
    if (e.target === button || e.target.closest('#supervibe-fb-panel')) return;
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
    panel.appendChild(el('div', { className: 'supervibe-fb-meta', textContent: sel }));
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
    const send = el('button', { textContent: 'Send to agent', className: 'supervibe-fb-send' });
    panel.appendChild(send);
    panel.style.display = 'block';

    send.addEventListener('click', () => {
      const payload = {
        prototypeSlug: window.__supervibePrototypeSlug || 'unknown',
        viewport: window.__supervibeViewport || `${window.innerWidth}`,
        region: { selector: sel, x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        comment: textarea.value.trim(),
        type: typeSel.value,
        url: window.location.href,
      };
      if (!payload.comment) return;
      const sent = sendFeedbackPayload(payload);
      if (!sent) {
        flashAck('Feedback unavailable');
        return;
      }
      panel.style.display = 'none';
      disarm();
      flashAck(ws.readyState === WebSocket.OPEN ? 'Feedback sent' : 'Feedback queued');
    });
  }

  function sendFeedbackPayload(payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      pendingPayloads.push(payload);
      return true;
    }
    return false;
  }

  function flashAck(message) {
    const ack = el('div', { id: 'supervibe-fb-ack', textContent: message });
    document.documentElement.appendChild(ack);
    setTimeout(() => ack.remove(), 1500);
  }
})();
