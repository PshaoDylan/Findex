// QuickMark 后台服务脚本

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('QuickMark 插件已安装');
        
        // 设置默认配置
        chrome.storage.local.set({
            bookmarks: [],
            lastSyncTime: null,
            settings: {
                autoSync: false,
                syncInterval: 24 // 小时
            }
        });
    }
});

// 监听书签变化事件，可以用于自动同步
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    console.log('新书签已创建:', bookmark);
    // 这里可以添加自动同步逻辑
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    console.log('书签已删除:', id);
    // 这里可以添加自动同步逻辑
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
    console.log('书签已修改:', id, changeInfo);
    // 这里可以添加自动同步逻辑
});

// 处理来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getBookmarks') {
        // 获取所有书签
        chrome.bookmarks.getTree().then(bookmarkTree => {
            sendResponse({ bookmarks: bookmarkTree });
        }).catch(error => {
            sendResponse({ error: error.message });
        });
        return true; // 保持消息通道开放
    }
    
    if (request.action === 'exportBookmarks') {
        // 导出书签功能的后台处理
        sendResponse({ success: true });
    }
});

// 定期清理存储空间（可选）
setInterval(() => {
    chrome.storage.local.getBytesInUse().then(bytesInUse => {
        console.log('QuickMark 存储使用量:', bytesInUse, 'bytes');
        
        // 如果存储使用量过大，可以进行清理
        if (bytesInUse > 5 * 1024 * 1024) { // 5MB
            console.log('存储空间使用量较大，建议清理');
        }
    });
}, 60 * 60 * 1000); // 每小时检查一次