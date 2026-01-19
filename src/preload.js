// preload.js

console.log('SH Smart Preload: Initializing Auto-Subscribe...');

Object.defineProperty(Notification, 'permission', { get: () => 'granted' });

// 1. Auto-Subscribe
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            const allowButton = document.querySelector('#onesignal-slidedown-allow-button');
            if (allowButton) { allowButton.click(); return; }
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
                if (btn.textContent && btn.textContent.includes('Subscribe') && btn.offsetParent !== null) {
                    btn.click(); return;
                }
            }
        }
    }
});

window.addEventListener('DOMContentLoaded', () => {
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });

        // 2. OTP Logic
        const otpObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length || mutation.type === 'characterData') {
                    const text = document.body.innerText;
                    const match = text.match(/ô số[:\s]*(\d+)/i);

                    if (match) {
                        const index = parseInt(match[1]);

                        if (window.lastAutoFillIndex === index) return;

                        console.log('Detected OTP Request for Index:', index);
                        window.lastAutoFillIndex = index;

                        const { ipcRenderer } = require('electron');
                        ipcRenderer.invoke('get-auto-otp', index).then(result => {
                            if (result.success && result.code) {
                                // NEW STRATEGY: Show Toast
                                showToast(result.code);
                            } else if (result.reason === 'LOCKED') {
                                showUnlockModal(index);
                            }
                        });
                    }
                }
            }
        });

        // Toast Notification System
        function showToast(otpCode) {
            // Remove existing toast if any
            const existing = document.getElementById('shs-otp-toast');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.id = 'shs-otp-toast';
            toast.style.cssText = `
                position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
                background: #007acc; color: white; padding: 15px 30px;
                border-radius: 50px; font-size: 24px; font-weight: bold;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 2147483647;
                display: flex; align-items: center; gap: 15px;
                animation: fadeInDown 0.5s ease-out; font-family: sans-serif;
            `;

            // Inner HTML
            toast.innerHTML = `
                <span>Mã OTP:</span>
                <span style="font-family: monospace; font-size: 32px; background: rgba(0,0,0,0.2); padding: 0 10px; border-radius: 4px;">${otpCode}</span>
            `;

            // Auto-dismiss
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.5s';
                setTimeout(() => toast.remove(), 500);
            }, 5000); // 5 seconds

            // Animation Keyframes
            const style = document.createElement('style');
            style.innerHTML = `
                @keyframes fadeInDown {
                    from { opacity: 0; transform: translate(-50%, -20px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(toast);
        }

        function showUnlockModal(pendingIndex) {
            if (document.getElementById('shs-otp-modal')) return;
            const { ipcRenderer } = require('electron');

            ipcRenderer.invoke('get-otp-list').then(cards => {
                if (cards.length === 0) { alert('Chưa có thẻ OTP nào.'); return; }

                const modal = document.createElement('div');
                modal.id = 'shs-otp-modal';
                modal.style.cssText = `position: fixed; top: 120px; left: 50%; transform: translateX(-50%); width: 320px; background: #252526; color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 2147483647; font-family: sans-serif; border: 1px solid #3e3e42;`;

                const title = document.createElement('div'); title.innerText = '🔐 Mở khóa OTP'; title.style.cssText = 'font-weight: bold; margin-bottom: 15px; font-size: 16px; text-align: center;';

                const select = document.createElement('select');
                select.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 10px; background: #333; color: #fff; border: 1px solid #444; border-radius: 4px;';
                cards.forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.innerText = c.name; select.appendChild(opt); });

                const input = document.createElement('input'); input.type = 'password'; input.placeholder = 'Nhập mật khẩu...';
                input.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 15px; background: #333; color: #fff; border: 1px solid #444; border-radius: 4px; box-sizing: border-box;';

                const btnContainer = document.createElement('div'); btnContainer.style.display = 'flex'; btnContainer.style.justifyContent = 'space-between';

                const btnCancel = document.createElement('button'); btnCancel.innerText = 'Hủy';
                btnCancel.style.cssText = 'padding: 8px 15px; cursor: pointer; background: #444; color: #fff; border: none; border-radius: 4px;';

                const btnUnlock = document.createElement('button'); btnUnlock.innerText = 'Mở khóa';
                btnUnlock.style.cssText = 'padding: 8px 20px; cursor: pointer; background: #007acc; color: #fff; border: none; border-radius: 4px; font-weight: bold;';

                const close = () => modal.remove();
                btnCancel.onclick = close;

                const doUnlock = async () => {
                    const cardId = select.value; const password = input.value;
                    if (!password) return;
                    btnUnlock.disabled = true; btnUnlock.innerText = 'Đang xử lý...';

                    try {
                        const res = await ipcRenderer.invoke('attempt-unlock-otp', { cardId, password });
                        if (res.success) {
                            close();
                            // Retry Fetch triggers Toast
                            const r2 = await ipcRenderer.invoke('get-auto-otp', pendingIndex);
                            if (r2.success && r2.code) {
                                showToast(r2.code);
                            }
                        } else {
                            alert('Sai mật khẩu!');
                            btnUnlock.disabled = false; btnUnlock.innerText = 'Mở khóa';
                            input.value = ''; input.focus();
                        }
                    } catch (e) { alert('Lỗi: ' + e.message); btnUnlock.disabled = false; }
                };

                btnUnlock.onclick = doUnlock;
                input.onkeyup = (e) => { if (e.key === 'Enter') doUnlock(); else if (e.key === 'Escape') close(); };

                modal.append(title, select, input, btnContainer);
                btnContainer.append(btnCancel, btnUnlock);
                document.body.appendChild(modal);
                input.focus();
            });
        }

        otpObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

        // Title Bar injection
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 40px; background: #202020; z-index: 999999; display: flex; align-items: center; -webkit-app-region: drag; box-sizing: border-box; padding-left: 15px; font-family: sans-serif;`;
        const title = document.createElement('div'); title.innerText = 'SH Smart'; title.style.cssText = `color: #fff; font-size: 14px; font-weight: bold;`;
        titleBar.appendChild(title);
        const btnContainer = document.createElement('div'); btnContainer.style.cssText = `position: absolute; right: 150px; top: 0; height: 100%; display: flex; align-items: center; -webkit-app-region: no-drag;`;
        const btn = document.createElement('div'); btn.innerHTML = '⚙️'; btn.onclick = () => { require('electron').ipcRenderer.send('open-settings'); };
        btn.style.cssText = `cursor: pointer; font-size: 18px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; color: #ccc;`;
        btnContainer.appendChild(btn); titleBar.appendChild(btnContainer); document.body.appendChild(titleBar);
        const style = document.createElement('style'); style.innerHTML = `body { margin-top: 40px !important; } header, .header, #header { top: 40px !important; }`;
        document.head.appendChild(style);
    }
});
