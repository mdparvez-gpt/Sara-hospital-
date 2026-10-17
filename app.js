// Firebase configuration for realtime active users sync
const firebaseConfig = {
    databaseURL: "https://sara-hospital-intercom-default-rtdb.firebaseio.com/"
};
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

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
        setupPresence();
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

function logoutUser() {
    if(myExt) {
        db.ref('active_users/' + myExt).remove();
    }
    localStorage.removeItem("sara_hosp_user");
    if(peer) peer.destroy();
    location.reload();
}

function setupPresence() {
    const userRef = db.ref('active_users/' + myExt);
    userRef.set({ name: myName, ext: myExt, time: Date.now() });
    userRef.onDisconnect().remove();

    // Listen to all active users in realtime
    db.ref('active_users').on('value', (snapshot) => {
        const users = snapshot.val();
        const listDiv = document.getElementById("active-users-list");
        listDiv.innerHTML = "";
        
        if(users) {
            Object.values(users).forEach(u => {
                if(u.ext !== myExt) {
                    listDiv.innerHTML += `
                        <div class="user-chip" onclick="quickCall('${u.ext}')">
                            🟢 <strong>${u.name}</strong> (${u.ext})
                        </div>
                    `;
                }
            });
        }
    });
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
        document.getElementById("caller-info").innerText = `ইনকামিং কল আসছে...`;
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
    if(!dialBuffer) return alert("প্রথমে এক্সটেনশন নম্বর ডায়াল করুন!");
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

