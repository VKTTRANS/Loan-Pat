<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LMS Dashboard</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Kanit', sans-serif; background-color: #f8fafc; }
    .card-custom { border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: none; }
    .loading { display: none; text-align: center; color: #0d6efd; margin-top: 10px; font-size: 0.9rem; }
  </style>
</head>
<body>

<div class="container" style="max-width: 500px; margin-top: 50px;">
  
  <div id="loginPage" class="card card-custom p-4 text-center">
    <h3 class="mb-4 text-primary fw-bold">เข้าสู่ระบบ</h3>
    <input type="text" id="userId" class="form-control mb-3" placeholder="รหัสผู้ใช้งาน (User ID)">
    <input type="password" id="password" class="form-control mb-3" placeholder="รหัสผ่าน">
    <button onclick="login()" class="btn btn-primary w-100 py-2 fw-bold">Login</button>
    <div id="loginLoad" class="loading">กำลังตรวจสอบข้อมูล...</div>
  </div>

  <div id="adminPage" style="display: none;">
    <div class="d-flex justify-content-between mb-4 align-items-center">
      <h4 class="m-0 fw-bold">ระบบรับชำระเงิน</h4>
      <button onclick="location.reload()" class="btn btn-sm btn-outline-danger">ออกระบบ</button>
    </div>
    
    <div class="card card-custom p-4 mb-4">
      <div class="input-group mb-3">
        <input type="text" id="loanId" class="form-control" placeholder="ค้นหารหัสสัญญา">
        <button onclick="fetchPreview()" class="btn btn-dark fw-bold">ดึงข้อมูล</button>
      </div>
      <div id="previewLoad" class="loading">กำลังดึงข้อมูล...</div>

      <div id="paymentForm" style="display: none;">
        <div class="alert alert-secondary border-0">
          <p class="mb-1"><b>รหัสผู้กู้:</b> <span id="lblUserId"></span></p>
          <p class="mb-2"><b>ชำระงวดที่:</b> <span id="lblNo"></span></p>
          <hr class="my-2">
          <p class="mb-1 small">เงินต้น: ฿<span id="lblPrin"></span> | ดอกเบี้ย: ฿<span id="lblInt"></span></p>
          <h5 class="mt-2 text-danger fw-bold m-0">ยอดรวมชำระ: ฿<span id="lblTotal"></span></h5>
        </div>
        
        <label class="small fw-bold">รูปแบบการชำระเงิน</label>
        <select id="method" class="form-select mb-3">
          <option value="เงินโอน">เงินโอน</option>
          <option value="เงินสด">เงินสด</option>
        </select>
        
        <label class="small fw-bold">แนบหลักฐาน (ถ้ามี)</label>
        <input type="file" id="slipFile" class="form-control mb-4">
        
        <button onclick="submitData()" class="btn btn-success w-100 py-2 fw-bold">บันทึกรับชำระเงิน</button>
        <div id="submitLoad" class="loading">กำลังบันทึกข้อมูลเข้าสู่ระบบ...</div>
      </div>
    </div>
  </div>

</div>

<script>
  const GAS_URL = "https://script.google.com/macros/s/AKfycbxkq39mAaFRG584lXiQfqogwzTiPCjRWleq1L8JKiDVqa4YYphMRTYvlgefOqVI4ac4yQ/exec";
  let currentPayData = {};

  async function callGAS(data) {
    const res = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  async function login() {
    document.getElementById('loginLoad').style.display = 'block';
    const userId = document.getElementById('userId').value;
    const pass = document.getElementById('password').value;
    
    const response = await callGAS({ action: 'login', userId: userId, password: pass });
    document.getElementById('loginLoad').style.display = 'none';

    if (response.success && response.role === 'Admin') {
      document.getElementById('loginPage').style.display = 'none';
      document.getElementById('adminPage').style.display = 'block';
    } else {
      alert("เข้าสู่ระบบไม่สำเร็จ หรือคุณไม่มีสิทธิ์เข้าถึง");
    }
  }

  async function fetchPreview() {
    const loanId = document.getElementById('loanId').value;
    if (!loanId) return;
    
    document.getElementById('paymentForm').style.display = 'none';
    document.getElementById('previewLoad').style.display = 'block';
    const response = await callGAS({ action: 'preview', loanId: loanId });
    document.getElementById('previewLoad').style.display = 'none';

    if (response.success) {
      currentPayData = response;
      document.getElementById('paymentForm').style.display = 'block';
      document.getElementById('lblUserId').innerText = response.userId;
      document.getElementById('lblNo').innerText = response.nextNo;
      document.getElementById('lblPrin').innerText = response.principal;
      document.getElementById('lblInt').innerText = response.interest;
      document.getElementById('lblTotal').innerText = response.total;
    } else {
      alert("ไม่พบรหัสสัญญานี้ในระบบ");
    }
  }

  async function submitData() {
    document.getElementById('submitLoad').style.display = 'block';
    const fileInput = document.getElementById('slipFile');
    
    currentPayData.action = 'submit';
    currentPayData.method = document.getElementById('method').value;

    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = async function(e) {
        currentPayData.fileBase64 = e.target.result;
        currentPayData.fileName = file.name;
        await sendSubmit();
      };
      reader.readAsDataURL(file);
    } else {
      await sendSubmit();
    }
  }

  async function sendSubmit() {
    const response = await callGAS(currentPayData);
    document.getElementById('submitLoad').style.display = 'none';
    if (response.success) {
      alert("บันทึกการรับชำระเงินเรียบร้อยแล้ว!");
      location.reload();
    } else {
      alert("เกิดข้อผิดพลาดในการบันทึก");
    }
  }
</script>
</body>
</html>