'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./lib/db');
const { lookupProvince, normalize } = require('./lib/geo');

const STUDENT_ID = process.env.STUDENT_ID || '249210103';
const PORT = Number(process.env.PORT) || 3000;
const BASE = `/${STUDENT_ID}`;

const app = express();
app.set('trust proxy', true); // 云端/隧道场景取真实客户端 IP
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

db.seedIfEmpty();

const router = express.Router();

/* ---------- 页面 ---------- */
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

router.get('/', (req, res) => {
  // 把模板里的 %BASE% 换成 /学号/，保证子路由下 CSS/JS 路径不出错
  res.type('html').send(INDEX_HTML.split('%BASE%').join(`${BASE}/`));
});

/* ---------- API：留言列表 ---------- */
router.get('/api/messages', (req, res) => {
  res.json({ ok: true, messages: db.listMessages() });
});

/* ---------- API：提交留言 ---------- */
router.post('/api/messages', async (req, res) => {
  const nickname = String(req.body?.nickname ?? '').trim();
  const content = String(req.body?.content ?? '').trim();

  if (!nickname || !content) {
    return res.status(400).json({ ok: false, error: '昵称和内容都不能为空' });
  }
  if (nickname.length > 12) {
    return res.status(400).json({ ok: false, error: '昵称请控制在 12 个字以内' });
  }
  if (content.length > 300) {
    return res.status(400).json({ ok: false, error: '内容请控制在 300 个字以内' });
  }

  try {
    const ip = normalize(req.ip || req.socket?.remoteAddress || '');
    // 先落库保证提交速度，省份交给后台异步解析后回填
    const message = db.addMessage({
      nickname,
      content,
      ip,
      province: '定位中',
    });
    res.status(201).json({ ok: true, message });

    lookupProvince(ip)
      .then((geo) => db.updateProvince(message.id, geo.province))
      .catch(() => db.updateProvince(message.id, '未知'));
  } catch (err) {
    console.error('[post message]', err);
    res.status(500).json({ ok: false, error: '留言保存失败，请稍后再试' });
  }
});

/* ---------- API：点赞（AJAX，不刷新页面） ---------- */
router.post('/api/like', (req, res) => {
  const id = Number(req.body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: '无效的留言 ID' });
  }
  const updated = db.likeMessage(id);
  if (!updated) {
    return res.status(404).json({ ok: false, error: '留言不存在' });
  }
  res.json({ ok: true, id: updated.id, likes: updated.likes });
});

/* ---------- 静态资源（CSS / JS） ---------- */
router.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '1h' }));

app.use(BASE, router);

/* 根路径友好跳转 + 健康检查（Render 用） */
app.get('/', (req, res) => res.redirect(302, BASE));
app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.use((req, res) => res.status(404).send('页面不存在，请访问 ' + BASE));

app.listen(PORT, () => {
  console.log(`树洞已启动：http://localhost:${PORT}${BASE}`);
});
