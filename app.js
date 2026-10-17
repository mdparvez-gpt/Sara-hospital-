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
    // Request microphone permission early
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

function registerUser() {
    const name = document.getElementById("reg-name").value.trim();
    const ext = document.getElementById("reg-ext").value.trim();

    if(!name || !ext) {
        alert("দয়া করে নাম এবং এক্সটেনশন নম্বর উভয়ই দিন!");
        return;
    }

    const user = { name, ext };
    localStorage.setItem("sara_hosp_user", JSON.stringify(user));
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
    await sb.from('active_users').upsert({ ext: myExt, name: myName });
    fetchActiveUsers();

    sb.channel('public:active_users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_users' }, () => {
          fetchActiveUsers();
      })
      .subscribe();
}

async function fetchActiveUsers() {
    const { data, error } = await sb.from('active_users').select('*');
    if(error) return;

    const listDiv = document.getElementById("active-users-list");
    listDiv.innerHTML = "";
    globalUsersMap = {};
    
    if(data && data.length > 0) {
        data.forEach(u => {
            globalUsersMap[u.ext] = u.name;
            if(u.ext !== myExt) {
                listDiv.innerHTML += `
                    <div class="user-chip" onclick="quickCall('${u.ext}')">
                        🟢 ${u.name} (${u.ext})
                    </div>
                `;
            }
        });
        if(Object.keys(globalUsersMap).length <= 1) {
            listDiv.innerHTML = `<span class="no-user">অন্য কেউ অনলাইন নেই</span>`;
        }
    } else {
        listDiv.innerHTML = `<span class="no-user">কেউ অনলাইন নেই</span>`;
    }
}

function quickCall(ext) {
    dialBuffer = ext;
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
        const callerName = globalUsersMap[callerExt] || callerExt;

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
    const targetName = globalUsersMap[targetExt] || targetExt;
    const targetId = "sara-hosp-" + targetExt;
    
    document.getElementById("screen-display").innerText = "CALLING...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const call = peer.call(targetId, stream);
        currentCall = call;
        setupActiveCall(call, targetName, targetExt);
    }).catch(() => {
        alert("মাইক্রোফোন পারমিশন প্রয়োজন!");
        document.getElementById("screen-display").innerText = "READY";
    });
}

function answerCall() {
    stopRingtone();
    document.getElementById("incoming-modal").style.display = "none";
    
    const callerExt = incomingCallObj.peer.replace('sara-hosp-', '');
    const callerName = globalUsersMap[callerExt] || callerExt;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        incomingCallObj.answer(stream);
        currentCall = incomingCallObj;
        setupActiveCall(currentCall, callerName, callerExt);
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

function setupActiveCall(call, name, ext) {
    document.getElementById("incoming-modal").style.display = "none";
    document.getElementById("active-call-modal").style.display = "flex";
    document.getElementById("connected-target-info").innerText = `${name} (Ext: ${ext})`;
    
    startCallTimer();

    call.on('stream', (remoteStream) => {
        const audioEle = document.getElementById("remote-audio");
        audioEle.srcObject = remoteStream;
    });

    call.on('close', () => {
        resetUI();
    });
}

function toggleSpeaker() {
    const audioEle = document.getElementById("remote-audio");
    isSpeakerOn = !isSpeakerOn;
    if(audioEle.setSinkId) {
        // Supported browsers speaker switch
    }
    document.getElementById("speaker-btn").innerText = isSpeakerOn ? "🔊 স্পিকার: চালু" : "🔊 স্পিকার: বন্ধ";
}

function startCallTimer() {
    callSeconds = 0;
    document.getElementById("call-timer").innerText = "00:00";
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
    if(callTimerInterval) clearInterval(callTimerInterval);
    dialBuffer = "";
    document.getElementById("screen-display").innerText = "READY";
    document.getElementById("incoming-modal").style.display = "none";
    document.getElementById("active-call-modal").style.display = "none";
    currentCall = null;
    incomingCallObj = null;
    isSpeakerOn = false;
}

