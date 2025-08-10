// Findex - 浏览器书签索引插件

document.addEventListener('DOMContentLoaded', () => {
  const syncBtn = document.getElementById('syncBtn');
  const exportBtn = document.getElementById('exportBtn');
  const searchInput = document.getElementById('searchInput');
  const resultsContainer = document.getElementById('results');
  const statusEl = document.getElementById('status');

  // --- 书签同步功能 ---
  syncBtn.addEventListener('click', () => {
    statusEl.textContent = '正在同步书签，请稍候...';
    syncBtn.disabled = true;

    const processBookmarks = (nodes) => {
      let bookmarks = [];
      for (const node of nodes) {
        if (node.url) { // 是书签
          bookmarks.push({ title: node.title, url: node.url });
        }
        if (node.children) { // 是文件夹
          bookmarks = bookmarks.concat(processBookmarks(node.children));
        }
      }
      return bookmarks;
    };

    chrome.bookmarks.getTree((bookmarkTree) => {
      const bookmarks = processBookmarks(bookmarkTree);
      chrome.storage.local.set({ bookmarks: bookmarks }, () => {
        statusEl.textContent = `同步完成！共找到 ${bookmarks.length} 个书签。`;
        syncBtn.disabled = false;
        // 5秒后清除状态消息
        setTimeout(() => {
          statusEl.textContent = '';
        }, 5000);
      });
    });
  });

  // --- 搜索功能 ---
  const displayBookmarks = (bookmarks) => {
    resultsContainer.innerHTML = '';
    if (!bookmarks || bookmarks.length === 0) {
      resultsContainer.innerHTML = '<div class="result-item">没有找到书签。</div>';
      return;
    }

    bookmarks.forEach(bookmark => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `<a href="${bookmark.url}" title="${bookmark.title}\n${bookmark.url}" target="_blank">${bookmark.title}</a>`;
      resultsContainer.appendChild(item);
    });
  };

  const searchBookmarks = (query) => {
    chrome.storage.local.get('bookmarks', (data) => {
      if (!data.bookmarks) {
        return;
      }

      let filteredBookmarks = [];
      const lowerCaseQuery = query.toLowerCase();

      // 尝试作为正则表达式进行搜索
      let regex;
      try {
        regex = new RegExp(query, 'i'); // 'i' 表示不区分大小写
      } catch (e) {
        regex = null;
      }

      if (regex) {
        filteredBookmarks = data.bookmarks.filter(
          bm => regex.test(bm.title) || regex.test(bm.url)
        );
      } else {
        // 作为普通字符串进行模糊搜索
        filteredBookmarks = data.bookmarks.filter(
          bm => bm.title.toLowerCase().includes(lowerCaseQuery) || bm.url.toLowerCase().includes(lowerCaseQuery)
        );
      }

      displayBookmarks(filteredBookmarks);
    });
  };

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query) {
      searchBookmarks(query);
    } else {
      // 如果搜索框为空，显示所有书签
      loadInitialBookmarks();
    }
  });

  // --- 导出CSV功能 ---
  const escapeCsvField = (field) => {
    if (field === null || field === undefined) {
      return '';
    }
    let str = String(field);
    // 如果字段包含逗号、双引号或换行符，则需要用双引号括起来
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      // 将字段中的双引号替换为两个双引号
      str = str.replace(/"/g, '""');
      return `"${str}"`;
    }
    return str;
  };

  exportBtn.addEventListener('click', () => {
    chrome.storage.local.get('bookmarks', (data) => {
      if (!data.bookmarks || data.bookmarks.length === 0) {
        statusEl.textContent = '没有可导出的书签。';
        setTimeout(() => { statusEl.textContent = '' }, 3000);
        return;
      }

      const bookmarks = data.bookmarks;
      const headers = ['title', 'url'];
      let csvContent = headers.join(',') + '\n';

      bookmarks.forEach(bm => {
        const row = [escapeCsvField(bm.title), escapeCsvField(bm.url)];
        csvContent += row.join(',') + '\n';
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const date = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `findex_bookmarks_${date}.csv`);

      document.body.appendChild(link); // Required for Firefox
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url); // Clean up
    });
  });

  // --- 初始化加载 ---
  const loadInitialBookmarks = () => {
    chrome.storage.local.get('bookmarks', (data) => {
      if (data.bookmarks) {
        displayBookmarks(data.bookmarks);
      } else {
        statusEl.textContent = '暂无书签，请先同步。';
      }
    });
  };

  loadInitialBookmarks();
});
