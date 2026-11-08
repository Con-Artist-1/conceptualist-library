async function testUrl(urlStr) {
  const t0 = Date.now();
  try {
    const res = await fetch(urlStr, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const elapsed = Date.now() - t0;
    console.log(urlStr);
    console.log(`Status: ${res.status}, Type: ${res.headers.get('content-type')}, Content-Length: ${res.headers.get('content-length')}, Elapsed: ${elapsed}ms, CF-Cache: ${res.headers.get('cf-cache-status')}, CF-Ray: ${res.headers.get('cf-ray')}`);
    const text = await res.text();
    console.log(`Body length received: ${text.length} chars. Sample: ${text.slice(0, 100)}...`);
    console.log('---');
  } catch (err) {
    console.error(urlStr, 'ERROR:', err.message, `after ${Date.now() - t0}ms`);
  }
}

async function run() {
  await testUrl('https://search-app-two-dun.vercel.app/meta.json');
  await testUrl('https://www.conceptualist.uk/meta.json');
  await testUrl('https://search-app-two-dun.vercel.app/index.json');
  await testUrl('https://www.conceptualist.uk/index.json');
}

run();
