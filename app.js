const SUPABASE_URL = "https://msggjgygnzwobxtcnepr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cY5siaFgI1e0w7ZdrFJ2yQ_EGRE3QjP";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

window.onload = function() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        stream.getTracks().forEach(track => track.stop());
    }).catch(() => {});

    const savedProfile = localStorage.getItem("sara_hosp_user");
    if(savedProfile) {
        const user = JSON.parse(savedProfile);
        myExt = user.ext;
        myName = user.name;
        document.getElementById("app-container").style.display = "block";
        document.getElementById("user-info-display").innerText = `${myName} (Ext: ${myExt})`;
        initPeer();
        setupSupabasePresence();
    } else {
        document.getElementById("reg-modal").style.display = "flex";
    }
};

async function registerUser() {
    const name = document.getElementById("reg-name").value.trim();
    const ext = document.getElementById("reg-ext").value.trim();

    if(!name || !ext) {
        alert("Doya kore name ebong extension number ubhoy-i din!");
        return;
    }

    const user = { name, ext };
    localStorage.setItem("sara_hosp_user", JSON.stringify(user));
    
    // Save registered user into active_users table directly
    await sb.from('active_users').upsert({ ext, name, last_seen: new Date().toISOString() });
    location.reload();
}

async function logoutUser() {
    if(myExt) {
        await sb.from('active_users').delete().eq('ext', myExt);
    }
    localStorage.removeItem("sara_hosp_user");
    if(peer) peer.destroy();
    location.reload();
}

async function setupSupabasePresence() {
    // Save/Update current user on Supabase
    await sb.from('active_users').upsert({ ext: myExt, name: myName, last_seen: new Date().toISOString() });
    
    // Fetch initial registered users
    await fetchActiveUsers();

    // Listen to realtime database changes
    sb.channel('realtime_active_users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_users' }, async () => {
          await fetchActiveUsers();
      })
      .subscribe();
}

async function fetchActiveUsers() {
    const { data, error } = await sb.from('active_users').select('*');
    if(error) return;

    const listDiv = document.getElementById("directory-users-list");
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
                    <div class="user-chip online" onclick="quickCall('${u.ext}')">
                        🟢 <strong>${u.name}</strong> (Ext: ${u.ext})
                    </div>
                `;
            }
        });
        if(count === 0) {
            listDiv.innerHTML = `<span class="no-user">Onno keo register koreni...</span>`;
        }
    } else {
        listDiv.innerHTML = `<span class="no-user">Kono registered user nei</span>`;
    }
}

function quickCall(ext) {
    dialBuffer = ext;
    document.getElementById("screen-display").innerText = dialBuffer;
    makeCall();
}

function initPeer() {
    peer = new Peer("sara-hosp-" + myExt);

    peer.on('open', () => {
        document.getElementById("screen-display").innerText = "READY";
    });

    peer.on('call', (call) => {
        incomingCallObj = call;
        const callerExt = call.peer.replace('sara-hosp-', '');
        const callerName = globalUsersMap[callerExt] || (call.metadata && call.metadata.callerName) || ("Ext " + callerExt);

        document.getElementById("caller-info").innerText = `${callerName} (Ext: ${callerExt})`;
        document.getElementById("incoming-modal").style.display = "flex";
        
        if (navigator.vibrate) navigator.vibrate([500, 500, 500, 500]);
        startRingtone();
    });

    peer.on('error', (err) => {
        if(err.type === 'unavailable-id') {
            alert("Ei extension number-ti itomoddhe babohrito hocche!");
            logoutUser();
        }
    });
}

function pressKey(num) {
    if(dialBuffer.length < 8) {
        dialBuffer += num;
        document.getElementById("screen-display").innerText = dialBuffer;
    }
}

function backspaceKey() {
    dialBuffer = dialBuffer.slice(0, -1);
    document.getElementById("screen-display").innerText = dialBuffer || "READY";
}

function makeCall() {
    if(!dialBuffer) return alert("Prothome extension number dial korun!");
    if(dialBuffer === myExt) return alert("Nijeke call kora jabe na!");

    const targetExt = dialBuffer;
    const targetName = globalUsersMap[targetExt] || ("Ext " + targetExt);
    const targetId = "sara-hosp-" + targetExt;
    
    document.getElementById("screen-display").innerText = "CALLING...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const call = peer.call(targetId, stream, {
            metadata: { callerName: myName, callerExt: myExt }
        });
        currentCall = call;
        setupActiveCallScreen(call, targetName, targetExt);
    }).catch(() => {
        alert("Microphone permission proyojon!");
        document.getElementById("screen-display").innerText = "READY";
    });
}

function answerCall() {
    stopRingtone();
    document.getElementById("incoming-modal").style.display = "none";
    
    const callerExt = incomingCallObj.peer.replace('sara-hosp-', '');
    const callerName = globalUsersMap[callerExt] || (incomingCallObj.metadata && incomingCallObj.metadata.callerName) || ("Ext " + callerExt);

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        incomingCallObj.answer(stream);
        currentCall = incomingCallObj;
        setupActiveCallScreen(currentCall, callerName, callerExt);
    }).catch(() => {
        alert("Microphone permission proyojon!");
    });
}

function rejectCall() {
    stopRingtone();
    document.getElementById("incoming-modal").style.display = "none";
    if(incomingCallObj) incomingCallObj.close();
    incomingCallObj = null;
}

function setupActiveCallScreen(call, name, ext) {
    document.getElementById("active-call-modal").style.display = "flex";
    document.getElementById("connected-target-info").innerText = `${name} (Ext: ${ext})`;
    document.getElementById("call-timer").innerText = "Connecting...";

    call.on('stream', (remoteStream) => {
        const audioEle = document.getElementById("remote-audio");
        audioEle.srcObject = remoteStream;
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
    document.getElementById("speaker-btn").innerText = isSpeakerOn ? "🔊 Speaker: Chalu" : "🔊 Speaker: Bondho";
}

function startCallTimer() {
    callSeconds = 0;
    document.getElementById("call-timer").innerText = "00:00";
    if(callTimerInterval) clearInterval(callTimerInterval);
    
    callTimerInterval = setInterval(() => {
        callSeconds++;
        let mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
        let secs = (callSeconds % 60).toString().padStart(2, '0');
        document.getElementById

