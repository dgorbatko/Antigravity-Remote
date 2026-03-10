import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';

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

        // Let's create a real PNG file to upload
        const dummyImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        const filePath = '/tmp/test_upload.png';
        fs.writeFileSync(filePath, Buffer.from(dummyImageBase64, 'base64'));

        // 1. Get the document node
        const doc = await call("DOM.getDocument", {});

        // 2. Query for the input element
        const queryRes = await call("DOM.querySelector", {
            nodeId: doc.root.nodeId,
            selector: 'input[type="file"]'
        });

        console.log("Input Node ID:", queryRes.nodeId);

        if (queryRes.nodeId) {
            // 3. Set files
            const uploadRes = await call("DOM.setFileInputFiles", {
                files: [filePath],
                nodeId: queryRes.nodeId
            });
            console.log("Upload Result:", JSON.stringify(uploadRes, null, 2));

            // Dispatch a change event so React picks it up
            const expr = `
                const input = document.querySelector('input[type="file"]');
                if (input) {
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            `;
            await call("Runtime.evaluate", { expression: expr });
            console.log("Dispatched change event.");
        }

        ws.close();
    } catch (e) { console.error(e); }
})();
