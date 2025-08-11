class Findex {
    constructor() {
        this.bookmarks = [];
        this.filteredBookmarks = [];
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadBookmarks();
        this.updateUI();
    }

    bindEvents() {
        document.getElementById('syncBtn').addEventListener('click', () => this.syncBookmarks());
        document.getElementById('searchInput').addEventListener('input', (e) => this.searchBookmarks(e.target.value));
        document.getElementById('regexMode').addEventListener('change', () => this.searchBookmarks(document.getElementById('searchInput').value));
        document.getElementById('exportBtn').addEventListener('click', () => this.exportToCSV());
    }

    async syncBookmarks() {
        const syncBtn = document.getElementById('syncBtn');
        const syncStatus = document.getElementById('syncStatus');
        
        try {
            syncBtn.disabled = true;
            syncBtn.classList.add('syncing');
            syncStatus.textContent = '正在同步收藏夹...';
            syncStatus.className = 'sync-status';

            // 获取所有书签
            const bookmarkTree = await chrome.bookmarks.getTree();
            const allBookmarks = this.flattenBookmarks(bookmarkTree);
            
            // 存储到本地
            await chrome.storage.local.set({ bookmarks: allBookmarks });
            this.bookmarks = allBookmarks;
            this.filteredBookmarks = [...allBookmarks];
            
            this.updateUI();
            
            syncStatus.textContent = `同步完成！共 ${allBookmarks.length} 个收藏`;
            syncStatus.className = 'sync-status success';
            
        } catch (error) {
            console.error('同步失败:', error);
            syncStatus.textContent = '同步失败，请重试';
            syncStatus.className = 'sync-status error';
        } finally {
            syncBtn.disabled = false;
            syncBtn.classList.remove('syncing');
            
            // 3秒后清除状态信息
            setTimeout(() => {
                syncStatus.textContent = '';
                syncStatus.className = 'sync-status';
            }, 3000);
        }
    }

    flattenBookmarks(nodes, path = '') {
        let bookmarks = [];
        
        for (const node of nodes) {
            if (node.children) {
                // 这是一个文件夹
                const currentPath = path ? `${path}/${node.title}` : node.title;
                bookmarks = bookmarks.concat(this.flattenBookmarks(node.children, currentPath));
            } else if (node.url) {
                // 这是一个书签
                bookmarks.push({
                    id: node.id,
                    title: node.title,
                    url: node.url,
                    folder: path || '根目录',
                    dateAdded: node.dateAdded
                });
            }
        }
        
        return bookmarks;
    }

    async loadBookmarks() {
        try {
            const result = await chrome.storage.local.get(['bookmarks']);
            this.bookmarks = result.bookmarks || [];
            this.filteredBookmarks = [...this.bookmarks];
        } catch (error) {
            console.error('加载书签失败:', error);
            this.bookmarks = [];
            this.filteredBookmarks = [];
        }
    }

    searchBookmarks(query) {
        if (!query.trim()) {
            this.filteredBookmarks = [...this.bookmarks];
        } else {
            const isRegexMode = document.getElementById('regexMode').checked;
            
            if (isRegexMode) {
                try {
                    const regex = new RegExp(query, 'i');
                    this.filteredBookmarks = this.bookmarks.filter(bookmark => 
                        regex.test(bookmark.title) || 
                        regex.test(bookmark.url) || 
                        regex.test(bookmark.folder)
                    );
                } catch (error) {
                    // 正则表达式无效，回退到普通搜索
                    this.filteredBookmarks = this.fuzzySearch(query);
                }
            } else {
                this.filteredBookmarks = this.fuzzySearch(query);
            }
        }
        
        this.updateUI();
    }

    fuzzySearch(query) {
        const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
        
        return this.bookmarks.filter(bookmark => {
            const searchText = `${bookmark.title} ${bookmark.url} ${bookmark.folder}`.toLowerCase();
            return searchTerms.every(term => searchText.includes(term));
        });
    }

    updateUI() {
        this.updateBookmarkCount();
        this.renderBookmarks();
    }

    updateBookmarkCount() {
        const countElement = document.getElementById('bookmarkCount');
        const total = this.bookmarks.length;
        const filtered = this.filteredBookmarks.length;
        
        if (filtered === total) {
            countElement.textContent = `共 ${total} 个收藏`;
        } else {
            countElement.textContent = `显示 ${filtered} / ${total} 个收藏`;
        }
    }

    renderBookmarks() {
        const container = document.getElementById('bookmarksList');
        const noResults = document.getElementById('noResults');
        
        if (this.filteredBookmarks.length === 0) {
            container.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }
        
        noResults.style.display = 'none';
        
        const query = document.getElementById('searchInput').value.toLowerCase();
        
        container.innerHTML = this.filteredBookmarks.map(bookmark => {
            const title = this.highlightText(bookmark.title, query);
            const url = this.highlightText(bookmark.url, query);
            const folder = this.highlightText(bookmark.folder, query);
            
            return `
                <div class="bookmark-item" data-url="${bookmark.url}">
                    <img class="bookmark-favicon" src="https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}" 
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><path fill=%22%23999%22 d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z%22/></svg>'">
                    <div class="bookmark-content">
                        <div class="bookmark-title">${title}</div>
                        <div class="bookmark-url">${url}</div>
                    </div>
                    <div class="bookmark-folder">${folder}</div>
                </div>
            `;
        }).join('');
        
        // 添加点击事件
        container.querySelectorAll('.bookmark-item').forEach(item => {
            item.addEventListener('click', () => {
                const url = item.dataset.url;
                chrome.tabs.create({ url });
            });
        });
    }

    highlightText(text, query) {
        if (!query.trim()) return text;
        
        const isRegexMode = document.getElementById('regexMode').checked;
        
        if (isRegexMode) {
            try {
                const regex = new RegExp(`(${query})`, 'gi');
                return text.replace(regex, '<span class="highlight">$1</span>');
            } catch (error) {
                return text;
            }
        } else {
            const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
            let highlightedText = text;
            
            searchTerms.forEach(term => {
                const regex = new RegExp(`(${this.escapeRegExp(term)})`, 'gi');
                highlightedText = highlightedText.replace(regex, '<span class="highlight">$1</span>');
            });
            
            return highlightedText;
        }
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    exportToCSV() {
        if (this.filteredBookmarks.length === 0) {
            alert('没有可导出的书签');
            return;
        }
        
        const headers = ['标题', '网址', '文件夹', '添加时间'];
        const csvContent = [
            headers.join(','),
            ...this.filteredBookmarks.map(bookmark => [
                `"${bookmark.title.replace(/"/g, '""')}"`,
                `"${bookmark.url}"`,
                `"${bookmark.folder.replace(/"/g, '""')}"`,
                `"${new Date(bookmark.dateAdded).toLocaleString()}"`
            ].join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `findex_bookmarks_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new Findex();
});