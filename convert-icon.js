const fs = require('fs');
const pngToIco = require('png-to-ico').default;

console.log('Converting assets/icon.png to assets/icon.ico...');

pngToIco('assets/icon.png')
    .then(buf => {
        fs.writeFileSync('assets/icon.ico', buf);
        console.log('Successfully created assets/icon.ico');
    })
    .catch(error => {
        console.error('Error converting icon:', error);
        process.exit(1);
    });
