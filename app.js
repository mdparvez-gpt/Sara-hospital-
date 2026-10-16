et peer = null;
let currentCall = null;
let dialBuffer = "";

window.onload = function() {
    try {
        const profileStr = localStorage.getItem("sara_hosp_profile");
        if(profileStr) {
            const profile = JSON.parse(profileStr);
            document.getElementById("profile-area").innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <img src="${profile.photo || 'https://via.placeholder.com/50'}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid #38bdf8;">
                    <div>
                        <h4 style="margin:0; font-size:16px; color:#fff;">${profile.name}</h4>
                        <small style="color:#38bdf8; font-size:14px;">Ext: <strong>${profile.ext}</strong></small>
                    </div>
                </div>
            `;
            initPeer(profile.ext);
        }
    } catch(err) {
        console.error("Profile load error:", err);
    }
    renderContacts();
};

function saveProfile() {
    const nameInput = document.getElementById("my-name");
    const extInput = document.getElementById("my-ext");
    const photoInput = document.getElementById("my-photo");

    const name = nameInput ? nameInput.value.trim() : "";
    const ext = extInput ? extInput.value.trim() : "";

    if(!name || !ext) {
        alert("দয়া করে নাম এবং এক্সটেনশন নম্বর উভয়ই লিখুন!");
        return;
    }

    if (photoInput && photoInput.files && photoInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const img = new Image();
                img.src = e.target.result;
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = 80;
                    canvas.height = 80;
                    ctx.drawImage(img, 0, 0, 80, 80);
                    
                    const resizedPhoto = canvas.toDataURL('image/jpeg', 0.6);
                    const profile = { name, ext, photo: resizedPhoto };
                    localStorage.setItem("sara_hosp_profile", JSON.stringify(profile));
                    location.reload();
                };
                img.onerror = function() {
                    // ছবি লোডে সমস্যা হলে ছবি ছাড়াই সেভ করবে
                    saveProfileWithoutPhoto(name, ext);
                };
            } catch(ex) {
                saveProfileWithoutPhoto(name, ext);
            }
        };
        reader.onerror = function() {
            saveProfileWithoutPhoto(name, ext);
        };
        reader.readAsDataURL(photoInput.files[0]);
    } else {
        saveProfileWithoutPhoto(name, ext);
    }
}

function saveProfileWithoutPhoto(name, ext) {
    const profile = { name, ext, photo: "" };
    localStorage.setItem("sara_hosp_profile", JSON.stringify(profile));
    location.reload();
}

function initPeer(ext) {
    try {
        peer = new Peer("sara-hosp-ext-" + ext);
        peer.on('open', () => {
            const screen = document.getElementById("screen-display");
            if(screen) screen.innerText = "অনলাইন (Ext: " + ext + ")";
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
    const screen = document.getElementById("screen-display");
    if(screen) screen.innerText = dialBuffer;
}

function makeCall() {
    if(!dialBuffer) return alert("প্রথমে এক্সটেনশন নম্বর ডায়াল করুন!");
    triggerPeerCall(dialBuffer);
}

function triggerPeerCall(extNum) {
    const targetPeerId = "sara-hosp-ext-" + extNum;
    const screen = document.getElementById("screen-display");
    if(screen) screen.innerText = "ডায়ালিং " + extNum + "...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const call = peer.call(targetPeerId, stream);
        currentCall = call;
        setupCallStream(call);
    }).catch(() => alert("কল করার জন্য মাইক্রোফোন পারমিশন প্রয়োজন।"));
}

function setupCallStream(call) {
    const callBtn = document.getElementById("call-btn");
    const hangupBtn = document.getElementById("hangup-btn");
    if(callBtn) callBtn.style.display = "none";
    if(hangupBtn) hangupBtn.style.display = "block";

    call.on('stream', (remoteStream) => {
        const audioEle = document.getElementById("remote-audio");
        if(audioEle) audioEle.srcObject = remoteStream;
        const screen = document.getElementById("screen-display");
        if(screen) screen.innerText = "সংযুক্ত আছেন 📞";
    });

    call.on('close', resetCallUI);
}

function hangUp() {
    if(currentCall) currentCall.close();
    resetCallUI();
}

function resetCallUI() {
    dialBuffer = "";
    const screen = document.getElementById("screen-display");
    if(screen) screen.innerText = "রেডি / নম্বর ডায়াল করুন";
    const callBtn = document.getElementById("call-btn");
    const hangupBtn = document.getElementById("hangup-btn");
    if(callBtn) callBtn.style.display = "block";
    if(hangupBtn) hangupBtn.style.display = "none";
}

function addContact() {
    const nameInput = document.getElementById("c-name");
    const extInput = document.getElementById("c-ext");
    const name = nameInput ? nameInput.value.trim() : "";
    const ext = extInput ? extInput.value.trim() : "";
    
    if(!name || !ext) return alert("কন্টাক্টের নাম এবং এক্সটেনশন দিন");

    let contacts = JSON.parse(localStorage.getItem("sara_hosp_contacts")) || [
        { name: "ICU Desk", ext: "101" },
        { name: "Emergency", ext: "102" },
        { name: "Pharmacy", ext: "103" },
        { name: "Reception", ext: "104" }
    ];

    contacts.push({ name, ext });
    localStorage.setItem("sara_hosp_contacts", JSON.stringify(contacts));
    
    if(nameInput) nameInput.value = "";
    if(extInput) extInput.value = "";
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
    if(!listDiv) return;
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

