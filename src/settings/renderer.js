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

    // Load App Version
    ipcRenderer.invoke('get-app-version').then(ver => {
        const el = document.getElementById('app-version');
        if (el) el.innerText = ver;
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
            ipcRenderer.send('save-settings', { action: 'reload' });
        }
    };

    // --- Widget Settings ---
    const chkWidget = document.getElementById('chk-widget-enable');
    const watchlistInputs = document.querySelectorAll('.watchlist-input');

    // Load Widget Config
    ipcRenderer.invoke('get-general-settings').then(config => {
        if (config.widgetEnable) chkWidget.checked = true;

        const savedList = config.watchlist || [];
        watchlistInputs.forEach((input, index) => {
            if (savedList[index]) input.value = savedList[index];
        });
    });

    // Save Widget Enable
    chkWidget.onchange = (e) => {
        setConfig('widgetEnable', e.target.checked);
        ipcRenderer.send('toggle-widget', e.target.checked);
    };

    // Save Watchlist (Debounced or on Blur)
    watchlistInputs.forEach(input => {
        input.onblur = () => {
            const newWatchlist = Array.from(watchlistInputs)
                .map(i => i.value.trim().toUpperCase())
                .filter(v => v); // Remove empty
            setConfig('watchlist', newWatchlist);

            if (chkWidget.checked) {
                // Force update widget immediately
                ipcRenderer.send('update-widget-watchlist', newWatchlist);
            }
        };
    });

    // Clear Watchlist Button
    document.getElementById('btn-clear-watchlist').onclick = () => {
        if (confirm('Bạn có chắc muốn xóa toàn bộ danh sách và tắt Widget?')) {
            // 1. Clear UI
            watchlistInputs.forEach(input => input.value = '');
            chkWidget.checked = false;

            // 2. Update Config
            setConfig('watchlist', []);
            setConfig('widgetEnable', false);

            // 3. Send IPCs
            ipcRenderer.send('update-widget-watchlist', []);
            ipcRenderer.send('toggle-widget', false);
        }
    };

    // Listen for Sync State from Main (When closed via context menu)
    ipcRenderer.on('sync-widget-state', (event, isEnabled) => {
        chkWidget.checked = isEnabled;
    });
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
    // 1. Tokenize: Extract all number-like strings
    // We split by non-digit characters to get pure numbers
    const tokens = text.match(/\b\d+\b/g);

    if (!tokens || tokens.length === 0) {
        console.warn('No numbers found in OCR text');
        return;
    }

    console.log('OCR Tokens:', tokens);

    const pendingIndices = [];
    const found = {};
    let foundCount = 0;

    tokens.forEach(token => {
        const num = parseInt(token);

        // Check if it's a valid index (1-35)
        // We exclude numbers that look like codes (e.g. 2024 is > 35)
        // Note: A code like "0012" might parse as 12. 
        // We assume codes are typically 4 digits >= 1000 or have leading zeros preserved in string if we looked closer,
        // but parseInt strips them.
        // However, in the image, codes are 4 digits. Let's assume codes >= 100 if leading zeros sort of missing, but strictly the image shows 4 digits.
        // Let's rely on string length for code detection if possible?
        // But the token is string.

        const isIndex = (num >= 1 && num <= 35);
        const isCode = (token.length === 4 || (num >= 1000 && num <= 9999));

        if (isIndex && !isCode) {
            // It's an index, add to queue
            // Prevent duplicate indices in queue if we want to be strict? 
            // Better to just push, maybe the format is 1 1234 1 5678 (repeated index?) - unlikely.
            // Just push.
            pendingIndices.push(num);
        } else if (isCode) {
            // It's a code
            if (pendingIndices.length > 0) {
                // Assign to the oldest pending index (FIFO for "Row of Indices... Row of Codes" or "Index Code")
                const idx = pendingIndices.shift();
                if (!found[idx]) {
                    found[idx] = token;
                    foundCount++;
                }
            } else {
                // Found a code but no index? 
                // Could be noise, or maybe structure is mismatched.
                // Ignore for now.
            }
        }
    });

    otpData.codes = new Array(35).fill('');
    Object.keys(found).forEach(idx => {
        otpData.codes[idx - 1] = found[idx];
    });

    console.log(`Parsed ${foundCount} pairs using Queue Strategy.`);
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
// 2. Save OTP
document.getElementById('btn-save-otp').addEventListener('click', async () => {
    const name = document.getElementById('otp-name').value;
    const password = document.getElementById('otp-password').value;
    const errorWith = document.getElementById('save-error-msg');
    errorWith.style.display = 'none';

    if (!name || !password) {
        errorWith.textContent = 'Vui lòng nhập đầy đủ tên và mật khẩu!';
        errorWith.style.display = 'block';
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
        // Use a small toast or just reset
        cancelAddOtp();
        loadOtpList();
        // Optional: show a small 'Saved' toast if we had one, but list update is visual enough.
    } else {
        errorWith.textContent = 'Lỗi lưu: ' + result.error;
        errorWith.style.display = 'block';
    }
});

// 3. Show/Unlock logic
async function showOtpDetail(id, name) {
    currentOtpId = id;
    console.log('showOtpDetail called for:', id, name);

    try {
        // Fetch encrypted data once
        const result = await ipcRenderer.invoke('get-otp-card-enc', id);
        if (!result) throw new Error("Không tìm thấy dữ liệu thẻ");

        // Validator function to check password
        const validator = (password) => {
            try {
                const bytes = CryptoJS.AES.decrypt(result.data, password);
                const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
                if (!decryptedStr) return null; // Wrong password
                return JSON.parse(decryptedStr); // Success: return codes
            } catch (e) {
                return null; // Decrypt failed
            }
        };

        const codes = await requestPassword(name, validator);

        // If we get here, password was correct and we have codes
        await ipcRenderer.invoke('unlock-otp-card', { cardId: id, codes });
        showUnlockedDetail(name, codes);

    } catch (e) {
        if (e !== 'CANCEL') {
            console.error(e);
            // Use a toast or non-blocking UI for fatal errors
            // alert('Lỗi: ' + e.message); 
            // Better: update the UI placeholder
            document.getElementById('otp-placeholder').innerHTML = `<p style="color:red">Lỗi: ${e.message}</p>`;
            document.getElementById('otp-placeholder').style.display = 'block';
        }
    }
}

function requestPassword(cardName, validatorFn) {
    return new Promise((resolve, reject) => {
        const modal = document.getElementById('password-modal');
        const input = document.getElementById('modal-password-input');
        const errorMsg = document.getElementById('modal-error-msg');
        const btnConfirm = document.getElementById('btn-modal-confirm');
        const btnCancel = document.getElementById('btn-modal-cancel');

        modal.querySelector('h3').textContent = `Nhập mật khẩu cho thẻ "${cardName}"`;
        input.value = '';
        errorMsg.style.display = 'none';
        modal.style.display = 'flex';
        input.focus();

        const cleanup = () => {
            modal.style.display = 'none';
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
            input.onkeyup = null;
        };

        const onConfirm = async () => {
            const password = input.value;
            if (!password) return;

            // Validate
            const codes = validatorFn(password);
            if (codes) {
                cleanup();
                resolve(codes);
            } else {
                // Show error, keep modal open
                errorMsg.textContent = 'Mật khẩu không đúng!';
                errorMsg.style.display = 'block';
                input.value = '';
                // Hack: Blur then focus to ensure caret reappears
                ipcRenderer.send('focus-settings');
                input.blur();
                setTimeout(() => input.focus(), 100);
            }
        };

        const onCancel = () => {
            cleanup();
            reject('CANCEL');
        };

        btnConfirm.onclick = onConfirm;
        btnCancel.onclick = onCancel;

        input.onkeyup = (e) => {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
        };
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
