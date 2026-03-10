import http from 'http';
import WebSocket from 'ws';

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

(async () => {
    try {
        const list = await getJson('http://127.0.0.1:9000/json/list');
        const target = list.find(t => t.url?.includes('workbench.html') || (t.title && t.title.includes('workbench')));
        if (!target) return console.log('No workbench target');

        console.log('Target:', target.title);
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

        // Find the main chat area
        const expression = `
            (() => {
                const results = [];
                // Look for common wrapper classes in Antigravity
                const wrappers = document.querySelectorAll('.monaco-scrollable-element');
                for (let i=0; i<Math.min(10, wrappers.length); i++) {
                    const el = wrappers[i];
                    results.push({
                        c: el.className,
                        h: el.scrollHeight,
                        w: el.clientWidth,
                        text: el.innerText ? el.innerText.substring(0, 50).replace(/\\n/g, ' ') : ''
                    });
                }
                
                // Also get all div IDs that have 'chat' or 'conversation' anywhere
                const allDivs = document.querySelectorAll('div, main, section');
                const chatLike = [];
                for(const d of allDivs) {
                    if (d.id && (d.id.toLowerCase().includes('chat') || d.id.toLowerCase().includes('conv'))) {
                        chatLike.push({id: d.id, tag: d.tagName, c: d.className, h: d.scrollHeight});
                    }
                    if (d.className && typeof d.className === 'string' && (d.className.toLowerCase().includes('chat') || d.className.toLowerCase().includes('conversation'))) {
                        chatLike.push({id: d.id, tag: d.tagName, c: d.className, h: d.scrollHeight});
                    }
                }

                // Dedup
                const uniqueChatLike = Array.from(new Set(chatLike.map(JSON.stringify))).map(JSON.parse);
                
                return { wrappers: results, chatLike: uniqueChatLike.slice(0, 20) };
            })()
        `;

        const res = await call("Runtime.evaluate", {
            expression,
            returnByValue: true
        });

        console.dir(res.result.value, { depth: null });
        ws.close();
    } catch (e) {
        console.error(e);
    }
})();
