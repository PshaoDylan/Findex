
// MV3 后台：监听书签变更，增量刷新并广播

// 扁平化函数（与 utils.js 等价的最小依赖）
function flattenBookmarks(nodes, path = []) {
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

let realtime = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['findexSettings']).then(({findexSettings})=>{
    realtime = !!(findexSettings && findexSettings.realtime);
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'FINDEX_REALTIME') {
    realtime = !!msg.enabled;
  }
});

const updateAll = async () => {
  const tree = await chrome.bookmarks.getTree();
  const flat = flattenBookmarks(tree);
  const meta = { count: flat.length, syncedAt: Date.now() };
  await chrome.storage.local.set({ findexData: flat, findexMeta: meta });
  chrome.runtime.sendMessage({ type: 'FINDEX_UPDATED', payload: { data: flat, meta } });
};

function handleEvent() {
  if (!realtime) return;
  clearTimeout(handleEvent._t);
  handleEvent._t = setTimeout(updateAll, 500);
}

chrome.bookmarks.onCreated.addListener(handleEvent);
chrome.bookmarks.onRemoved.addListener(handleEvent);
chrome.bookmarks.onChanged.addListener(handleEvent);
chrome.bookmarks.onMoved.addListener(handleEvent);
