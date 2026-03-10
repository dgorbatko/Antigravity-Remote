import fs from 'fs';

async function check() {
    const res = await fetch('http://127.0.0.1:3001/snapshot');
    const data = await res.json();
    console.log("Workspace Chats array:", data.workspaceChats);
    fs.writeFileSync('temp_snap.html', data.html);
    console.log("Saved raw HTML to temp_snap.html");
}
check();
