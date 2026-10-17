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
let globalDirectory = {};
let onlineExtensions = [];

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
        setupSupabaseSync();
    } else {
        document.getElementById("reg-modal").style.display = "flex";
    }
};

async function registerUser() {
    const name = document.getElementById("reg-name").value.trim();
    const ext = document.getElementById("reg-ext").value.trim();

    if(!name || !ext) {
        alert("দয়া করে নাম এবং এক্সটেনশন নম্বর উভয়ই দিন!");
        return;
    }

    const user = { name, ext };
    localStorage.setItem("sara_hosp_user", JSON.stringify(user));
    
    // Also automatically register into permanent directory so others can see
    await sb.from('hospital_directory').upsert({ ext, name });
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

async function setupSupabaseSync() {
    // Set active presence
    await sb.from('active_users').upsert({ ext: myExt, name: myName, last_seen: new Date().toISOString() });
    await sb.from('hospital_directory').upsert({ ext: myExt, name: myName });

    await loadDirectoryAndActiveUsers();

    // Realtime listeners for both directory and active status
    sb.channel('sync_all_channels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospital_directory' }, async () => {
          await loadDirectoryAndActiveUsers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_users' }, async () => {
          await loadDirectoryAndActiveUsers();
      })
      .subscribe();
}

async function loadDirectoryAndActiveUsers() {
    // 1. Fetch Permanent Directory
    const { data: dirData } = await sb.from('hospital_directory').select('*');
    // 2. Fetch Active Users
    const { data: activeData } = await sb.from('active_users').select('*');

    globalDirectory = {};
    onlineExtensions = [];

    if(activeData) {
        activeData.forEach(u => onlineExtensions.push(u.ext));
    }

    const listDiv = document.getElementById("directory-users-list");
    listDiv.innerHTML = "";

    if(dirData && dirData.length > 0) {
        dirData.forEach(item => {
            globalDirectory[item.ext] = item.name;
            if(item.ext !== myExt) {
                const isOnline = onlineExtensions.includes(item.ext);
                const statusDot = isOnline ? "🟢" : "⚪";
                const onlineClass = isOnline ? "online" : "";

                listDiv.innerHTML += `
                    <div class="user-chip ${onlineClass}" onclick="quickCall('${item.ext}')">
                        ${statusDot} <strong>${item.name}</strong> (Ext: ${item.ext})
                    </div>
                `;
            }
        });
    } else {
        listDiv.innerHTML = `<span class="no-user">কোনো এক্সটেনশন নেই</span>`;
    }
}

function toggleAddBox() {
    const box = document.getElementById("add-dir-box");
    box.style.display = box.style.display === "none" ? "block" : "none";
}

async function addNewDirectoryContact() {
    const name = document.getElementById("new-dir-name").value.trim();
    const ext = document.getElementById("new-dir-ext").value.trim();

    if(!name || !ext) return alert("নাম এবং এক্সটেনশন দিন!");

    const { error } = await sb.from('hospital_directory').upsert({ ext, name });
    if(error) {
        alert("সংরক্ষণ করতে সমস্যা হয়েছে!");
    } else {
        document.getElementById("new-dir-name").value = "";
        document.getElementById("new-dir-ext").value = "";
        document.getElementById("add-dir-box").style.display = "none";
        await loadDirectoryAndActiveUsers();
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
        const callerName = globalDirectory[callerExt] || (call.metadata && call.metadata.callerName) || ("Ext " + callerExt);

        document.getElementById("caller-info").innerText = `${callerName} (Ext: ${callerExt})`;
        document.getElementById("incoming-modal").style.display = "flex";
        
        if (navigator.vibrate) navigator.vibrate([500, 500, 500, 500]);
        startRingtone();
    });

    peer.on('error', (err) => {
        if(err.type === 'unavailable-id') {
            alert("এই এক্সটেনশন নম্বরটি ইতিমধ্যে ব্যবহৃত হচ্ছে!");
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
    if(!dialBuffer) return alert("প্রথমে এক্সটেনশন নম্বর ডায়াল করুন!");
    if(dialBuffer === myExt) return alert("নিজেকে কল করা যাবে না!");

    const targetExt = dialBuffer;
    const targetName = globalDirectory[targetExt] || ("Ext " + targetExt);
    const targetId = "sara-hosp-" + targetExt;
    
    document.getElementById("screen-display").innerText = "CALLING...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const call = peer.call(targetId, stream, {
            metadata: { callerName: myName, callerExt: myExt }
        });
        currentCall = call;
        setupActiveCallScreen(call, targetName, targetExt);
    }).catch(() => {
        alert("মাইক্রোফোন পারমিশন প্রয়োজন!");
        document.getElementById("screen-display").innerText = "READY";
    });
}

function answerCall() {
    stopRingtone();
    document.getElementById("incoming-modal").style.display = "none";
    
    const callerExt = incomingCallObj.peer.replace('sara-hosp-', '');
    const callerName = globalDirectory[callerExt] || (incomingCallObj.metadata && incomingCallObj.metadata.callerName) || ("Ext " + callerExt);

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
    document.getElementById("speaker-btn").innerText = isSpeakerOn ? "🔊 স্পিকার: চালু" : "🔊 স্পিকার: বন্ধ";
}

function startCallTimer() {
    callSeconds = 0;
    document.getElementById("call-timer").innerText = "00:00";
    if(callTimerInterval) clearInterval(callTimerInterval);
    
    callTimerInterval = setInterval(() => {
        callSeconds++;
        let mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
        let secs = (callSeconds % 60).toString().padStart(2, '0');
        document.getElementById("call-timer").innerText = `${mins}:${secs}`;
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
        audioContext.close();
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
    document.getElementById("screen-display").innerText = "READY";
    document.getElementById("incoming-modal").style.display = "none";
    document.getElementById("active-call-modal").style.display = "none";
    currentCall = null;
    incomingCallObj = null;
    isSpeakerOn = false;
}

