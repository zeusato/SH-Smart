const https = require('https');

const url = 'https://shsmart.shs.com.vn/api/v1/finance/stock-ta-rating?symbol=SHS';

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("STATUS:", res.statusCode);
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.log("RAW DATA:", data);
        }
    });
}).on('error', err => console.error(err));
