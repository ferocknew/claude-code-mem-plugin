/**
 * Claude Code Memory Viewer - 主应用脚本
 */

let refreshTimer = null;
let lastRecordCount = 0;

// 页面加载时获取数据
window.onload = function() {
    loadRecords();
    setupAutoRefresh();
    // 默认启动5秒自动刷新
    startAutoRefresh(5000);
};

// 启动自动刷新
function startAutoRefresh(interval) {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    if (interval > 0) {
        refreshTimer = setInterval(loadRecords, interval);
        console.log(`自动刷新已启动: 每 ${interval/1000} 秒`);
    }
}

// 设置自动刷新
function setupAutoRefresh() {
    const intervalInput = document.getElementById('refreshInterval');

    intervalInput.addEventListener('change', function() {
        const interval = parseInt(this.value) * 1000;

        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }

        if (interval > 0) {
            startAutoRefresh(interval);
        } else {
            console.log('自动刷新已停止');
        }
    });
}

// 加载记录
async function loadRecords() {
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    const recordsList = document.getElementById('recordsList');

    try {
        errorDiv.style.display = 'none';
        // 只在第一次加载时显示 loading
        if (recordsList.innerHTML === '') {
            loadingDiv.style.display = 'block';
        }

        const type = document.getElementById('typeFilter').value;
        const limit = document.getElementById('limitInput').value;

        let url = `/api/records?limit=${limit}`;
        if (type) {
            url += `&type=${type}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // 显示统计信息
        await loadStats();

        // 显示记录（倒序）
        const records = data.records.reverse();

        if (records.length === 0) {
            recordsList.innerHTML = `
                <div class="empty-state">
                    <h3>暂无记录</h3>
                    <p>当前条件下没有找到任何记录</p>
                </div>
            `;
        } else {
            // 检测是否有新记录
            const hasNewRecords = records.length !== lastRecordCount;
            lastRecordCount = records.length;

            recordsList.innerHTML = records.map(record => renderRecord(record)).join('');

            // 如果有新记录，闪烁提示
            if (hasNewRecords && recordsList.innerHTML !== '') {
                recordsList.style.transition = 'opacity 0.3s';
                recordsList.style.opacity = '0.7';
                setTimeout(() => {
                    recordsList.style.opacity = '1';
                }, 300);
            }
        }

        loadingDiv.style.display = 'none';

    } catch (error) {
        console.error('Error loading records:', error);
        errorDiv.textContent = `加载失败: ${error.message}`;
        errorDiv.style.display = 'block';
        loadingDiv.style.display = 'none';
    }
}

// 加载统计信息
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) return;

        const stats = await response.json();

        document.getElementById('totalRecords').textContent = stats.totalRecords || 0;
        document.getElementById('totalSessions').textContent = stats.totalSessions || 0;
        document.getElementById('totalObservations').textContent = stats.totalObservations || 0;
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// 渲染单条记录
function renderRecord(record) {
    const time = new Date(record.timestamp).toLocaleString();

    let content = '';

    switch (record.type) {
        case 'session_event':
            content = `<p>会话事件: <strong>${record.event}</strong></p>`;
            break;

        case 'user_message':
            content = `<pre>${escapeHtml(record.content)}</pre>`;
            break;

        case 'tool_execution':
            content = `
                <p><span class="tool-name">${record.tool_name}</span></p>
                ${record.result ? `<pre>${escapeHtml(record.result.substring(0, 500))}${record.result.length > 500 ? '...' : ''}</pre>` : ''}
            `;
            break;

        case 'session_summary':
            if (record.format === 'structured') {
                content = `
                    <div class="summary-grid">
                        <div class="summary-item">
                            <h4>🔍 调查内容</h4>
                            <p>${escapeHtml(record.investigated || '')}</p>
                        </div>
                        <div class="summary-item">
                            <h4>💡 学到知识</h4>
                            <p>${escapeHtml(record.learned || '')}</p>
                        </div>
                        <div class="summary-item">
                            <h4>✅ 完成工作</h4>
                            <p>${escapeHtml(record.completed || '')}</p>
                        </div>
                        <div class="summary-item">
                            <h4>➡️ 后续步骤</h4>
                            <p>${escapeHtml(record.next_steps || '')}</p>
                        </div>
                    </div>
                `;
            } else {
                content = `<pre>${escapeHtml(JSON.stringify(record, null, 2))}</pre>`;
            }
            break;

        case 'observation':
            content = `
                <div class="observation-title">${escapeHtml(record.title || '')}</div>
                <p><strong>类型:</strong> ${record.obs_type}</p>
                <p><strong>洞察:</strong> ${escapeHtml(record.insight || '')}</p>
                ${record.concepts && record.concepts.length > 0 ? `
                    <div class="concepts">
                        ${record.concepts.map(c => `<span class="concept">${escapeHtml(c)}</span>`).join('')}
                    </div>
                ` : ''}
            `;
            break;

        default:
            content = `<pre>${escapeHtml(JSON.stringify(record, null, 2))}</pre>`;
    }

    return `
        <div class="record">
            <div class="record-header">
                <span class="record-type type-${record.type}">${record.type}</span>
                <span class="record-time">${time}</span>
            </div>
            <div class="record-content">
                ${content}
            </div>
        </div>
    `;
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 导出数据
async function exportData() {
    try {
        const response = await fetch('/api/records?limit=10000');
        if (!response.ok) throw new Error('导出失败');

        const data = await response.json();
        const jsonStr = JSON.stringify(data.records, null, 2);

        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `claude-memory-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        alert(`导出失败: ${error.message}`);
    }
}
