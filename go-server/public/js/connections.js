// connections.js — Manage Sessions panel for the Manage Sessions Modal.
// Renders into #ns-manage-host. No tabs: the modal body IS the list, with
// an "Add" button in the toolbar. Edit/Delete/Add open nested frosted-glass
// modals (reusing .settings-modal with data-open="true"). No description/
// color fields. SVG elements created with the SVG namespace so icons render.

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, ...children) {
    const node = tag === 'svg' || tag === 'line' || tag === 'rect' || tag === 'path' || tag === 'circle' || tag === 'polyline'
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);
    attrs = attrs || {};
    for (const k in attrs) {
      const v = attrs[k];
      if (v === false || v == null) continue;
      if (k === 'class') node.setAttribute('class', v);
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v === true) {
        node.setAttribute(k, '');
      } else {
        node.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  // X-icon SVG (used in nested modal headers).
  function xIcon() {
    return el('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      el('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
      el('line', { x1: '6', y1: '6', x2: '18', y2: '18' }));
  }

  async function api(method, path, body) {
    const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!r.ok) {
      const msg = (data && data.error) || ('HTTP ' + r.status);
      const err = new Error(msg);
      err.status = r.status;
      throw err;
    }
    return data;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Open a nested frosted-glass modal. data-open="true" so the CSS
  // opacity/transform transitions reveal scrim + dialog (default opacity:0).
  function openNestedModal(title, buildBody, footerButtons) {
    closeNestedModal();
    const overlay = el('div', { id: 'conn-nested-overlay', class: 'settings-modal', 'data-open': 'true' });
    overlay.style.display = 'grid';
    overlay.style.zIndex = '1100';
    const scrim = el('div', { class: 'settings-scrim' });
    const dialog = el('div', { class: 'settings-dialog', style: 'max-width:480px;' });

    const header = el('div', { class: 'settings-header' },
      el('div', { class: 'settings-copy' },
        el('span', { class: 'settings-kicker' }, 'CONNECTION'),
        el('h2', { class: 'settings-title' }, title)),
      el('button', { class: 'settings-close-button', title: 'Close', onclick: closeNestedModal }, xIcon()));

    const body = el('div', { class: 'settings-body' });
    buildBody(body);

    const footer = el('div', { class: 'settings-footer' },
      el('div', { class: 'settings-footer-actions' },
        el('button', { class: 'chrome-button', onclick: closeNestedModal }, 'Cancel'),
        ...footerButtons));

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(scrim);
    overlay.appendChild(dialog);
    scrim.addEventListener('click', closeNestedModal);
    document.body.appendChild(overlay);
    return dialog;
  }

  function closeNestedModal() {
    const m = document.getElementById('conn-nested-overlay');
    if (m) m.remove();
  }

  function showErr(dialog, msg) {
    let box = dialog.querySelector('.conn-form-error');
    if (!box) {
      box = el('div', { class: 'conn-form-error', style: 'display:none' });
      dialog.insertBefore(box, dialog.children[1]); // after header
    }
    box.textContent = msg;
    box.style.display = '';
  }

  // Build the connection form fields (shared by Add and Edit).
  // Returns { fieldMap, getPayload } where getPayload() reads current values.
  function buildConnForm(parentEl, values) {
    values = values || {};
    const fieldMap = {};
    const grid = el('div', { class: 'settings-grid' });

    function field(label, name, value, inputAttrs) {
      const input = el('input', Object.assign(
        { class: 'toolbar-input', name: name, value: value || '' }, inputAttrs || {}));
      fieldMap[name] = input;
      grid.appendChild(el('div', { class: 'compact-field' },
        el('label', { class: 'toolbar-label' }, label), input));
    }

    field('CONNECTION NAME', 'name', values.name, { placeholder: 'My Server' });

    // Protocol chips (mirrors the old Add tab)
    const protoWrap = el('div', { class: 'settings-transport' },
      el('div', { class: 'settings-transport-copy' }, el('span', { class: 'toolbar-label' }, 'PROTOCOL')),
      el('div', { class: 'workspace-switcher' },
        ['ssh', 'telnet'].map(p => el('button', {
          class: 'workspace-chip' + (p === (values.protocol || 'ssh') ? ' is-active' : ''),
          'data-proto': p,
          onclick: (e) => {
            grid.querySelectorAll('[data-proto]').forEach(b => b.classList.remove('is-active'));
            e.currentTarget.classList.add('is-active');
          }
        }, p.toUpperCase()))));
    grid.appendChild(protoWrap);

    field('HOST', 'host', values.host, { placeholder: '192.168.1.100' });
    field('PORT', 'port', values.port, { type: 'number', placeholder: '22' });
    field('USERNAME', 'username', values.username, { placeholder: 'root' });
    field('PASSWORD', 'password', values.password || values.password_encrypted || '', { type: 'password', placeholder: '••••••••' });

    parentEl.appendChild(grid);

    return {
      fieldMap,
      getPayload: () => {
        const protoBtn = grid.querySelector('[data-proto].is-active');
        return {
          name: fieldMap.name.value.trim(),
          protocol: (protoBtn && protoBtn.dataset.proto) || (values.protocol || 'ssh'),
          host: fieldMap.host.value,
          port: parseInt(fieldMap.port.value, 10) || null,
          username: fieldMap.username.value,
          password: fieldMap.password.value,
        };
      }
    };
  }

  class ConnectionsManager {
    constructor() {
      this.connections = [];
      this.parentEl = null;
    }

    async mount(parentEl) {
      this.parentEl = parentEl;
      await this.refresh();
    }

    async refresh() {
      this.parentEl.innerHTML = '';
      try {
        this.connections = await api('GET', '/api/connections') || [];
      } catch (err) {
        this.parentEl.appendChild(el('div', { class: 'conn-error' },
          'Failed to load connections: ' + escapeHtml(err.message)));
        return;
      }
      this.render();
    }

    render() {
      const self = this;

      if (this.connections.length === 0) {
        self.parentEl.appendChild(el('div', { class: 'conn-empty' },
          'No saved connections yet. Click "Add" to create one.'));
        return;
      }

      const header = el('div', { class: 'conn-row conn-header' },
        el('span', { class: 'conn-col-name' }, 'NAME'),
        el('span', { class: 'conn-col-host' }, 'HOST'),
        el('span', { class: 'conn-col-user' }, 'USER'),
        el('span', { class: 'conn-col-actions' }, ''));
      self.parentEl.appendChild(header);

      for (const c of this.connections) {
        self.parentEl.appendChild(el('div', { class: 'conn-row', 'data-id': String(c.id) },
          el('span', { class: 'conn-col-name' }, escapeHtml(c.name)),
          el('span', { class: 'conn-col-host' },
            escapeHtml(c.host || '—'),
            c.port ? ':' + c.port : ''),
          el('span', { class: 'conn-col-user' }, escapeHtml(c.username || '—')),
          el('span', { class: 'conn-col-actions' },
            el('button', { class: 'conn-btn-icon', title: 'Edit',
              onclick: () => self.openEdit(c) }, '✎'),
            el('button', { class: 'conn-btn-icon conn-btn-danger', title: 'Delete',
              onclick: () => self.confirmDelete(c) }, '🗑'))
        ));
      }
    }

    openAdd() {
      const self = this;
      const dialog = openNestedModal('New connection', (body) => {
        buildConnForm(body, { protocol: 'ssh' });
      }, [
        el('button', { class: 'chrome-button is-primary', id: 'conn-add-save' }, 'Create')
      ]);

      document.getElementById('conn-add-save').addEventListener('click', async () => {
        const form = buildConnForm_getter(dialog);
        const payload = form.getPayload();
        if (!payload.name) { showErr(dialog, 'Name is required'); return; }
        const btn = document.getElementById('conn-add-save');
        btn.disabled = true; btn.textContent = 'Creating…';
        try {
          await api('POST', '/api/connections', payload);
          closeNestedModal();
          await self.refresh();
        } catch (err) {
          btn.disabled = false; btn.textContent = 'Create';
          showErr(dialog, err.message);
        }
      });
    }

    openEdit(c) {
      const self = this;
      let form;
      const dialog = openNestedModal('Edit connection', (body) => {
        form = buildConnForm(body, c);
      }, [
        el('button', { class: 'chrome-button is-primary', id: 'conn-edit-save' }, 'Save')
      ]);

      document.getElementById('conn-edit-save').addEventListener('click', async () => {
        const payload = form.getPayload();
        if (!payload.name) { showErr(dialog, 'Name is required'); return; }
        const btn = document.getElementById('conn-edit-save');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
          await api('PUT', '/api/connections/' + c.id, payload);
          closeNestedModal();
          await self.refresh();
        } catch (err) {
          btn.disabled = false; btn.textContent = 'Save';
          showErr(dialog, err.message);
        }
      });
    }

    confirmDelete(c) {
      const self = this;
      const dialog = openNestedModal('Delete connection', (body) => {
        body.appendChild(el('div', { class: 'conn-confirm' },
          el('p', { class: 'conn-confirm-text' },
            'Delete ',
            el('strong', {}, escapeHtml(c.name)),
            '? This cannot be undone.')));
      }, [
        el('button', { class: 'chrome-button is-primary', id: 'conn-delete-confirm' }, 'Delete')
      ]);

      document.getElementById('conn-delete-confirm').addEventListener('click', async () => {
        const btn = document.getElementById('conn-delete-confirm');
        btn.disabled = true; btn.textContent = 'Deleting…';
        try {
          await api('DELETE', '/api/connections/' + c.id);
          closeNestedModal();
          await self.refresh();
        } catch (err) {
          btn.disabled = false; btn.textContent = 'Delete';
          showErr(dialog, err.message);
        }
      });
    }
  }

  // Helper: re-extract the form payload from a dialog that was already built.
  // This is a fallback for openAdd where the form builder wasn't captured.
  function buildConnForm_getter(dialog) {
    const grid = dialog.querySelector('.settings-grid');
    const inputs = {};
    grid.querySelectorAll('input[name]').forEach(i => { inputs[i.name] = i; });
    const protoBtn = grid.querySelector('[data-proto].is-active');
    return {
      getPayload: () => ({
        name: inputs.name.value.trim(),
        protocol: (protoBtn && protoBtn.dataset.proto) || 'ssh',
        host: inputs.host.value,
        port: parseInt(inputs.port.value, 10) || null,
        username: inputs.username.value,
        password: inputs.password.value,
      })
    };
  }

  // Mount the manager when the modal opens. Also wire the Add button
  // in the modal header.
  function init() {
    let mgr = null;
    const host = document.getElementById('ns-manage-host');
    const modal = document.getElementById('newSessionModal');
    const addBtn = document.getElementById('nsAddBtn');

    function getMgr() {
      if (!mgr) mgr = new ConnectionsManager();
      return mgr;
    }

    function tryMount() {
      if (!host) return;
      getMgr().mount(host);
    }

    // Wire Add button (in modal header)
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const m = getMgr();
        if (!m.parentEl) m.mount(host);
        m.openAdd();
      });
    }

    // Mount when modal becomes visible (app.js toggles display + data-open).
    if (modal && window.MutationObserver) {
      const obs = new MutationObserver(() => {
        if (modal.style.display !== 'none' && !modal.hasAttribute('hidden')) {
          tryMount();
        }
      });
      obs.observe(modal, { attributes: true, attributeFilter: ['style', 'hidden', 'data-open'] });
    }

    // Also try mounting on DOMContentLoaded in case the modal is already open.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryMount);
    } else {
      tryMount();
    }
  }

  init();
})();
