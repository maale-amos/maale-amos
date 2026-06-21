/* common.js — shared header/footer/data loader for all pages */
(function () {
  'use strict';

  // --- Site config ---
  const SITE = {
    name: 'מעלה עמוס',
    yishuv: 'מעלה עמוס',
    contactEmail: '6742853@gmail.com',
    pages: [
      { href: 'index.html', label: 'דף הבית', icon: 'bi-house-door' },
      { href: 'about.html', label: 'אודות', icon: 'bi-info-circle' },
      { href: 'services.html', label: 'שירותים', icon: 'bi-grid' },
      { href: 'calendar.html', label: 'לוח שנה', icon: 'bi-calendar3' },
      { href: 'phones.html', label: 'ספר טלפונים', icon: 'bi-telephone' },
      { href: 'gallery.html', label: 'גלריה', icon: 'bi-images' },
      { href: 'contact.html', label: 'צור קשר', icon: 'bi-envelope' },
      { href: 'members.html', label: 'אזור חברים', icon: 'bi-person-lock' },
    ],
  };

  // --- Helpers ---
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  window.el = el;

  function currentPage() {
    const p = location.pathname.split('/').pop() || 'index.html';
    return p;
  }

  // --- Header ---
  function buildHeader() {
    const current = currentPage();
    const nav = el('nav', { id: 'site-nav' },
      SITE.pages.map(p => el('a', {
        href: p.href,
        class: current === p.href ? 'active' : ''
      }, [
        el('i', { class: 'bi ' + p.icon, style: 'margin-left:6px' }),
        p.label,
      ]))
    );

    const toggle = el('button', {
      class: 'menu-toggle',
      'aria-label': 'תפריט',
      onclick: () => nav.classList.toggle('open')
    }, '☰');

    const container = el('div', { class: 'container' }, [
      el('a', { href: 'index.html', class: 'brand' }, [
        el('span', { style: 'font-size:1.5rem' }, '⛰'),
        SITE.name,
      ]),
      toggle,
      nav,
    ]);

    const header = el('header', { class: 'site-header' }, container);
    document.body.insertBefore(header, document.body.firstChild);
  }

  // --- Footer ---
  function buildFooter() {
    const container = el('div', { class: 'container' }, [
      el('div', null, [
        el('h4', null, SITE.name),
        el('p', { class: 'muted' }, 'אתר הקהילה של מעלה עמוס'),
        el('p', null, [
          el('a', { href: 'mailto:' + SITE.contactEmail }, [
            el('i', { class: 'bi bi-envelope', style: 'margin-left:6px' }),
            SITE.contactEmail
          ])
        ]),
      ]),
      el('div', null, [
        el('h4', null, 'ניווט מהיר'),
        ...SITE.pages.slice(0, 5).map(p => el('div', null,
          el('a', { href: p.href }, p.label)
        )),
      ]),
      el('div', null, [
        el('h4', null, 'עוד'),
        ...SITE.pages.slice(5).map(p => el('div', null,
          el('a', { href: p.href }, p.label)
        )),
      ]),
    ]);

    const copyright = el('div', { class: 'copyright' },
      `© ${new Date().getFullYear()} ${SITE.name} · נבנה בקהילה`
    );

    const footer = el('footer', { class: 'site-footer' }, [container, copyright]);
    document.body.appendChild(footer);
  }

  // --- Data loader ---
  const DATA = { ready: false, news: [], residents: [], events: [], market: [], simchot: [], gemachim: [], ticker: [], announcements: [], phones: [] };
  window.MA_DATA = DATA;

  async function loadData() {
    try {
      const r = await fetch('data.json?t=' + Date.now());
      const d = await r.json();
      Object.assign(DATA, d);
    } catch (e) { console.error('data.json load fail', e); }
    try {
      const r = await fetch('phones.json?t=' + Date.now());
      DATA.phones = await r.json();
    } catch (e) { console.error('phones.json load fail', e); }
    DATA.ready = true;
    document.dispatchEvent(new CustomEvent('ma:data-ready', { detail: DATA }));
  }

  // --- Ticker ---
  function buildTicker() {
    if (!DATA.ticker || !DATA.ticker.length) return;
    const track = el('div', { class: 'ticker-track' });
    DATA.ticker.forEach(t => track.appendChild(el('span', null, t)));
    DATA.ticker.forEach(t => track.appendChild(el('span', null, t)));
    const ticker = el('div', { class: 'ticker', id: 'site-ticker' }, track);
    const main = document.querySelector('main');
    if (main) main.parentNode.insertBefore(ticker, main);
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', async () => {
    buildHeader();
    await loadData();
    buildTicker();
    buildFooter();
  });

  // --- Shared utility for date/hebrew ---
  window.MA = {
    formatDate(s) {
      try {
        const d = new Date(s);
        return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
      } catch { return s; }
    },
    escape(s) {
      if (s == null) return '';
      return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);
    },
    async onDataReady() {
      if (DATA.ready) return DATA;
      return new Promise(res => document.addEventListener('ma:data-ready', () => res(DATA), { once: true }));
    },
  };
})();
