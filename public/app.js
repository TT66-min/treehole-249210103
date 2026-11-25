'use strict';

/* 一隅 · 树洞 — 前端脚本（原生 JS，无框架依赖） */

(function () {
  const BASE = (document.body.dataset.base || '/').replace(/\/$/, ''); // 形如 /249210103
  const API = {
    list: BASE + '/api/messages',
    create: BASE + '/api/messages',
    like: BASE + '/api/like',
  };

  const form = document.getElementById('message-form');
  const nicknameInput = document.getElementById('nickname');
  const contentInput = document.getElementById('content');
  const errorBox = document.getElementById('form-error');
  const counter = document.getElementById('counter');
  const listEl = document.getElementById('message-list');
  const emptyEl = document.getElementById('empty-state');
  const countEl = document.getElementById('feed-count');
  const toastEl = document.getElementById('toast');
  const submitBtn = form.querySelector('.btn-submit');

  const MAX_NICK = 12;
  const MAX_CONTENT = 300;
  const LIKED_KEY = 'treehole-liked-' + BASE;

  const PIN_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>';

  /* -------------- 工具 -------------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400 && d.getDate() === now.getDate()) {
      return '今天 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    const sameYear = d.getFullYear() === now.getFullYear();
    const md = String(d.getMonth() + 1).padStart(2, '0') + '月' + String(d.getDate()).padStart(2, '0') + '日';
    return sameYear ? md : d.getFullYear() + '年' + md;
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function showError(msg, target) {
    errorBox.textContent = msg;
    errorBox.dataset.visible = 'true';
    const field = target || form;
    field.classList.remove('shake');
    // 强制重排后再加动画，保证连续报错也能看到抖动
    void field.offsetWidth;
    field.classList.add('shake');
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.dataset.visible = 'false';
  }

  function getLiked() {
    try {
      return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || '[]'));
    } catch (e) {
      return new Set();
    }
  }

  function saveLiked(set) {
    try {
      localStorage.setItem(LIKED_KEY, JSON.stringify([...set]));
    } catch (e) {
      /* 忽略隐私模式下的写入失败 */
    }
  }

  /* -------------- 渲染 -------------- */
  function cardHtml(msg) {
    const likedSet = getLiked();
    const liked = likedSet.has(msg.id);
    const placeText = msg.province === '定位中' ? '定位中…' : msg.province || '未知';
    return `
      <article class="card" data-id="${msg.id}">
        <div class="card-head">
          <span class="avatar" aria-hidden="true">${escapeHtml(msg.nickname.slice(0, 1))}</span>
          <span class="nick">${escapeHtml(msg.nickname)}</span>
          <span class="time">${escapeHtml(formatTime(msg.time))}</span>
        </div>
        <p class="content">${escapeHtml(msg.content)}</p>
        <div class="card-foot">
          <span class="place" data-place="${msg.id}">
            ${PIN_SVG}
            来自 ${escapeHtml(placeText)}
          </span>
          <button class="like-btn${liked ? ' is-liked' : ''}" type="button" data-like="${msg.id}" aria-label="给这条留言点赞">
            <span class="thumb">👍</span>
            <span class="like-count">${msg.likes}</span>
          </button>
        </div>
      </article>`;
  }

  function renderList(messages) {
    if (!messages.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      countEl.textContent = '';
      return;
    }
    emptyEl.hidden = true;
    listEl.innerHTML = messages.map(cardHtml).join('');
    // 轻微错峰出现，避免一整排同时弹出来
    [...listEl.children].forEach((el, i) => {
      el.style.animationDelay = Math.min(i, 8) * 0.05 + 's';
    });
    countEl.textContent = '共 ' + messages.length + ' 条';
  }

  /* -------------- 数据 -------------- */
  async function loadMessages() {
    try {
      const res = await fetch(API.list, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '加载失败');
      renderList(data.messages || []);
    } catch (err) {
      listEl.innerHTML = '<p class="loading">心事没能捞上来，稍后刷新试试……</p>';
      console.error(err);
    }
  }

  /* 省份是后台异步解析的，这里静默补齐，不打断用户操作 */
  async function patchProvinces(round) {
    try {
      const res = await fetch(API.list, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      let pending = false;
      (data.messages || []).forEach((m) => {
        const el = listEl.querySelector('[data-place="' + m.id + '"]');
        if (!el) return;
        if (m.province === '定位中') {
          pending = true;
        } else {
          el.innerHTML = PIN_SVG + ' 来自 ' + escapeHtml(m.province);
        }
      });
      if (pending && (round || 0) < 4) setTimeout(() => patchProvinces((round || 0) + 1), 2000);
    } catch (err) {
      /* 静默失败 */
    }
  }

  async function submitMessage(event) {
    event.preventDefault();
    const nickname = nicknameInput.value.trim();
    const content = contentInput.value.trim();

    /* 输入校验：未填则不发送请求 */
    if (!nickname && !content) {
      showError('昵称和内容都还没写呢，留下点什么再投吧。', nicknameInput);
      nicknameInput.focus();
      return;
    }
    if (!nickname) {
      showError('还差一个昵称 —— 随便起一个就好。', nicknameInput);
      nicknameInput.focus();
      return;
    }
    if (!content) {
      showError('「想说的话」还空着，写一句再投进树洞吧。', contentInput);
      contentInput.focus();
      return;
    }
    if (nickname.length > MAX_NICK) {
      showError('昵称最多 ' + MAX_NICK + ' 个字。', nicknameInput);
      nicknameInput.focus();
      return;
    }
    if (content.length > MAX_CONTENT) {
      showError('内容最多 ' + MAX_CONTENT + ' 个字。', contentInput);
      contentInput.focus();
      return;
    }

    clearError();
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').textContent = '正在投递…';

    try {
      const res = await fetch(API.create, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ nickname, content }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '提交失败');

      const html = cardHtml(data.message);
      if (emptyEl.hidden === false) emptyEl.hidden = true;
      listEl.insertAdjacentHTML('afterbegin', html);
      const newest = listEl.firstElementChild;
      newest.style.animationDelay = '0s';

      form.reset();
      counter.textContent = '0';
      countEl.textContent = '共 ' + listEl.querySelectorAll('.card').length + ' 条';
      toast('风替你收好了 🌿');
      if (data.message.province === '定位中') setTimeout(() => patchProvinces(0), 1600);
    } catch (err) {
      showError(err.message || '投递失败，请稍后再试。');
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('.btn-text').textContent = '投进树洞';
    }
  }

  async function likeMessage(id, btn) {
    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';

    try {
      const res = await fetch(API.like, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: Number(id) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '点赞失败');

      /* 后端返回真实赞数，前端只更新数字，不刷新页面 */
      btn.querySelector('.like-count').textContent = data.likes;
      btn.classList.add('is-liked', 'pop');
      setTimeout(() => btn.classList.remove('pop'), 480);

      const liked = getLiked();
      liked.add(Number(id));
      saveLiked(liked);
    } catch (err) {
      toast(err.message || '点赞失败，稍后再试');
    } finally {
      setTimeout(() => {
        btn.dataset.busy = '';
      }, 300);
    }
  }

  /* -------------- 事件绑定 -------------- */
  form.addEventListener('submit', submitMessage);

  contentInput.addEventListener('input', () => {
    counter.textContent = contentInput.value.length;
    if (errorBox.textContent) clearError();
  });

  nicknameInput.addEventListener('input', () => {
    if (errorBox.textContent) clearError();
  });

  // Ctrl / Cmd + Enter 快速投递
  [nicknameInput, contentInput].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  });

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-like]');
    if (btn) likeMessage(btn.dataset.like, btn);
  });

  loadMessages();
})();
