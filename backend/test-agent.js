const axios = require('axios');

const url = 'http://buxplay.org:8080/player_api.php?username=38485858999&password=1234567883848595595&action=get_live_categories';

const agents = {
  'default (Axios)': {},
  'IPTV Smarters': { 'User-Agent': 'IPTVSmarters' },
  'VLC': { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
  'Chrome': { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  'TiviMate': { 'User-Agent': 'TiviMate/4.7.0 (Linux; Google Chromecast)' }
};

async function run() {
  for (const [name, headers] of Object.entries(agents)) {
    console.log(`Testing with User-Agent: ${name}`);
    try {
      const res = await axios.get(url, { headers, timeout: 5000 });
      console.log(`  -> Status: ${res.status}`);
      console.log(`  -> Data:`, typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 100) : String(res.data).slice(0, 100));
    } catch (err) {
      console.log(`  -> Error: ${err.message}`);
    }
  }
}

run();
