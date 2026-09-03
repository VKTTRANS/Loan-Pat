const GAS_URL = "https://script.google.com/macros/s/AKfycbxkq39mAaFRG584lXiQfqogwzTiPCjRWleq1L8JKiDVqa4YYphMRTYvlgefOqVI4ac4yQ/exec";

let allLoans = []; 
let rawAllTimeLoans = []; 
let loggedInPassword = ''; 
let windowClientsData = []; 
let windowSystemAccounts = [];
let windowRecentPays = []; 
let timeLogoutVar;
let pendingAction = null; 
let globalConfirmCallback = null;

const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

let currentYear = new Date().getFullYear() + 543;
let yearHtml = '<option value="all">ทุกปี</option>';
for(let y = currentYear - 2; y <= currentYear + 2; y++) {
  yearHtml += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
}
if (document.getElementById('dashFilterYear')) {
  document.getElementById('dashFilterYear').innerHTML = yearHtml;
}

function safeDateParse(dateStr) {
  if (!dateStr) return new Date(NaN);
  if (String(dateStr).includes('T')) return new Date(dateStr); 
  return new Date(String(dateStr).replace(/-/g, '/')); 
}

function formatDateWithDayName(dateString) {
  let d = safeDateParse(dateString);
  if(isNaN(d.getTime())) return '-';
  return DAY_NAMES[d.getDay()] + ' ' + d.toLocaleDateString('th-TH');
}

function getSafeImgUrl(url, size = 'w150') {
  if (!url || url === 'ไม่มี') return '';
  let match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/d\/([a-zA-Z0-9_-]+)/);
  return (match && match[1]) ? 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=' + size : url; 
}

function zoomImage(url) {
  if(!url || url === 'ไม่มี') return;
  let hdUrl = url.replace(/sz=w\d+/, 'sz=w1000');
  document.getElementById('fullSizeImage').src = hdUrl;
  document.getElementById('imageViewer').style.display = 'flex';
}

function closeImageViewer() { document.getElementById('imageViewer').style.display = 'none'; }

function debounce(func, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

let lastActivityTime = 0;
function resetInactivityTimer() {
  const now = Date.now();
  if (now - lastActivityTime > 1000) { 
    lastActivityTime = now;
    clearTimeout(timeLogoutVar);
    if (sessionStorage.getItem('fintechAuthData')) timeLogoutVar = setTimeout(logout, 300000); 
  }
}

window.onload = () => {
  let authData = sessionStorage.getItem('fintechAuthData');
  if(!authData) { window.location.href = 'index.html'; return; }

  let parsed = JSON.parse(authData);
  if(parsed.role !== 'Admin' && parsed.role !== 'SuperAdmin') {
    window.location.href = 'index.html'; return;
  }

  loggedInPassword = atob(parsed.token); 
  document.getElementById('mainApp').style.display = 'block';
  
  loadAdminDash();
  resetInactivityTimer();
  ['mousemove','keypress','touchstart','click','scroll'].forEach(evt => document.addEventListener(evt, resetInactivityTimer));
};

function toggleL(s) { document.getElementById('loader').style.display = s ? 'flex' : 'none'; }
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function clearForms() {
  const ids = ['caId','caPass','caName','caPin','caGroup','ccName','ccNick','ccPhone','ccDetails','ccGroup','ccPhoto','ccIdCard','ccImg3','authPassword'];
  ids.forEach(id => {
    let el = document.getElementById(id);
    if(el) el.value = '';
  });
}

function showAlert(msg, isError = false) {
  document.getElementById('alertMsg').innerText = msg;
  document.getElementById('alertTitle').innerText = isError ? 'แจ้งเตือน' : 'สำเร็จ';
  document.getElementById('alertTitle').className = isError ? 'text-danger-corp fw-bold mb-2' : 'text-primary-corp fw-bold mb-2';
  document.getElementById('alertIcon').innerText = isError ? '❌' : '✅';
  document.querySelector('#customAlert .pro-card').style.borderTopColor = isError ? '#ef4444' : '#2563eb';
  document.getElementById('alertBtn').className = isError ? 'btn btn-danger text-white fw-bold px-4 py-3 w-100 rounded-pill' : 'btn bg-primary-corp text-white fw-bold px-4 py-3 w-100 rounded-pill';
  document.getElementById('customAlert').style.display = 'flex';
}

function showConfirm(msg, callback) {
  document.getElementById('confirmMsg').innerText = msg;
  globalConfirmCallback = callback;
  document.getElementById('customConfirm').style.display = 'flex';
}
function closeConfirm() { document.getElementById('customConfirm').style.display = 'none'; globalConfirmCallback = null; }
function executeConfirm() { document.getElementById('customConfirm').style.display = 'none'; if(globalConfirmCallback) globalConfirmCallback(); }

function switchMainTab(tab) {
  ['Dash', 'System', 'Clients', 'Loans', 'Pays'].forEach(t => {
    let btn = document.getElementById('btnTab'+t);
    let btnMb = document.getElementById('btnTab'+t+'_mb');
    let view = document.getElementById('view'+t);
    
    if(btn) btn.classList.remove('active');
    if(btnMb) btnMb.classList.remove('active');
    if(view) view.style.display = 'none';
  });
  
  let activeBtn = document.getElementById('btnTab'+tab);
  let activeBtnMb = document.getElementById('btnTab'+tab+'_mb');
  let activeView = document.getElementById('view'+tab);
  
  if(activeBtn) activeBtn.classList.add('active');
  if(activeBtnMb) activeBtnMb.classList.add('active');
  if(activeView) activeView.style.display = 'block';

  const navbarCollapse = document.getElementById('adminNavbar');
  if(navbarCollapse && navbarCollapse.classList.contains('show')) {
      if(typeof bootstrap !== 'undefined') {
          new bootstrap.Collapse(navbarCollapse).hide();
      }
  }
}

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
  window.location.href = 'index.html'; 
}

async function loadAdminDash() {
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  const res = await api({ action: 'getAdminDashboard', userId: authData.userId }); 
  
  if(res.success) {
      allLoans = res.activeLoans || []; 
      rawAllTimeLoans = res.allTimeLoans || [];
      windowClientsData = res.users || [];
      windowSystemAccounts = res.systemAccounts || [];
      windowRecentPays = res.recentPayments || []; 

      let filterAdminHtml = '<option value="all">ทุกสายงาน</option>';
      let datalistHtml = ''; 

      if(res.groups && res.groups.length > 0) {
        res.groups.forEach(g => {
          if(g) {
              filterAdminHtml += `<option value="${g}">สาย: ${g}</option>`;
              datalistHtml += `<option value="${g}">`;
          }
        });
      }
      
      let fLoanGroup = document.getElementById('filterLoanGroup');
      if(fLoanGroup) fLoanGroup.innerHTML = filterAdminHtml;

      let dListOptions = document.getElementById('groupListOptions');
      if(dListOptions) dListOptions.innerHTML = datalistHtml;

      let dashFilterGroup = document.getElementById('dashFilterGroup');
      if(dashFilterGroup) dashFilterGroup.innerHTML = filterAdminHtml;

      let dashFilterAdminHtml = '<option value="all">ทุกคน</option>';
      if(windowSystemAccounts.length > 0) {
        windowSystemAccounts.forEach(a => {
          dashFilterAdminHtml += `<option value="${a.id}">${a.name}</option>`;
        });
      }
      let dFilterAdmin = document.getElementById('dashFilterAdmin');
      if(dFilterAdmin) dFilterAdmin.innerHTML = dashFilterAdminHtml;

      let currentMonth = new Date().getMonth() + 1;
      let dashFilterMonth = document.getElementById('dashFilterMonth');
      if(dashFilterMonth) {
          dashFilterMonth.value = currentMonth;
      }

      updateDashMetrics();
      renderSystemTable();
      renderClientsTable(windowClientsData);
      renderLoansTable(allLoans);
      renderPaysTable(windowRecentPays);
  } else {
      showAlert('ข้อผิดพลาด: ' + (res.error || 'โหลดข้อมูลล้มเหลว'), true);
  }
}

function updateDashMetrics() {
  let fDay = document.getElementById('dashFilterDay') ? document.getElementById('dashFilterDay').value : 'all';
  let fMonth = document.getElementById('dashFilterMonth') ? document.getElementById('dashFilterMonth').value : 'all';
  let fYear = document.getElementById('dashFilterYear') ? document.getElementById('dashFilterYear').value : 'all';
  let fGroup = document.getElementById('dashFilterGroup') ? document.getElementById('dashFilterGroup').value : 'all';
  let fAdmin = document.getElementById('dashFilterAdmin') ? document.getElementById('dashFilterAdmin').value : 'all';

  let metrics = { TotalLoan: 0, TotalRemain: 0, TotalUsers: new Set(), TotalStaff: windowSystemAccounts.length };
  let groupMetrics = {};
  let typeMetrics = {}; 
  
  window.currentCycleLoans = {}; 

  rawAllTimeLoans.forEach(l => {
    if (l.status === 'Deleted') return; 

    let d = safeDateParse(l.startDate);
    if(!isNaN(d.getTime())) {
      let dDay = d.getDate().toString();
      let dMonth = (d.getMonth() + 1).toString();
      let dYear = (d.getFullYear() + 543).toString();

      let client = windowClientsData.find(u => u.id === l.userId);
      let g = client && client.groupName ? client.groupName : 'ไม่ระบุสาย';
      let opId = l.operatorId || '';

      let matchDay = (fDay === 'all' || fDay === dDay);
      let matchMonth = (fMonth === 'all' || fMonth === dMonth);
      let matchYear = (fYear === 'all' || fYear === dYear);
      let matchGroup = (fGroup === 'all' || fGroup === g);
      let matchAdmin = (fAdmin === 'all' || fAdmin === opId);

      if (matchDay && matchMonth && matchYear && matchGroup && matchAdmin) {
        let orig = Number(l.originalPrincipal) || 0; 
        let remain = Number(l.remainingPrincipal) || 0;
        
        metrics.TotalLoan += orig; 
        
        if(l.status === 'Active') {
          metrics.TotalRemain += remain;
          metrics.TotalUsers.add(l.userId);
        }
        
        if (!groupMetrics[g]) groupMetrics[g] = { loan: 0, remain: 0 };
        groupMetrics[g].loan += orig;
        if (l.status === 'Active') groupMetrics[g].remain += remain;

        let c = String(l.cycle || 'ไม่ระบุ');
        let cycleName = c;
        if(c === '1' || c.toLowerCase() === 'daily') cycleName = 'รายวัน';
        else if(c === '7' || c === 'fixed_day') cycleName = 'รายสัปดาห์ (7 วัน)';
        else if(c === '15') cycleName = 'ราย 15 วัน';
        else if(c === '30' || c.toLowerCase() === 'monthly') cycleName = 'รายเดือน';
        else if(c !== 'ไม่ระบุ') cycleName = 'รอบ ' + c + ' วัน';

        if (!typeMetrics[cycleName]) typeMetrics[cycleName] = { count: 0, loan: 0, remain: 0 };
        typeMetrics[cycleName].count += 1;
        typeMetrics[cycleName].loan += orig;
        
        if (l.status === 'Active') {
            typeMetrics[cycleName].remain += remain;
            
            if(!window.currentCycleLoans[cycleName]) window.currentCycleLoans[cycleName] = [];
            window.currentCycleLoans[cycleName].push({
                ...l,
                groupName: g
            });
        }
      }
    }
  });

  document.getElementById('mTotalLoan').innerText = Math.round(metrics.TotalLoan).toLocaleString(); 
  document.getElementById('mTotalRemain').innerText = Math.round(metrics.TotalRemain).toLocaleString(); 
  document.getElementById('mTotalClients').innerText = metrics.TotalUsers.size.toLocaleString();
  document.getElementById('mTotalStaff').innerText = metrics.TotalStaff;
  
  let typeHtml = '';
  Object.keys(typeMetrics).forEach(t => {
    let data = typeMetrics[t];
    typeHtml += `
    <div class="col-md-3 col-sm-6">
     <div class="pro-card p-3 shadow-sm border-0 d-flex justify-content-between align-items-center bg-white clickable-card" 
          style="border-radius: 12px; border-left: 4px solid #10b981 !important;" 
          onclick="showCycleDetails('${t}')">
        <div>
           <div class="d-flex align-items-center mb-1">
             <span class="emoji-icon text-muted">⏱️</span>
             <span class="fw-bold text-dark">${t}</span>
           </div>
           <span class="d-block text-muted small" style="font-size: 0.75rem;">จำนวน: ${data.count} สัญญา</span>
        </div>
        <div class="text-end">
           <span class="d-block fw-bold text-primary-corp" style="font-size: 0.85rem;">ปล่อย: ฿${Math.round(data.loan).toLocaleString()}</span>
           <span class="d-block fw-bold text-warning-corp" style="font-size: 0.85rem;">ค้าง: ฿${Math.round(data.remain).toLocaleString()}</span>
        </div>
     </div>
    </div>`;
  });
  document.getElementById('typeBreakdownContainer').innerHTML = typeHtml || `<div class="col-12 text-center text-muted">ไม่มีข้อมูลประเภทการกู้</div>`;

  let groupHtml = '';
  Object.keys(groupMetrics).forEach(g => {
    let data = groupMetrics[g];
    groupHtml += `
    <div class="col-md-4 col-sm-6">
     <div class="pro-card p-3 shadow-sm border-0 d-flex justify-content-between align-items-center bg-white" style="border-radius: 12px;">
        <div>
           <div class="d-flex align-items-center mb-1">
             <span class="emoji-icon text-muted">🗂️</span>
             <span class="fw-bold text-dark">${g}</span>
           </div>
           <span class="d-block text-muted small" style="font-size: 0.75rem;">กู้สะสม: ฿${Math.round(data.loan).toLocaleString()}</span>
        </div>
        <div class="text-end">
           <span class="d-block fw-bold text-warning-corp fs-6">ค้าง: ฿${Math.round(data.remain).toLocaleString()}</span>
        </div>
     </div>
    </div>`;
  });
  document.getElementById('groupBreakdownContainer').innerHTML = groupHtml || `<div class="col-12 text-center text-muted">ยังไม่มีข้อมูลตามตัวกรอง</div>`;
}

function showCycleDetails(cycleName) {
    let loans = window.currentCycleLoans[cycleName] || [];
    let html = '';
    
    if(loans.length === 0) {
        html = '<div class="text-center text-muted py-4"><span style="font-size: 2rem; display: block; margin-bottom: 10px;">📭</span>ไม่มีสัญญากำลังกู้ (Active) ในรอบนี้</div>';
    } else {
        html = '<div class="list-group list-group-flush">';
        loans.forEach(l => {
             html += `
             <div class="list-group-item list-group-item-action p-3" style="cursor:pointer; border-bottom: 1px solid #e2e8f0;" onclick="closeModal('modalCycleDetails'); viewDetails('${l.loanId}')">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <b class="text-dark text-truncate pe-2" style="font-size: 0.95rem; max-width: 65%;">${l.userName}</b>
                    <span class="text-success fw-bold" style="font-size: 1rem;">฿${Number(l.originalPrincipal || 0).toLocaleString()}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                    <span class="text-muted small text-truncate" style="font-size:0.75rem; max-width: 50%;"><span class="emoji-icon">👔</span>${l.adminName || '-'} | สาย: ${l.groupName || '-'}</span>
                    <span class="badge bg-light text-dark border shadow-sm"><span class="emoji-icon">📅</span>${l.dueDate || '-'}</span>
                </div>
             </div>`;
        });
        html += '</div>';
    }
    
    document.getElementById('cycleDetailTitle').innerText = 'ข้อมูลสัญญา ' + cycleName + ' (กำลังกู้)';
    document.getElementById('cycleDetailBody').innerHTML = html;
    openModal('modalCycleDetails');
}

// 🟢 อัปเกรดตารางให้รองรับมือถือด้วย data-label
function renderSystemTable() {
  let html = '';
  windowSystemAccounts.forEach(a => {
    let roleBadge = a.role === 'SuperAdmin' ? '<span class="badge bg-danger">SuperAdmin</span>' : (a.role === 'Admin' ? '<span class="badge bg-primary">Admin</span>' : '<span class="badge bg-info text-dark">User</span>');
    let statusBadge = a.status === 'Active' ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Suspended</span>';
    
    let editBtn = `<button class="btn btn-sm btn-outline-secondary" onclick="triggerEditAccount('${a.id}', '${a.name}', '${a.role}', '${a.groupName}', '${a.status}')"><span class="emoji-icon">✏️</span> แก้ไข</button>`;
    let copyBtn = `<button class="btn btn-sm btn-outline-primary ms-1" onclick="copyNfcLink('${a.id}')"><span class="emoji-icon">🔗</span> ลิงก์</button>`;
    
    let actionBtns = a.role === 'SuperAdmin' ? '-' : `<div class="d-flex justify-content-end gap-1 w-100">${editBtn}${copyBtn}</div>`;

    html += `<tr>
      <td data-label="รหัส ID" class="fw-bold text-muted">${a.id}</td>
      <td data-label="ชื่อพนักงาน" class="fw-bold">${a.name}</td>
      <td data-label="ตำแหน่ง">${roleBadge}</td>
      <td data-label="สายงาน">${a.groupName || '-'}</td>
      <td data-label="สถานะ">${statusBadge}</td>
      <td data-label="จัดการ" class="text-end">${actionBtns}</td>
    </tr>`;
  });
  document.getElementById('systemTableBody').innerHTML = html || '<tr><td colspan="6" class="text-center text-muted py-3">ไม่มีข้อมูลพนักงาน</td></tr>';
}

function copyNfcLink(userId) {
    let currentUrl = window.location.href.split('?')[0]; 
    let baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
    if(baseUrl === "" || baseUrl === "https://" || baseUrl === "http://") {
        baseUrl = currentUrl.replace(/\/$/, "");
    }
    let nfcLink = `${baseUrl}/index.html?uid=${userId}`;

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(nfcLink).then(() => {
            showAlert(`🔗 คัดลอกลิงก์ NFC สำเร็จ!\n\n${nfcLink}\n\nนำไปวางในแอปเขียน Tag ได้เลยครับ`);
        }).catch(err => {
            prompt('กรุณาคัดลอกลิงก์ด้านล่างนี้ด้วยตัวเอง:', nfcLink);
        });
    } else {
        let textArea = document.createElement("textarea");
        textArea.value = nfcLink;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showAlert(`🔗 คัดลอกลิงก์ NFC สำเร็จ!\n\n${nfcLink}\n\nนำไปวางในแอปเขียน Tag ได้เลยครับ`);
        } catch (err) {
            prompt('กรุณาคัดลอกลิงก์ด้านล่างนี้ด้วยตัวเอง:', nfcLink);
        }
        textArea.remove();
    }
}

async function saveSystemAccount() {
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  let adId = document.getElementById('caId').value; 
  let adPass = document.getElementById('caPass').value; 
  let adName = document.getElementById('caName').value; 
  let adRole = document.getElementById('caRole').value; 
  let adGroup = document.getElementById('caGroup').value; 
  let adPin = document.getElementById('caPin').value; 

  if(!adId || !adPass || !adName || !adPin) { showAlert('กรุณากรอกข้อมูลให้ครบถ้วน รวมถึงรหัส PIN', true); return; }
  if(adPin.length !== 4) { showAlert('รหัส PIN ต้องมีครบ 4 หลัก', true); return; }

  const res = await api({ action: 'createSystemAccount', operatorId: authData.userId, newUserId: adId, password: adPass, name: adName, role: adRole, groupName: adGroup, pinCode: adPin });
  if(res.success) { showAlert('สร้างบัญชีพนักงานใหม่สำเร็จ'); clearForms(); closeModal('modalCreateAccount'); loadAdminDash(); } else showAlert(res.error || 'เกิดข้อผิดพลาด', true);
}

function triggerEditAccount(id, name, role, group, status) {
  document.getElementById('eaId').value = id; 
  document.getElementById('eaName').value = name;
  document.getElementById('eaRole').value = role;
  document.getElementById('eaGroup').value = group || ''; 
  document.getElementById('eaStatus').value = status || 'Active';
  document.getElementById('eaPin').value = ''; 
  document.getElementById('eaPass').value = ''; 
  openModal('modalEditAccount');
}

async function submitEditAccount() {
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  let payload = { action: 'editSystemAccount', operatorId: authData.userId, targetUserId: document.getElementById('eaId').value, name: document.getElementById('eaName').value, role: document.getElementById('eaRole').value, groupName: document.getElementById('eaGroup').value, status: document.getElementById('eaStatus').value, pinCode: document.getElementById('eaPin').value, password: document.getElementById('eaPass').value };
  
  if(payload.pinCode && payload.pinCode.length !== 4) { showAlert('รหัส PIN ต้องมี 4 หลัก', true); return; }

  const res = await api(payload); 
  if(res.success) { showAlert('อัปเดตพนักงานสำเร็จ'); closeModal('modalEditAccount'); loadAdminDash(); } else showAlert(res.error, true);
}

const debouncedFilterUsers = debounce(filterClients, 300);

function filterClients() {
  let val = document.getElementById('searchClient').value.toLowerCase();
  let filtered = windowClientsData.filter(u => (u.name + u.nickname + u.phone + u.id).toLowerCase().includes(val));
  renderClientsTable(filtered);
}

function renderClientsTable(data) {
  let html = '';
  data.forEach(u => {
    let safeUrl = getSafeImgUrl(u.photoUrl);
    let photoHtml = safeUrl ? `<img src="${safeUrl}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">` : `<div style="width: 40px; height: 40px; border-radius: 8px; background: #e2e8f0; display:flex; align-items:center; justify-content:center;"><span style="font-size:1.2rem;">👤</span></div>`;
    
    let clientActiveLoans = rawAllTimeLoans.filter(l => String(l.userId).trim() === String(u.id).trim() && l.status === 'Active');
    
    let totalActivePrincipal = 0;
    let admins = new Set();
    
    clientActiveLoans.forEach(l => {
        totalActivePrincipal += Number(l.originalPrincipal || 0);
        if (l.adminName) admins.add(l.adminName);
    });
    
    let adminNames = admins.size > 0 ? Array.from(admins).join(', ') : '-';
    let loanBadge = totalActivePrincipal > 0 ? `<span class="text-primary fw-bold">฿${totalActivePrincipal.toLocaleString()}</span>` : `<span class="text-muted">-</span>`;

    html += `<tr style="cursor:pointer;" onclick="viewClientProfile('${u.id}')">
      <td data-label="รูปภาพ">${photoHtml}</td>
      <td data-label="รหัสลูกค้า" class="text-muted small">${u.id}</td>
      <td data-label="ชื่อ-นามสกุล" class="fw-bold text-dark">${u.name} ${u.nickname ? `(${u.nickname})` : ''}</td>
      <td data-label="เบอร์โทร">${u.phone || '-'}</td>
      <td data-label="สายงาน"><span class="badge bg-light text-dark border">${u.groupName || '-'}</span></td>
      <td data-label="ผู้ปล่อยกู้"><span class="badge bg-light text-dark border"><span class="emoji-icon">👔</span>${adminNames}</span></td>
      <td data-label="ยอดกู้รวม (Active)" class="text-end">${loanBadge}</td>
    </tr>`;
  });
  document.getElementById('clientsTableBody').innerHTML = html || '<tr><td colspan="7" class="text-center text-muted py-3">ไม่มีข้อมูลลูกค้า</td></tr>';
}

function viewClientProfile(userId) {
  let user = windowClientsData.find(u => String(u.id).trim() === String(userId).trim()); 
  if(!user) return;
  
  let safeFace = getSafeImgUrl(user.photoUrl, 'w150'); 
  let safeId = getSafeImgUrl(user.idCardUrl, 'w150'); 
  let safeImg3 = getSafeImgUrl(user.img3Url, 'w150');
  let safeImg4 = getSafeImgUrl(user.img4Url, 'w150');
  let safeImg5 = getSafeImgUrl(user.img5Url, 'w150');
  
  let phoneStr = String(user.phone || '').replace(/'/g, '');
  
  let photo1 = safeFace ? `<img src="${safeFace}" class="img-box mb-1" style="width:80px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="event.stopPropagation(); zoomImage('${safeFace}')">` : `<div class="img-box mb-1 mx-auto d-flex justify-content-center align-items-center bg-light" style="width:80px; height:80px; border-radius:8px;"><span style="font-size:2rem;">👤</span></div>`;
  let photo2 = safeId ? `<img src="${safeId}" class="img-box mb-1" style="width:80px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="event.stopPropagation(); zoomImage('${safeId}')">` : `<div class="img-box mb-1 mx-auto d-flex justify-content-center align-items-center bg-light" style="width:80px; height:80px; border-radius:8px;"><span style="font-size:2rem;">🪪</span></div>`;
  let photo3 = safeImg3 ? `<div class="text-center"><img src="${safeImg3}" class="img-box mb-1" style="width:80px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="event.stopPropagation(); zoomImage('${safeImg3}')"><br><span class="text-muted fw-bold" style="font-size:0.7rem;">เพิ่มเติม 1</span></div>` : ``;
  let photo4 = safeImg4 ? `<div class="text-center"><img src="${safeImg4}" class="img-box mb-1" style="width:80px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="event.stopPropagation(); zoomImage('${safeImg4}')"><br><span class="text-muted fw-bold" style="font-size:0.7rem;">เพิ่มเติม 2</span></div>` : ``;
  let photo5 = safeImg5 ? `<div class="text-center"><img src="${safeImg5}" class="img-box mb-1" style="width:80px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="event.stopPropagation(); zoomImage('${safeImg5}')"><br><span class="text-muted fw-bold" style="font-size:0.7rem;">เพิ่มเติม 3</span></div>` : ``;

  document.getElementById('vcProfile').innerHTML = `
    <div class="d-flex justify-content-center flex-wrap gap-3 mb-4 p-3 bg-white rounded-3 border">
      <div class="text-center">${photo1}<br><span class="text-muted fw-bold" style="font-size:0.7rem;">หน้าตรง</span></div>
      <div class="text-center">${photo2}<br><span class="text-muted fw-bold" style="font-size:0.7rem;">เอกสาร</span></div>
      ${photo3}
      ${photo4}
      ${photo5}
    </div>
    <div class="pro-card p-3 shadow-sm bg-white border-0">
        <h5 class="fw-bold text-primary-corp mb-2">${user.name} ${user.nickname ? `(${user.nickname})` : ''}</h5>
        <p class="text-muted mb-2"><span class="emoji-icon">📞</span>${phoneStr || 'ไม่มีเบอร์โทร'}</p>
        <p class="text-muted small mb-0 px-2 border-start border-3 border-primary bg-light p-2 rounded-end">${user.details || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
    </div>
  `;

  let uLoans = rawAllTimeLoans.filter(l => String(l.userId).trim() === String(userId).trim()).sort((a,b) => safeDateParse(b.startDate) - safeDateParse(a.startDate));
  let lHtml = '';
  if(uLoans.length === 0) lHtml = '<div class="text-center text-muted p-4 border rounded bg-white small">ยังไม่มีประวัติการกู้</div>';
  else {
    uLoans.forEach(l => {
      let statusBadge = '';
      if(l.status === 'Active') statusBadge = '<span class="badge bg-success-corp">กำลังกู้</span>';
      else if(l.status === 'Closed') statusBadge = '<span class="badge bg-secondary">ปิดยอดแล้ว</span>';
      else if(l.status === 'Deleted') statusBadge = '<span class="badge bg-danger">ยกเลิก/ลบสัญญา</span>';
      else statusBadge = `<span class="badge bg-danger">${l.status}</span>`;

      lHtml += `
        <div class="pro-card p-3 mb-2 border-0 shadow-sm bg-white" style="cursor:pointer; border-left: 4px solid #3b82f6 !important;" onclick="closeModal('modalViewClient'); viewDetails('${l.loanId}')">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <b class="text-dark d-block mb-1">ยอดกู้: ฿${Number(l.originalPrincipal || 0).toLocaleString()}</b>
              <span class="text-muted d-block small"><span class="emoji-icon">📅</span>${formatDateWithDayName(l.startDate)}</span>
            </div>
            <div class="text-end">
              ${statusBadge}
              <span class="d-block text-primary-corp fw-bold mt-2" style="font-size:0.8rem;">ดูข้อมูล <span class="emoji-icon">👁️</span></span>
            </div>
          </div>
        </div>`;
    });
  }
  document.getElementById('vcLoansList').innerHTML = lHtml;

  let modalContent = document.getElementById('modalViewClient').querySelector('.modal-content-custom');
  let btnEdit = modalContent.querySelector('.btn-outline-primary');
  let btnDel = modalContent.querySelector('.btn-outline-danger');
  if(btnEdit) btnEdit.onclick = () => { closeModal('modalViewClient'); triggerEditClient(userId); };
  if(btnDel) btnDel.onclick = () => { closeModal('modalViewClient'); triggerDeleteClient(userId); };

  openModal('modalViewClient');
}

function compressImage(file, maxWidth = 600) {
  return new Promise((resolve) => {
    if (!file) { resolve(""); return; }
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image(); img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas'); 
        let scaleSize = maxWidth / img.width; 
        if (scaleSize > 1) scaleSize = 1;
        canvas.width = img.width * scaleSize; 
        canvas.height = img.height * scaleSize;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); 
        resolve(canvas.toDataURL('image/jpeg', 0.6)); 
      };
    };
  });
}

async function submitCreateClient() {
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  let name = document.getElementById('ccName').value;
  if(!name) { showAlert('กรุณากรอกชื่อลูกค้า', true); return; }

  let photoBase64 = document.getElementById('ccPhoto').files[0] ? await compressImage(document.getElementById('ccPhoto').files[0]) : ''; 
  let idCardBase64 = document.getElementById('ccIdCard').files[0] ? await compressImage(document.getElementById('ccIdCard').files[0]) : '';
  let img3Base64 = document.getElementById('ccImg3').files[0] ? await compressImage(document.getElementById('ccImg3').files[0]) : '';
  let img4Base64 = document.getElementById('ccImg4').files[0] ? await compressImage(document.getElementById('ccImg4').files[0]) : '';
  let img5Base64 = document.getElementById('ccImg5').files[0] ? await compressImage(document.getElementById('ccImg5').files[0]) : '';

  const res = await api({
    action: 'createClient', operatorId: authData.userId, name: name, nickname: document.getElementById('ccNick').value,
    phone: document.getElementById('ccPhone').value, details: document.getElementById('ccDetails').value, groupName: document.getElementById('ccGroup').value,
    photoBase64: photoBase64, idCardBase64: idCardBase64, img3Base64: img3Base64, img4Base64: img4Base64, img5Base64: img5Base64
  });

  if(res.success) { showAlert('เพิ่มประวัติลูกค้าสำเร็จ'); closeModal('modalCreateClient'); loadAdminDash(); } else showAlert(res.error, true);
}

function triggerEditClient(userId) {
  let user = windowClientsData.find(u => String(u.id).trim() === String(userId).trim()); if(!user) return;
  document.getElementById('ecId').value = user.id; 
  document.getElementById('ecName').value = user.name;
  document.getElementById('ecNick').value = user.nickname; 
  document.getElementById('ecPhone').value = String(user.phone || '').replace(/'/g, ''); 
  document.getElementById('ecDetails').value = user.details; 
  document.getElementById('ecGroup').value = user.groupName || '';
  
  document.getElementById('ecPhoto').value = ''; 
  document.getElementById('ecIdCard').value = ''; 
  document.getElementById('ecImg3').value = '';
  document.getElementById('ecImg4').value = '';
  document.getElementById('ecImg5').value = '';
  openModal('modalEditClient');
}

async function submitEditClient() {
  let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
  let photoBase64 = document.getElementById('ecPhoto').files[0] ? await compressImage(document.getElementById('ecPhoto').files[0]) : ''; 
  let idCardBase64 = document.getElementById('ecIdCard').files[0] ? await compressImage(document.getElementById('ecIdCard').files[0]) : '';
  let img3Base64 = document.getElementById('ecImg3').files[0] ? await compressImage(document.getElementById('ecImg3').files[0]) : '';
  let img4Base64 = document.getElementById('ecImg4').files[0] ? await compressImage(document.getElementById('ecImg4').files[0]) : '';
  let img5Base64 = document.getElementById('ecImg5').files[0] ? await compressImage(document.getElementById('ecImg5').files[0]) : '';

  const res = await api({
    action: 'editUser', operatorId: authData.userId, userId: document.getElementById('ecId').value, 
    name: document.getElementById('ecName').value, nickname: document.getElementById('ecNick').value, phone: document.getElementById('ecPhone').value, 
    details: document.getElementById('ecDetails').value, groupName: document.getElementById('ecGroup').value, 
    photoBase64: photoBase64, idCardBase64: idCardBase64, img3Base64: img3Base64, img4Base64: img4Base64, img5Base64: img5Base64
  });

  if(res.success) { showAlert('แก้ไขลูกค้าสำเร็จ'); closeModal('modalEditClient'); loadAdminDash(); } else showAlert(res.error, true);
}

function triggerDeleteClient(userId) {
  promptPassword(() => {
    showConfirm('ต้องการลบประวัติลูกค้ารายนี้ถาวรใช่หรือไม่?\n(สถานะจะถูกเปลี่ยนเป็น Deleted)', () => {
      let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
      api({ action: 'deleteClient', clientId: userId, operatorId: authData.userId }).then(res => {
        if(res.success) { showAlert('ลบลูกค้าสำเร็จ'); loadAdminDash(); } else showAlert(res.error, true);
      });
    });
  });
}

const debouncedApplyFilters = debounce(filterLoans, 300);

function filterLoans() {
  let statusVal = document.getElementById('filterLoanStatus').value; 
  let groupVal = document.getElementById('filterLoanGroup').value; 
  let searchVal = document.getElementById('searchLoan').value.toLowerCase();
  let filterDueVal = document.getElementById('filterDue') ? document.getElementById('filterDue').value : '';

  let str1 = '', str2 = '', str3 = '', str4 = '';
  
  if (filterDueVal) {
    let parts = filterDueVal.split('-');
    let selectedDate = new Date(parts[0], parts[1] - 1, parts[2]);

    let y = parseInt(parts[0]) + 543;
    let m = parseInt(parts[1]); 
    let d = parseInt(parts[2]); 
    let dayIndex = selectedDate.getDay();
    
    let shortDays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    let longDays = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

    str1 = `${shortDays[dayIndex]} ${d}/${m}/${y}`; 
    str2 = `${longDays[dayIndex]} ${d}/${m}/${y}`; 
    str3 = `${d}/${m}/${y}`; 
    str4 = `${shortDays[dayIndex]} ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`; 
  }

  let filtered = allLoans.filter(l => {
    let matchStatus = (statusVal === 'all' || l.status === statusVal);
    let matchSearch = (l.userName + l.nickname + l.loanId).toLowerCase().includes(searchVal); 
    
    let client = windowClientsData.find(u => u.id === l.userId);
    let clientGroup = client ? client.groupName : '';
    let matchGroup = (groupVal === 'all' || clientGroup === groupVal);
    
    let matchDue = true;
    if (filterDueVal) {
        if (!l.dueDate) matchDue = false;
        else {
            let due = String(l.dueDate).trim();
            matchDue = (due === str1 || due === str2 || due === str4 || due.includes(str3));
        }
    }

    return matchStatus && matchSearch && matchGroup && matchDue && l.status !== 'Deleted';
  });

  renderLoansTable(filtered);
}

function renderLoansTable(data) {
  let html = '';
  data.forEach(b => {
      let statusBadge = b.status === 'Active' ? '<span class="badge bg-success">กำลังกู้</span>' : '<span class="badge bg-secondary">ปิดยอดแล้ว</span>';

      html += `<tr style="cursor:pointer;" onclick="viewDetails('${b.loanId}')">
          <td data-label="รหัสสัญญา" class="text-muted small">${b.loanId}</td>
          <td data-label="ลูกค้า" class="fw-bold text-dark">
            <span class="emoji-icon">👤</span>${b.userName} ${b.nickname ? `(${b.nickname})` : ''}
          </td>
          <td data-label="ผู้ปล่อยกู้"><span class="badge bg-light text-dark border"><span class="emoji-icon">👔</span>${b.adminName || '-'}</span></td>
          <td data-label="ประเภท / ดิวชำระ">
            <span class="d-block text-muted small mb-1">รอบ ${b.cycle === 'fixed_day' ? '7' : b.cycle} วัน</span>
            <span class="d-block fw-bold text-dark small"><span class="emoji-icon">📅</span>${b.dueDate}</span>
          </td>
          <td data-label="ยอดเงินต้น" class="text-primary fw-bold text-end">฿${Number(b.originalPrincipal || 0).toLocaleString()}</td>
          <td data-label="หนี้คงเหลือ" class="text-danger fw-bold text-end">฿${Number(b.remainingPrincipal || 0).toLocaleString()}</td>
          <td data-label="สถานะ" class="text-end">${statusBadge}</td>
      </tr>`;
  });
  document.getElementById('loansTableBody').innerHTML = html || '<tr><td colspan="7" class="text-center text-muted py-3">ไม่มีข้อมูลสัญญาตามเงื่อนไขที่เลือก</td></tr>';
}

async function viewDetails(id) {
  const res = await api({ action: 'getLoanDetails', loanId: id }); 
  if(res.success) {
    document.getElementById('dName').innerText = `${res.userName} ${res.nickname ? `(${res.nickname})` : ''}`; 
    document.getElementById('dDetails').innerHTML = `${res.details || 'ไม่มีข้อมูลเพิ่มเติม'}`;
    
    let infoHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; row-gap: 8px; column-gap: 4px;" class="text-muted small">
        <div class="d-flex align-items-center text-truncate"><span class="emoji-icon">🏷️</span>รหัส: <span class="text-dark ms-1 fw-bold">${res.loanId}</span></div>
        <div class="d-flex align-items-center text-truncate"><span class="emoji-icon">📅</span>เริ่ม: <span class="text-dark ms-1 fw-bold">${res.startDate}</span></div>
        <div class="d-flex align-items-center text-truncate"><span class="emoji-icon">👔</span>แอดมิน: <span class="text-dark ms-1 fw-bold">${res.adminName}</span></div>
        <div class="d-flex align-items-center text-truncate"><span class="emoji-icon">🗂️</span>กลุ่ม: <span class="text-dark ms-1 fw-bold">${res.groupName || '-'}</span></div>
      </div>
    `;
    document.getElementById('dInfoGrid').innerHTML = infoHtml;
    
    document.getElementById('dPrin').innerText = `฿${Number(res.principal || 0).toLocaleString()}`; 
    document.getElementById('dPaid').innerText = `฿${Number(res.totalPaid || 0).toLocaleString()}`; 
    document.getElementById('dRemain').innerText = `฿${Number(res.remaining !== undefined ? res.remaining : (res.remainingPrincipal || 0)).toLocaleString()}`;
    
    document.getElementById('btnDetailDelete').onclick = () => { closeModal('modalDetails'); triggerDeleteLoan(id); };
    
    openModal('modalDetails');
  }
}

function triggerDeleteLoan(id) {
  promptPassword(() => {
    showConfirm('🚨 คำเตือน:\nคุณต้องการ "ลบ" สัญญานี้อย่างถาวรใช่หรือไม่?', () => {
      let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
      api({ action: 'deleteLoan', loanId: id, operatorId: authData.userId }).then(res => { if(res.success) { showAlert('ลบข้อมูลสัญญาสำเร็จ'); loadAdminDash(); } else showAlert('เกิดข้อผิดพลาดในการลบ', true); });
    });
  });
}

function renderPaysTable(data) {
  let html = '';
  data.forEach(p => {
    let slipBtn = p.slipUrl && p.slipUrl !== 'ไม่มี' ? `<a href="${getSafeImgUrl(p.slipUrl)}" target="_blank" class="btn btn-sm btn-outline-primary"><span class="emoji-icon">🧾</span></a>` : `-`;
    let noText = String(p.no) === '0' ? 'ล่วงหน้า' : p.no;

    html += `<tr>
      <td data-label="วันที่/เวลา" class="text-muted small">${p.date}</td>
      <td data-label="ชื่อลูกค้า" class="fw-bold">${p.userName}</td>
      <td data-label="รหัสสัญญา" class="text-muted small">${p.loanId}</td>
      <td data-label="งวดที่">${noText}</td>
      <td data-label="ยอดรับ (฿)" class="text-success fw-bold text-end">฿${Number(p.totalPaid || 0).toLocaleString()}</td>
      <td data-label="ค่าปรับ (฿)" class="text-danger fw-bold text-end">${Number(p.finePaid || 0) > 0 ? '฿'+Number(p.finePaid).toLocaleString() : '-'}</td>
      <td data-label="สลิป" class="text-end">${slipBtn}</td>
      <td data-label="ยกเลิกรายการ" class="text-end"><button class="btn btn-sm btn-outline-danger" onclick="triggerDeletePayment('${p.id}', '${p.loanId}')"><span class="emoji-icon">🗑️</span></button></td>
    </tr>`;
  });
  document.getElementById('paysTableBody').innerHTML = html || '<tr><td colspan="8" class="text-center text-muted py-3">ไม่มีประวัติรับชำระ</td></tr>';
}

function triggerDeletePayment(paymentId, loanId) {
  promptPassword(() => {
     showConfirm('คุณต้องการ "ลบประวัติรับชำระเงิน" รหัสงวดนี้ใช่หรือไม่?\n(เงินจะถูกดึงกลับเข้าสัญญา)', () => {
        let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
        api({ action: 'deletePayment', paymentId: paymentId, loanId: loanId, operatorId: authData.userId }).then(res => {
           if (res.success) { showAlert('ลบประวัติรับชำระเงินสำเร็จ!'); loadAdminDash(); } else showAlert(res.error, true);
        });
     });
  });
}

function triggerArchive() {
  promptPassword(() => {
    showConfirm('📦 ยืนยันการย้ายข้อมูลเก่าลง Archive?\nสัญญา (ปิดยอด/ลบ) ที่เกิน 6 เดือน จะถูกย้ายไปชีตสำรอง', () => {
      let authData = JSON.parse(sessionStorage.getItem('fintechAuthData'));
      api({ action: 'archiveData', operatorId: authData.userId }).then(res => { 
        if(res.success) { showAlert('จัดเก็บข้อมูลเก่าลง Archive สำเร็จ!\nย้ายไป ' + res.count + ' สัญญา'); loadAdminDash(); } else { showAlert(res.error, true); }
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