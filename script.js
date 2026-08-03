const GAS_URL = "https://script.google.com/macros/s/AKfycbxkq39mAaFRG584lXiQfqogwzTiPCjRWleq1L8JKiDVqa4YYphMRTYvlgefOqVI4ac4yQ/exec";

let allLoans = []; 
let rawAllTimeLoans = []; 
let curPay = null;
let loggedInPassword = ''; 
let windowUsersData = []; 
let windowRecentPays = []; 

let currentPinInput = "";
let detectedNfcUid = "";
let timeLogoutVar;
let pendingAction = null; 
let globalConfirmCallback = null;

const DAY_NAMES = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

document.getElementById('cStartDate').valueAsDate = new Date();

let currentYear = new Date().getFullYear() + 543;
let yearHtml = '<option value="all">ทุกปี</option>';
for(let y = currentYear - 2; y <= currentYear + 2; y++) yearHtml += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
document.getElementById('dashFilterYear').innerHTML = yearHtml;

// 🟢 ตัวช่วยแปลง String เป็น Date ให้รองรับกับ iOS/Safari
function safeDateParse(dateStr) {
  if (!dateStr) return new Date(NaN);
  if (String(dateStr).includes('T')) return new Date(dateStr); 
  return new Date(String(dateStr).replace(/-/g, '/')); 
}

function formatThaiDateWithDay(dateString) {
  let d = safeDateParse(dateString);
  if(isNaN(d.getTime())) return '-';
  return DAY_NAMES[d.getDay()] + ' ' + d.toLocaleDateString('th-TH');
}

function getSafeImgUrl(url) {
  if (!url || url === 'ไม่มี') return '';
  let match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/d\/([a-zA-Z0-9_-]+)/);
  return (match && match[1]) ? 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w1000' : url; 
}

function zoomImage(url) {
  if(!url || url === 'ไม่มี') return;
  document.getElementById('fullSizeImage').src = url;
  document.getElementById('imageViewer').style.display = 'flex';
}

function closeImageViewer() { document.getElementById('imageViewer').style.display = 'none'; }

// 🟢 Debounce สำหรับการค้นหา (ลดการกระตุก)
function debounce(func, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// 🟢 Throttle สำหรับ Inactivity Timer (ลดการกินแบตเตอรี่)
let lastActivityTime = 0;
function resetInactivityTimer() {
  const now = Date.now();
  if (now - lastActivityTime > 1000) { 
    lastActivityTime = now;
    clearTimeout(timeLogoutVar);
    if (sessionStorage.getItem('fintechAuthData')) timeLogoutVar = setTimeout(logout, 300000); 
  }
}

function processDashboardData(res) {
  allLoans = res.activeLoans || []; rawAllTimeLoans = res.allTimeLoans || []; windowUsersData = res.users || [];
  windowRecentPays = res.recentPayments || []; 
  
  if(res.allAdmins && res.allAdmins.length > 0) {
    let filterAdminHtml = '<option value="all">ทั้งหมด</option>';
    res.allAdmins.forEach(ad => {
      filterAdminHtml += `<option value="${ad.id}">${ad.name}</option>`;
    });
    let fa = document.getElementById('filterAdmin');
    if(fa) fa.innerHTML = filterAdminHtml;
  }
  
  updateDashMetrics(); 
  
  let optHtml = '<option value="NEW">➕ สร้างบัญชีใหม่ (ระบุด้านล่าง)</option>';
  let datalistHtml = '';
  if(res.users) res.users.forEach(u => { optHtml += `<option value="${u.id}">👤 ${u.name} (${u.nickname})</option>`; });
  allLoans.forEach(l => { 
    let name = l.userName + (l.nickname ? ` (${l.nickname})` : '');
    datalistHtml += `<option value="${l.loanId}">👤 ${name} (ค้าง: ฿${Number(l.amount).toLocaleString()})</option>`;
  }); 
  
  document.getElementById('cUserSelect').innerHTML = optHtml;
  document.getElementById('payLoanOptions').innerHTML = datalistHtml;
  renderDashAlerts(); applyRecentPaysLimit(); filterUsers(); applyFilters();
}

window.onload = () => {
  const urlParams = new URLSearchParams(window.location.search);
  detectedNfcUid = urlParams.get('uid');
  
  let authData = sessionStorage.getItem('fintechAuthData');
  if(authData) {
    let parsed = JSON.parse(authData);
    
    if (detectedNfcUid && String(detectedNfcUid).trim() !== String(parsed.userId).trim()) {
      sessionStorage.removeItem('fintechAuthData');
      checkNfcEntry();
    } else if(Date.now() - parsed.timestamp < 43200000) { 
      loggedInPassword = atob(parsed.token); // 🟢 แปลงคืนค่าจาก Base64 ในหน่วยความจำ
      window.history.replaceState({}, document.title, window.location.pathname);
      document.getElementById('loginPage').style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';
      loadDash();
    } else {
      sessionStorage.removeItem('fintechAuthData');
      checkNfcEntry();
    }
  } else {
    checkNfcEntry();
  }

  function checkNfcEntry() {
    if (detectedNfcUid) {
      document.getElementById('noNfcWarning').style.display = 'none';
      document.getElementById('nfcLoginBox').style.display = 'block';
      document.getElementById('nfcUserDisplay').innerText = detectedNfcUid;
    } else {
      document.getElementById('noNfcWarning').style.display = 'block';
      document.getElementById('nfcLoginBox').style.display = 'none';
    }
  }

  resetInactivityTimer();
  ['mousemove','keypress','touchstart','click','scroll'].forEach(evt => document.addEventListener(evt, resetInactivityTimer));
};

function pressPin(num) {
  if (currentPinInput.length >= 4) return;
  currentPinInput += num;
  updatePinDots();
  if (currentPinInput.length === 4) submitNfcLogin();
}

function clearPin() { currentPinInput = ""; updatePinDots(); }

function updatePinDots() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById('dot' + i);
    if (i <= currentPinInput.length) dot.classList.add('active');
    else dot.classList.remove('active');
  }
}

function cancelNfcLogin() {
  currentPinInput = ""; updatePinDots(); detectedNfcUid = "";
  document.getElementById('nfcLoginBox').style.display = 'none';
  document.getElementById('noNfcWarning').style.display = 'block';
  window.history.replaceState({}, document.title, window.location.pathname);
}

async function submitNfcLogin() {
  const res = await api({ action: 'loginNfc', userId: detectedNfcUid, pin: currentPinInput });
  
  if (res.success) {
    loggedInPassword = currentPinInput; 
    // 🟢 ซ่อนรหัสผ่านใน Storage แบบ Base64 ขั้นพื้นฐาน
    sessionStorage.setItem('fintechAuthData', JSON.stringify({ userId: res.userId, token: btoa(currentPinInput), timestamp: Date.now(), role: res.role, groupName: res.groupName }));
    window.history.replaceState({}, document.title, window.location.pathname);
    
    if(res.role === 'SuperAdmin') {
       document.getElementById('btnManageAdmin').style.display = 'block'; 
       document.getElementById('cGroupDiv').style.display = 'block';
       document.getElementById('filterAdminWrap').style.display = 'block'; 
    } else {
       document.getElementById('btnManageAdmin').style.display = 'none'; 
       document.getElementById('cGroupDiv').style.display = 'none';
       document.getElementById('filterAdminWrap').style.display = 'none';
    }

    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    clearPin(); 
    if(res.dashboard) processDashboardData(res.dashboard); 
    resetInactivityTimer(); 
  } else {
    showAlert(res.error || 'รหัส PIN ไม่ถูกต้อง!', true); clearPin();
  }
}

function toggleL(s) { document.getElementById('loader').style.display = s ? 'flex' : 'none'; }
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function toggleCycleMode() {
  let mode = document.getElementById('cCycleMode').value;
  document.getElementById('cPresetContainer').style.display = (mode === 'preset') ? 'block' : 'none';
  document.getElementById('cDayOfWeekContainer').style.display = (mode === 'fixed_day') ? 'block' : 'none';
  document.getElementById('cCustomContainer').style.display = (mode === 'custom') ? 'block' : 'none';
}
 
function toggleEditCycleMode() {
  let mode = document.getElementById('eCycleMode').value;
  document.getElementById('ePresetContainer').style.display = (mode === 'preset') ? 'block' : 'none';
  document.getElementById('eDayOfWeekContainer').style.display = (mode === 'fixed_day') ? 'block' : 'none';
  document.getElementById('eCustomContainer').style.display = (mode === 'custom') ? 'block' : 'none';
}

function clearForms() {
  const ids = ['cName','cNick','cPhone','cDetails','cPhoto','cIdCard','cImg3','cImg4','cImg5','cAmount','cCustomInterval','loanIdInput','pTotalPaidInput','pFinePaidInput','pSlip','caId','caPass','caName','caPin','authPassword'];
  ids.forEach(id => {
    let el = document.getElementById(id);
    if(el) el.value = '';
  });
  document.getElementById('cSchedulePreview').innerHTML = '';
  document.getElementById('cUserSelect').value = 'NEW';
  document.getElementById('cUpfrontInt').checked = false;
  
  document.getElementById('cCycleMode').value = 'preset';
  document.getElementById('cPresetInterval').value = '1';
  document.getElementById('cCustomInterval').value = '1';
  toggleCycleMode(); 
  toggleNewUserForm();
  
  document.getElementById('payDetails').style.display = 'none';
  document.getElementById('pWarning').style.display = 'none';
  curPay = null;
}

function showAlert(msg, isError = false) {
  document.getElementById('alertMsg').innerText = msg;
  document.getElementById('alertTitle').innerText = isError ? 'แจ้งเตือน' : 'สำเร็จ';
  document.getElementById('alertTitle').className = isError ? 'text-danger-corp fw-bold mb-2' : 'text-primary-corp fw-bold mb-2';
  document.getElementById('alertIcon').className = isError ? 'fa-solid fa-circle-xmark text-danger-corp mb-3' : 'fa-solid fa-circle-check text-success-corp mb-3';
  document.querySelector('#customAlert .pro-card').style.borderTopColor = isError ? '#ef4444' : '#2563eb';
  document.getElementById('alertBtn').className = isError ? 'btn btn-danger text-white fw-bold px-4 py-3 w-100 rounded-pill' : 'btn bg-primary-corp text-white fw-bold px-4 py-3 w-100 rounded-pill';
  document.getElementById('customAlert').style.display = 'flex';
}

function showConfirm(msg, callback) {
  document.getElementById('confirmMsg').innerText = msg;
  globalConfirmCallback = callback;
  document.getElementById('customConfirm').style.display = 'flex';
}

function closeConfirm() {
  document.getElementById('customConfirm').style.display = 'none';
  globalConfirmCallback = null;
}

function executeConfirm() {
  document.getElementById('customConfirm').style.display = 'none';
  if(globalConfirmCallback) globalConfirmCallback();
}

function switchMainTab(tab) {
  ['Dash', 'Users', 'List'].forEach(t => {
    document.getElementById('btnTab'+t).classList.remove('active');
    document.getElementById('view'+t).style.display = 'none';
  });
  document.getElementById('btnTab'+tab).classList.add('active');
  document.getElementById('view'+tab).style.display = 'block';
}

function switchDetailTab(tab) {
  ['History', 'Schedule'].forEach(t => {
    document.getElementById('tabBtn'+t).classList.remove('active');
    document.getElementById('d'+t).style.display = 'none';
  });
  document.getElementById('tabBtn'+tab).classList.add('active');
  document.getElementById('d'+tab).style.display = 'block';
}

// 🟢 รวม Loader เอาไว้ในฟังก์ชันนี้เลย ไม่ต้องสั่ง toggleL ทุกรอบ
async function api(data, showLoader = true) {
  if (showLoader) toggleL(true);
  try {
      const r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(data) });
      return await r.json();
  } catch (e) {
      return { success: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ' + e.message };
  } finally {
      if (showLoader) toggleL(false);
  }
}

function logout() {
  clearTimeout(timeLogoutVar); 
  sessionStorage.removeItem('fintechAuthData'); 
  loggedInPassword = '';
  
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('logoutScreen').style.display = 'block';
  
  window.history.replaceState({}, document.title, window.location.pathname);
}

async function loadDash() {
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  if(!authData) return logout();

  if(authData.role === 'SuperAdmin') {
     document.getElementById('btnManageAdmin').style.display = 'block'; 
     document.getElementById('cGroupDiv').style.display = 'block';
     document.getElementById('filterAdminWrap').style.display = 'block';
  } else {
     document.getElementById('btnManageAdmin').style.display = 'none'; 
     document.getElementById('cGroupDiv').style.display = 'none';
     document.getElementById('filterAdminWrap').style.display = 'none';
  }

  const res = await api({ action: 'getDashboard', adminId: authData.userId }); 
  
  if(res.success) {
      processDashboardData(res);
  } else {
      showAlert('ข้อผิดพลาด: ' + (res.error || 'โหลดข้อมูลล้มเหลว'), true);
  }
}

async function openManageAdmins() {
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  const res = await api({ action: 'getAdmins', operatorId: authData.userId }); 

  if(res.success) {
    let html = '';
    res.admins.forEach(a => {
      let roleBadge = a.role === 'SuperAdmin' ? '<span class="badge bg-danger">SuperAdmin</span>' : '<span class="badge bg-primary-corp">Admin</span>';
      let statusBadge = a.status === 'Active' ? '<span class="badge bg-success-corp">Active</span>' : '<span class="badge bg-secondary">Suspended</span>';
      let editBtn = a.role === 'SuperAdmin' ? '' : `<button class="btn btn-outline-secondary px-3 py-2" onclick="triggerEditAdmin('${a.id}', '${a.name}', '${a.groupName}', '${a.status}')"><i class="fa-solid fa-pen"></i></button>`;
      
      html += `
        <div class="pro-card p-3 mb-3 border-0 shadow-sm">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <b class="text-primary-corp d-block mb-2 fs-6">${a.name} (${a.id})</b>
              <div>${roleBadge} ${statusBadge} <span class="badge bg-light text-dark border">กลุ่ม: ${a.groupName || '-'}</span></div>
            </div>
            <div>${editBtn}</div>
          </div>
        </div>
      `;
    });
    document.getElementById('adminsListContainer').innerHTML = html;
    openModal('modalManageAdmins');
  } else showAlert(res.error, true);
}

function triggerEditAdmin(id, name, group, status) {
  document.getElementById('eaId').value = id; document.getElementById('eaName').value = name;
  document.getElementById('eaGroup').value = group || 'A'; document.getElementById('eaStatus').value = status || 'Active';
  document.getElementById('eaPin').value = ''; document.getElementById('eaPass').value = ''; 
  closeModal('modalManageAdmins'); openModal('modalEditAdmin');
}

async function submitEditAdmin() {
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  let payload = { action: 'editAdmin', operatorId: authData.userId, targetAdminId: document.getElementById('eaId').value, name: document.getElementById('eaName').value, groupName: document.getElementById('eaGroup').value, status: document.getElementById('eaStatus').value, pinCode: document.getElementById('eaPin').value, password: document.getElementById('eaPass').value };
  if(payload.pinCode && payload.pinCode.length !== 4) { showAlert('รหัส PIN ต้องมี 4 หลัก', true); return; }

  const res = await api(payload); 
  if(res.success) { showAlert('อัปเดตข้อมูลแอดมินสำเร็จ'); closeModal('modalEditAdmin'); } else showAlert(res.error, true);
}

async function saveAdmin() {
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  let adId = document.getElementById('caId').value; let adPass = document.getElementById('caPass').value; let adName = document.getElementById('caName').value; let adGroup = document.getElementById('caGroup').value; let adPin = document.getElementById('caPin').value; 
  if(!adId || !adPass || !adGroup || !adPin) { showAlert('กรุณากรอกข้อมูลให้ครบถ้วน รวมถึงรหัส PIN', true); return; }
  if(adPin.length !== 4) { showAlert('รหัส PIN ต้องมีครบ 4 หลักพอดี', true); return; }

  const res = await api({ action: 'createAdmin', operatorId: authData.userId, newAdminId: adId, password: adPass, name: adName, groupName: adGroup, pinCode: adPin });
  if(res.success) { showAlert('สร้างแอดมินใหม่เรียบร้อยแล้ว'); clearForms(); closeModal('modalCreateAdmin'); loadDash(); } else showAlert(res.error || 'เกิดข้อผิดพลาด', true);
}

// 🟢 Debounce function
const debouncedFilterUsers = debounce(filterUsers, 300);

function filterUsers() {
  let val = document.getElementById('searchUser').value.toLowerCase();
  let limitVal = document.getElementById('userFilterLimit').value;
  
  let filtered = windowUsersData.filter(u => (u.name + u.nickname + u.phone).toLowerCase().includes(val));
  if(limitVal !== 'all') filtered = filtered.slice(0, parseInt(limitVal));
  renderUsers(filtered);
}

function renderUsers(usersArray) {
  let html = '';
  usersArray.forEach(u => {
    let userLoans = rawAllTimeLoans.filter(l => String(l.userId).trim() === String(u.id).trim() && l.status !== 'Deleted');
    let totalBorrowed = userLoans.reduce((sum, l) => sum + Number(l.originalPrincipal), 0);
    let safeUrl = getSafeImgUrl(u.photoUrl);
    let photoHtml = safeUrl ? `<img src="${safeUrl}" class="img-box" onclick="event.stopPropagation(); zoomImage('${safeUrl}')">` : `<div class="img-box d-flex justify-content-center align-items-center"><i class="fa-solid fa-user text-secondary fs-2"></i></div>`;
    html += `
      <div class="borrower-card" onclick="viewUserHistory('${u.id}')">
        <div class="d-flex align-items-center">
          <div class="me-3">${photoHtml}</div>
          <div>
            <h6 class="fw-bold mb-2 text-dark">${u.name} ${u.nickname ? `(${u.nickname})` : ''}</h6>
            <span class="text-muted small"><i class="fa-solid fa-file-contract me-1"></i>กู้ ${userLoans.length} ครั้ง | ฿${totalBorrowed.toLocaleString()}</span><br>
            <span class="text-muted small"><i class="fa-solid fa-users me-1"></i>กลุ่ม: ${u.groupName || '-'}</span>
          </div>
        </div>
      </div>`;
  });
  document.getElementById('usersContainer').innerHTML = html || '<div class="text-center text-muted p-4 border rounded bg-white mt-2">ไม่มีข้อมูลลูกค้า</div>';
}

function viewUserHistory(userId) {
  let user = windowUsersData.find(u => String(u.id).trim() === String(userId).trim()); if(!user) return;
  let safeFace = getSafeImgUrl(user.photoUrl); 
  let safeId = getSafeImgUrl(user.idCardUrl); 
  let safeImg3 = getSafeImgUrl(user.img3Url);
  let safeImg4 = getSafeImgUrl(user.img4Url);
  let safeImg5 = getSafeImgUrl(user.img5Url);
  
  let phoneStr = String(user.phone || '').replace(/'/g, '');
  
  let photo1 = safeFace ? `<img src="${safeFace}" class="img-box mb-1" style="width:80px; height:80px;" onclick="zoomImage('${safeFace}')">` : `<div class="img-box mb-1 mx-auto d-flex justify-content-center align-items-center" style="width:80px; height:80px;"><i class="fa-solid fa-user text-secondary fs-3"></i></div>`;
  let photo2 = safeId ? `<img src="${safeId}" class="img-box mb-1" style="width:80px; height:80px;" onclick="zoomImage('${safeId}')">` : `<div class="img-box mb-1 mx-auto d-flex justify-content-center align-items-center" style="width:80px; height:80px;"><i class="fa-solid fa-id-card text-secondary fs-3"></i></div>`;
  let photo3 = safeImg3 ? `<img src="${safeImg3}" class="img-box mb-1" style="width:80px; height:80px;" onclick="zoomImage('${safeImg3}')">` : ``;
  let photo4 = safeImg4 ? `<img src="${safeImg4}" class="img-box mb-1" style="width:80px; height:80px;" onclick="zoomImage('${safeImg4}')">` : ``;
  let photo5 = safeImg5 ? `<img src="${safeImg5}" class="img-box mb-1" style="width:80px; height:80px;" onclick="zoomImage('${safeImg5}')">` : ``;

  document.getElementById('uhProfile').innerHTML = `
    <div class="d-flex justify-content-center flex-wrap gap-2 mb-4">
      <div class="text-center">${photo1}<br><span class="text-muted fw-bold" style="font-size:0.7rem;">หน้าตรง</span></div>
      <div class="text-center">${photo2}<br><span class="text-muted fw-bold" style="font-size:0.7rem;">เอกสาร</span></div>
      ${photo3 ? `<div class="text-center">${photo3}<br><span class="text-muted fw-bold" style="font-size:0.7rem;">เพิ่มเติม</span></div>` : ''}
      ${photo4 ? `<div class="text-center">${photo4}<br><span class="text-muted fw-bold" style="font-size:0.7rem;">เพิ่มเติม</span></div>` : ''}
      ${photo5 ? `<div class="text-center">${photo5}<br><span class="text-muted fw-bold" style="font-size:0.7rem;">เพิ่มเติม</span></div>` : ''}
    </div>
    <h5 class="fw-bold text-primary-corp mb-2">${user.name} ${user.nickname ? `(${user.nickname})` : ''} <i class="fa-solid fa-pen text-warning-corp ms-2 p-2 bg-light rounded" style="cursor:pointer;" onclick="triggerEditUser('${user.id}')"></i></h5>
    <p class="text-muted mb-2"><i class="fa-solid fa-phone me-2"></i>${phoneStr || 'ไม่มีเบอร์โทร'}</p>
    <p class="text-muted small mb-3 px-2">${user.details || 'ไม่มีรายละเอียด'}</p>
    <span class="badge bg-white text-dark border shadow-sm px-3 py-2 fs-6">กลุ่ม: ${user.groupName || '-'}</span>
  `;

  let uLoans = rawAllTimeLoans.filter(l => String(l.userId).trim() === String(userId).trim()).sort((a,b) => safeDateParse(b.startDate) - safeDateParse(a.startDate));
  let html = '';
  if(uLoans.length === 0) html = '<div class="text-center text-muted p-4 border rounded bg-white">ยังไม่มีประวัติการกู้</div>';
  else {
    uLoans.forEach(l => {
      let statusBadge = '';
      if(l.status === 'Active') statusBadge = '<span class="badge bg-success-corp">กำลังกู้</span>';
      else if(l.status === 'Closed') statusBadge = '<span class="badge bg-secondary">ปิดยอดแล้ว</span>';
      else if(l.status === 'Deleted') statusBadge = '<span class="badge bg-danger">ยกเลิก/ลบสัญญา</span>';
      else statusBadge = `<span class="badge bg-danger">${l.status}</span>`;

      html += `
        <div class="pro-card p-3 mb-3 border-0 shadow-sm" style="cursor:pointer;" onclick="viewDetails('${l.loanId}')">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <b class="text-dark d-block mb-2">ยอดกู้: ฿${Number(l.originalPrincipal).toLocaleString()}</b>
              <span class="text-muted d-block mb-1 small"><i class="fa-regular fa-calendar me-1"></i>${formatThaiDateWithDay(l.startDate)}</span>
              <span class="text-primary-corp d-block mt-2 small"><i class="fa-solid fa-user-tie me-1"></i>แอดมิน: ${l.adminName || 'ไม่ระบุ'}</span>
            </div>
            <div class="text-end">
              ${statusBadge}
              <span class="d-block text-primary-corp fw-bold mt-3" style="font-size:0.85rem;">ดูรายละเอียด <i class="fa-solid fa-angle-right"></i></span>
            </div>
          </div>
        </div>`;
    });
  }
  document.getElementById('uhLoansList').innerHTML = html; openModal('modalUserHistory');
}

function triggerEditUser(userId) {
  let user = windowUsersData.find(u => String(u.id).trim() === String(userId).trim()); if(!user) return;
  document.getElementById('euUserId').value = user.id; document.getElementById('euName').value = user.name;
  document.getElementById('euNick').value = user.nickname; document.getElementById('euPhone').value = String(user.phone || '').replace(/'/g, ''); document.getElementById('euDetails').value = user.details;
  
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  if(authData.role === 'SuperAdmin') { 
      document.getElementById('euGroupDiv').style.display = 'block'; 
      document.getElementById('euGroup').value = user.groupName || 'A'; 
  } else document.getElementById('euGroupDiv').style.display = 'none';
  
  document.getElementById('euPhoto').value = ''; 
  document.getElementById('euIdCard').value = ''; 
  document.getElementById('euImg3').value = '';
  document.getElementById('euImg4').value = '';
  document.getElementById('euImg5').value = '';
  openModal('modalEditUser');
}

function compressImage(file, maxWidth = 800) {
  return new Promise((resolve) => {
    if (!file) { resolve(""); return; }
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image(); img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas'); let scaleSize = maxWidth / img.width; if (scaleSize > 1) scaleSize = 1;
        canvas.width = img.width * scaleSize; canvas.height = img.height * scaleSize;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      };
    };
  });
}

async function submitEditUser() {
  let btn = document.getElementById('btnConfirmEditUser');
  if(btn) btn.disabled = true;
  
  try {
    let photoBase64 = document.getElementById('euPhoto').files[0] ? await compressImage(document.getElementById('euPhoto').files[0]) : ''; 
    let idCardBase64 = document.getElementById('euIdCard').files[0] ? await compressImage(document.getElementById('euIdCard').files[0]) : '';
    let img3Base64 = document.getElementById('euImg3').files[0] ? await compressImage(document.getElementById('euImg3').files[0]) : '';
    let img4Base64 = document.getElementById('euImg4').files[0] ? await compressImage(document.getElementById('euImg4').files[0]) : '';
    let img5Base64 = document.getElementById('euImg5').files[0] ? await compressImage(document.getElementById('euImg5').files[0]) : '';
    
    let authData = JSON.parse(sessionStorage.getItem('fintechAuthData')); 
    let group = authData.role === 'SuperAdmin' ? document.getElementById('euGroup').value : undefined;
    
    const res = await api({ 
        action: 'editUser', 
        operatorId: authData.userId, 
        userId: document.getElementById('euUserId').value, 
        name: document.getElementById('euName').value, 
        nickname: document.getElementById('euNick').value, 
        phone: document.getElementById('euPhone').value, 
        details: document.getElementById('euDetails').value, 
        photoBase64: photoBase64, 
        idCardBase64: idCardBase64, 
        img3Base64: img3Base64,
        img4Base64: img4Base64,
        img5Base64: img5Base64,
        groupName: group 
    });
    
    if(res.success) { 
        showAlert('อัปเดตข้อมูลลูกค้าสำเร็จ'); closeModal('modalEditUser'); closeModal('modalUserHistory'); loadDash(); 
    } else {
        showAlert('เกิดข้อผิดพลาดในการอัปเดต: ' + res.error, true);
    }
  } catch(e) {
    showAlert('ระบบขัดข้อง: ' + e.message, true);
  } finally {
    if(btn) btn.disabled = false;
  }
}

function updateDashMetrics() {
  let fYear = document.getElementById('dashFilterYear').value; 
  let fMonth = document.getElementById('dashFilterMonth').value;
  
  let metrics = {
    TotalLoan: 0, TotalRemain: 0, TotalUsers: new Set()
  };
  
  let cycleMetrics = {};

  rawAllTimeLoans.forEach(l => {
    if (l.status === 'Deleted') return; 

    let d = safeDateParse(l.startDate);
    if(!isNaN(d.getTime())) {
      let y = d.getFullYear() + 543; let m = d.getMonth() + 1;
      if ((fYear === 'all' || fYear == y.toString()) && (fMonth === 'all' || fMonth == m.toString())) {
        let orig = Number(l.originalPrincipal) || 0; let remain = Number(l.remainingPrincipal) || 0;
        metrics.TotalLoan += orig; 
        
        if(l.status === 'Active') {
          metrics.TotalRemain += remain;
          metrics.TotalUsers.add(l.userId);
        }
        
        let c = String(l.cycle);
        if (!cycleMetrics[c]) cycleMetrics[c] = { loan: 0, remain: 0 };
        cycleMetrics[c].loan += orig;
        if (l.status === 'Active') cycleMetrics[c].remain += remain;
      }
    }
  });

  if(document.getElementById('mTotalLoan')) document.getElementById('mTotalLoan').innerText = Math.round(metrics.TotalLoan).toLocaleString(); 
  if(document.getElementById('mTotalRemain')) document.getElementById('mTotalRemain').innerText = Math.round(metrics.TotalRemain).toLocaleString(); 
  if(document.getElementById('mTotalUsers')) document.getElementById('mTotalUsers').innerText = metrics.TotalUsers.size.toLocaleString();
  
  let cycleHtml = '';
  let sortedCycles = Object.keys(cycleMetrics).sort((a, b) => Number(a) - Number(b));
  let hasData = false;

  sortedCycles.forEach(c => {
    let data = cycleMetrics[c];
    if (data.loan === 0 && data.remain === 0) return;

    hasData = true;
    let cNum = Number(c);
    let cLabel = `ส่งทุก ${cNum} วัน`;
    if (cNum === 1) cLabel = "ส่งรายวัน";
    else if (cNum === 7) cLabel = "รายสัปดาห์ (7 วัน)";
    else if (cNum === 30) cLabel = "รายเดือน (30 วัน)";

    cycleHtml += `
     <div class="d-flex justify-content-between align-items-center p-3 border-bottom bg-white">
        <div class="d-flex align-items-center">
           <div class="bg-light text-primary-corp rounded-3 d-flex justify-content-center align-items-center fw-bold me-3 shadow-sm border" style="width: 45px; height: 45px; font-size: 1.1rem;">${cNum}</div>
           <div>
              <span class="d-block fw-bold text-dark mb-1">${cLabel}</span>
              <span class="d-block text-muted small" style="font-size: 0.75rem;">ปล่อยกู้: ฿${Math.round(data.loan).toLocaleString()}</span>
           </div>
        </div>
        <div class="text-end">
           <span class="d-block fw-bold text-warning-corp fs-6">ค้าง: ฿${Math.round(data.remain).toLocaleString()}</span>
        </div>
     </div>
    `;
  });

  if(!hasData) cycleHtml = `<div class="p-4 text-center text-muted bg-white small">ยังไม่มีข้อมูลในเดือนนี้</div>`;

  if(document.getElementById('cycleBreakdownContainer')) {
    document.getElementById('cycleBreakdownContainer').innerHTML = cycleHtml;
  }
}

function applyRecentPaysLimit() {
  let limitVal = document.getElementById('recentPaysLimit').value;
  let dataToRender = windowRecentPays;
  if(limitVal !== 'all') dataToRender = windowRecentPays.slice(0, parseInt(limitVal));
  renderRecentPays(dataToRender);
}

function renderRecentPays(data) {
  let html = '';
  if (!data || data.length === 0) html = '<div class="text-center text-muted p-4 border rounded bg-white">ไม่มีประวัติการรับชำระเงิน</div>';
  else {
    data.forEach(p => {
      let slipBtn = p.slipUrl && p.slipUrl !== 'ไม่มี' ? `<a href="${getSafeImgUrl(p.slipUrl)}" target="_blank" class="text-primary-corp fs-3 mt-2 me-3"><i class="fa-solid fa-file-invoice"></i></a>` : ``;
      html += `
        <div class="pro-card p-4 mb-3 border-0 shadow-sm" style="border-left: 5px solid #10b981 !important;">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <b class="text-dark fs-6"><i class="fa-solid fa-user text-secondary me-2"></i> ${p.userName}</b>
              <span class="d-block text-muted mt-2 small"><i class="fa-regular fa-clock me-1"></i>${p.date} | งวดที่ ${p.no}</span>
              <span class="d-block text-danger-corp fw-bold mt-2 small">ค่าปรับ: ฿${Number(p.finePaid || 0).toLocaleString()}</span>
            </div>
            <div class="text-end">
              <b class="text-success-corp d-block" style="font-size:1.3rem;">+ ฿${Number(p.totalPaid || 0).toLocaleString()}</b>
              <div class="d-flex justify-content-end align-items-center mt-2">
                 ${slipBtn}
                 <i class="fa-solid fa-trash-can text-danger-corp bg-light p-2 rounded" style="cursor:pointer; font-size:1.3rem;" onclick="triggerDeletePayment('${p.id}', '${p.loanId}')" title="ลบรายการนี้"></i>
              </div>
            </div>
          </div>
        </div>`;
    });
  }
  document.getElementById('recentPaysContainer').innerHTML = html;
}

function renderDashAlerts() {
  let alertLoans = allLoans.filter(l => (Number(l.daysLeft) || 0) <= 3);
  let html = '';
  alertLoans.forEach(b => {
    let dLeft = Number(b.daysLeft) || 0; 
    let statusClass = dLeft < 0 ? 'bg-danger' : (dLeft === 0 ? 'bg-warning text-dark' : 'bg-success-corp'); 
    let statusText = dLeft < 0 ? `เกินกำหนด ${Math.abs(dLeft)} วัน` : (dLeft === 0 ? 'ครบดิววันนี้' : `อีก ${dLeft} วัน`);
    
    let installmentPay = Number(b.installment || b.installmentAmount || b.perInstallment || 0);
    let cInst = b.currentInst || 1;
    let tInst = b.totalInst || 1;

    html += `
      <div class="borrower-card p-3 mb-3 shadow-sm" onclick="viewDetails('${b.loanId}')" style="border-left-color: var(--danger); border-radius: 16px;">
          <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
              <h6 class="fw-bold m-0 text-dark text-truncate pe-2" style="max-width: 70%;">
                  <i class="fa-solid fa-circle-user text-secondary me-2"></i>${b.userName || 'ไม่ระบุชื่อ'}
              </h6>
              <span class="status-badge ${statusClass} shadow-sm" style="font-size:0.75rem; padding: 4px 10px;">${statusText}</span>
          </div>

          <div class="d-flex justify-content-between align-items-center mb-2">
              <div>
                  <span class="d-block text-muted mb-1" style="font-size:0.7rem;">รหัส: ${b.loanId}</span>
                  <span class="text-danger-corp fw-bold" style="font-size:1.1rem;">ค้าง: ฿${Number(b.amount || 0).toLocaleString()}</span>
              </div>
              <div class="text-end">
                  <span class="d-block text-muted mb-1" style="font-size:0.7rem;">ค่างวด ${installmentPay > 0 ? `(${cInst}/${tInst})` : ''}</span>
                  <span class="text-success-corp fw-bold" style="font-size:1.1rem;">${installmentPay > 0 ? `฿${installmentPay.toLocaleString()}` : '-'}</span>
              </div>
          </div>

          <div class="text-end mt-2 pt-2 border-top">
              <button class="btn bg-primary-corp rounded-pill px-4 py-2 shadow-sm fw-bold w-100" style="font-size:0.85rem;" onclick="event.stopPropagation(); clearForms(); quickPay('${b.loanId}')">รับชำระ</button>
          </div>
      </div>`;
  });
  document.getElementById('dashAlertContainer').innerHTML = html || '<div class="text-center text-muted p-4 border rounded bg-white mx-2 mb-3">ไม่มีรายการค้างชำระ / ใกล้ครบดิว</div>';
}

function renderList(data) {
  let html = '';
  data.forEach(b => {
      let dLeft = Number(b.daysLeft) || 0; 
      let statusClass = dLeft < 0 ? 'bg-danger' : (dLeft <= 3 ? 'bg-warning text-dark' : 'bg-success-corp'); 
      let statusText = dLeft < 0 ? `เกินกำหนด` : (dLeft === 0 ? 'ครบดิววันนี้' : `อีก ${dLeft} วัน`);
      
      let installmentPay = Number(b.installment || b.installmentAmount || b.perInstallment || 0);
      let cInst = b.currentInst || 1;
      let tInst = b.totalInst || 1;

      html += `
      <div class="borrower-card loan-item p-3 mb-3 shadow-sm" onclick="viewDetails('${b.loanId}')" style="border-left-color: var(--primary); border-radius: 16px;">
          <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="fw-bold m-0 text-dark text-truncate pe-2" style="max-width: 70%;">
                  <i class="fa-solid fa-circle-user text-secondary me-2"></i>${b.userName} ${b.nickname ? `(${b.nickname})` : ''}
              </h6>
              <span class="badge bg-light text-secondary border px-2 py-1" style="font-size:0.75rem; white-space:nowrap;">รอบ ${b.cycle} วัน</span>
          </div>
          
          <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
              <span class="text-muted small m-0" style="font-size:0.8rem;"><i class="fa-solid fa-hashtag me-1"></i>${b.loanId}</span>
              <span class="status-badge ${statusClass} shadow-sm" style="font-size:0.75rem; padding: 4px 10px;">${statusText}</span>
          </div>

          <div class="d-flex justify-content-between align-items-center mb-2">
              <div>
                  <span class="d-block text-muted mb-1" style="font-size:0.7rem;">ยอดหนี้คงค้าง</span>
                  <span class="text-primary-corp fw-bold" style="font-size:1.1rem;">฿${Number(b.amount || 0).toLocaleString()}</span>
              </div>
              <div class="text-end">
                  <span class="d-block text-muted mb-1" style="font-size:0.7rem;">ค่างวด ${installmentPay > 0 ? `(${cInst}/${tInst})` : ''}</span>
                  <span class="text-success-corp fw-bold" style="font-size:1.1rem;">${installmentPay > 0 ? `฿${installmentPay.toLocaleString()}` : '-'}</span>
              </div>
          </div>

          <div class="d-flex justify-content-between align-items-end mt-2 pt-2 border-top">
              <div class="text-muted" style="font-size:0.75rem;">
                  <div class="mb-1"><i class="fa-regular fa-calendar me-1"></i>ดิว: <span class="text-dark fw-bold">${b.dueDate}</span></div>
                  <div>
                      <i class="fa-solid fa-user-tie me-1"></i>${b.adminName || '-'} 
                      <span class="mx-1 text-light">|</span> 
                      <i class="fa-solid fa-users me-1"></i>${b.groupName || '-'}
                  </div>
              </div>
              <button class="btn bg-primary-corp rounded-pill px-4 py-2 shadow-sm fw-bold" style="font-size:0.85rem;" onclick="event.stopPropagation(); clearForms(); quickPay('${b.loanId}')">รับชำระ</button>
          </div>
      </div>`;
  });
  document.getElementById('loanContainer').innerHTML = html || '<div class="text-center text-muted p-4 border rounded bg-white">ไม่มีข้อมูลที่ค้นหา</div>';
}

// 🟢 Debounce function
const debouncedApplyFilters = debounce(applyFilters, 300);

function applyFilters() {
  let cycleVal = document.getElementById('filterCycle').value; 
  let statusVal = document.getElementById('filterStatus').value; 
  let sortVal = document.getElementById('filterSort').value; 
  let limitVal = document.getElementById('filterLimit').value; 
  let searchVal = document.getElementById('searchLoan').value.toLowerCase();
  
  let adminFilter = document.getElementById('filterAdmin') ? document.getElementById('filterAdmin').value : 'all';

  let filtered = allLoans.filter(l => {
    let matchCycle = (cycleVal === 'all' || l.cycle.toString() === cycleVal); 
    let matchStatus = true; 
    let dLeft = Number(l.daysLeft) || 0;
    if (statusVal === 'due') matchStatus = (dLeft >= 0 && dLeft <= 3); 
    else if (statusVal === 'overdue') matchStatus = (dLeft < 0); 
    
    let matchSearch = (l.userName + l.nickname + l.loanId).toLowerCase().includes(searchVal); 
    let matchAdmin = (adminFilter === 'all' || String(l.operatorId).trim() === String(adminFilter).trim());

    return matchCycle && matchStatus && matchSearch && matchAdmin;
  });

  if (sortVal === 'due') filtered.sort((a, b) => a.daysLeft - b.daysLeft); 
  else if (sortVal === 'amtDesc') filtered.sort((a, b) => Number(b.amount) - Number(a.amount)); 
  else if (sortVal === 'amtAsc') filtered.sort((a, b) => Number(a.amount) - Number(b.amount));

  if(limitVal !== 'all') filtered = filtered.slice(0, parseInt(limitVal)); 
  renderList(filtered);
}

function triggerDelete(id) {
  promptPassword(() => {
    showConfirm('🚨 คำเตือน:\nคุณต้องการ "ลบ" สัญญานี้อย่างถาวรใช่หรือไม่?', () => {
      let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
      api({ action: 'deleteLoan', loanId: id, operatorId: authData.userId }).then(res => { if(res.success) { showAlert('ลบข้อมูลสัญญาเรียบร้อยแล้ว'); loadDash(); } else showAlert('เกิดข้อผิดพลาดในการลบ', true); });
    });
  });
}

function triggerArchive() {
  promptPassword(() => {
    showConfirm('📦 ยืนยันการย้ายข้อมูลเก่าลง Archive?\nระบบจะทำการย้ายสัญญาที่ (ปิดยอด/ถูกลบ) ที่เกิน 6 เดือน ไปเก็บในชีตสำรองเพื่อลดความหนืดของระบบ', () => {
      let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
      api({ action: 'archiveData', operatorId: authData.userId }).then(res => { 
        if(res.success) { showAlert('จัดเก็บข้อมูลเก่าลง Archive สำเร็จ!\nย้ายข้อมูลไปทั้งหมด ' + res.count + ' สัญญา'); loadDash(); } 
        else { showAlert(res.error, true); }
      });
    });
  });
}

function triggerEdit(id) {
  let loan = allLoans.find(l => String(l.loanId).trim() === String(id).trim()); if(!loan) return;
  api({ action: 'getLoanDetails', loanId: id }).then(res => {
    if(res.success) {
      document.getElementById('eLoanId').value = id; document.getElementById('eUserId').value = loan.userId;
      if(res.startDateRaw) document.getElementById('eStartDate').value = res.startDateRaw;
      document.getElementById('eAmount').value = Number(res.principal || 0); document.getElementById('eRate').value = Number(res.rate || 0); 
      
      let cycleNum = Number(res.cycle) || 1;
      if ([1, 3, 5, 7, 14, 21, 30].includes(cycleNum)) {
          document.getElementById('eCycleMode').value = 'preset';
          document.getElementById('ePresetInterval').value = cycleNum;
      } else {
          document.getElementById('eCycleMode').value = 'custom';
          document.getElementById('eCustomInterval').value = cycleNum;
      }
      
      toggleEditCycleMode();
      openModal('modalEdit');
    }
  });
}
 
async function submitEdit() {
  let btn = document.getElementById('btnConfirmEdit');
  if(btn) btn.disabled = true;
  
  try {
    let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
    let cycleMode = document.getElementById('eCycleMode').value;
    let cycleVal = '1';
    let targetDay = null;
    
    if (cycleMode === 'fixed_day') {
        cycleVal = 'fixed_day';
        targetDay = document.getElementById('eDayOfWeek').value;
    } else if (cycleMode === 'preset') {
        cycleVal = document.getElementById('ePresetInterval').value;
    } else if (cycleMode === 'custom') {
        cycleVal = document.getElementById('eCustomInterval').value;
    }
    
    const res = await api({ action: 'editLoan', operatorId: authData.userId, loanId: document.getElementById('eLoanId').value, userId: document.getElementById('eUserId').value, amount: document.getElementById('eAmount').value, rate: document.getElementById('eRate').value, cycle: cycleVal, targetDay: targetDay, startDate: document.getElementById('eStartDate').value });
    
    if(res.success) { 
        showAlert('อัปเดตข้อมูลสัญญาสำเร็จ'); closeModal('modalEdit'); loadDash(); 
    } else {
        showAlert('เกิดข้อผิดพลาด: ' + res.error, true);
    }
  } catch(e) {
    showAlert('ระบบขัดข้อง: ' + e.message, true);
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function viewDetails(id) {
  const res = await api({ action: 'getLoanDetails', loanId: id }); 
  if(res.success) {
    document.getElementById('dName').innerText = `${res.userName} ${res.nickname ? `(${res.nickname})` : ''}`; 
    document.getElementById('dDetails').innerHTML = `${res.details || 'ไม่มีข้อมูลเพิ่มเติม'}`;
    
    let infoHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; row-gap: 8px; column-gap: 4px;" class="text-muted small">
        <div class="d-flex align-items-center text-truncate">
          <i class="fa-solid fa-hashtag me-2 text-primary-corp opacity-75" style="width: 14px;"></i>
          รหัส:<span class="text-dark ms-1 fw-bold text-truncate">${res.loanId}</span>
        </div>
        <div class="d-flex align-items-center text-truncate">
          <i class="fa-regular fa-calendar me-2 text-primary-corp opacity-75" style="width: 14px;"></i>
          เริ่ม:<span class="text-dark ms-1 fw-bold text-truncate">${res.startDate}</span>
        </div>
        <div class="d-flex align-items-center text-truncate">
          <i class="fa-solid fa-user-tie me-2 text-primary-corp opacity-75" style="width: 14px;"></i>
          แอดมิน:<span class="text-dark ms-1 fw-bold text-truncate">${res.adminName}</span>
        </div>
        <div class="d-flex align-items-center text-truncate">
          <i class="fa-solid fa-users me-2 text-primary-corp opacity-75" style="width: 14px;"></i>
          กลุ่ม:<span class="text-dark ms-1 fw-bold text-truncate">${res.groupName || '-'}</span>
        </div>
      </div>
    `;
    document.getElementById('dInfoGrid').innerHTML = infoHtml;
    
    document.getElementById('dPrin').innerText = `฿${Number(res.principal || 0).toLocaleString()}`; document.getElementById('dPaid').innerText = `฿${Number(res.totalPaid || 0).toLocaleString()}`; document.getElementById('dRemain').innerText = `฿${Number(res.remaining !== undefined ? res.remaining : (res.remainingPrincipal || 0)).toLocaleString()}`;
    
    let loanObj = allLoans.find(l => String(l.loanId).trim() === String(id).trim()) || rawAllTimeLoans.find(l => String(l.loanId).trim() === String(id).trim());
    let currentUserId = loanObj ? loanObj.userId : null;
    
    let isDeleted = (res.status === 'Deleted');
    let isActive = (res.status === 'Active');
    
    document.getElementById('btnDetailPay').disabled = !isActive;
    document.getElementById('btnDetailEdit').disabled = isDeleted;
    document.getElementById('btnDetailDelete').disabled = isDeleted;

    document.getElementById('btnDetailPay').onclick = () => { if(isActive) { closeModal('modalDetails'); clearForms(); quickPay(id); } };
    document.getElementById('btnDetailHistory').onclick = () => { if(currentUserId) { closeModal('modalDetails'); viewUserHistory(currentUserId); } };
    document.getElementById('btnDetailEdit').onclick = () => { if(!isDeleted) { closeModal('modalDetails'); triggerEdit(id); } };
    document.getElementById('btnDetailDelete').onclick = () => { if(!isDeleted) { closeModal('modalDetails'); triggerDelete(id); } };
    
    let hHtml = '';
    if(!res.payments || res.payments.length === 0) hHtml = '<div class="text-center text-muted p-4 border rounded bg-white">ยังไม่มีประวัติการรับชำระ</div>';
    else {
      res.payments.forEach(p => {
        let fineText = Number(p.finePaid || 0) > 0 ? `<br><span class="text-danger-corp fw-bold">ค่าปรับ: ฿${Number(p.finePaid).toLocaleString()}</span>` : '';
        
        let titleRow = '';
        if(String(p.no) === '0') {
           titleRow = `<b class="text-danger-corp fs-6">หักดอกเบี้ยล่วงหน้า <span class="text-muted fw-normal d-block mt-1" style="font-size:0.75rem;">(${p.date})</span></b>`;
        } else {
           titleRow = `<b class="text-dark fs-6">งวดที่ ${p.no} <span class="text-muted fw-normal d-block mt-1" style="font-size:0.75rem;">(${p.date})</span></b>`;
        }
        
        hHtml += `
          <div class="pro-card p-3 mb-3 border-0 shadow-sm" style="border-left: 4px solid #10b981 !important;">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                ${titleRow}
                <span class="text-muted d-block mt-1 small" style="font-size:0.75rem;">ตัดต้น ฿${Number(p.prinPaid || 0).toLocaleString()} | ตัดดอก ฿${Number(p.intPaid || 0).toLocaleString()} ${fineText}</span>
              </div>
              <div class="text-end">
                <b class="text-success-corp d-block mb-1" style="font-size:1.1rem;">฿${Number(p.totalPaid || 0).toLocaleString()}</b>
                <div class="d-flex gap-2 justify-content-end align-items-center mt-1">
                   ${p.slipUrl && p.slipUrl !== 'ไม่มี' ? `<a href="${getSafeImgUrl(p.slipUrl)}" target="_blank" class="text-primary-corp fw-bold text-decoration-none fs-5"><i class="fa-solid fa-file-invoice"></i></a>` : ''}
                   <i class="fa-solid fa-trash-can text-danger-corp p-2 bg-light rounded" style="cursor:pointer; font-size:1.1rem;" onclick="triggerDeletePayment('${p.id}', '${res.loanId}')" title="ลบรายการรับเงินนี้"></i>
                </div>
              </div>
            </div>
          </div>`;
      });
    }
    document.getElementById('dHistory').innerHTML = hHtml;

    let sHtml = '';
    if(!res.schedule || res.schedule.length === 0) sHtml = '<div class="text-center text-muted p-4 border rounded bg-white">ไม่มีข้อมูลตารางชำระ</div>';
    else {
      res.schedule.forEach(s => { sHtml += `<div class="d-flex justify-content-between text-muted border-bottom py-2 small"><span class="fw-bold text-dark">งวดที่ ${s.no}: <span class="text-muted fw-normal ms-2">${s.date}</span></span><b class="text-primary-corp">฿${Number(s.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</b></div>`; });
    }
    document.getElementById('dSchedule').innerHTML = sHtml;
    
    switchDetailTab('History'); openModal('modalDetails');
  }
}

function triggerDeletePayment(paymentId, loanId) {
  promptPassword(() => {
     showConfirm('คุณต้องการ "ลบประวัติรับชำระเงิน" รหัสงวดนี้ใช่หรือไม่?\n(เงินจะถูกดึงกลับเข้าสัญญา)', () => {
        let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
        api({ action: 'deletePayment', paymentId: paymentId, loanId: loanId, operatorId: authData.userId }).then(res => {
           if (res.success) {
              showAlert('ลบประวัติรับชำระเงินสำเร็จ!');
              closeModal('modalDetails'); closeModal('modalRecentPays'); loadDash();
           } else showAlert(res.error, true);
        });
     });
  });
}

function promptPassword(callback) {
  pendingAction = callback; document.getElementById('authPassword').value = ''; openModal('modalAuth');
}

function confirmPassword() {
  if(String(document.getElementById('authPassword').value).trim() === String(loggedInPassword).trim()) {
    closeModal('modalAuth'); if(pendingAction) pendingAction();
  } else showAlert('รหัสยืนยันตัวตนไม่ถูกต้อง!', true);
}

function toggleNewUserForm() { document.getElementById('newUserFormBox').style.display = (document.getElementById('cUserSelect').value === 'NEW') ? 'block' : 'none'; }

function generateSchedulePreview() {
  let amount = Number(document.getElementById('cAmount').value) || 0; 
  let rate = Number(document.getElementById('cRate').value) || 0; 
  let inst = Number(document.getElementById('cInstallments').value) || 1; 
  let dateStr = document.getElementById('cStartDate').value;
  
  let cycleMode = document.getElementById('cCycleMode').value;
  let cycle = 1;
  
  if (cycleMode === 'fixed_day') {
      cycle = 7;
  } else if (cycleMode === 'preset') {
      cycle = Number(document.getElementById('cPresetInterval').value) || 1;
  } else if (cycleMode === 'custom') {
      cycle = Number(document.getElementById('cCustomInterval').value) || 1;
  }
  
  let isUpfront = document.getElementById('cUpfrontInt').checked;
  
  if(!dateStr || amount === 0) { document.getElementById('cSchedulePreview').innerHTML = '<div class="text-muted text-center p-4">กรุณาระบุยอดเงินและวันที่เริ่มสัญญา</div>'; return; }
  
  let start = safeDateParse(dateStr); 
  if(isNaN(start.getTime())) { document.getElementById('cSchedulePreview').innerHTML = '<div class="text-danger text-center p-3">รูปแบบวันที่ไม่ถูกต้อง</div>'; return; }
  
  let firstDue = new Date(start);
  if (cycleMode === 'fixed_day') {
     let targetDay = Number(document.getElementById('cDayOfWeek').value);
     let diff = targetDay - start.getDay();
     if (diff <= 0) diff += 7; 
     firstDue.setDate(firstDue.getDate() + diff);
  } else {
     firstDue.setDate(firstDue.getDate() + cycle);
  }
  
  let intPerPeriod = amount * (rate / 100);
  let prinPerPeriod = amount / inst;

  let html = '';
  
  if (isUpfront) {
     html += `
     <div class="d-flex justify-content-between text-danger-corp border-bottom py-2 px-3 rounded mb-2" style="background-color: #fef2f2;">
       <span><b class="small">หัก ณ วันทำสัญญา:</b></span>
       <b class="small">ดอกเบี้ย ฿${intPerPeriod.toLocaleString(undefined, {minimumFractionDigits: 2})}</b>
     </div>
     <div class="d-flex justify-content-between text-success-corp border-bottom py-2 px-3 rounded mb-3" style="background-color: #f0fdf4;">
       <span><b class="small">ลูกค้ารับเงินสุทธิ:</b></span>
       <b style="font-size: 1.1rem;">฿${(amount - intPerPeriod).toLocaleString(undefined, {minimumFractionDigits: 2})}</b>
     </div>`;
  }
  
  for(let i = 1; i <= inst; i++) {
    let d = new Date(firstDue);
    d.setDate(d.getDate() + ((i-1) * cycle));
    let dayStr = DAY_NAMES[d.getDay()] + ' ' + d.toLocaleDateString('th-TH');
    html += `<div class="d-flex justify-content-between text-muted border-bottom py-2 small"><span>งวดที่ ${i}: <span class="fw-bold text-dark ms-2">${dayStr}</span></span><b class="text-primary-corp">฿${(prinPerPeriod + intPerPeriod).toLocaleString(undefined, {minimumFractionDigits: 2})}</b></div>`;
  }
  
  document.getElementById('cSchedulePreview').innerHTML = html;
}

// 🟢 ฟังก์ชันคำนวณค่าปรับและค่างวดใหม่ เมื่อมีการเปลี่ยนวันที่รับชำระย้อนหลัง/ล่วงหน้า
function recalculatePayPreview() {
  if (!curPay) return;

  let selectedDateStr = document.getElementById('pPayDate').value;
  if (!selectedDateStr) return;

  let selectedDate = safeDateParse(selectedDateStr);
  selectedDate.setHours(0, 0, 0, 0);

  let nextDue = safeDateParse(curPay.nextDue);
  if (isNaN(nextDue.getTime())) nextDue = new Date(); 
  nextDue.setHours(0, 0, 0, 0);

  // คำนวณความห่างของวัน
  let daysDiff = Math.ceil((selectedDate.getTime() - nextDue.getTime()) / (1000 * 60 * 60 * 24));
  let cycle = Number(curPay.cycle) || 1;
  let missedInst = 1;

  if (daysDiff > 0) {
      missedInst = 1 + Math.floor(daysDiff / cycle);
  }

  // คำนวณเงินต้นและดอกเบี้ยตามจำนวนงวดที่ค้าง
  let installments = Number(curPay.installments) || 1;
  let count = Number(curPay.count) || 0;
  let remainingInst = installments - count;
  if (remainingInst < 1) remainingInst = 1;
  if (missedInst > remainingInst) missedInst = remainingInst;

  let remainingPrincipal = Number(curPay.remainingPrincipal) || 0;
  let rate = Number(curPay.rate) || 0;

  let prinPerPeriod = remainingPrincipal / remainingInst;
  let intPerPeriod = remainingPrincipal * (rate / 100);

  let expectedPrin = prinPerPeriod * missedInst;
  let expectedInt = intPerPeriod * missedInst;

  if (expectedPrin > remainingPrincipal) expectedPrin = remainingPrincipal;

  // คำนวณค่าปรับ (วันละ 100 บาท ตามสูตร Backend)
  let suggestedFine = 0;
  if (daysDiff > 0) {
      suggestedFine = daysDiff * 100;
  }

  let suggestedTotal = expectedPrin + expectedInt + suggestedFine;

  // อัปเดตข้อมูลใน object หลัก
  curPay.expectedPrin = expectedPrin;
  curPay.expectedInt = expectedInt;
  curPay.fineAmount = suggestedFine;
  curPay.suggestedPay = suggestedTotal;
  curPay.nextNo = count + 1;

  // อัปเดต UI บนหน้าจอให้เปลี่ยนตาม
  document.getElementById('pExpectedPrin').innerText = Number(expectedPrin).toLocaleString();
  document.getElementById('pExpectedInt').innerText = Number(expectedInt).toLocaleString();
  document.getElementById('pFine').innerText = Number(suggestedFine).toLocaleString();
  document.getElementById('pExpectedTotal').innerText = `฿${Number(suggestedTotal).toLocaleString()}`;

  let pWarning = document.getElementById('pWarning');
  if (missedInst > 1) {
      pWarning.innerText = `⚠️ ระบบคิดค่างวดทบยอด ${missedInst} รอบบิล`;
      pWarning.style.display = 'block';
  } else {
      pWarning.style.display = 'none';
  }

  // เรียกใช้ฟังก์ชัน toggle ค่าปรับเพื่อให้ช่อง Input สีแดง และช่องยอดโอนรวมด้านล่างอัปเดตตาม
  toggleFineInput();
}

// 🟢 ฟังก์ชันคำนวณยอดปิดสัญญาแบบคลิกเดียวจบ
function setPayoffAmount() {
  if(!curPay) return;
  let fineInput = document.getElementById('pFinePaidInput');
  let totalInput = document.getElementById('pTotalPaidInput');
  
  let fine = Number(fineInput.value) || 0;
  let payoffTotal = Number(curPay.remainingPrincipal) + Number(curPay.expectedInt) + fine;
  totalInput.value = payoffTotal;
}

async function saveLoan() {
  const uId = document.getElementById('cUserSelect').value; 
  const amount = document.getElementById('cAmount').value;
  if(!amount || amount <= 0) { showAlert('กรุณาระบุยอดเงินต้นให้ถูกต้อง', true); return; }
  if(uId === 'NEW' && !document.getElementById('cName').value) { showAlert('กรุณากรอกชื่อ-นามสกุลลูกค้า', true); return; }

  let btn = document.getElementById('btnConfirmCreate');
  if(btn) btn.disabled = true;

  try {
    let photoBase64 = document.getElementById('cPhoto').files[0] ? await compressImage(document.getElementById('cPhoto').files[0]) : ''; 
    let idCardBase64 = document.getElementById('cIdCard').files[0] ? await compressImage(document.getElementById('cIdCard').files[0]) : ''; 
    let img3Base64 = document.getElementById('cImg3').files[0] ? await compressImage(document.getElementById('cImg3').files[0]) : '';
    let img4Base64 = document.getElementById('cImg4').files[0] ? await compressImage(document.getElementById('cImg4').files[0]) : '';
    let img5Base64 = document.getElementById('cImg5').files[0] ? await compressImage(document.getElementById('cImg5').files[0]) : '';

    let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
    
    let cycleMode = document.getElementById('cCycleMode').value;
    let cycleVal = '1';
    let targetDay = null;
    
    if (cycleMode === 'fixed_day') {
        cycleVal = 'fixed_day';
        targetDay = document.getElementById('cDayOfWeek').value;
    } else if (cycleMode === 'preset') {
        cycleVal = document.getElementById('cPresetInterval').value;
    } else if (cycleMode === 'custom') {
        cycleVal = document.getElementById('cCustomInterval').value;
    }
    
    let isUpfront = document.getElementById('cUpfrontInt').checked;
    
    const res = await api({ 
      action: 'saveLoan', 
      operatorId: authData.userId, 
      userId: uId, 
      name: document.getElementById('cName').value, 
      nickname: document.getElementById('cNick').value, 
      phone: document.getElementById('cPhone').value, 
      details: document.getElementById('cDetails').value, 
      photoBase64: photoBase64, 
      idCardBase64: idCardBase64, 
      img3Base64: img3Base64,
      img4Base64: img4Base64,
      img5Base64: img5Base64,
      amount: amount, 
      rate: document.getElementById('cRate').value, 
      cycle: cycleVal, 
      targetDay: targetDay, 
      isUpfront: isUpfront, 
      installments: document.getElementById('cInstallments').value, 
      startDate: document.getElementById('cStartDate').value, 
      groupName: authData.role === 'SuperAdmin' ? document.getElementById('cGroup').value : authData.groupName 
    });

    if (res.success) {
       clearForms(); showAlert('สร้างสัญญาสินเชื่อใหม่สำเร็จ!'); closeModal('modalCreate'); loadDash();
    } else {
       showAlert('เกิดข้อผิดพลาด: ' + res.error, true);
    }
  } catch(e) {
    showAlert('ระบบขัดข้อง: ' + e.message, true);
  } finally {
    if(btn) btn.disabled = false;
  }
}

function quickPay(id) { 
  document.getElementById('loanIdInput').value = id; 
  document.getElementById('pPayDate').valueAsDate = new Date(); 
  openModal('modalPay'); 
  fetchPreview(); 
}

async function fetchPreview() {
  let query = String(document.getElementById('loanIdInput').value).trim(); 
  let targetLoanId = query;
  if(query.includes('👤')) targetLoanId = query.split(' ')[0].trim(); 
  
  let loanObj = allLoans.find(l => String(l.loanId).trim() === String(targetLoanId).trim());
  if(loanObj) targetLoanId = String(loanObj.loanId).trim();
  if(!targetLoanId) return showAlert('กรุณาเลือกรหัสสัญญาให้ถูกต้อง', true);

  try {
    const res = await api({ action: 'previewPay', loanId: targetLoanId }); 
    
    if(res.success) {
      curPay = res; 
      document.getElementById('payDetails').style.display = 'block'; 
      document.getElementById('pName').innerText = `👤 ข้อมูลลูกค้า: ${res.userName}`;
      
      let pWarning = document.getElementById('pWarning');
      if(res.missedInst > 1) { 
          pWarning.innerText = `⚠️ ระบบคิดค่างวดทบยอด ${res.missedInst} รอบบิล`; 
          pWarning.style.display = 'block'; 
      } else pWarning.style.display = 'none';

      document.getElementById('pRemainingPrin').innerText = `฿${Number(res.remainingPrincipal || 0).toLocaleString()}`; 
      document.getElementById('pExpectedPrin').innerText = Number(res.expectedPrin || 0).toLocaleString(); 
      document.getElementById('pExpectedInt').innerText = Number(res.expectedInt || 0).toLocaleString(); 
      document.getElementById('pFine').innerText = Number(res.fineAmount || 0).toLocaleString(); 
      document.getElementById('pExpectedTotal').innerText = `฿${Number(res.suggestedPay || 0).toLocaleString()}`;
      
      document.getElementById('pChargeFine').value = 'Yes'; 
      let fineInput = document.getElementById('pFinePaidInput');
      fineInput.value = res.fineAmount || 0; 
      fineInput.disabled = false; 
      
      document.getElementById('pTotalPaidInput').value = res.suggestedPay;
      
      curPay.expectedPrin = res.expectedPrin; 
      curPay.expectedInt = res.expectedInt; 
      curPay.fineAmount = res.fineAmount; 
      curPay.suggestedPay = res.suggestedPay;
      
      // 🟢 เรียกการคำนวณซ้ำ 1 ครั้งทันที เผื่อกรณีคีย์ย้อนหลัง/ล่วงหน้าตั้งแต่ตอนเปิด Modal (ถ้าวันที่ใน Input ไม่ใช่วันนี้)
      recalculatePayPreview();
      
    } else { 
        showAlert(res.error || 'ค้นหารหัสสัญญาไม่พบ', true); 
        document.getElementById('payDetails').style.display = 'none'; 
    }
  } catch(e) {
    showAlert('เซิร์ฟเวอร์ขัดข้อง: ' + e.message, true);
  }
}

function toggleFineInput() {
  if(!curPay) return;
  let fineInput = document.getElementById('pFinePaidInput');
  if (document.getElementById('pChargeFine').value === 'Yes') { 
      fineInput.value = curPay.fineAmount || 0; 
      fineInput.disabled = false; 
  } else { 
      fineInput.value = 0; 
      fineInput.disabled = true; 
  }
  syncTotalPay();
}

function syncTotalPay() {
  if(!curPay) return;
  let totalInput = document.getElementById('pTotalPaidInput');
  let fineInput = document.getElementById('pFinePaidInput');
  totalInput.value = ((Number(curPay.suggestedPay) || 0) - (Number(curPay.fineAmount) || 0)) + (Number(fineInput.value) || 0);
}

async function submitPay() {
  const totalPaidVal = document.getElementById('pTotalPaidInput').value; 
  const finePaidVal = document.getElementById('pFinePaidInput').value;
  
  if(!totalPaidVal || Number(totalPaidVal) <= 0) { showAlert('กรุณาระบุยอดชำระให้ถูกต้อง', true); return; }

  let btn = document.getElementById('btnConfirmPay');
  if(btn) btn.disabled = true;

  try {
    let slipBase64 = document.getElementById('pSlip').files[0] ? await compressImage(document.getElementById('pSlip').files[0]) : ''; 
    let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
    
    const res = await api({ action: 'submitPay', loanId: String(curPay.loanId).trim(), userId: authData.userId, nextNo: curPay.nextNo, totalPaidAmount: totalPaidVal, fineAmount: finePaidVal, payDate: document.getElementById('pPayDate').value, method: document.getElementById('pMethod').value, slipBase64: slipBase64 });
    
    if(res.success) {
      clearForms(); showAlert('บันทึกการชำระเงินเสร็จสมบูรณ์!'); closeModal('modalPay'); loadDash();
    } else {
      showAlert('บันทึกไม่สำเร็จ: ' + res.error, true);
    }
  } catch(e) {
    showAlert('ระบบขัดข้อง: ' + e.message, true);
  } finally {
    if(btn) btn.disabled = false;
  }
}