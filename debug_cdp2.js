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

        const expression = `
            (() => {
                let cascade = document.getElementById('conversation');
                if (!cascade) return { error: "No conversation" };
                
                // Return exact children of conversation container
                const children = Array.from(cascade.children).map(c => ({
                    tag: c.tagName,
                    id: c.id,
                    className: c.className,
                    h: c.scrollHeight,
                    text: c.innerText ? c.innerText.substring(0, 50).replace(/\\n/g, ' ') : ''
                }));
                
                return { 
                    cascadeHeight: cascade.scrollHeight,
                    cascadeWidth: cascade.clientWidth,
                    children 
                };
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
