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
                const buttons = Array.from(document.querySelectorAll('button'));
                const retryBtn = buttons.find(b => b.textContent.toLowerCase().includes('retry') || b.querySelector('.codicon-refresh'));
                
                // Find chat title button. Usually text contains the current agent name or "Conversation"
                const chatTitles = Array.from(document.querySelectorAll('button, div')).filter(el => {
                   const text = el.textContent.toLowerCase();
                   return (el.classList.contains('chat-title') || el.classList.contains('conversation-title') || text.includes('rubber-tangle') || text.includes('chat')) && !el.children.length > 5;
                });
                
                // Find elements with specific codicons that might be the chat selector
                const menuIcons = Array.from(document.querySelectorAll('.codicon-menu, .codicon-history, .codicon-chevron-down'));

                return {
                    retryButtons: buttons.filter(b => b.textContent.toLowerCase().includes('retry') || b.innerHTML.includes('refresh')).map(b => b.outerHTML),
                    headers: Array.from(document.querySelectorAll('header')).map(h => h.innerHTML.substring(0, 500)),
                    navs: Array.from(document.querySelectorAll('nav')).map(n => n.innerHTML.substring(0, 500))
                };
            })()
        `;

        const res = await call("Runtime.evaluate", {
            expression,
            returnByValue: true
        });

        console.log("Deep Dive Results:", JSON.stringify(res.result.value, null, 2));
        ws.close();
    } catch (e) { console.error(e); }
})();
