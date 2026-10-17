let peer = null;
let currentCall = null;
let incomingCallObj = null;
let dialBuffer = "";
let myExt = "";
let myName = "";

window.onload = function() {
    const savedProfile = localStorage.getItem("sara_hosp_user");
    if(savedProfile) {
        const user = JSON.parse(savedProfile);
        myExt = user.ext;
        myName = user.name;
        document.getElementById("app-container").style.display = "block";
        document.getElementById("user-info-display").innerText = `${myName} (Ext: ${myExt})`;
        initPeer();
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
    localStorage.removeItem("sara_hosp_user");
    if(peer) peer.destroy();
    location.reload();
}

function initPeer() {
    // Unique ID based on extension
    peer = new Peer("sara-hosp-" + myExt);

    peer.on('open', () => {
        document.getElementById("screen-display").innerText = "অনলাইন (কল করার জন্য প্রস্তুত)";
    });

    peer.on('call', (call) => {
        incomingCallObj = call;
        document.getElementById("caller-info").innerText = `এক্সটেনশন থেকে কল আসছে...`;
        document.getElementById("incoming-modal").style.display = "flex";
        
        // রিংটোন বা ভাইব্রেশন ট্রিগার করা যেতে পারে
        if (navigator.vibrate) navigator.vibrate([500, 500, 500]);
    });

    peer.on('error', (err) => {
        console.error(err);
        if(err.type === 'unavailable-id') {
            alert("এই এক্সটেনশন নম্বরটি ইতিমধ্যে অন্য কেউ ব্যবহার করছে! অন্য নম্বর দিন।");
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
    if(dialBuffer === myExt) return alert("নিজেকে কল করতে পারবেন না!");

    const targetId = "sara-hosp-" + dialBuffer;
    document.getElementById("screen-display").innerText = "কলিং " + dialBuffer + "...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const call = peer.call(targetId, stream);
        currentCall = call;
        setupActiveCall(call);
    }).catch(() => {
        alert("মাইক্রোফোন পারমিশন পাওয়া যায়নি!");
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
    document.getElementById("call-btn").style.display = "none";
    document.getElementById("hangup-btn").style.display = "block";
    document.getElementById("screen-display").innerText = "সংযুক্ত আছেন 📞";

    call.on('stream', (remoteStream) => {
        document.getElementById("remote-audio").srcObject = remoteStream;
    });

    call.on('close', () => {
        resetUI();
    });
}

function hangUp() {
    if(currentCall) currentCall.close();
    resetUI();
}

function resetUI() {
    dialBuffer = "";
    document.getElementById("screen-display").innerText = "অনলাইন (কল করার জন্য প্রস্তুত)";
    document.getElementById("call-btn").style.display = "block";
    document.getElementById("hangup-btn").style.display = "none";
    currentCall = null;
    incomingCallObj = null;
}

