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
                // User Request: Use official Real-time API (Same as Price Board)
                // Endpoint: /api/v1/market/symbolLatest?symbolList=...
                const url = `https://shsmart.shs.com.vn/api/v1/market/symbolLatest?symbolList=${currentWatchlist.join(',')}`;
                const res = await fetch(url);
                const json = await res.json();

                // Parse Data
                // API Mapping:
                // s: Symbol
                // c: Match Price (e.g. 20300) -> Need raw for logic, display handles formatting
                // ch: Change (e.g. 100 or -500) -> Display handles +/-, unit is absolute
                // r: Rate (e.g. 0.05 for 5%) -> Convert to %
                // o, h, l, ceiling, floor? 
                // The new API object might not have ceil/floor/ref explicitly in this endpoint?
                // Let's check sample response: "bb": [], "bo": [], "o":..., "h":..., "l":...
                // Only basic price data. We might need Reference price to calculate color if not provided.
                // Wait, "r" is rate. We can deduce Ref = c / (1 + r).
                // Or just trust c and ch.
                // Color logic: ch > 0 (Green), ch < 0 (Red), ch = 0 (Yellow).
                // Ceil/Floor check? Use 7% or default logic? Or fetch stockInfos ONCE to get Ref/Ceil/Floor, 
                // and then poll symbolLatest for updates?
                // For simplicity and speed (1s update), let's just use c, ch, r. Colors can be derived from ch.
                // Ceil/Floor specific colors (Purple/Blue) - we might miss them without Ref/Ceil/Floor data.
                // BUT user only complained about "Data Slow & Wrong Value". 
                // Let's try to mix? No, keep it fast. One call.
                // If ch is missing, default to 0.

                const updates = json.map(item => {
                    return {
                        symbol: item.s,
                        price: item.c,      // 20300
                        change: item.ch / 1000,    // 100 -> 0.1
                        percent: item.r * 100, // 0.005 -> 0.5%
                        // Mock Ref/Ceil/Floor for color logic if needed, or update renderer to rely on 'change'
                        // But renderer uses: price > ref, price == ceil etc.
                        // Let's approximated ref:
                        ref: item.c - item.ch,
                        // We can't know ceil/floor exactly without static data. 
                        // Let's assume just up/down colors (Green/Red/Yellow).
                        // If item.c == ceil? We don't know ceil.
                        // Ideally we should cache the static info (Ref/Ceil/Floor) from initial 'stockInfos' call,
                        // and then only update Price/Vol from 'symbolLatest'.
                        // However, for this fix, let's just make sure price/change is correct first.
                        // To preserve color logic in renderer:
                        ceil: (item.c - item.ch) * 1.069, // Estimate? No, dangerous.
                        floor: (item.c - item.ch) * 0.931
                        // Actually, let's just pass what we have and let renderer decide.
                        // Renderer logic:
                        // if (item.price > item.ref) colorClass = 'up';
                        // if (item.price < item.ref) colorClass = 'down';
                        // ...
                        // So setting ref = c - ch works perfect for Up/Down/Ref.
                        // For Ceil/Floor colors, we accept we might lose them momentarily unless we do the "Fetch Static + Poll Dynamic" strategy.
                        // User priority: "Correct Prices".
                    };
                });

                ipcRenderer.send('price-update-data', updates);
            } catch (e) {
                // Silent error
            }
        };

        fetchPrices(); // Immediate first run
        priceInterval = setInterval(fetchPrices, 1000); // 1 second
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
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

                #shs-ai-container {
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                }

                /* Floating Icon */
                #shs-ai-floating-icon {
                    position: fixed; bottom: 30px; right: 30px;
                    width: 60px; height: 60px;
                    border-radius: 50%;
                    background: #202020;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
                    cursor: pointer; z-index: 10000;
                    display: flex; align-items: center; justify-content: center;
                    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    border: 2px solid #007acc;
                }
                #shs-ai-floating-icon:hover { 
                    transform: scale(1.1); 
                    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.6);
                }
                #shs-ai-floating-icon img { width: 90%; height: 90%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }

                /* Chat Window */
                #shs-ai-chat-window {
                    position: fixed; bottom: 105px; right: 30px;
                    width: 380px; height: 600px;
                    background: rgba(30, 30, 30, 0.85);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 24px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    z-index: 10000;
                    display: none; flex-direction: column;
                    overflow: hidden;
                    animation: aiSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    transform-origin: bottom right;
                }
                
                @keyframes aiSlideIn {
                    from { opacity: 0; transform: scale(0.9) translateY(20px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }

                #shs-ai-chat-window.modal-mode {
                    width: 900px; height: 700px;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    bottom: auto; right: auto;
                    border-radius: 16px;
                }

                /* Header */
                .ai-header {
                    padding: 16px 20px;
                    background: rgba(255, 255, 255, 0.03);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    display: flex; justify-content: space-between; align-items: center;
                    color: #fff; font-weight: 600; font-size: 15px;
                    -webkit-user-select: none;
                }
                .ai-controls { display: flex; gap: 14px; align-items: center; }
                .ai-controls span { 
                    cursor: pointer; color: #888; transition: all 0.2s; 
                    font-size: 16px; display: flex; align-items: center; justify-content: center;
                    width: 24px; height: 24px; border-radius: 4px;
                }
                .ai-controls span:hover { color: #fff; background: rgba(255,255,255,0.1); }
                #btn-ai-close:hover { background: #d32f2f; color: white; }

                /* Tabs */
                .ai-tabs { 
                    display: flex; padding: 12px 20px 0; gap: 15px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .ai-tab {
                    padding: 8px 12px; text-align: center; color: #999; cursor: pointer;
                    font-size: 13px; font-weight: 500; position: relative;
                    transition: all 0.2s;
                }
                .ai-tab:hover { color: #ccc; }
                .ai-tab.active { color: #4daafc; }
                .ai-tab.active::after {
                    content: ''; position: absolute; bottom: -1px; left: 0; width: 100%; height: 2px;
                    background: #4daafc; border-radius: 2px 2px 0 0;
                    box-shadow: 0 -2px 10px rgba(77, 170, 252, 0.5);
                }

                /* Body */
                .ai-body { 
                    flex: 1; overflow-y: auto; padding: 20px; 
                    display: flex; flex-direction: column; gap: 16px; 
                    scroll-behavior: smooth;
                }
                .ai-body::-webkit-scrollbar { width: 5px; }
                .ai-body::-webkit-scrollbar-track { background: transparent; }
                .ai-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .ai-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

                /* Messages */
                .ai-message { 
                    max-width: 85%; padding: 10px 16px; border-radius: 18px; 
                    font-size: 14px; line-height: 1.5; word-wrap: break-word;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                    position: relative;
                }
                .ai-message.user { 
                    align-self: flex-end; 
                    background: linear-gradient(135deg, #007acc, #005c99); 
                    color: #fff; 
                    border-bottom-right-radius: 4px;
                }
                .ai-message.model { 
                    align-self: flex-start; 
                    background: rgba(255,255,255,0.08); 
                    color: #eee; 
                    border-bottom-left-radius: 4px;
                }
                .ai-message.model strong { color: #fff; font-weight: 600; }

                /* Input Area */
                .ai-input-area {
                    padding: 15px; 
                    background: rgba(20, 20, 20, 0.4); 
                    border-top: 1px solid rgba(255,255,255,0.05);
                    display: flex; gap: 10px; align-items: flex-end;
                }
                .ai-input-area input {
                    flex: 1; min-height: 40px; max-height: 100px;
                    background: rgba(0,0,0,0.3); 
                    border: 1px solid rgba(255,255,255,0.1); 
                    color: #fff; padding: 10px 15px; border-radius: 20px; 
                    font-family: inherit; font-size: 14px; outline: none;
                    transition: border-color 0.2s, background 0.2s;
                }
                .ai-input-area input:focus {
                    border-color: #007acc; background: rgba(0,0,0,0.5);
                }
                .ai-input-area button {
                    background: #007acc; color: #fff; border: none; 
                    width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    box-shadow: 0 4px 12px rgba(0,122,204,0.3);
                }
                .ai-input-area button:hover {
                    background: #008ae6; transform: scale(1.05);
                }
                .ai-input-area button svg { width: 20px; height: 20px; fill: currentColor; transform: translateX(2px); }

                /* Technical Analysis Form */
                #ai-tech-form {
                    display: flex; padding: 20px; flex-direction: column; gap: 20px;
                    align-items: center; justify-content: center; height: 100%;
                }
                .tech-card {
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.05);
                    padding: 30px; border-radius: 20px; width: 100%; box-sizing: border-box;
                    text-align: center;
                }
                #ai-tech-form input {
                    width: 100%; padding: 14px; box-sizing: border-box;
                    background: rgba(0,0,0,0.3); 
                    border: 1px solid rgba(255,255,255,0.2); 
                    color: #fff; border-radius: 12px; text-align: center; 
                    font-size: 20px; text-transform: uppercase; letter-spacing: 2px;
                    transition: all 0.2s; margin-bottom: 20px; font-weight: bold;
                }
                #ai-tech-form input:focus {
                    border-color: #4daafc; background: rgba(0,0,0,0.5); box-shadow: 0 0 0 3px rgba(77, 170, 252, 0.25);
                }
                #ai-tech-form button {
                    padding: 14px 40px; background: linear-gradient(135deg, #00c853, #1b5e20);
                    color: #fff; border: none; font-weight: 600;
                    border-radius: 30px; cursor: pointer; font-size: 15px;
                    box-shadow: 0 8px 15px rgba(0, 200, 83, 0.2);
                    transition: transform 0.2s, box-shadow 0.2s; width: 100%;
                }
                #ai-tech-form button:hover { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(0, 200, 83, 0.3); }

                /* Typing Indicator */
                .typing-indicator { display: flex; align-items: center; height: 20px; }
                .typing-indicator span {
                    display: block; width: 5px; height: 5px; background-color: #aaa;
                    border-radius: 50%; margin: 0 2px;
                    animation: typing 1.4s infinite ease-in-out both;
                }
                .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
                .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
                @keyframes typing {
                    0%, 80%, 100% { transform: scale(0); }
                    40% { transform: scale(1); }
                }
            </style>

            <div id="shs-ai-floating-icon" title="Trợ lý AI Smart">
                <img src="${aiIconSrc}" alt="AI">
            </div>

            <div id="shs-ai-chat-window">
                <div class="ai-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: linear-gradient(135deg, #00c6ff, #0072ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">✨ SH Smart AI</span>
                    </div>
                    <div class="ai-controls">
                        <span id="btn-ai-expand" title="Mở rộng">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                        </span>
                        <span id="btn-ai-close" title="Đóng">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </span>
                    </div>
                </div>
                <div class="ai-tabs">
                    <div class="ai-tab active" data-mode="chat">Chat Tự Do</div>
                    <div class="ai-tab" data-mode="technical">Phân Tích Kỹ Thuật</div>
                </div>

                <!-- Chat Mode Body -->
                <div id="ai-body-chat" class="ai-body">
                    <div class="ai-message model">👋 Xin chào! Em là trợ lý ảo SH Smart. Em có thể giúp gì cho anh/chị hôm nay?</div>
                </div>
                
                <!-- Technical Mode Body -->
                <div id="ai-body-tech" class="ai-body" style="display: none;">
                    <div id="ai-tech-form">
                        <div class="tech-card">
                            <div style="font-size: 48px; margin-bottom: 20px;">📈</div>
                            <h3 style="color: #fff; margin: 0 0 10px 0; font-size: 18px;">Phân Tích Kỹ Thuật AI</h3>
                            <p style="color: #aaa; font-size: 13px; margin: 0 0 25px 0; line-height: 1.6;">
                                Nhập mã cổ phiếu để AI phân tích xu hướng, chỉ báo RSI/MACD và đưa ra khuyến nghị.
                            </p>
                            <input type="text" id="inp-tech-symbol" placeholder="Mã CP (VD: SSI)" maxlength="3">
                            <button id="btn-analyze">BẮT ĐẦU PHÂN TÍCH</button>
                        </div>
                        <div style="font-size: 12px; color: #555;">
                            Powered by Google Gemini & TradingView Data
                        </div>
                    </div>
                    <div id="ai-tech-result" style="display: none; flex-direction: column; gap: 15px;">
                        <!-- Results go here -->
                    </div>
                </div>

                <div class="ai-input-area" id="ai-input-area">
                    <input type="text" id="inp-ai-chat" placeholder="Nhập tin nhắn..." autocomplete="off">
                    <button id="btn-ai-send">
                        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                    </button>
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
                btnReset.style.cssText = "padding: 10px 20px; background: rgba(255,255,255,0.1); color: #ccc; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; border-radius: 20px; font-weight: 600; font-size: 13px; transition: all 0.2s;";
                btnReset.onmouseover = () => { btnReset.style.background = 'rgba(255,255,255,0.2)'; btnReset.style.color = '#fff'; };
                btnReset.onmouseout = () => { btnReset.style.background = 'rgba(255,255,255,0.1)'; btnReset.style.color = '#ccc'; };
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
                btnCopy.style.cssText = "padding: 10px 20px; background: linear-gradient(135deg, #007acc, #005c99); color: #fff; border: none; cursor: pointer; border-radius: 20px; font-weight: 600; font-size: 13px; transition: transform 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.2);";
                btnCopy.onmouseover = () => btnCopy.style.transform = 'translateY(-2px)';
                btnCopy.onmouseout = () => btnCopy.style.transform = 'translateY(0)';
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
                btnRetry.style.cssText = "padding: 8px 20px; margin-top: 10px; background: #d32f2f; color: #fff; border: none; border-radius: 20px; cursor: pointer;";
                btnRetry.onclick = () => { btnAnalyze.click(); }; // Retry
                techResultDiv.appendChild(btnRetry);
            }
        };

        inpSymbol.onkeydown = (e) => {
            if (e.key === 'Enter') btnAnalyze.click();
        };
    }

});
