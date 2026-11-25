'use strict';

/**
 * 数据层：SQLite（better-sqlite3）
 * 表结构在作业模板基础上增加了 likes / ip / province 三个字段
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'treehole.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    time TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    ip TEXT DEFAULT '',
    province TEXT DEFAULT '未知'
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ip_cache (
    ip TEXT PRIMARY KEY,
    province TEXT,
    city TEXT,
    updated_at INTEGER
  );
`);

const stmts = {
  list: db.prepare(
    'SELECT id, nickname, content, time, likes, province FROM messages ORDER BY id DESC'
  ),
  one: db.prepare(
    'SELECT id, nickname, content, time, likes, province FROM messages WHERE id = ?'
  ),
  insert: db.prepare(
    'INSERT INTO messages (nickname, content, time, likes, ip, province) VALUES (?, ?, ?, 0, ?, ?)'
  ),
  like: db.prepare('UPDATE messages SET likes = likes + 1 WHERE id = ?'),
  province: db.prepare('UPDATE messages SET province = ? WHERE id = ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM messages'),
  cacheGet: db.prepare('SELECT province, city FROM ip_cache WHERE ip = ?'),
  cachePut: db.prepare(
    'INSERT INTO ip_cache (ip, province, city, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(ip) DO UPDATE SET province = excluded.province, city = excluded.city, updated_at = excluded.updated_at'
  ),
};

function listMessages() {
  return stmts.list.all();
}

function getMessage(id) {
  return stmts.one.get(id);
}

function addMessage({ nickname, content, ip, province }) {
  const time = new Date().toISOString();
  const info = stmts.insert.run(nickname, content, time, ip, province);
  return getMessage(info.lastInsertRowid);
}

function likeMessage(id) {
  const info = stmts.like.run(id);
  if (!info.changes) return null;
  return getMessage(id);
}

function updateProvince(id, province) {
  stmts.province.run(province || '未知', id);
  return getMessage(id);
}

function countMessages() {
  return stmts.count.get().n;
}

function getCache(ip) {
  return stmts.cacheGet.get(ip) || null;
}

function setCache(ip, province, city) {
  stmts.cachePut.run(ip, province, city || '', Date.now());
}

// 首次启动（或云平台重置文件系统后）写入演示留言，保证页面不是空的
function seedIfEmpty() {
  if (countMessages() > 0) return;
  const demo = [
    ['小满', '今天图书馆坐到闭馆，抬头发现外面在下雨。其实也挺好的，雨声比耳机白噪音好听。', '浙江'],
    ['阿岚', '和室友冷战三天了，谁都不肯先说话。可我还是偷偷给她留了最后一块小蛋糕。', '广东'],
    ['一路向北', '考研倒计时 47 天，早上六点起床已经变成习惯。希望明年这个时候，我能笑着说都值得。', '四川'],
    ['橘子汽水', '第一次一个人去看了场电影，散场的时候居然觉得挺自由的。', '北京'],
    ['晚风', '想家了。东北的秋天是不是已经下霜了？', '江苏'],
  ];
  for (const [nickname, content, province] of demo) {
    stmts.insert.run(nickname, content, new Date().toISOString(), 'demo', province);
    stmts.like.run(0);
  }
  // 给演示数据一些初始赞数，让点赞数字更自然
  const ids = listMessages().map((m) => m.id);
  const initialLikes = [7, 4, 11, 3, 2];
  ids.forEach((id, i) => {
    for (let k = 0; k < (initialLikes[i] || 0); k += 1) stmts.like.run(id);
  });
}

module.exports = {
  db,
  listMessages,
  getMessage,
  addMessage,
  likeMessage,
  updateProvince,
  countMessages,
  getCache,
  setCache,
  seedIfEmpty,
  DB_PATH,
};
