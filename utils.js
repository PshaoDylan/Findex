
// 扁平化书签
export function flattenBookmarks(nodes, path = []) {
  const out = [];
  for (const node of nodes) {
    const currentPath = node.title ? [...path, node.title] : path;
    if (node.url) {
      out.push({ id: node.id, title: node.title || "(无标题)", url: node.url, path: currentPath.join(" / ") });
    }
    if (node.children) out.push(...flattenBookmarks(node.children, currentPath));
  }
  return out;
}

// 模糊匹配（返回分数与命中索引）
export function fuzzyMatch(query, text) {
  if (!query) return { score: 1, idxs: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0, score = 0, idxs = [];
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 2; idxs.push(i); qi++;
      if (i>0 && qi>1 && t[i-1] === q[qi-2]) score += 1;
    }
  }
  return (qi === q.length) ? { score: score/(t.length+q.length), idxs } : { score: 0, idxs: [] };
}

// 高亮命中索引
export function highlight(text, idxs) {
  if (!idxs || !idxs.length) return escapeHtml(text);
  const set = new Set(idxs);
  let out = "", open = false;
  for (let i=0;i<text.length;i++){
    const ch = text[i];
    if (set.has(i) && !open) { out += "<mark>"; open = true; }
    if (!set.has(i) && open) { out += "</mark>"; open = false; }
    out += escapeHtml(ch);
  }
  if (open) out += "</mark>";
  return out;
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// CSV
export function toCSV(rows, headers) {
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [];
  lines.push(headers.map(h => esc(h.title)).join(','));
  for (const row of rows) lines.push(headers.map(h => esc(row[h.key])).join(','));
  return lines.join('\r\n');
}

// 下载
export async function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try { await chrome.downloads.download({ url, filename, saveAs: true }); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
}

// 构建分组树: { path: 'A / B', items: [...] }
export function groupByPath(items) {
  const groups = {};
  for (const it of items) {
    const key = it.path || '根目录';
    (groups[key] ||= []).push(it);
  }
  return groups;
}

// 增强模糊：基于分词（空格/非字母数字分割），前缀与词边界加权，返回综合分数与高亮索引
export function enhancedFuzzyMatch(query, text) {
  const q = (query||'').trim();
  if (!q) return { score: 1, idxs: [] };
  const tokens = q.split(/\s+/).filter(Boolean);
  const lower = (text||'').toLowerCase();
  const idxs = new Set();
  let score = 0;

  for (const token of tokens) {
    const t = token.toLowerCase();
    let best = { s: 0, start: -1, len: 0 };
    // 搜索所有出现位置
    let pos = 0;
    while (true) {
      const i = lower.indexOf(t[0], pos);
      if (i === -1) break;
      // 逐字符推进
      let qi = 0, si = 0, k = i;
      for (; k < lower.length && qi < t.length; k++) {
        if (lower[k] === t[qi]) {
          // 命中加分
          si += 2;
          // 连续命中额外加分
          if (qi>0 && lower[k-1] === t[qi-1]) si += 1;
          // 词边界/前缀加权
          const boundary = (k===0 || /\W/.test(lower[k-1]));
          if (boundary && qi===0) si += 2;
          qi++;
        }
      }
      if (qi === t.length) {
        // 命中范围
        const start = i;
        const len = k - i;
        // 短距离匹配略加分（近似位置因素）
        si += Math.max(0, 3 - Math.min(3, len - t.length));
        if (si > best.s) best = { s: si, start, len };
      }
      pos = i + 1;
    }
    if (best.s === 0) return { score: 0, idxs: [] }; // 某 token 未命中则放弃
    for (let j = best.start; j < best.start + best.len; j++) idxs.add(j);
    score += best.s;
  }
  // 归一化
  score = score / (lower.length + tokens.join('').length);
  return { score, idxs: Array.from(idxs).sort((a,b)=>a-b) };
}

// 搜索历史工具（最多 15 条）
export async function pushHistory(q) {
  if (!q) return;
  const { findexHistory = [] } = await chrome.storage.local.get(['findexHistory']);
  const next = [q, *findexHistory.filter(x => x !== q)].slice(0, 15);
  await chrome.storage.local.set({ findexHistory: next });
}
export async function clearHistory() {
  await chrome.storage.local.set({ findexHistory: [] });
}
export async function getHistory() {
  const { findexHistory = [] } = await chrome.storage.local.get(['findexHistory']);
  return findexHistory;
}
