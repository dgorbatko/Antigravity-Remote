const WebSocket = require('ws');
const http = require('http');

http.get("http://127.0.0.1:9000/json", (res) => {
    let raw = "";
    res.on("data", chunk => raw += chunk);
    res.on("end", async () => {
        const targets = JSON.parse(raw);
        let target = targets.find(w => !w.title.includes('Task') && w.url.includes('workbench.html')) || targets[0];
        if (!target) return console.log("No target");

        const ws = new WebSocket(target.webSocketDebuggerUrl);
        ws.on('open', () => {
            let id = 1;
            const evalCmd = {
                id: id++,
                method: 'Runtime.evaluate',
                params: {
                    expression: `(() => {
                        const links = Array.from(document.querySelectorAll('.sidebar a, nav a, [role="navigation"] a, a[href*="/chat/"]'));
                        return links.map(l => ({ text: l.innerText, href: l.href, class: l.className }));
                    })()`,
                    returnByValue: true
                }
            };
            ws.send(JSON.stringify(evalCmd));
        });
        ws.on('message', msg => {
            const data = JSON.parse(msg);
            if (data.result && data.result.result) {
                console.log(JSON.stringify(data.result.result.value, null, 2));
                process.exit(0);
            }
        });
    });
});
