'use strict';

/**
 * IP -> 省份 解析
 * 使用 ip-api.com 的免费 JSON 接口（服务端调用，非浏览器，不受 CORS 限制）
 * 解析结果写入本地 ip_cache 表，避免重复请求触发限流
 */

const db = require('./db');

const ENDPOINT = (ip) =>
  `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,country,regionName,city,message`;

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:.]{2,45}$/;

const memory = new Map(); // ip -> { province, city }
const MEMORY_LIMIT = 500;

function normalize(ip) {
  if (!ip) return '';
  let v = String(ip).trim();
  if (v.includes(',')) v = v.split(',')[0].trim(); // 多级代理取第一跳
  v = v.replace(/^::ffff:/i, '');
  return v;
}

function isPrivate(ip) {
  if (!IPV4.test(ip) && !IPV6.test(ip)) return true; // 非法或主机名一律按内网处理
  if (IPV6.test(ip) && !IPV4.test(ip)) return !ip.includes(':'); // 简化处理
  const parts = ip.split('.').map(Number);
  if (parts.some((n) => Number.isNaN(n) || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // 运营商内网段
  return false;
}

function prettyProvince(name) {
  if (!name) return '未知';
  const raw = String(name).replace(/\s+/g, '');
  if (/^(北京|上海|天津|重庆)/.test(raw)) return raw.slice(0, 2);
  if (/(省|市|自治区|特别行政区)$/.test(raw)) return raw;
  return raw;
}

async function lookupProvince(rawIp) {
  const ip = normalize(rawIp);
  if (!ip) return { province: '未知', city: '', source: 'empty' };
  if (isPrivate(ip)) return { province: '本地测试', city: '', source: 'private' };

  if (memory.has(ip)) return { ...memory.get(ip), source: 'memory' };

  const cached = db.getCache(ip);
  if (cached) {
    const value = { province: cached.province, city: cached.city || '' };
    memory.set(ip, value);
    return { ...value, source: 'cache' };
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(ENDPOINT(ip), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = await res.json();
      if (data.status !== 'success') throw new Error(data.message || 'lookup failed');
      const province = prettyProvince(data.regionName);
      const city = data.city || '';
      const value = { province, city };
      db.setCache(ip, province, city);
      if (memory.size > MEMORY_LIMIT) memory.clear();
      memory.set(ip, value);
      return { ...value, source: 'remote' };
    } catch (err) {
      console.warn(`[geo] ${ip} 第 ${attempt} 次解析失败: ${err.name} ${err.message}`);
    }
  }
  // 解析失败不影响留言本身，降级为“未知”
  return { province: '未知', city: '', source: 'fallback' };
}

module.exports = { lookupProvince, isPrivate, normalize };
