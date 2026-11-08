import dns from 'dns/promises';
import https from 'https';

async function checkDns() {
  for (const host of ['www.conceptualist.uk', 'conceptualist.uk']) {
    console.log(`=== DNS for ${host} ===`);
    try {
      const a = await dns.resolve4(host);
      console.log('A records:', a);
    } catch(e) { console.log('A error:', e.message); }
    try {
      const aaaa = await dns.resolve6(host);
      console.log('AAAA records:', aaaa);
    } catch(e) { console.log('AAAA error:', e.message); }
    try {
      const cname = await dns.resolveCname(host);
      console.log('CNAME records:', cname);
    } catch(e) { console.log('CNAME error:', e.message); }
  }

  // Also check NS records for conceptualist.uk
  try {
    const ns = await dns.resolveNs('conceptualist.uk');
    console.log('=== NS records for conceptualist.uk ===\n', ns);
  } catch(e) {
    console.log('NS error:', e.message);
  }
}

async function measureHttp(urlStr) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let dnsTime = 0, tcpTime = 0, tlsTime = 0, ttfb = 0, totalTime = 0;
    const req = https.get(urlStr, (res) => {
      ttfb = Date.now() - t0;
      let bodyLen = 0;
      res.on('data', chunk => bodyLen += chunk.length);
      res.on('end', () => {
        totalTime = Date.now() - t0;
        resolve({
          url: urlStr,
          status: res.status,
          headers: {
            server: res.headers['server'],
            cfRay: res.headers['cf-ray'],
            cfCacheStatus: res.headers['cf-cache-status'],
            xVercelCache: res.headers['x-vercel-cache'],
            cacheControl: res.headers['cache-control']
          },
          dnsTime,
          tcpTime,
          tlsTime,
          ttfb,
          totalTime,
          bodyLen
        });
      });
    });

    req.on('socket', socket => {
      socket.on('lookup', () => { dnsTime = Date.now() - t0; });
      socket.on('connect', () => { tcpTime = Date.now() - t0; });
      socket.on('secureConnect', () => { tlsTime = Date.now() - t0; });
    });

    req.on('error', err => {
      resolve({ url: urlStr, error: err.message, elapsed: Date.now() - t0 });
    });
  });
}

async function run() {
  await checkDns();

  console.log('\n=== Measuring HTTP Performance through Cloudflare ===');
  for (const url of [
    'https://www.conceptualist.uk/',
    'https://www.conceptualist.uk/meta.json',
    'https://www.conceptualist.uk/index.json',
    'https://conceptualist.uk/',
    'https://search-app-two-dun.vercel.app/meta.json',
    'https://search-app-two-dun.vercel.app/index.json'
  ]) {
    const res = await measureHttp(url);
    console.log(url);
    console.log(`  DNS: ${res.dnsTime}ms | TCP: ${res.tcpTime}ms | TLS: ${res.tlsTime}ms | TTFB: ${res.ttfb}ms | Total: ${res.totalTime}ms`);
    console.log(`  Headers:`, res.headers);
    console.log(`  Body: ${res.bodyLen} bytes\n`);
  }
}

run();

