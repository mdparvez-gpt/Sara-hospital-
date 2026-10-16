let peer = null;
let currentCall = null;
let dialBuffer = "";

window.onload = function() {
    const profile = JSON.parse(localStorage.getItem("sara_hosp_profile"));
    if(profile) {
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
    renderContacts();
};

function saveProfile() {
    const name = document.getElementById("my-name").value.trim();
    const ext = document.getElementById("my-ext").value.trim();
    const photoInput = document.getElementById("my-photo").files[0];

    if(!name || !ext) return alert("নাম এবং এক্সটেনশন নম্বর দিন");

    if (photoInput) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.src = e.target.result;
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 100;
                canvas.height = 100;
                ctx.drawImage(img, 0, 0, 100, 100);
                
                const resizedPhoto = canvas.toDataURL('image/jpeg', 0.7);
                const profile = { name, ext, photo: resizedPhoto };
                localStorage.setItem("sara_hosp_profile", JSON.stringify(profile));
                location.reload();
            };
        };
        reader.readAsDataURL(photoInput);
    } else {
        const profile = { name, ext, photo: "" };
        localStorage.setItem("sara_hosp_profile", JSON.stringify(profile));
        location.reload();
    }
}

function initPeer(ext) {
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


