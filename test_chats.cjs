const fetch = require('node-fetch');

async function check() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const res = await fetch('https://127.0.0.1:3001/snapshot');
    const data = await res.json();
    console.log("Workspace Chats array:", data.workspaceChats);
}
check();
