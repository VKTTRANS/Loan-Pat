const GAS_URL = "https://script.google.com/macros/s/AKfycbxkq39mAaFRG584lXiQfqogwzTiPCjRWleq1L8JKiDVqa4YYphMRTYvlgefOqVI4ac4yQ/exec";

// ป้องกันการย้อนกลับมาหน้า Login ถ้าล็อกอินอยู่แล้ว
window.onload = () => {
  let authData = sessionStorage.getItem('fintechAuthData');
  if (authData) {
    let parsed = JSON.parse(authData);
    routeUser(parsed.role);
  }
};

function toggleL(s) {
  document.getElementById('loader').style.display = s ? 'flex' : 'none';
}

function showAlert(msg) {
  document.getElementById('alertMsg').innerText = msg;
  document.getElementById('customAlert').style.display = 'flex';
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

// ฟังก์ชัน Login ปกติ
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
    showAlert(res.error || 'ไอดีหรือรหัสผ่านไม่ถูกต้อง');
  }
}

// ================== ระบบ NFC ==================
function openNfcLogin() {
  document.getElementById('nfcId').value = '';
  document.getElementById('nfcPin').value = '';
  document.getElementById('nfcPinSection').style.display = 'none';
  document.getElementById('btnReadNfc').style.display = 'block';
  document.getElementById('modalNfc').style.display = 'flex';
}

function closeNfcModal() {
  document.getElementById('modalNfc').style.display = 'none';
}

async function startNfcRead() {
  try {
    if ('NDEFReader' in window) {
      const ndef = new NDEFReader();
      await ndef.scan();
      document.getElementById('nfcId').value = "กำลังรออ่านบัตร...";
      
      ndef.onreading = event => {
        const serialNumber = event.serialNumber; 
        document.getElementById('nfcId').value = serialNumber.replace(/:/g, '');
        document.getElementById('btnReadNfc').style.display = 'none';
        document.getElementById('nfcPinSection').style.display = 'block';
        document.getElementById('nfcPin').focus();
      };
    } else {
      showAlert('อุปกรณ์หรือบราวเซอร์ของคุณไม่รองรับการอ่าน NFC');
    }
  } catch (error) {
    showAlert('เกิดข้อผิดพลาดในการเปิดระบบ NFC: ' + error);
  }
}

// ฟังก์ชันดักจับการกด Enter ในช่อง PIN ของ NFC
function handleNfcEnter(event) {
  if (event.key === 'Enter') {
    event.preventDefault(); // กันจอกระพริบ
    submitNfcLogin();
  }
}

async function submitNfcLogin() {
  const u = document.getElementById('nfcId').value.trim();
  const p = document.getElementById('nfcPin').value.trim();

  if (!u || !p || p.length !== 4) {
    showAlert('กรุณาแตะบัตรและกรอก PIN 4 หลักให้ครบถ้วน');
    return;
  }

  const res = await api({ action: 'loginNfc', userId: u, pin: p });

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
    showAlert(res.error || 'รหัส PIN ไม่ถูกต้อง');
    document.getElementById('nfcPin').value = ''; 
  }
}