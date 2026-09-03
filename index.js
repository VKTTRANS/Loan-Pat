// 🟢 เปลี่ยน URL นี้เป็น Google Apps Script Web App URL ของคุณ
const GAS_URL = "https://script.google.com/macros/s/AKfycbxkq39mAaFRG584lXiQfqogwzTiPCjRWleq1L8JKiDVqa4YYphMRTYvlgefOqVI4ac4yQ/exec";

// 🟢 ตั้งค่า PIN ลับ สำหรับปลดล็อคหน้า Login ปกติ
const SECRET_GATEWAY_PIN = "9999"; 

let currentUid = null;

window.onload = () => {
  // ดักจับ Error เผื่อมีปัญหาจาก Cache
  try {
    let authData = sessionStorage.getItem('fintechAuthData');
    if (authData) {
      let parsed = JSON.parse(authData);
      routeUser(parsed.role);
      return; 
    }
  } catch (e) {
    sessionStorage.removeItem('fintechAuthData');
  }

  // อ่านค่าจาก URL (ตรวจสอบว่ามาจาก NFC Tag หรือไม่)
  const urlParams = new URLSearchParams(window.location.search);
  currentUid = urlParams.get('uid');

  if (currentUid) {
    // 🟢 ถ้ามาจาก NFC Tag (?uid=) -> โชว์หน้ากรอก PIN ของพนักงาน
    document.getElementById('stepGatewayLock').style.display = 'none';
    document.getElementById('stepManualLogin').style.display = 'none';
    document.getElementById('stepEnterPin').style.display = 'block';
    
    document.getElementById('displayUid').innerText = currentUid.toUpperCase();
    
    // ซ่อน parameter ออกจาก URL
    window.history.replaceState({}, document.title, window.location.pathname);
    setTimeout(() => document.getElementById('nfcPin').focus(), 300);
  } else {
    // 🔴 เข้าเว็บปกติ -> ไม่ต้องทำอะไร เพราะหน้า Lock ถูกตั้งค่าให้โชว์อยู่แล้วใน HTML
    // แค่โฟกัสช่องให้พิมพ์ PIN
    setTimeout(() => document.getElementById('gatewayPin').focus(), 300);
  }
};

// 🟢 ฟังก์ชันปลดล็อคระบบ (Gateway Lock)
function unlockGateway() {
    const pinInput = document.getElementById('gatewayPin');
    const pin = pinInput.value.trim();
    const mainCard = document.getElementById('mainCard');

    if (pin === SECRET_GATEWAY_PIN) {
        // ปลดล็อคสำเร็จ: เล่น Animation 3D Flip เพื่อพลิกการ์ด
        mainCard.classList.remove('animate-flip');
        void mainCard.offsetWidth; // Trigger Reflow
        mainCard.classList.add('animate-flip');

        setTimeout(() => {
            document.getElementById('stepGatewayLock').style.display = 'none';
            document.getElementById('stepManualLogin').style.display = 'block';
            document.getElementById('userId').focus();
        }, 300); 
        
    } else {
        // ปลดล็อคไม่สำเร็จ: สั่นการ์ดเตือน
        mainCard.classList.remove('shake-animation');
        void mainCard.offsetWidth; 
        mainCard.classList.add('shake-animation');
        
        showAlert('รหัสปลดล็อคระบบไม่ถูกต้อง!');
        pinInput.value = '';
        setTimeout(() => pinInput.focus(), 500);
    }
}

function toggleL(s) {
  document.getElementById('loader').style.display = s ? 'flex' : 'none';
}

function showAlert(msg) {
  document.getElementById('alertMsg').innerText = msg;
  const alertBox = document.getElementById('customAlert');
  alertBox.style.display = 'flex';
  
  // เพิ่มเอฟเฟกต์เด้งเตือน
  const alertCard = alertBox.querySelector('.pro-card');
  alertCard.style.animation = 'none';
  void alertCard.offsetWidth;
  alertCard.style.animation = 'dropInBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
}

async function api(data) {
  toggleL(true);
  try {
      const r = await fetch(GAS_URL, { 
        method: 'POST', 
        body: JSON.stringify(data) 
      });
      return await r.json();
  } catch (e) {
      return { success: false, error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ' + e.message };
  } finally {
      toggleL(false);
  }
}

function routeUser(role) {
  if (role === 'Admin' || role === 'SuperAdmin') {
    window.location.href = 'admin.html';
  } else if (role === 'User') {
    window.location.href = 'user.html';
  } else if (role === 'Client') {
    window.location.href = 'client.html';
  } else {
    showAlert('ตำแหน่งผู้ใช้งานไม่ถูกต้อง');
  }
}

// 🟢 ฟังก์ชัน Login ด้วย NFC Tag (ใช้ UID จาก URL + กรอก PIN)
async function submitNfcLogin() {
  const p = document.getElementById('nfcPin').value.trim();

  if (!currentUid || !p || p.length !== 4) {
    showAlert('กรุณากรอกรหัส PIN 4 หลักให้ครบถ้วน');
    return;
  }

  const res = await api({ action: 'loginNfc', userId: currentUid, pin: p });

  if (res.success) {
    const tokenData = {
      userId: res.userId,
      name: res.name,
      role: res.role,
      groupName: res.groupName,
      token: btoa(p)
    };
    sessionStorage.setItem('fintechAuthData', JSON.stringify(tokenData));
    routeUser(res.role);
  } else {
    // สั่นเตือนเวลาพิมพ์ PIN ผิด
    const mainCard = document.getElementById('mainCard');
    mainCard.classList.remove('shake-animation');
    void mainCard.offsetWidth; 
    mainCard.classList.add('shake-animation');

    showAlert(res.error || 'รหัส PIN ไม่ถูกต้อง หรือบัญชีถูกระงับ');
    document.getElementById('nfcPin').value = ''; 
    setTimeout(() => document.getElementById('nfcPin').focus(), 500);
  }
}

// 🟢 ฟังก์ชัน Login แบบปกติ (พิมพ์ ID / Pass)
async function submitLogin() {
  const u = document.getElementById('userId').value.trim();
  const p = document.getElementById('password').value.trim();

  if (!u || !p) {
    showAlert('กรุณากรอกรหัสผู้ใช้งานและรหัสผ่านให้ครบถ้วน');
    return;
  }

  const res = await api({ action: 'login', userId: u, password: p });

  if (res.success) {
    const tokenData = {
      userId: res.userId,
      name: res.name,
      role: res.role,
      groupName: res.groupName,
      token: btoa(p) 
    };
    sessionStorage.setItem('fintechAuthData', JSON.stringify(tokenData));
    routeUser(res.role);
  } else {
    const mainCard = document.getElementById('mainCard');
    mainCard.classList.remove('shake-animation');
    void mainCard.offsetWidth; 
    mainCard.classList.add('shake-animation');

    showAlert(res.error || 'ไอดีหรือรหัสผ่านไม่ถูกต้อง');
  }
}

// 🟢 ลงทะเบียน Service Worker สำหรับ PWA (ให้เว็บเร็วกระฉูด)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.log('Service Worker Reg Fail:', err));
  });
}