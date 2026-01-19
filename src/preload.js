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
                if (cards.length === 0) {
                    console.warn('No OTP cards configured');
                    showToast('Chưa có thẻ OTP nào.');
                    return;
                }

                const modal = document.createElement('div');
                modal.id = 'shs-otp-modal';
                modal.style.cssText = `position: fixed; top: 120px; left: 50%; transform: translateX(-50%); width: 320px; background: #252526; color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 2147483647; font-family: sans-serif; border: 1px solid #3e3e42;`;

                const title = document.createElement('div'); title.innerText = '🔐 Mở khóa OTP'; title.style.cssText = 'font-weight: bold; margin-bottom: 15px; font-size: 16px; text-align: center;';

                const select = document.createElement('select');
                select.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 10px; background: #333; color: #fff; border: 1px solid #444; border-radius: 4px;';
                cards.forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.innerText = c.name; select.appendChild(opt); });

                const input = document.createElement('input'); input.type = 'password'; input.placeholder = 'Nhập mật khẩu...';
                input.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 10px; background: #333; color: #fff; border: 1px solid #444; border-radius: 4px; box-sizing: border-box;';

                const errorMsg = document.createElement('div');
                errorMsg.style.cssText = 'color: #ff5555; font-size: 13px; margin-bottom: 10px; display: none;';

                const btnContainer = document.createElement('div'); btnContainer.style.display = 'flex'; btnContainer.style.justifyContent = 'space-between';

                const btnCancel = document.createElement('button'); btnCancel.innerText = 'Hủy';
                btnCancel.style.cssText = 'padding: 8px 15px; cursor: pointer; background: #444; color: #fff; border: none; border-radius: 4px;';

                const btnUnlock = document.createElement('button'); btnUnlock.innerText = 'Mở khóa';
                btnUnlock.style.cssText = 'padding: 8px 20px; cursor: pointer; background: #007acc; color: #fff; border: none; border-radius: 4px; font-weight: bold;';

                const close = () => {
                    modal.remove();
                    // Clear lastAutoFillIndex so user can retry
                    window.lastAutoFillIndex = null;
                };
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
                            errorMsg.textContent = 'Mật khẩu không đúng!';
                            errorMsg.style.display = 'block';
                            btnUnlock.disabled = false; btnUnlock.innerText = 'Mở khóa';
                            input.value = '';
                            setTimeout(() => input.focus(), 50);
                        }
                    } catch (e) {
                        errorMsg.textContent = 'Lỗi: ' + e.message;
                        errorMsg.style.display = 'block';
                        btnUnlock.disabled = false;
                    }
                };

                btnUnlock.onclick = doUnlock;
                input.onkeyup = (e) => { if (e.key === 'Enter') doUnlock(); else if (e.key === 'Escape') close(); };

                modal.append(title, select, input, errorMsg, btnContainer);
                btnContainer.append(btnCancel, btnUnlock);
                document.body.appendChild(modal);
                input.focus();
            });
        }

        otpObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

        // Title Bar injection
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 40px; background: #202020; z-index: 999999; display: flex; align-items: center; -webkit-app-region: drag; box-sizing: border-box; padding-left: 15px; font-family: sans-serif;`;

        // Logo
        const logo = document.createElement('img');
        const { ipcRenderer } = require('electron');
        ipcRenderer.invoke('get-app-icon').then(base64 => {
            if (base64) {
                logo.src = `data:image/png;base64,${base64}`;
            } else {
                console.warn('Could not load app icon via IPC');
            }
        });

        logo.style.cssText = 'height: 24px; width: 24px; margin-right: 10px; -webkit-app-region: no-drag;';
        titleBar.appendChild(logo);

        const title = document.createElement('div'); title.innerText = 'SH Smart'; title.style.cssText = `color: #fff; font-size: 14px; font-weight: bold;`;
        titleBar.appendChild(title);
        const btnContainer = document.createElement('div'); btnContainer.style.cssText = `position: absolute; right: 150px; top: 0; height: 100%; display: flex; align-items: center; -webkit-app-region: no-drag;`;
        const btn = document.createElement('div'); btn.innerHTML = '⚙️'; btn.onclick = () => { require('electron').ipcRenderer.send('open-settings'); };
        btn.style.cssText = `cursor: pointer; font-size: 18px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; color: #ccc;`;
        btnContainer.appendChild(btn); titleBar.appendChild(btnContainer); document.body.appendChild(titleBar);
        const style = document.createElement('style'); style.innerHTML = `body { margin-top: 40px !important; } header, .header, #header { top: 40px !important; }`;
        document.head.appendChild(style);
        // F1-F7 Shortcuts
        window.addEventListener('keydown', (e) => {
            const keyMap = {
                'F1': 'Bảng giá',
                'F2': 'Thị trường',
                'F3': 'Giao dịch',
                'F4': 'Tài sản',
                'F5': 'Quản lý tiền',
                'F6': 'Báo cáo',
                'F7': 'Quản lý dịch vụ'
            };

            if (keyMap[e.key]) {
                e.preventDefault();
                const label = keyMap[e.key];
                console.log(`Shortcut pressed: ${e.key} -> ${label}`);

                const xpath = `//*[text()='${label}' or contains(text(), '${label}')]`;
                const result = document.evaluate(xpath, document.body, null, XPathResult.ANY_TYPE, null);

                let element = result.iterateNext();
                let found = null;

                while (element) {
                    if (element.offsetParent !== null) {
                        const rect = element.getBoundingClientRect();
                        if (rect.top < 100) {
                            found = element;
                            break;
                        }
                    }
                    element = result.iterateNext();
                }

                if (found) {
                    found.click();
                }
            }

            // F8 Macro: Notifications -> See More
            if (e.key === 'F8') {
                e.preventDefault();
                console.log('Shortcut F8: Opening Notifications...');

                // 1. Find the Bell Icon using multiple heuristics
                const bellXpaths = [
                    // Specific SVG Path (M12 2.5...) from User Screenshot
                    `//*[local-name()='path' and starts-with(@d, 'M12 2.5a7.297')]/..`,
                    `//*[contains(@title, 'Thông báo')]`,
                    `//*[contains(@aria-label, 'Thông báo')]`,
                    `//*[contains(@class, 'bell')]`,
                    `//*[contains(@class, 'notification')]`
                ];

                let bell = null;
                for (const xp of bellXpaths) {
                    bell = document.evaluate(xp, document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if (bell) {
                        // Check if visible
                        if (bell.offsetParent !== null) {
                            console.log('Found Bell via:', xp);
                            break;
                        } else {
                            bell = null; // Found but hidden, keep looking
                        }
                    }
                }


                if (bell) {
                    // SVG elements might not have .click(), so we dispatch a MouseEvent
                    const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    });
                    bell.dispatchEvent(clickEvent);

                    // 2. Wait for popup and Click "Xem thêm"
                    setTimeout(() => {
                        const xpathMore = `//button[contains(text(), 'Xem thêm')] | //a[contains(text(), 'Xem thêm')] | //span[contains(text(), 'Xem thêm')]`;
                        const btnMore = document.evaluate(xpathMore, document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (btnMore) {
                            btnMore.click();
                            console.log('Clicked "Xem thêm"');
                        } else {
                            console.warn('"Xem thêm" button not found');
                        }
                    }, 800);
                } else {
                    console.warn('Bell icon not found with any selector');
                }
            }

            // F9: Click Search (Magnifying Glass) Icon
            if (e.key === 'F9') {
                e.preventDefault();
                console.log('Shortcut F9: Opening Search...');

                const searchXpaths = [
                    // Specific SVG Path from User Screenshot
                    `//*[local-name()='path' and starts-with(@d, 'M3 9.167a6.167')]/..`,
                    `//*[local-name()='svg' and contains(@class, 'cursor-po')]`,
                    `//*[contains(@title, 'Tìm kiếm')]`,
                    `//*[contains(@aria-label, 'Tìm kiếm')]`,
                    `//*[contains(@aria-label, 'Search')]`
                ];

                let searchIcon = null;
                for (const xp of searchXpaths) {
                    searchIcon = document.evaluate(xp, document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if (searchIcon && searchIcon.offsetParent !== null) {
                        console.log('Found Search via:', xp);
                        break;
                    } else {
                        searchIcon = null;
                    }
                }

                if (searchIcon) {
                    const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    });
                    searchIcon.dispatchEvent(clickEvent);
                } else {
                    console.warn('Search icon not found with any selector');
                }
            }
        });
    }
});
