
import { flattenBookmarks, fuzzyMatch, enhancedFuzzyMatch, highlight, toCSV, downloadText, groupByPath, pushHistory, clearHistory, getHistory } from './utils.js';

const els = {
  syncBtn: document.getElementById('syncBtn'),
  exportBtn: document.getElementById('exportBtn'),
  searchInput: document.getElementById('searchInput'),
  resultList: document.getElementById('resultList'),
  groupList: document.getElementById('groupList'),
  count: document.getElementById('count'),
  syncedAt: document.getElementById('syncedAt'),
  groupView: document.getElementById('groupView'),
  realtimeToggle: document.getElementById('realtimeToggle'),
  titleWeight: document.getElementById('titleWeight'),
  algo: document.getElementById('algo'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
};

let allData = [];
let viewData = [];
let settings = { realtime: false, titleWeight: 3 };

init();

async function init() {
  const { findexData = [], findexMeta = {}, findexSettings = {} } = await chrome.storage.local.get(['findexData','findexMeta','findexSettings']);
  allData = findexData;
  settings = Object.assign(settings, findexSettings);
  els.realtimeToggle.checked = !!settings.realtime;
  els.titleWeight.value = settings.titleWeight ?? 3;

  renderMeta(findexMeta);
  render();

  els.syncBtn.addEventListener('click', onSync);
  els.exportBtn.addEventListener('click', onExport);
  els.searchInput.addEventListener('input', onSearch);
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', onSearch));
  els.groupView.addEventListener('change', render);
  els.realtimeToggle.addEventListener('change', onRealtimeToggle);
  els.titleWeight.addEventListener('input', onWeightChange);

  // 历史与快捷键
  await loadHistory();
  els.clearHistoryBtn.addEventListener('click', async ()=>{ await clearHistory(); await loadHistory(); });
  document.addEventListener('keydown', (e)=>{
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); els.searchInput.focus(); els.searchInput.select(); }
    if (e.key==='Enter'){ const first = (viewData&&viewData[0]) || (allData&&allData[0]); if(first) window.open(first.url, '_blank'); }
  });
  els.algo.addEventListener('change', onSearch);

  // 来自后台的增量同步广播
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'FINDEX_UPDATED') {
      allData = msg.payload.data;
      const meta = msg.payload.meta;
      chrome.storage.local.set({ findexData: allData, findexMeta: meta });
      renderMeta(meta);
      render();
    }
  });
}

async function onRealtimeToggle() {
  settings.realtime = this.checked;
  await chrome.storage.local.set({ findexSettings: settings });
  chrome.runtime.sendMessage({ type: 'FINDEX_REALTIME', enabled: settings.realtime });
}

async function onWeightChange() {
  settings.titleWeight = Number(this.value);
  await chrome.storage.local.set({ findexSettings: settings });
  onSearch();
}

async function onSync() {
  els.syncBtn.disabled = true;
  try {
    const tree = await chrome.bookmarks.getTree();
    const flat = flattenBookmarks(tree);
    allData = flat;
    const meta = { count: flat.length, syncedAt: Date.now() };
    await chrome.storage.local.set({ findexData: flat, findexMeta: meta });
    renderMeta(meta);
    render();
  } catch (e) {
    alert('同步失败：' + e.message);
  } finally {
    els.syncBtn.disabled = false;
  }
}

function onSearch() {
  const q = els.searchInput.value.trim();
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const algo = els.algo.value;
  if (!q) { viewData = allData; return render(); }

  if (mode === 'regex' && /^\/.+\/[gimsuy]*$/.test(q)) {
    try {
      const m = q.match(/^\/(.+)\/([gimsuy]*)$/);
      const re = new RegExp(m[1], m[2]);
      viewData = allData.filter(bm => re.test(bm.title||'') || re.test(bm.url||''));
    } catch { viewData = []; }
  } else {
    const w = Number(settings.titleWeight)||3;
    const fn = (algo==='enhanced') ? enhancedFuzzyMatch : fuzzyMatch;
    viewData = allData.map(bm => {
      const mt = fn(q, bm.title||'');
      const mu = fn(q, bm.url||'');
      const score = mt.score*w + mu.score*(6-w);
      return { ...bm, _score: score, _mt: mt, _mu: mu };
    }).filter(x => x._score>0).sort((a,b)=>b._score-a._score);
    pushHistory(q);

  }
  render();
}

async function onExport() {
  const headers = [{key:'title',title:'标题'},{key:'url',title:'链接'},{key:'path',title:'路径'}];
  const rows = (viewData && viewData.length) ? viewData : allData;
  const csv = toCSV(rows, headers);
  await downloadText('findex_bookmarks_'+new Date().toISOString().slice(0,10)+'.csv', csv);
}

function renderMeta(meta={}) {
  els.count.textContent = (meta.count ?? allData.length) + ' 项';
  els.syncedAt.textContent = meta.syncedAt ? ('上次同步：'+ new Date(meta.syncedAt).toLocaleString()) : '未同步';
}

function render() {
  const q = els.searchInput.value.trim();
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'fuzzy';
  const data = (viewData && viewData.length) || q ? viewData : allData;

  if (els.groupView.checked) {
    els.resultList.parentElement.hidden = true;
    els.groupList.hidden = false;
    renderGroups(data, q, mode);
  } else {
    els.groupList.hidden = true;
    els.resultList.parentElement.hidden = false;
    renderList(data, q, mode);
  }
}

function renderList(list, q, mode) {
  els.resultList.innerHTML = '';
  (list||[]).forEach(bm => {
    const li = document.createElement('li');
    li.className = 'item';
    const title = document.createElement('div');
    title.className = 'title';
    title.innerHTML = (mode==='fuzzy' && bm._mt) ? highlight(bm.title||'(无标题)', bm._mt.idxs) : (bm.title||'(无标题)');
    const url = document.createElement('a');
    url.className = 'url'; url.href = bm.url; url.textContent = bm.url; url.target = '_blank'; url.rel = 'noopener';
    const meta = document.createElement('div'); meta.className = 'meta';
    const badge = document.createElement('span'); badge.className='badge'; badge.textContent = bm.path || '根目录';
    meta.appendChild(badge);
    li.appendChild(title); li.appendChild(url); li.appendChild(meta);
    els.resultList.appendChild(li);
  });
  els.count.textContent = (list||[]).length + ' 项';
}

function renderGroups(list, q, mode) {
  const groups = groupByPath(list||[]);
  const container = els.groupList;
  container.innerHTML='';
  Object.keys(groups).sort().forEach(path => {
    const items = groups[path];
    const div = document.createElement('div');
    div.className = 'group';
    const head = document.createElement('div');
    head.className = 'ghead';
    const caret = document.createElement('span'); caret.textContent = '▸';
    const name = document.createElement('span'); name.textContent = path;
    const count = document.createElement('span'); count.className='gcount'; count.textContent = '('+items.length+')';
    head.appendChild(caret); head.appendChild(name); head.appendChild(count);
    const listEl = document.createElement('ul'); listEl.className='gitems list'; listEl.style.display='none';

    items.forEach(bm => {
      const li = document.createElement('li'); li.className='item';
      const title = document.createElement('div'); title.className='title';
      title.innerHTML = (mode==='fuzzy' && bm._mt) ? highlight(bm.title||'(无标题)', bm._mt.idxs) : (bm.title||'(无标题)');
      const url = document.createElement('a'); url.className='url'; url.href=bm.url; url.textContent=bm.url; url.target='_blank'; url.rel='noopener';
      li.appendChild(title); li.appendChild(url);
      listEl.appendChild(li);
    });

    head.addEventListener('click', () => {
      const open = listEl.style.display === 'none';
      listEl.style.display = open ? 'block':'none';
      caret.textContent = open ? '▾' : '▸';
    });

    div.appendChild(head); div.appendChild(listEl);
    container.appendChild(div);
  });
  els.count.textContent = (list||[]).length + ' 项';
}

async function loadHistory(){
  const list = await getHistory();
  let dl = document.getElementById('hist');
  if (!dl){ dl = document.createElement('datalist'); dl.id = 'hist'; document.body.appendChild(dl); }
  dl.innerHTML = list.map(x=>`<option value="${x}">`).join('');
  els.searchInput.setAttribute('list','hist');
}
