const SUPABASE_URL = "https://msggjgygnzwobxtcnepr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cY5siaFgI1e0w7ZdrFJ2yQ_EGRE3QjP";

let sb = null;
try {
    if (window.supabase) {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch(e) {}

let peer = null;
let currentCall = null;
let incomingCallObj = null;
let dialBuffer = "";
let myExt = "";
let myName = "";
let callTimerInterval = null;
let callSeconds = 0;
let audioContext = null;
let ringtoneInterval = null;
let isSpeakerOn = false;
let globalUsersMap = {};
let currentChatExt = null;

window.onload = function() {
    try {
        const savedProfile = localStorage.getItem("sara_hosp_user");
        if(savedProfile) {
            const user = JSON.parse(savedProfile);
            if(user && user.ext && user.name) {
                myExt = user.ext;
                myName = user.name;
                
                document.getElementById("reg-modal").style.display = "none";
                document.getElementById("app-container").style.display = "block";
                document.getElementById("user-info-display").innerText = `Ext: ${myExt}`;
                
                initPeer();
                setupSupabasePresence();
                return;
            }
        }
    } catch(e) {}

    document.getElementById("app-container").style.display = "none";
    document.getElementById("reg-modal").style.display = "flex";
};

async function registerUser() {
    try {
        const nameInput = document.getElementById("reg-name");
        const extInput = document.getElementById("reg-ext");
        
        if(!nameInput || !extInput) return;
        const name = nameInput.value.trim();
        const ext = extInput.value.trim();

        if(!name || !ext) {
            alert("দয়া করে নাম এবং এক্সটেনশন নম্বর উভয়ই দিন!");
            return;
        }

        const user = { name, ext };
        localStorage.setItem("sara_hosp_user", JSON.stringify(user));
        
        if(sb) {
            await sb.from('active_users').upsert({ ext, name, last_seen: new Date().toISOString() });
        }
        location.reload();
    } catch(e) {
        alert("রেজিস্ট্রেশন করতে সমস্যা হয়েছে!");
    }
}

async function logoutUser() {
    try {
        if(myExt && sb) {
            await sb.from('active_users').delete().eq('ext', myExt);
        }
    } catch(e) {}
    localStorage.removeItem("sara_hosp_user");
    if(peer) peer.destroy();
    location.reload();
}

async function setupSupabasePresence() {
    if(!sb) return;
    try {
        await sb.from('active_users').upsert({ ext: myExt, name: myName, last_seen: new Date().toISOString() });
        await fetchActiveUsers();

        sb.channel('realtime_active_users_room')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'active_users' }, async () => {
              await fetchActiveUsers();
          })
          .subscribe();
    } catch(e) {}
}

async function fetchActiveUsers() {
    if(!sb) return;
    try {
        const { data, error } = await sb.from('active_users').select('*');
        if(error) return;

        const listDiv = document.getElementById("active-users-list");
        if(!listDiv) return;
        
        listDiv.innerHTML = "";
        globalUsersMap = {};

        if(data && data.length > 0) {
            let count = 0;
            data.forEach(u => {
                globalUsersMap[u.ext] = u.name;
                if(u.ext !== myExt) {
                    count++;
                    listDiv.innerHTML += `
                        <div class="user-chip" onclick="openChat('${u.ext}', '${u.name}')">
                            🟢 <strong>${u.name}</strong> (Ext: ${u.ext})
                        </div>
                    `;
                }
            });
            if(count === 0) {
                listDiv.innerHTML = `<span class="no-user">অন্য কেউ অনলাইন নেই...</span>`;
            }
        } else {
            listDiv.innerHTML = `<span class="no-user">কেউ অনলাইন নেই</span>`;
        }
    } catch(e) {}
}

// Feature 2: Open Chat Option on User Click
function openChat(ext, name) {
    currentChatExt = ext;
    document.getElementById("chat-target-name").innerText = `${name} (Ext: ${ext})`;
    document.getElementById("chat-messages").innerHTML = `<div class="chat-msg">চ্যাট শুরু হয়েছে...</div>`;
    document.getElementById("chat-modal").style.display = "flex";
}

function closeChat() {
    document.getElementById("chat-modal").style.display = "none";
    currentChatExt = null;
}

function sendChatMessage() {
    const input = document.getElementById("chat-text-input");
    const msg = input.value.trim();
    if(!msg || !currentChatExt) return;

    const msgArea = document.getElementById("chat-messages");
    msgArea.innerHTML += `<div class="chat-msg my">${msg}</div>`;
    input.value = "";
    msgArea.scrollTop = msgArea.scrollHeight;
    
    // PeerJS DataConnection can be used here for direct text/file messaging if needed
}

function handleChatKeyPress(e) {
    if(e.key === 'Enter') sendChatMessage();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if(!file) return;

    const msgArea = document.getElementById("chat-messages");
    if(file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            msgArea.innerHTML += `<div class="chat-msg my"><img src="${e.target.result}" style="max-width:150px; border-radius:6px;"><br><small>${file.name}</small></div>`;
            msgArea.scrollTop = msgArea.scrollHeight;
        }
        reader.readAsDataURL(file);
    } else {
        msgArea.innerHTML += `<div class="chat-msg my">📎 ফাইল প্রেরিত: ${file.name}</div>`;
        msgArea.scrollTop = msgArea.scrollHeight;
    }
}

function startCallFromChat() {
    if(!currentChatExt) return;
    closeChat();
    dialBuffer = currentChatExt;
    makeCall();
}

function quickCall(ext) {
    openChat(ext, globalUsersMap[ext] || ext);
}

function initPeer() {
    try {
        peer = new Peer("sara-hosp-" + myExt);

        peer.on('open', () => {
            const screen = document.getElementById("screen-display");
            if(screen) screen.innerText = "READY";
        });

        peer.on('call', (call) => {
            incomingCallObj = call;
            const callerExt = call.peer.replace('sara-hosp-', '');
            const callerName = globalUsersMap[callerExt] || (call.metadata && call.metadata.callerName) || ("Ext " + callerExt);

            const callerInfo = document.getElementById("caller-info");
            if(callerInfo) callerInfo.innerText = `${callerName} (Ext: ${callerExt})`;
            
            const modal = document.getElementById("incoming-modal");
            if(modal) modal.style.display = "flex";
            
            if (navigator.vibrate) navigator.vibrate([500, 500, 500, 500]);
            startRingtone();
        });

        peer.on('error', (err) => {
            if(err && err.type === 'unavailable-id') {
                alert("এই এক্সটেনশন নম্বরটি ইতিমধ্যে ব্যবহৃত হচ্ছে!");
                logoutUser();
            }
        });
    } catch(e) {}
}

function pressKey(num) {
    if(dialBuffer.length < 8) {
        dialBuffer += num;
        const screen = document.getElementById("screen-display");
        if(screen) screen.innerText = dialBuffer;
    }
}

function backspaceKey() {
    dialBuffer = dialBuffer.slice(0, -1);
    const screen = document.getElementById("screen-display");
    if(screen) screen.innerText = dialBuffer || "READY";
}

function makeCall() {
    if(!dialBuffer) return alert("প্রথমে এক্সটেনশন নম্বর ডায়াল করুন!");
    if(dialBuffer === myExt) return alert("নিজেকে কল করা যাবে না!");

    const targetExt = dialBuffer;
    const targetName = globalUsersMap[targetExt] || ("Ext " + targetExt);
    const targetId = "sara-hosp-" + targetExt;
    
    const screen = document.getElementById("screen-display");
    if(screen) screen.innerText = "CALLING...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const call = peer.call(targetId, stream, {
            metadata: { callerName: myName, callerExt: myExt }
        });
        currentCall = call;
        setupActiveCallScreen(call, targetName, targetExt);
    }).catch(() => {
        alert("মাইক্রোফোন পারমিশন প্রয়োজন!");
        if(screen) screen.innerText = "READY";
    });
}

function answerCall() {
    stopRingtone();
    const modal = document.getElementById("incoming-modal");
    if(modal) modal.style.display = "none";
    
    const callerExt = incomingCallObj.peer.replace('sara-hosp-', '');
    const callerName = globalUsersMap[callerExt] || (incomingCallObj.metadata && incomingCallObj.metadata.callerName) || ("Ext " + callerExt);

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        incomingCallObj.answer(stream);
        currentCall = incomingCallObj;
        setupActiveCallScreen(currentCall, callerName, callerExt);
    }).catch(() => {
        alert("মাইক্রোফোন পারমিশন প্রয়োজন!");
    });
}

function rejectCall() {
    stopRingtone();
    const modal = document.getElementById("incoming-modal");
    if(modal) modal.style.display = "none";
    if(incomingCallObj) incomingCallObj.close();
    incomingCallObj = null;
}

function setupActiveCallScreen(call, name, ext) {
    const activeModal = document.getElementById("active-call-modal");
    if(activeModal) activeModal.style.display = "flex";
    
    const targetInfo = document.getElementById("connected-target-info");
    if(targetInfo) targetInfo.innerText = `${name} (Ext: ${ext})`;
    
    const timer = document.getElementById("call-timer");
    if(timer) timer.innerText = "Connecting...";

    call.on('stream', (remoteStream) => {
        const audioEle = document.getElementById("remote-audio");
        if(audioEle) audioEle.srcObject = remoteStream;
        if(!callTimerInterval) {
            startCallTimer();
        }
    });

    call.on('close', () => {
        resetUI();
    });
}

function toggleSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    const btn = document.getElementById("speaker-btn");
    if(btn) btn.innerText = isSpeakerOn ? "🔊 স্পিকার: চালু" : "🔊 স্পিকার: বন্ধ";
}

function startCallTimer() {
    callSeconds = 0;
    const timer = document.getElementById("call-timer");
    if(timer) timer.innerText = "00:00";
    if(callTimerInterval) clearInterval(callTimerInterval);
    
    callTimerInterval = setInterval(() => {
        callSeconds++;
        let mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
        let secs = (callSeconds % 60).toString().padStart(2, '0');
        if(timer) timer.innerText = `${mins}:${secs}`;
    }, 1000);
}

function startRingtone() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        ringtoneInterval = setInterval(() => {
            if(!audioContext) return;
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(440, audioContext.currentTime);
            gain.gain.setValueAtTime(0.1, audioContext.currentTime);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start();
            osc.stop(audioContext.currentTime + 0.3);
        }, 1000);
    } catch(e) {}
}

function stopRingtone() {
    if(ringtoneInterval) clearInterval(ringtoneInterval);
    if(audioContext) {
        try { audioContext.close(); } catch(e) {}
        audioContext = null;
    }
}

function hangUp() {
    if(currentCall) currentCall.close();
    resetUI();
}

function resetUI() {
    stopRingtone();
    if(callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    dialBuffer = "";
    const screen = document.getElementById("screen-display");
    if(screen) screen.innerText = "READY";
    
    const incModal = document.getElementById("incoming-modal");
    if(incModal) incModal.style.display = "none";
    
    const actModal = document.getElementById("active-call-modal");
    if(actModal) actModal.style.display = "none";
    
    currentCall = null;
    incomingCallObj = null;
    isSpeakerOn = false;
}

