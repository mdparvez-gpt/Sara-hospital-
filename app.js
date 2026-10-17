const SUPABASE_URL = "https://msggjgygnzwobxtcnepr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cY5siaFgI1e0w7ZdrFJ2yQ_EGRE3QjP";

let sb = null;
try {
    if (window.supabase) {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch(e) {}

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
let unreadMessagesCounts = {};
let missedCallsList = {};
let currentChatExt = null;

window.onload = function() {
    try {
        const savedProfile = localStorage.getItem("sara_hosp_user");
        if(savedProfile) {
            const user = JSON.parse(savedProfile);
            if(user && user.ext && user.name) {
                myExt = user.ext;
                myName = user.name;
                
                document.getElementById("reg-modal").style.display = "none";
                document.getElementById("app-container").style.display = "block";
                document.getElementById("user-info-display").innerText = `Ext: ${myExt}`;
                
                initPeer();
                setupSupabaseSync();
                return;
            }
        }
    } catch(e) {}

    document.getElementById("app-container").style.display = "none";
    document.getElementById("reg-modal").style.display = "flex";
};

async function registerUser() {
    try {
        const nameInput = document.getElementById("reg-name");
        const extInput = document.getElementById("reg-ext");
        
        if(!nameInput || !extInput) return;
        const name = nameInput.value.trim();
        const ext = extInput.value.trim();

        if(!name || !ext) {
            alert("দয়া করে নাম এবং এক্সটেনশন নম্বর উভয়ই দিন!");
            return;
        }

        if(sb) {
            const { data: existing } = await sb
                .from('hospital_directory')
                .select('*')
                .eq('ext', ext);

            if(existing && existing.length > 0) {
                alert("এই এক্সটেনশন নম্বরটি ইতিমধ্যে রেজিস্টার্ড! অন্য নম্বর দিন।");
                return;
            }

            const { error: insertError } = await sb.from('hospital_directory').insert({
                ext: ext,
                name: name,
                last_seen: new Date().toISOString()
            });

            if(insertError) {
                alert("রেজিস্ট্রেশন করতে সমস্যা হয়েছে: " + insertError.message);
                return;
            }
        }

        const user = { name, ext };
        localStorage.setItem("sara_hosp_user", JSON.stringify(user));
        location.reload();
    } catch(e) {
        alert("রেজিস্ট্রেশন করতে সমস্যা হয়েছে!");
    }
}

async function logoutUser() {
    try {
        if(myExt && sb) {
            await sb.from('hospital_directory').update({ last_seen: null }).eq('ext', myExt);
        }
    } catch(e) {}
    localStorage.removeItem("sara_hosp_user");
    if(peer) peer.destroy();
    location.reload();
}

async function setupSupabaseSync() {
    if(!sb) return;
    try {
        await sb.from('hospital_directory').update({ last_seen: new Date().toISOString() }).eq('ext', myExt);
        await loadSectionsData();

        sb.channel('sara_hosp_realtime_sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'hospital_directory' }, async () => {
              await loadSectionsData();
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
              const newMsg = payload.new;
              if(newMsg.receiver_ext === myExt) {
                  if(currentChatExt !== newMsg.sender_ext) {
                      unreadMessagesCounts[newMsg.sender_ext] = (unreadMessagesCounts[newMsg.sender_ext] || 0) + 1;
                  } else {
                      appendChatMessage(newMsg.sender_ext, newMsg.message, false);
                  }
                  await loadSectionsData();
              }
          })
          .subscribe();
    } catch(e) {}
}

async function loadSectionsData() {
    if(!sb) return;
    try {
        const { data: dirData } = await sb.from('hospital_directory').select('*');
        globalDirectory = {};
        let onlineList = [];

        if(dirData) {
            dirData.forEach(u => {
                globalDirectory[u.ext] = u.name;
                if(u.last_seen) {
                    onlineList.push(u);
                }
            });
        }

        const phonebookDiv = document.getElementById("phonebook-list");
        if(phonebookDiv) {
            phonebookDiv.innerHTML = "";
            let countPb = 0;
            if(dirData && dirData.length > 0) {
                dirData.forEach(item => {
                    if(item.ext !== myExt) {
                        countPb++;
                        const unread = unreadMessagesCounts[item.ext] ? `<span class="unread-badge">${unreadMessagesCounts[item.ext]}</span>` : "";
                        const missed = missedCallsList[item.ext] ? `<span class="missed-call-tag">⚠️ মিসড কল</span>` : "";

                        phonebookDiv.innerHTML += `
                            <div class="user-chip" onclick="openChat('${item.ext}', '${item.name}')">
                                👤 <strong>${item.name}</strong> (Ext: ${item.ext}) ${unread} ${missed}
                            </div>
                        `;
                    }
                });
            }
            if(countPb === 0) phonebookDiv.innerHTML = `<span class="no-user">কোনো ইউজার নেই</span>`;
        }

        const onlineDiv = document.getElementById("online-users-list");
        if(onlineDiv) {
            onlineDiv.innerHTML = "";
            let countOn = 0;
            if(onlineList && onlineList.length > 0) {
                onlineList.forEach(item => {
                    if(item.ext !== myExt) {
                        countOn++;
                        onlineDiv.innerHTML += `
                            <div class="user-chip" onclick="openChat('${item.ext}', '${item.name}')" style="border-color: #22c55e;">
                                🟢 <strong>${item.name}</strong> (Ext: ${item.ext})
                            </div>
                        `;
                    }
                });
            }
            if(countOn === 0) onlineDiv.innerHTML = `<span class="no-user">কেউ অনলাইন নেই...</span>`;
        }

    } catch(e) {}
}

async function openChat(ext, name) {
    currentChatExt = ext;
    unreadMessagesCounts[ext] = 0;
    missedCallsList[ext] = false;
    document.getElementById("chat-target-name").innerText = `${name} (Ext: ${ext})`;
    document.getElementById("chat-modal").style.display = "flex";
    
    const msgArea = document.getElementById("chat-messages");
    msgArea.innerHTML = `<div class="chat-msg">চ্যাট লোড হচ্ছে...</div>`;

    if(sb) {
        const { data } = await sb.from('chat_messages')
            .select('*')
            .or(`and(sender_ext.eq.${myExt},receiver_ext.eq.${ext}),and(sender_ext.eq.${ext},receiver_ext.eq.${myExt})`)
            .order('created_at', { ascending: true });
        
        msgArea.innerHTML = "";
        if(data && data.length > 0) {
            data.forEach(m => {
                const isMy = m.sender_ext === myExt;
                appendChatMessage(m.sender_ext, m.message, isMy);
            });
        } else {
            msgArea.innerHTML = `<div class="chat-msg">কথোপকথন শুরু করুন...</div>`;
        }
    }
    await loadSectionsData();
}

function closeChat() {
    document.getElementById("chat-modal").style.display = "none";
    currentChatExt = null;
}

async function sendChatMessage() {
    const input = document.getElementById("chat-text-input");
    const msg = input.value.trim();
    if(!msg || !currentChatExt || !sb) return;

    input.value = "";
    appendChatMessage(myExt, msg, true);

    await sb.from('chat_messages').insert({
        sender_ext: myExt,
        receiver_ext: currentChatExt,
        message: msg
    });
}

function appendChatMessage(sender, msg, isMy) {
    const msgArea = document.getElementById("chat-messages");
    if(!msgArea) return;
    const alignClass = isMy ? "chat-msg my" : "chat-msg";
    msgArea.innerHTML += `<div class="${alignClass}">${msg}</div>`;
    msgArea.scrollTop = msgArea.scrollHeight;
}

function handleChatKeyPress(e) {
    if(e.key === 'Enter') sendChatMessage();
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if(!file || !currentChatExt || !sb) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const fileData = e.target.result;
        const fileTag = file.type.startsWith('image/') ? `<img src="${fileData}" style="max-width:150px; border-radius:6px;"><br>${file.name}` : `📎 ফাইল: ${file.name}`;
        
        appendChatMessage(myExt, fileTag, true);
        await sb.from('chat_messages').insert({
            sender_ext: myExt,
            receiver_ext: currentChatExt,
            message: fileTag
        });
    }
    reader.readAsDataURL(file);
}

function startCallFromChat() {
    if(!currentChatExt) return;
    const target = currentChatExt;
    closeChat();
    dialBuffer = target;
    makeCall();
}

function initPeer() {
    try {
        peer = new Peer("sara-hosp-" + myExt);

        peer.on('open', () => {
            const screen = document.getElementById("screen-display");
            if(screen) screen.innerText = "READY";
        });

        peer.on('call', (call) => {
            incomingCallObj = call;
            const callerExt = call.peer.replace('sara-hosp-', '');
            const callerName = globalDirectory[callerExt] || ("Ext " + callerExt);

            const callerInfo = document.getElementById("caller-info");
            if(callerInfo) callerInfo.innerText = `${callerName} (Ext: ${callerExt})`;
            
            const modal = document.getElementById("incoming-modal");
            if(modal) modal.style.display = "flex";
            
            if (navigator.vibrate) navigator.vibrate([500, 500, 500, 500]);
            startRingtone();
        });

        peer.on('error', (err) => {
            if(err && err.type === 'unavailable-id') {
                alert("এই এক্সটেনশন নম্বরটি ইতিমধ্যে ব্যবহৃত হচ্ছে!");
                logoutUser();
            }
        });
    } catch(e) {}
}

function pressKey(num) {
    if(dialBuffer.length < 8) {
        dialBuffer += num;
        const screen = document.getElementById("screen-display");
        if(screen) screen.innerText = dialBuffer;
    }
}

function backspaceKey() {
    dialBuffer = dialBuffer.slice(0, -1);
    const screen = document.getElementById("screen-display");
    if(screen) screen.innerText = dialBuffer || "READY";
}

function makeCall() {
    if(!dialBuffer) return alert("প্রথমে এক্সটেনশন নম্বর ডায়াল করুন!");
    if(dialBuffer === myExt) return alert("নিজেকে কল করা যাবে না!");

    const targetExt = dialBuffer;
    const targetName = globalDirectory[targetExt] || ("Ext " + targetExt);
    const targetId = "sara-hosp-" + targetExt;
    
    const screen = document.getElementById("screen-display");
    if(screen) screen.innerText = "CALLING...";

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const call = peer.call(targetId, stream, {
            metadata: { callerName: myName, callerExt: myExt }
        });
        currentCall = call;
        setupActiveCallScreen(call, targetName, targetExt);
    }).catch((err) => {
        // If peer is offline / unavailable, mark as missed call in chat/directory
        alert("ইউজার বর্তমানে অফলাইন বা ব্রাউজারে নেই!");
        if(screen) screen.innerText = "READY";
        missedCallsList[targetExt] = true;
        loadSectionsData();
    });
}

function answerCall() {
    stopRingtone();
    const modal = document.getElementById("incoming-modal");
    if(modal) modal.style.display = "none";
    
    const callerExt = incomingCallObj.peer.replace('sara-hosp-', '');
    const callerName = globalDirectory[callerExt] || ("Ext " + callerExt);

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
    const modal = document.getElementById("incoming-modal");
    if(modal) modal.style.display = "none";
    
    const callerExt = incomingCallObj.peer.replace('sara-hosp-', '');
    missedCallsList[callerExt] = true;
    loadSectionsData();

    if(incomingCallObj) incomingCallObj.close();
    incomingCallObj = null;
}

function setupActiveCallScreen(call, name, ext) {
    const activeModal = document.getElementById("active-call-modal");
    if(activeModal) activeModal.style.display = "flex";
    
    const targetInfo = document.getElementById("connected-target-info");
    if(targetInfo) targetInfo.innerText = `${name} (Ext: ${ext})`;
    
    const timer = document.getElementById("call-timer");
    if(timer) timer.innerText = "Connecting...";

    call.on('stream', (remoteStream) => {
        const audioEle = document.getElementById("remote-audio");
        if(audioEle) audioEle.srcObject = remoteStream;
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
    const btn = document.getElementById("speaker-btn");
    if(btn) btn.innerText = isSpeakerOn ? "🔊 স্পিকার: চালু" : "🔊 স্পিকার: বন্ধ";
}

function startCallTimer() {
    callSeconds = 0;
    const timer = document.getElementById("call-timer");
    if(timer) timer.innerText = "00:00";
    if(callTimerInterval) clearInterval(callTimerInterval);
    
    callTimerInterval = setInterval(() => {
        callSeconds++;
        let mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
        let secs = (callSeconds % 60).toString().padStart(2, '0');
        if(timer) timer.innerText = `${mins}:${secs}`;
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
        try { audioContext.close(); } catch(e) {}
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
    const screen = document.getElementById("screen-display");
    if(screen) screen.innerText = "READY";
    
    const incModal = document.getElementById("incoming-modal");
    if(incModal) incModal.style.display = "none";
    
    const actModal = document.getElementById("active-call-modal");
    if(actModal) actModal.style.display = "none";
    
    currentCall = null;
    incomingCallObj = null;
    isSpeakerOn = false;
}

