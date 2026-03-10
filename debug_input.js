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

        const expression = `
            (() => {
                const results = [];
                const els = document.querySelectorAll('[contenteditable="true"]');
                for (const el of els) {
                    let parent = el;
                    // Go up a few levels to get the whole input block
                    for(let i=0; i<4; i++) {
                        if(parent.parentElement) parent = parent.parentElement;
                    }
                    results.push({ 
                        html: parent.outerHTML.substring(0, 300) + '...',
                        classes: parent.className
                    });
                }
                return results;
            })()
        `;

        const res = await call("Runtime.evaluate", {
            expression,
            returnByValue: true
        });

        console.log("Editors found:", JSON.stringify(res.result.value, null, 2));
        ws.close();
    } catch (e) { console.error(e); }
})();
