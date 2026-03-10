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

        // Let's create a dummy 1x1 transparent PNG base64
        const dummyImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

        const expression = `
            (async () => {
                const editors = [...document.querySelectorAll('[contenteditable="true"], textarea')]
                    .filter(el => el.offsetParent !== null && !el.disabled);
                const editor = editors.at(-1);
                if (!editor) return { error: "No editor found" };
                
                editor.focus();
                
                // Convert base64 to File
                const b64Data = "${dummyImageBase64}";
                const byteCharacters = atob(b64Data);
                const byteArrays = [];
                for (let offset = 0; offset < byteCharacters.length; offset += 512) {
                    const slice = byteCharacters.slice(offset, offset + 512);
                    const byteNumbers = new Array(slice.length);
                    for (let i = 0; i < slice.length; i++) {
                        byteNumbers[i] = slice.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    byteArrays.push(byteArray);
                }
                const blob = new Blob(byteArrays, {type: 'image/png'});
                const file = new File([blob], "test-image.png", {type: 'image/png'});
                
                // Create DataTransfer
                const dt = new DataTransfer();
                dt.items.add(file);
                
                // Dispatch paste event
                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dt
                });
                
                const dispatched = editor.dispatchEvent(pasteEvent);
                return { success: true, dispatched };
            })()
        `;

        const res = await call("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true
        });

        console.log("Result:", JSON.stringify(res.result.value, null, 2));
        ws.close();
    } catch (e) { console.error(e); }
})();
