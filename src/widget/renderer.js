const { ipcRenderer } = require('electron');

ipcRenderer.on('update-prices', (event, data) => {
    const container = document.getElementById('stock-list'); // Changed to inner list
    container.innerHTML = '';

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="msg" style="width: 200px; -webkit-app-region: drag;">Chờ dữ liệu...</div>';
        // Resize for message
        ipcRenderer.send('resize-widget', { width: 300, height: 60 });
        return;
    }

    // Format Numbers (US locale for thousands separator: 20,200)
    const formatPrice = (p) => {
        if (!p) return '0';
        return new Intl.NumberFormat('en-US').format(p);
    };

    data.forEach(item => {
        const block = document.createElement('div');
        block.className = 'stock-block';

        // Directions
        let colorClass = 'ref'; // Default yellow
        if (item.price > item.ref) colorClass = 'up';
        if (item.price < item.ref) colorClass = 'down';
        if (item.price === item.ceil) colorClass = 'ceil';
        if (item.price === item.floor) colorClass = 'floor';
        if (item.price === item.ref) colorClass = 'ref';

        const priceStr = formatPrice(item.price);
        // Change is now in 1k unit (0.1 = 100d). Ensure 2 decimals for alignment.
        const changeStr = new Intl.NumberFormat('en-US', {
            signDisplay: 'always',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(item.change);
        const percentStr = new Intl.NumberFormat('en-US', {
            signDisplay: 'always',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(item.percent);

        // Display
        block.innerHTML = `
            <div class="symbol">${item.symbol || '---'}</div>
            <div class="price ${colorClass}">${priceStr}</div>
            <div class="change-line ${colorClass}">
                ${changeStr} / ${percentStr}%
            </div>
        `;

        // Left Click: Open Symbol
        block.addEventListener('click', () => {
            if (item.symbol) {
                ipcRenderer.send('request-open-symbol', item.symbol);
            }
        });

        container.appendChild(block);
    });

    // Auto-Resize the Window
    requestAnimationFrame(() => {
        const body = document.body;
        const width = body.offsetWidth;
        const height = body.offsetHeight;
        // Add slight buffer for shadows/border if needed, but offsetWidth usually includes border.
        // Sending to main process
        ipcRenderer.send('resize-widget', { width: width + 5, height: height + 5 });
    });
});

// Close Button Logic
document.getElementById('close-btn').addEventListener('click', () => {
    console.log('Renderer: Close clicked');
    ipcRenderer.send('request-close-widget');
});

// Right Click: Close Widget
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ipcRenderer.send('request-close-widget');
});
