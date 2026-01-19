const { ipcRenderer } = require('electron');
// const Tesseract = require('tesseract.js'); // Loaded via <script> tag
const CryptoJS = require('crypto-js');

// --- Tab Navigation ---
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        const tabId = item.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        document.getElementById(`tab-${tabId}`).style.display = 'block';

        if (tabId === 'otp') {
            cancelAddOtp(); // Reset view to default
            loadOtpList();
        }
    });
});

// Listen for tab switch requests from main
ipcRenderer.on('switch-tab', (event, tabId) => {
    const nav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (nav) nav.click();
});

// --- General Settings ---
function initGeneralSettings() {
    // UI Refs
    const chkTop = document.getElementById('chk-always-top');
    const chkTray = document.getElementById('chk-tray');
    const rngZoom = document.getElementById('rng-zoom');
    const lblZoom = document.getElementById('summ-zoom');
    const btnClear = document.getElementById('btn-clear-cache');

    // Load initial state
    ipcRenderer.invoke('get-general-settings').then(config => {
        if (config.alwaysOnTop) chkTop.checked = true;
        if (config.closeToTray) chkTray.checked = true;
        if (config.defaultZoom) {
            rngZoom.value = config.defaultZoom;
            lblZoom.innerText = config.defaultZoom + '%';
        }
    });

    // Bind Events
    chkTop.onchange = (e) => setConfig('alwaysOnTop', e.target.checked);
    chkTray.onchange = (e) => setConfig('closeToTray', e.target.checked);

    rngZoom.oninput = (e) => {
        lblZoom.innerText = e.target.value + '%';
        setConfig('defaultZoom', parseInt(e.target.value));
    };

    btnClear.onclick = async () => {
        if (confirm('Bạn có chắc muốn xóa cache và tải lại trang?')) {
            await ipcRenderer.invoke('clear-cache');
            ipcRenderer.send('save-settings', { action: 'reload' }); // Optional logic to reload main window
            alert('Đã xóa cache. Vui lòng đóng và mở lại ứng dụng hoặc trang chính.');
        }
    };
}

function setConfig(key, value) {
    ipcRenderer.invoke('set-general-setting', { key, value });
}

// Init immediately
initGeneralSettings();


// --- OTP Manager Logic ---
let currentOtpId = null; // Track current viewing ID for deletion
let otpData = {
    codes: new Array(35).fill(''), // 1-based index 0-34
};

function loadOtpList() {
    ipcRenderer.invoke('get-otp-list').then(list => {
        const container = document.getElementById('otp-cards-list');
        container.innerHTML = '';

        if (list.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#aaa;">Chưa có thẻ nào</div>';
            return;
        }

        list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'card-item';
            div.textContent = item.name + (item.lastUsed ? ' (Đã dùng)' : '');
            div.addEventListener('click', async () => {
                console.log('Clicked card:', item.id);
                try {
                    await showOtpDetail(item.id, item.name);
                } catch (err) {
                    console.error('Click error:', err);
                    alert('Lỗi khi mở thẻ: ' + err.message);
                }
            });
            container.appendChild(div);
        });
    });
}

document.getElementById('btn-add-otp').addEventListener('click', () => {
    document.getElementById('otp-placeholder').style.display = 'none';
    document.getElementById('otp-add-form').style.display = 'block';
    resetAddForm();
});

function cancelAddOtp() {
    document.getElementById('otp-add-form').style.display = 'none';
    document.getElementById('otp-placeholder').style.display = 'block';
}

function resetAddForm() {
    currentOtpId = null;
    const form = document.getElementById('otp-add-form');
    form.querySelector('h3').textContent = 'Thêm thẻ OTP mới';

    // Hide delete button
    document.getElementById('btn-delete-otp').style.display = 'none';

    const formGroups = form.querySelectorAll('.form-group');
    if (formGroups[2]) formGroups[2].style.display = 'block'; // Show File Input

    const btnContainer = form.querySelector('div[style*="margin-top: 15px"]');
    if (btnContainer) btnContainer.style.display = 'block'; // Show Buttons

    const nameInput = document.getElementById('otp-name');
    nameInput.value = '';
    nameInput.readOnly = false;

    const passInput = document.getElementById('otp-password');
    passInput.value = '';
    passInput.readOnly = false;

    document.getElementById('otp-file').value = '';
    document.getElementById('ocr-status').textContent = '';
    document.getElementById('otp-preview-area').style.display = 'none';
    document.getElementById('btn-save-otp').disabled = true;
    otpData.codes = new Array(35).fill('');
    renderGridPreview();
}

// 1. Handle File Upload & OCR
document.getElementById('otp-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('ocr-status');
    statusDiv.textContent = 'Đang tải ảnh lên máy chủ OCR (OCR.space)...';

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('apikey', 'helloworld');
        formData.append('language', 'eng');
        formData.append('isTable', 'true');
        formData.append('OCREngine', '2');

        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.IsErroredOnProcessing) {
            throw new Error(data.ErrorMessage[0] || 'Lỗi xử lý từ API');
        }

        if (!data.ParsedResults || data.ParsedResults.length === 0) {
            throw new Error('Không tìm thấy văn bản nào.');
        }

        const rawText = data.ParsedResults[0].ParsedText;
        statusDiv.textContent = 'Đã nhận kết quả! Đang phân tích...';
        console.log('--- API RAW RESULT ---', rawText);

        parseOcrResult(rawText);

        document.getElementById('otp-preview-area').style.display = 'block';
        document.getElementById('btn-save-otp').disabled = false;
        statusDiv.textContent = 'Vui lòng kiểm tra lại 35 ô bên dưới.';

    } catch (err) {
        statusDiv.textContent = 'Lỗi API: ' + err.message;
        console.error(err);
    }
});

function parseOcrResult(text) {
    const cleanText = text.replace(/[^0-9\s]/g, ' ');
    const pairRegex = /\b(\d{1,2})\s*(\d{4})\b/g;

    let match;
    const found = {};
    let foundCount = 0;

    while ((match = pairRegex.exec(cleanText)) !== null) {
        const idx = parseInt(match[1]);
        const code = match[2];

        if (idx >= 1 && idx <= 35) {
            if (!found[idx]) {
                found[idx] = code;
                foundCount++;
            }
        }
    }

    otpData.codes = new Array(35).fill('');
    Object.keys(found).forEach(idx => {
        otpData.codes[idx - 1] = found[idx];
    });

    console.log(`Parsed ${foundCount} pairs.`);
    renderGridPreview();
}

function renderGridPreview() {
    const container = document.getElementById('otp-grid-preview');
    container.innerHTML = '';

    for (let i = 0; i < 35; i++) {
        const cell = document.createElement('div');
        cell.className = 'otp-cell';

        const label = document.createElement('div');
        label.className = 'otp-label';
        label.textContent = `${i + 1}`;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'otp-input';
        input.maxLength = 4;
        input.value = otpData.codes[i];

        input.onchange = (e) => {
            otpData.codes[i] = e.target.value;
        };

        cell.appendChild(label);
        cell.appendChild(input);
        container.appendChild(cell);
    }
}

// 2. Save OTP
document.getElementById('btn-save-otp').addEventListener('click', async () => {
    const name = document.getElementById('otp-name').value;
    const password = document.getElementById('otp-password').value;

    if (!name || !password) {
        alert('Vui lòng nhập tên và mật khẩu!');
        return;
    }

    const jsonStr = JSON.stringify(otpData.codes);
    const encrypted = CryptoJS.AES.encrypt(jsonStr, password).toString();
    const id = Date.now().toString();

    const result = await ipcRenderer.invoke('save-otp-card', {
        id,
        name,
        data: encrypted,
        lastUsed: null
    });

    if (result.success) {
        alert('Đã lưu thẻ OTP thành công!');
        cancelAddOtp();
        loadOtpList();
    } else {
        alert('Lỗi lưu: ' + result.error);
    }
});

// 3. Show/Unlock logic
async function showOtpDetail(id, name) {
    currentOtpId = id;
    console.log('showOtpDetail called for:', id, name);

    try {
        const password = await requestPassword(name);
        const result = await ipcRenderer.invoke('get-otp-card-enc', id);
        if (!result) { alert("Lỗi tải thẻ"); return; }

        const bytes = CryptoJS.AES.decrypt(result.data, password);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);

        if (!decryptedStr) {
            alert('Mật khẩu sai!');
            return;
        }

        const codes = JSON.parse(decryptedStr);
        await ipcRenderer.invoke('unlock-otp-card', { cardId: id, codes });
        showUnlockedDetail(name, codes);

    } catch (e) {
        if (e !== 'CANCEL') {
            console.error(e);
            alert('Mật khẩu sai hoặc file lỗi!');
        }
    }
}

function requestPassword(cardName) {
    return new Promise((resolve, reject) => {
        const modal = document.getElementById('password-modal');
        const input = document.getElementById('modal-password-input');
        const btnConfirm = document.getElementById('btn-modal-confirm');
        const btnCancel = document.getElementById('btn-modal-cancel');

        modal.querySelector('h3').textContent = `Nhập mật khẩu cho thẻ "${cardName}"`;
        input.value = '';
        modal.style.display = 'flex';
        input.focus();

        const onConfirm = () => {
            const val = input.value;
            if (val) {
                cleanup();
                resolve(val);
            }
        };

        const onCancel = () => {
            cleanup();
            reject('CANCEL');
        };

        const onKeyup = (e) => {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
        };

        const cleanup = () => {
            modal.style.display = 'none';
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
            input.removeEventListener('keyup', onKeyup);
        };

        const confirmHandler = () => onConfirm();
        const cancelHandler = () => onCancel();
        const keyupHandler = (e) => onKeyup(e);

        btnConfirm.onclick = confirmHandler;
        btnCancel.onclick = cancelHandler;
        input.onkeyup = keyupHandler;
    });
}

function showUnlockedDetail(name, codes) {
    document.getElementById('otp-placeholder').style.display = 'none';
    const form = document.getElementById('otp-add-form');
    form.style.display = 'block';

    // 1. Change Title
    form.querySelector('h3').textContent = `Chi tiết thẻ: ${name}`;

    // 2. Show Delete Button
    const btnDelete = document.getElementById('btn-delete-otp');
    btnDelete.style.display = 'block';

    // Clear old listeners
    const newBtn = btnDelete.cloneNode(true);
    btnDelete.parentNode.replaceChild(newBtn, btnDelete);

    // Add delete handler
    newBtn.onclick = async () => {
        if (confirm(`Bạn có chắc muốn xóa thẻ "${name}"? Hành động này không thể hoàn tác.`)) {
            // Since we don't have the ID passed here implicitly, we need to store it globally or pass it.
            // Let's rely on 'currentOtpId' which we should have set in 'showOtpDetail'.
            // Wait, showOtpDetail has ID. I need to update showOtpDetail to set global ID.
            if (currentOtpId) {
                const res = await ipcRenderer.invoke('delete-otp-card', currentOtpId);
                if (res.success) {
                    alert('Đã xóa thẻ.');
                    cancelAddOtp();
                    loadOtpList();
                } else {
                    alert('Lỗi: ' + res.error);
                }
            }
        }
    };

    // 3. Hide File Upload & Save Buttons
    const formGroups = form.querySelectorAll('.form-group');
    if (formGroups[2]) formGroups[2].style.display = 'none';

    const btnContainer = form.querySelector('div[style*="margin-top: 15px"]');
    if (btnContainer) btnContainer.style.display = 'none';

    // 4. Fill Data
    document.getElementById('otp-name').value = name;
    document.getElementById('otp-name').readOnly = true;

    document.getElementById('otp-password').value = '******';
    document.getElementById('otp-password').readOnly = true;

    // 5. Render Grid
    otpData.codes = codes;
    renderGridPreview();

    const gridInputs = document.querySelectorAll('#otp-grid-preview input');
    gridInputs.forEach(input => {
        input.readOnly = true;
        input.style.color = '#fff';
        input.style.cursor = 'default';
    });

    document.getElementById('otp-preview-area').style.display = 'block';
    document.getElementById('ocr-status').textContent = 'Đã mở khóa. (Chế độ xem)';
}
