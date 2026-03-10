import http from 'http';
import WebSocket from 'ws';

function getJson(url) {
    return new Promise((r, j) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => r(JSON.parse(data)));
        }).on('error', j);
    });
}

(async () => {
    try {
        const list = await getJson('http://127.0.0.1:9000/json/list');
        const target = list.filter(t => t.type === 'page' && (t.url?.includes('workbench.html') || (t.title && t.title.includes('workbench')))).pop();

        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise(r => ws.on('open', r));

        let id = 1;
        const call = (method, params) => new Promise(r => {
            const currentId = id++;
            ws.on('message', function handler(m) {
                const data = JSON.parse(m);
                if (data.id === currentId) {
                    ws.off('message', handler);
                    r(data.result);
                }
            });
            ws.send(JSON.stringify({ id: currentId, method, params }));
        });

        await call("Runtime.enable", {});
        await call("DOM.enable", {});

        const expression = `
            (() => {
                const elements = [];
                // Look for chat selection elements
                const chatSelects = Array.from(document.querySelectorAll('div, button')).filter(el => 
                    el.textContent.includes('Conversation') || el.classList.contains('conversation-picker') || el.classList.contains('chat-select')
                );
                
                // Look for retry buttons
                const retryButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.toLowerCase().includes('retry'));
                
                // Look for dropdown arrows next to chat names
                const dropdowns = Array.from(document.querySelectorAll('.codicon-chevron-down'));

                return {
                    potentialChatSelectors: chatSelects.map(i => ({ tag: i.tagName, class: i.className, text: i.textContent.trim().substring(0, 50) })).slice(0, 5),
                    retryButtons: retryButtons.map(i => ({ tag: i.tagName, class: i.className, text: i.textContent.trim() })).slice(0, 5),
                    dropdowns: dropdowns.map(i => ({ tag: i.tagName, class: i.className, parentClass: i.parentElement?.className })).slice(0, 5)
                };
            })()
        `;

        const res = await call("Runtime.evaluate", {
            expression,
            returnByValue: true
        });

        console.log("UI Elements found:", JSON.stringify(res.result.value, null, 2));
        ws.close();
    } catch (e) { console.error(e); }
})();
