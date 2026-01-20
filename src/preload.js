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
        const style = document.createElement('style'); style.innerHTML = `body { margin-top: 40px !important; }`;
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

    // --- Price Widget Logic ---
    const { ipcRenderer } = require('electron');
    let priceInterval = null;
    let currentWatchlist = [];

    function startPricePoller() {
        if (priceInterval) clearInterval(priceInterval);
        if (!currentWatchlist || currentWatchlist.length === 0) return;

        const fetchPrices = async () => {
            try {
                // Switch to stockInfos for richer data (Ref, Ceil, Floor)
                const url = `https://shsmart.shs.com.vn/api/v1/finance/stockInfos?symbol=${currentWatchlist.join(',')}`;
                const res = await fetch(url);
                const json = await res.json();

                // Parse Data
                const updates = json.map(item => {
                    return {
                        symbol: item.symbol,
                        price: (item.lastPrice || 0) * 1000,
                        change: (item.priceChange || 0), // User requested unit 1k (0.1 for 100d)
                        percent: (item.priceChangePercent || 0) * 100,
                        ref: (item.basicPrice || 0) * 1000,
                        ceil: (item.ceilPrice || 0) * 1000,
                        floor: (item.flrPrice || 0) * 1000
                    };
                });

                ipcRenderer.send('price-update-data', updates);
            } catch (e) {
                // Silent error
            }
        };

        fetchPrices(); // Immediate first run
        priceInterval = setInterval(fetchPrices, 3000); // 3 seconds
    }

    ipcRenderer.on('watchlist-changed', (event, list) => {
        currentWatchlist = list;
        clearInterval(priceInterval);
        startPricePoller();
    });

    ipcRenderer.on('widget-enabled', () => {
        ipcRenderer.invoke('get-widget-config').then(config => {
            currentWatchlist = config.watchlist || [];
            startPricePoller();
        });
    });

    // Handle "Click on Widget Symbol" flow
    ipcRenderer.on('trigger-search-flow', (event, symbol) => {
        console.log('Triggering search for:', symbol);

        // 1. Find and Click Search Icon (Reuse F9 logic)
        const searchXpaths = [
            `//*[local-name()='path' and starts-with(@d, 'M3 9.167a6.167')]/..`,
            `//*[local-name()='svg' and contains(@class, 'cursor-po')]`,
            `//*[contains(@title, 'Tìm kiếm')]`,
            `//*[contains(@aria-label, 'Tìm kiếm')]`,
            `//*[contains(@aria-label, 'Search')]`
        ];

        let searchIcon = null;
        for (const xp of searchXpaths) {
            searchIcon = document.evaluate(xp, document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (searchIcon && searchIcon.offsetParent !== null) break;
            else searchIcon = null;
        }

        if (searchIcon) {
            searchIcon.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));

            // 2. Wait for Input to appear, then Type & Enter
            setTimeout(() => {
                // Try to find the search input
                const inputs = document.querySelectorAll('input');
                let searchInput = null;
                // Heuristic: Input that is visible and potentially related to search
                for (const inp of inputs) {
                    if (inp.offsetParent !== null && (
                        inp.placeholder.includes('Mã') ||
                        inp.placeholder.includes('Symbol') ||
                        inp.placeholder.includes('Tìm') ||
                        inp.className.includes('search')
                    )) {
                        searchInput = inp;
                        break;
                    }
                }

                if (searchInput) {
                    searchInput.focus();
                    searchInput.value = symbol;
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

                    setTimeout(() => {
                        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    }, 100);
                }
            }, 300); // 300ms wait for modal/input animation
        }
    });

    // Initial Start
    ipcRenderer.invoke('get-widget-config').then(config => {
        if (config.widgetEnable) {
            currentWatchlist = config.watchlist || [];
            startPricePoller();
            ipcRenderer.send('toggle-widget', true);
        }
    });

    // ==========================================
    // AI ASSISTANT INJECTION
    // ==========================================
    let aiIconSrc = 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png'; // Fallback initial

    // Load AI Config
    ipcRenderer.invoke('get-general-settings').then(config => {
        if (config.aiEnabled) {
            injectAIUI();
        }
    });

    function injectAIUI() {
        console.log('Injecting AI UI...');

        ipcRenderer.invoke('get-ai-icon').then(base64 => {
            if (base64) aiIconSrc = `data:image/png;base64,${base64}`;

            // Proceed to inject (moved inside callback to ensure icon is ready or defaulted)
            doInject();
        });
    }

    function doInject() {
        // ... (existing injection logic, but wrapped in function)
        const container = document.createElement('div');
        container.id = 'shs-ai-container';
        container.innerHTML = `
            <style>
                #shs-ai-floating-icon {
                    position: fixed; bottom: 20px; right: 20px;
                    width: 60px; height: 60px;
                    border-radius: 50%;
                    background: #202020;
                    border: 2px solid #007acc;
                    box-shadow: 0 4px 15px rgba(0,122,204,0.5);
                    cursor: pointer; z-index: 10000;
                    display: flex; align-items: center; justify-content: center;
                    transition: transform 0.2s;
                }
                #shs-ai-floating-icon:hover { transform: scale(1.1); }
                #shs-ai-floating-icon img { width: 85%; height: 85%; object-fit: contain; }

                #shs-ai-chat-window {
                    position: fixed; bottom: 90px; right: 20px;
                    width: 350px; height: 500px;
                    background: #1e1e1e;
                    border: 1px solid #333;
                    border-radius: 12px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    z-index: 10000;
                    display: none; flex-direction: column;
                    font-family: 'Segoe UI', sans-serif;
                    overflow: hidden;
                }
                #shs-ai-chat-window.modal-mode {
                    width: 800px; height: 600px;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    bottom: auto; right: auto;
                }

                .ai-header {
                    padding: 10px 15px; background: #252526; border-bottom: 1px solid #333;
                    display: flex; justify-content: space-between; align-items: center;
                    color: #fff; font-weight: bold; -webkit-user-select: none;
                }
                .ai-controls span { cursor: pointer; margin-left: 10px; color: #aaa; font-size: 14px; }
                .ai-controls span:hover { color: #fff; }

                .ai-tabs { display: flex; background: #2d2d2d; }
                .ai-tab {
                    flex: 1; padding: 8px; text-align: center; color: #aaa; cursor: pointer;
                    font-size: 13px; border-bottom: 2px solid transparent;
                }
                .ai-tab.active { color: #fff; border-bottom: 2px solid #007acc; background: #1e1e1e; }

                .ai-body { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
                
                .ai-message { max-width: 85%; padding: 8px 12px; border-radius: 8px; font-size: 14px; line-height: 1.4; color: #ddd; }
                .ai-message.user { align-self: flex-end; background: #007acc; color: #fff; }
                .ai-message.model { align-self: flex-start; background: #333; }
                
                .ai-input-area {
                    padding: 10px; background: #252526; border-top: 1px solid #333;
                    display: flex; gap: 10px;
                }
                .ai-input-area input {
                    flex: 1; background: #333; border: 1px solid #444; color: #fff;
                    padding: 8px; border-radius: 4px; outline: none;
                }
                .ai-input-area button {
                    background: #007acc; color: #fff; border: none; padding: 0 15px;
                    border-radius: 4px; cursor: pointer;
                }
                
                /* Technical Analysis Form */
                #ai-tech-form {
                    display: flex; padding: 20px; flex-direction: column; gap: 15px;
                    align-items: center; justify-content: center; height: 100%;
                }
                #ai-tech-form input {
                    width: 70%; padding: 10px; background: #333; border: 1px solid #444; 
                    color: #fff; border-radius: 4px; text-align: center; font-size: 16px; text-transform: uppercase;
                }
                #ai-tech-form button {
                    padding: 10px 30px; background: #28a745; color: #fff; border: none; 
                    border-radius: 4px; cursor: pointer; font-size: 14px;
                }

                /* Markdown Content Styling */
                .ai-message.model strong { color: #fff; font-weight: bold; }
                .ai-message.model ul { margin: 5px 0 5px 20px; padding: 0; }
                .ai-message.model li { margin-bottom: 2px; }

                /* Typing Indicator */
                .typing-indicator span {
                    display: inline-block; width: 6px; height: 6px; background-color: #aaa;
                    border-radius: 50%; animation: typing 1s infinite ease-in-out; margin: 0 2px;
                }
                .typing-indicator span:nth-child(1) { animation-delay: 0s; }
                .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
                .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
                @keyframes typing {
                    0% { transform: translateY(0); }
                    50% { transform: translateY(-5px); }
                    100% { transform: translateY(0); }
                }
            </style>

            <div id="shs-ai-floating-icon">
                <img src="${aiIconSrc}" alt="AI">
            </div>

            <div id="shs-ai-chat-window">
                <div class="ai-header">
                    <div>AI Assistant</div>
                    <div class="ai-controls">
                        <span id="btn-ai-expand" title="Mở rộng">⛶</span>
                        <span id="btn-ai-close" title="Thu nhỏ">✖</span>
                    </div>
                </div>
                <div class="ai-tabs">
                    <div class="ai-tab active" data-mode="chat">Chat Tự Do</div>
                    <div class="ai-tab" data-mode="technical">Phân Tích Kỹ Thuật</div>
                </div>

                <!-- Chat Mode Body -->
                <div id="ai-body-chat" class="ai-body">
                    <div class="ai-message model">Xin chào! Em là trợ lý ảo SH Smart. Anh/chị cần giúp gì hôm nay?</div>
                </div>
                
                <!-- Technical Mode Body -->
                <div id="ai-body-tech" class="ai-body" style="display: none;">
                    <div id="ai-tech-form" style="text-align: center;">
                        <div style="font-size: 40px; margin-bottom: 20px;">📈</div>
                        <h3 style="color: #fff; margin: 0 0 10px 0;">Phân Tích Kỹ Thuật AI</h3>
                        <p style="color: #aaa; font-size: 13px; margin: 0 0 20px 0; line-height: 1.5; padding: 0 20px;">
                            Nhập mã chứng khoán để nhận phân tích chi tiết về xu hướng, dòng tiền và điểm mua/bán dựa trên dữ liệu kỹ thuật thực tế.
                        </p>
                        <input type="text" id="inp-tech-symbol" placeholder="Nhập mã (VD: HPG)" maxlength="3" style="margin-bottom: 15px;">
                        <button id="btn-analyze">🔍 Phân Tích Ngay</button>
                        <div style="font-size: 11px; color: #666; margin-top: 15px;">
                            Dữ liệu được lấy từ Realtime Quote & TradingView History
                        </div>
                    </div>
                    <div id="ai-tech-result" style="display: none; flex-direction: column; gap: 10px;">
                        <!-- Results go here -->
                    </div>
                </div>

                <div class="ai-input-area" id="ai-input-area">
                    <input type="text" id="inp-ai-chat" placeholder="Nhập tin nhắn..." autocomplete="off">
                    <button id="btn-ai-send">Gửi</button>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        // --- Logic ---
        const icon = document.getElementById('shs-ai-floating-icon');
        const win = document.getElementById('shs-ai-chat-window');
        const btnClose = document.getElementById('btn-ai-close');

        // Restore History
        ipcRenderer.invoke('get-chat-history').then(history => {
            if (history && history.length > 0) {
                history.forEach(item => {
                    const text = item.parts[0].text;
                    appendMsg(item.role, text);
                });
            }
        });



        let isExpanded = false;
        let isTechActive = false; // Track if Tech Analysis is running or showing results

        icon.onclick = () => {
            if (win.style.display === 'flex') {
                win.style.display = 'none';
            } else {
                win.style.display = 'flex';
                document.getElementById('inp-ai-chat').focus();
            }
        };

        btnClose.onclick = () => {
            win.style.display = 'none';
            // icon.style.display = 'flex'; // Not needed since we don't hide it
        };

        document.getElementById('btn-ai-expand').onclick = () => {
            isExpanded = !isExpanded;
            if (isExpanded) win.classList.add('modal-mode');
            else win.classList.remove('modal-mode');
        };

        // Tabs
        const tabs = document.querySelectorAll('.ai-tab');
        tabs.forEach(t => t.onclick = () => {
            tabs.forEach(x => x.classList.remove('active'));
            t.classList.add('active');

            const mode = t.getAttribute('data-mode');
            if (mode === 'chat') {
                document.getElementById('ai-body-chat').style.display = 'flex';
                document.getElementById('ai-body-tech').style.display = 'none';
                document.getElementById('ai-input-area').style.display = 'flex';
            } else {
                document.getElementById('ai-body-chat').style.display = 'none';
                document.getElementById('ai-body-tech').style.display = 'flex';

                // Ensure form is visible and result is hidden when switching back
                document.getElementById('ai-tech-form').style.display = 'flex';
                document.getElementById('ai-tech-result').style.display = 'none';

                document.getElementById('ai-input-area').style.display = 'none';
                document.getElementById('inp-tech-symbol').focus();
            }
        });

        // Chat Logic
        const inpChat = document.getElementById('inp-ai-chat');
        const btnSend = document.getElementById('btn-ai-send');
        const bodyChat = document.getElementById('ai-body-chat');

        const appendMsg = (role, text) => {
            const div = document.createElement('div');
            div.className = `ai-message ${role}`;
            let html = text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n\s*-\s/g, '<br>• ')
                .replace(/\n/g, '<br>');
            div.innerHTML = html;
            bodyChat.appendChild(div);
            bodyChat.scrollTop = bodyChat.scrollHeight;
        };

        const handleSend = async () => {
            const text = inpChat.value.trim();
            if (!text) return;

            appendMsg('user', text);
            inpChat.value = '';

            // Show Typing Indicator
            const typingDiv = document.createElement('div');
            typingDiv.className = 'ai-message model typing-indicator';
            typingDiv.innerHTML = '<span></span><span></span><span></span>';
            bodyChat.appendChild(typingDiv);
            bodyChat.scrollTop = bodyChat.scrollHeight;

            try {
                const response = await ipcRenderer.invoke('ai-chat-request', { message: text, type: 'chat' });
                // Remove typing indicator
                if (typingDiv.parentNode) typingDiv.parentNode.removeChild(typingDiv);
                appendMsg('model', response);
            } catch (e) {
                if (typingDiv.parentNode) typingDiv.parentNode.removeChild(typingDiv);
                console.error("AI Chat Error:", e);
                appendMsg('model', 'Đã xảy ra lỗi kết nối: ' + e.message);
            }
        };

        btnSend.onclick = handleSend;
        inpChat.onkeydown = (e) => {
            if (e.key === 'Enter') handleSend();
        };

        // Tech Analysis Logic
        const btnAnalyze = document.getElementById('btn-analyze');
        const inpSymbol = document.getElementById('inp-tech-symbol');
        const techResultDiv = document.getElementById('ai-tech-result');
        const techForm = document.getElementById('ai-tech-form');

        btnAnalyze.onclick = async () => {
            const symbol = inpSymbol.value.trim().toUpperCase();
            if (!symbol) return;

            isTechActive = true; // Mark as active
            techForm.style.display = 'none';
            techResultDiv.style.display = 'flex';
            isTechActive = true;

            // Helper to update status
            const updateStatus = (msg, step) => {
                techResultDiv.innerHTML = `
                    <div class="ai-message model" style="text-align: center;">
                        <h3 style="margin-bottom: 20px;">Đang xử lý phân tích ${symbol}</h3>
                        <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start; margin: 0 auto; width: fit-content;">
                            <div style="color: ${step >= 1 ? '#4caf50' : '#ccc'}">
                                ${step >= 1 ? '✅' : '⏳'} Lấy dữ liệu giá realtime
                            </div>
                            <div style="color: ${step >= 2 ? '#4caf50' : '#ccc'}">
                                ${step >= 2 ? '✅' : '⏳'} Lấy chỉ số kỹ thuật (RSI, MAK...)
                            </div>
                            <div style="color: ${step >= 3 ? '#4caf50' : '#ccc'}">
                                ${step >= 3 ? '✅' : '⏳'} Lấy lịch sử giá quá khứ
                            </div>
                            <div style="color: ${step >= 4 ? '#4caf50' : '#ccc'}">
                                ${step >= 4 ? '🤖' : '⏳'} ${msg}
                            </div>
                        </div>
                        <div class="typing-indicator" style="margin-top: 20px; justify-content: center; display: flex;">
                             <span></span><span></span><span></span>
                        </div>
                    </div>`;
            };

            updateStatus("Đang khởi tạo...", 0);

            try {
                // Fetch context sequentially to show progress (or Promise.all but update UI in between? No, sequential/parallel mix is fine, but sequential is better for UX feedback)
                // Actually parallel is faster. Let's do parallel but with "done" flags?
                // For simplicity and clear steps, let's fetch sequentially or in groups.
                // Fetching is fast enough (<1s). The AI part is the slow one.

                const to = Math.floor(Date.now() / 1000);
                const from = to - (60 * 24 * 60 * 60);

                // Step 1: Realtime
                const infoRes = await fetch(`https://shsmart.shs.com.vn/api/v1/finance/stockInfos?symbol=${symbol}`);
                const infoData = await infoRes.json();
                updateStatus("Đang lấy chỉ số kỹ thuật...", 1);

                // Step 2: TA Rating
                const taRes = await fetch(`https://shsmart.shs.com.vn/api/v1/finance/stock-ta-rating?symbol=${symbol}`);
                const taData = await taRes.json();
                updateStatus("Đang lấy lịch sử giá...", 2);

                // Step 3: History
                const histRes = await fetch(`https://shsmart.shs.com.vn/api/v1/tradingview/history?symbol=${symbol}&resolution=1D&from=${from}&to=${to}`);
                const histData = await histRes.json();
                updateStatus("AI đang phân tích dữ liệu...", 3);

                const context = {
                    symbol,
                    price: infoData[0]?.lastPrice ? infoData[0].lastPrice * 1000 : 'N/A',
                    change: infoData[0]?.priceChange,
                    percent: infoData[0]?.priceChangePercent * 100,
                    quote: infoData[0],
                    indicators: taData,
                    history: []
                };

                if (histData && histData.t) {
                    context.history = histData.t.map((t, i) => ({
                        time: t,
                        open: histData.o[i],
                        high: histData.h[i],
                        low: histData.l[i],
                        close: histData.c[i],
                        volume: histData.v[i]
                    }));
                }

                // Step 3b: Weekly History (1 Year)
                const fromWeek = to - (365 * 24 * 60 * 60);
                const histWeekRes = await fetch(`https://shsmart.shs.com.vn/api/v1/tradingview/history?symbol=${symbol}&resolution=1W&from=${fromWeek}&to=${to}`);
                const histWeekData = await histWeekRes.json();

                context.historyWeek = [];
                if (histWeekData && histWeekData.t) {
                    context.historyWeek = histWeekData.t.map((t, i) => ({
                        time: t,
                        open: histWeekData.o[i],
                        high: histWeekData.h[i],
                        low: histWeekData.l[i],
                        close: histWeekData.c[i],
                        volume: histWeekData.v[i]
                    }));
                }

                // Step 4: AI Request
                updateStatus("AI đang suy nghĩ và viết báo cáo...", 4);

                const response = await ipcRenderer.invoke('ai-chat-request', {
                    type: 'technical',
                    contextData: context
                });

                techResultDiv.innerHTML = '';
                const resDiv = document.createElement('div');
                resDiv.className = 'ai-message model';

                let html = response
                    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #ffd700;">$1</strong>')
                    .replace(/### (.*?)\n/g, '<h4 style="margin: 10px 0 5px 0;">$1</h4>')
                    .replace(/\n/g, '<br>');

                resDiv.innerHTML = html;

                const btnReset = document.createElement('button');
                btnReset.innerText = "Phân tích mã khác";
                btnReset.style.cssText = "padding: 8px 16px; background: #444; color: #fff; border: none; cursor: pointer; border-radius: 4px;";
                btnReset.onclick = () => {
                    isTechActive = false; // Reset state
                    isTechActive = false;
                    techResultDiv.style.display = 'none';
                    techForm.style.display = 'flex';
                    inpSymbol.value = '';
                    inpSymbol.focus();
                };

                const btnCopy = document.createElement('button');
                btnCopy.innerText = "📋 Sao chép kết quả";
                btnCopy.style.cssText = "padding: 8px 16px; background: #007acc; color: #fff; border: none; cursor: pointer; border-radius: 4px;";
                btnCopy.onclick = () => {
                    // Clean Markdown for clipboard
                    const cleanText = response
                        .replace(/\*\*/g, '') // Remove bold
                        .replace(/### /g, '\n👉 ') // Header to bullet
                        .replace(/\n\n/g, '\n') // Remove extra lines
                        .replace(/`/g, '') // Remove code ticks
                        .trim();

                    navigator.clipboard.writeText(cleanText).then(() => {
                        const originalText = btnCopy.innerText;
                        btnCopy.innerText = "Đã sao chép!";
                        setTimeout(() => { btnCopy.innerText = originalText; }, 2000);
                    });
                };

                const buttonsDiv = document.createElement('div');
                buttonsDiv.style.cssText = "display: flex; gap: 10px; margin-top: 20px; align-self: center;";
                buttonsDiv.appendChild(btnCopy);
                buttonsDiv.appendChild(btnReset);

                techResultDiv.appendChild(resDiv);
                techResultDiv.appendChild(buttonsDiv);

            } catch (e) {
                techResultDiv.innerHTML = `<div class="ai-message model" style="color: red;">Lỗi khi lấy dữ liệu: ${e.message}</div>`;
                const btnRetry = document.createElement('button');
                btnRetry.innerText = "Thử lại";
                btnRetry.onclick = () => { btnAnalyze.click(); }; // Retry
                techResultDiv.appendChild(btnRetry);
            }
        };

        inpSymbol.onkeydown = (e) => {
            if (e.key === 'Enter') btnAnalyze.click();
        };
    }

});
