const GAS_URL = "https://script.google.com/macros/s/AKfycbxkq39mAaFRG584lXiQfqogwzTiPCjRWleq1L8JKiDVqa4YYphMRTYvlgefOqVI4ac4yQ/exec";

window.onload = () => {
    let authData = sessionStorage.getItem('fintechAuthData');
    if (!authData) {
        window.location.href = 'index.html'; 
        return;
    }
    
    let parsed = JSON.parse(authData);
    // ป้องกัน Role อื่นเข้ามาหน้านี้
    if (parsed.role !== 'Client') {
        if(parsed.role === 'Admin' || parsed.role === 'SuperAdmin') {
            window.location.href = 'admin.html'; 
        } else if (parsed.role === 'User') {
            window.location.href = 'user.html'; 
        } else {
            window.location.href = 'index.html'; 
        }
        return;
    }

    loadClientData(parsed.userId);
};

function toggleL(show) { 
    document.getElementById('loader').style.display = show ? 'flex' : 'none'; 
}

// 🟢 ระบบดึงรูปภาพแบบกำหนดขนาดได้ (ค่าเริ่มต้น 150px เพื่อความไว)
function getSafeImgUrl(url, size = 'w150') {
    if (!url || url === 'ไม่มี') return '';
    let match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/d\/([a-zA-Z0-9_-]+)/);
    return (match && match[1]) ? 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=' + size : url; 
}

async function loadClientData(userId) {
    toggleL(true);
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'getClientDashboard', userId: userId })
        });
        const res = await response.json();
        
        if (res.success) {
            renderProfile(res.profile);
            renderLoans(res.loans);
            renderPayments(res.payments);
        } else {
            alert('โหลดข้อมูลล้มเหลว: ' + res.error);
        }
    } catch (e) {
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ' + e.message);
    } finally {
        toggleL(false);
    }
}

function renderProfile(profile) {
    document.getElementById('uName').innerText = `${profile.name} ${profile.nickname ? `(${profile.nickname})` : ''}`;
    document.getElementById('uPhone').innerText = profile.phone ? String(profile.phone).replace(/'/g, '') : '-';
    
    if (profile.photoUrl && profile.photoUrl !== 'ไม่มี') {
        // ใช้ getSafeImgUrl เพื่อให้โหลดรูปโปรไฟล์เร็วขึ้น
        let safeUrl = getSafeImgUrl(profile.photoUrl, 'w150');
        document.getElementById('uPhotoContainer').innerHTML = `<img src="${safeUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
    }
}

function renderLoans(loans) {
    let html = '';
    
    if (!loans || loans.length === 0) {
        html = '<div class="text-center text-muted p-4 border rounded bg-white small shadow-sm">ไม่มีสัญญาที่ดำเนินการอยู่</div>';
    } else {
        loans.forEach(l => {
            let statusBadge = l.status === 'Active' 
                ? '<span class="badge bg-success-corp px-2 py-1">กำลังดำเนินการ</span>' 
                : '<span class="badge bg-secondary px-2 py-1">ปิดยอดแล้ว</span>';

            html += `
            <div class="pro-card p-3 mb-3 shadow-sm" style="border-left: 5px solid #2563eb; background: #fff; border-radius: 16px;">
                <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                    <span class="text-muted small"><i class="fa-solid fa-hashtag me-1"></i>รหัส: <b class="text-dark">${l.loanId}</b></span>
                    ${statusBadge}
                </div>
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <div>
                        <span class="d-block text-muted small mb-1">ยอดกู้ทั้งหมด</span>
                        <span class="fw-bold text-dark fs-6">฿${Number(l.principal).toLocaleString()}</span>
                    </div>
                    <div class="text-end">
                        <span class="d-block text-danger-corp small fw-bold mb-1">หนี้คงเหลือ</span>
                        <span class="fw-bold text-danger-corp fs-5">฿${Number(l.remaining).toLocaleString()}</span>
                    </div>
                </div>
                <div class="mt-2 pt-2 border-top text-muted" style="font-size: 0.75rem;">
                    <div class="d-flex justify-content-between">
                        <span>เริ่ม: ${l.startDate}</span>
                        <span>ดิวถัดไป: ${l.status === 'Active' ? l.dueDate : '-'}</span>
                    </div>
                </div>
            </div>`;
        });
    }
    document.getElementById('uLoansContainer').innerHTML = html;
}

function renderPayments(payments) {
    let html = '';
    
    if (!payments || payments.length === 0) {
        html = '<div class="text-center text-muted p-4 border rounded bg-white small shadow-sm">ยังไม่มีประวัติการชำระเงิน</div>';
    } else {
        // เรียงจากล่าสุดไปเก่าสุด
        let sortedPays = payments.sort((a, b) => {
            let dateA = a.date !== '-' ? a.date : '0';
            let dateB = b.date !== '-' ? b.date : '0';
            return dateB.localeCompare(dateA);
        });

        sortedPays.forEach(p => {
            let noText = String(p.no) === '0' ? 'หักล่วงหน้า' : `งวดที่ ${p.no}`;
            html += `
            <div class="pro-card p-3 mb-3 shadow-sm bg-white border-0" style="border-left: 4px solid #10b981 !important; border-radius: 12px;">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <b class="text-dark">${noText}</b>
                        <span class="d-block text-muted small mt-1"><i class="fa-regular fa-clock me-1"></i>${p.date || '-'}</span>
                        <span class="d-block text-muted small mt-1" style="font-size:0.7rem;">รหัส: ${p.loanId}</span>
                    </div>
                    <div class="text-end">
                        <b class="text-success-corp fs-5">+ ฿${Number(p.totalPaid).toLocaleString()}</b>
                    </div>
                </div>
            </div>`;
        });
    }
    document.getElementById('uPaymentsContainer').innerHTML = html;
}

function logout() {
    sessionStorage.removeItem('fintechAuthData');
    window.location.href = 'index.html';
}