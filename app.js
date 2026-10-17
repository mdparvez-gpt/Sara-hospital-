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

window.onload = function() {
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
        alert("নাম এবং এক্সটেনশন দিন!");
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
    
    if(data && data.length > 0) {
        data.forEach(u => {
            if(u.ext !== myExt) {
                listDiv.innerHTML += `
                    <div class="user-chip" onclick="quickCall('${u.ext}')">
                        🟢 ${u.name} (${u.ext})
                    </div>
                `;
            }
        });
    } else {
        listDiv.innerHTML = `<span style="color:#64748b; font-size:13px;">অন্য কেউ অনলাইন নেই</span>`;
    }
}

function quickCall(ext) {
    dialBuffer = ext;
    makeCall();
}

function initPeer() {
    peer = new Peer("sara-hosp-" + myExt);

    peer.on('open', () => {
        document.getElementById("screen-display").innerText = "প্রস্তুত (Ready)";
    });

    peer.on('call', (call) => {
        incomingCallObj = call;
        document.getElementById("caller-info").innerText = `এক্সটেনশন ${call.peer.replace('sara-hosp-', '')} থেকে কল আসছে...`;
        document.getElementById("incoming-modal").style.display = "flex";
        if (navigator.vibrate) navigator.vibrate([400, 400, 400]);
    });

    peer.on('error', (err) => {
        if(err.type === 'unavailable-id') {
            alert("এই এক্সটেনশন নম্বরটি ইতিমধ্যে ব্যবহৃত হচ্ছে!");
            logoutUser();
        }
    });
}

function pressKey(num) {
    dialBuffer += num;
    document.getElementById("screen-display").innerText = dialBuffer;
}

function makeCall() {
    if(!dialBuffer) return alert("নম্বর ডায়াল করুন!");
    if(dialBuffer === myExt) return alert("নিজেকে কল করা যাবে না!");

    const targetId = "sara-hosp-" + dialBuffer;
    document.getElementById("screen-display").innerText = "কলিং " + dialBuffer + "...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const call = peer.call(targetId, stream);
        currentCall = call;
        setupActiveCall(call);
    }).catch(() => {
        alert("মাইক্রোফোন পারমিশন প্রয়োজন!");
        resetUI();
    });
}

function answerCall() {
    document.getElementById("incoming-modal").style.display = "none";
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        incomingCallObj.answer(stream);
        currentCall = incomingCallObj;
        setupActiveCall(currentCall);
    }).catch(() => {
        alert("মাইক্রোফোন পারমিশন প্রয়োজন!");
    });
}

function rejectCall() {
    document.getElementById("incoming-modal").style.display = "none";
    if(incomingCallObj) incomingCallObj.close();
    incomingCallObj = null;
}

function setupActiveCall(call) {
    document.getElementById("incoming-modal").style.display = "none";
    document.getElementById("active-call-modal").style.display = "flex";
    
    startCallTimer();

    call.on('stream', (remoteStream) => {
        document.getElementById("remote-audio").srcObject = remoteStream;
    });

    call.on('close', () => {
        resetUI();
    });
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

function hangUp() {
    if(currentCall) currentCall.close();
    resetUI();
}

function resetUI() {
    if(callTimerInterval) clearInterval(callTimerInterval);
    dialBuffer = "";
    document.getElementById("screen-display").innerText = "প্রস্তুত (Ready)";
    document.getElementById("incoming-modal").style.display = "none";
    document.getElementById("active-call-modal").style.display = "none";
    currentCall = null;
    incomingCallObj = null;
}

