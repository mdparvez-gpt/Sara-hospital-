let peer = null;
let currentCall = null;
let dialBuffer = "";

window.onload = function() {
    const profileStr = localStorage.getItem("sara_hosp_profile");
    if(profileStr) {
        const profile = JSON.parse(profileStr);
        document.getElementById("profile-area").innerHTML = `
            <div style="text-align: center;">
                <h4 style="margin:0; font-size:16px; color:#fff;">👤 ${profile.name}</h4>
                <small style="color:#38bdf8; font-size:14px;">Extension: <strong>${profile.ext}</strong></small>
            </div>
        `;
        initPeer(profile.ext);
    }
    renderContacts();
};

function saveProfile() {
    const name = document.getElementById("my-name").value.trim();
    const ext = document.getElementById("my-ext").value.trim();

    if(!name || !ext) {
        alert("দয়া করে নাম এবং এক্সটেনশন নম্বর উভয়ই লিখুন!");
        return;
    }

    const profile = { name, ext };
    localStorage.setItem("sara_hosp_profile", JSON.stringify(profile));
    location.reload();
}

function initPeer(ext) {
    try {
        peer = new Peer("sara-hosp-ext-" + ext);
        peer.on('open', () => {
            document.getElementById("screen-display").innerText = "অনলাইন (Ext: " + ext + ")";
        });
        peer.on('call', (call) => {
            if(confirm("ইনকামিং কল আসছে... রিসিভ করবেন?")) {
                navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
                    call.answer(stream);
                    currentCall = call;
                    setupCallStream(call);
                }).catch(() => alert("মাইক্রোফোন পারমিশন প্রয়োজন"));
            }
        });
    } catch(e) {
        console.error("Peer init error:", e);
    }
}

function pressKey(num) {
    dialBuffer += num;
    document.getElementById("screen-display").innerText = dialBuffer;
}

function makeCall() {
    if(!dialBuffer) return alert("প্রথমে এক্সটেনশন নম্বর ডায়াল করুন!");
    triggerPeerCall(dialBuffer);
}

function triggerPeerCall(extNum) {
    const targetPeerId = "sara-hosp-ext-" + extNum;
    document.getElementById("screen-display").innerText = "ডায়ালিং " + extNum + "...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const call = peer.call(targetPeerId, stream);
        currentCall = call;
        setupCallStream(call);
    }).catch(() => alert("কল করার জন্য মাইক্রোফোন পারমিশন প্রয়োজন।"));
}

function setupCallStream(call) {
    document.getElementById("call-btn").style.display = "none";
    document.getElementById("hangup-btn").style.display = "block";

    call.on('stream', (remoteStream) => {
        document.getElementById("remote-audio").srcObject = remoteStream;
        document.getElementById("screen-display").innerText = "সংযুক্ত আছেন 📞";
    });

    call.on('close', resetCallUI);
}

function hangUp() {
    if(currentCall) currentCall.close();
    resetCallUI();
}

function resetCallUI() {
    dialBuffer = "";
    document.getElementById("screen-display").innerText = "রেডি / নম্বর ডায়াল করুন";
    document.getElementById("call-btn").style.display = "block";
    document.getElementById("hangup-btn").style.display = "none";
}

function addContact() {
    const name = document.getElementById("c-name").value.trim();
    const ext = document.getElementById("c-ext").value.trim();
    
    if(!name || !ext) return alert("কন্টাক্টের নাম এবং এক্সটেনশন দিন");

    let contacts = JSON.parse(localStorage.getItem("sara_hosp_contacts")) || [
        { name: "ICU Desk", ext: "101" },
        { name: "Emergency", ext: "102" },
        { name: "Pharmacy", ext: "103" },
        { name: "Reception", ext: "104" }
    ];

    contacts.push({ name, ext });
    localStorage.setItem("sara_hosp_contacts", JSON.stringify(contacts));
    
    document.getElementById("c-name").value = "";
    document.getElementById("c-ext").value = "";
    renderContacts();
}

function renderContacts() {
    let contacts = JSON.parse(localStorage.getItem("sara_hosp_contacts"));
    if(!contacts) {
        contacts = [
            { name: "ICU Desk", ext: "101" },
            { name: "Emergency", ext: "102" },
            { name: "Pharmacy", ext: "103" },
            { name: "Reception", ext: "104" }
        ];
        localStorage.setItem("sara_hosp_contacts", JSON.stringify(contacts));
    }

    const listDiv = document.getElementById("contact-list");
    listDiv.innerHTML = "";
    
    contacts.forEach(c => {
        listDiv.innerHTML += `
            <div class="contact-item">
                <div>
                    <strong>${c.name}</strong><br>
                    <small style="color:#38bdf8;">Ext: ${c.ext}</small>
                </div>
                <button style="width:auto; background:#22c55e; padding:6px 12px; margin:0;" onclick="triggerPeerCall('${c.ext}')">☎ কল</button>
            </div>
        `;
    });
}

