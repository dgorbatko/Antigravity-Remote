const WebSocket = require('ws');
const http = require('http');

http.get("http://127.0.0.1:9000/json", (res) => {
    let raw = "";
    res.on("data", chunk => raw += chunk);
    res.on("end", async () => {
        const targets = JSON.parse(raw);
        let target = targets.find(w => !w.title.includes('Task') && w.url.includes('workbench.html'));
        if (!target) target = targets[0];

        const ws = new WebSocket(target.webSocketDebuggerUrl);
        ws.on('open', () => {
            let id = 1;
            const evalCmd = {
                id: id++,
                method: 'Runtime.evaluate',
                params: {
                    expression: `(async () => {
                        let historyBtn = document.querySelector('[data-tooltip-id*="history"], [data-tooltip-id*="past"], [data-tooltip-id*="recent"], [data-tooltip-id*="conversation-history"]');
            
                        // Priority 2: Look for button ADJACENT to the new chat button
                        if (!historyBtn) {
                            const newChatBtn = document.querySelector('[data-tooltip-id="new-conversation-tooltip"]');
                            if (newChatBtn) {
                                const parent = newChatBtn.parentElement;
                                if (parent) {
                                    const siblings = Array.from(parent.children).filter(el => el !== newChatBtn);
                                    historyBtn = siblings.find(el => el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button');
                                }
                            }
                        }

                        // Fallback: Use previous heuristics (icon/aria-label)
                        if (!historyBtn) {
                            const allButtons = Array.from(document.querySelectorAll('button, [role="button"], a[data-tooltip-id]'));
                            for (const btn of allButtons) {
                                if (btn.offsetParent === null) continue;
                                const hasHistoryIcon = btn.querySelector('svg.lucide-clock') ||
                                                       btn.querySelector('svg.lucide-history') ||
                                                       btn.querySelector('svg.lucide-folder') ||
                                                       btn.querySelector('svg[class*="clock"]') ||
                                                       btn.querySelector('svg[class*="history"]');
                                if (hasHistoryIcon) {
                                    historyBtn = btn;
                                    break;
                                }
                            }
                        }
                        
                        if (!historyBtn) return "No history button found";
                        historyBtn.click();
                        await new Promise(r => setTimeout(r, 600));

                        const targetTitle = "Migrating Workspace History";
                        const allElements = Array.from(document.querySelectorAll('*'));
                        const candidates = allElements.filter(el => {
                            if (el.offsetParent === null) return false;
                            const text = el.innerText?.trim();
                            return text && text.startsWith(targetTitle.substring(0, Math.min(30, targetTitle.length)));
                        });

                        return { clickedBtn: !!historyBtn, candidatesCount: candidates.length, candidatesTexts: candidates.map(c => c.innerText.substring(0,30)) };
                    })()`,
                    returnByValue: true,
                    awaitPromise: true
                }
            };
            ws.send(JSON.stringify(evalCmd));
        });
        ws.on('message', msg => {
            const data = JSON.parse(msg);
            if (data.id === 1 && data.result && data.result.result) {
                console.log(JSON.stringify(data.result.result.value, null, 2));
                process.exit(0);
            }
        });
    });
});
