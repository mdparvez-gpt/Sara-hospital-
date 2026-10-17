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
        try {
            const user = JSON.parse(savedProfile);
            myExt = user.ext;
            myName = user.name;
            document.getElementById("app-container").style.display = "block";
            document.getElementById("user-info-display").innerText = `${myName} (Ext: ${myExt})`;
            initPeer();
            setupSupabasePresence();
        } catch(e) {
            localStorage.removeItem("sara_hosp_user");
            document.getElementById("reg-modal").style.display = "flex";
        }
    } else {
        document.getElementById("reg-modal").style.display = "flex";
    }
};

async function registerUser() {
    const name = document.getElementById("reg-name").value.trim();
    const ext = document.getElementById("reg-ext").value.trim();

    if(!name || !ext) {
        alert("দয়া করে নাম এবং এক্সটেনশন নম্বর প্রদান করুন!");
        return;
    }

    const user = { name, ext };
    localStorage.setItem("sara_hosp_user", JSON.stringify(user));
    
    await sb.from('active_users').upsert({ ext, name, last_seen: new Date().toISOString() });
    location.reload();
}

async function logoutUser() {
    if(myExt

