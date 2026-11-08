const url = 'https://www.conceptualist.uk/index.json?v=2026-11-07T20%3A25%3A46.012Z';

async function check() {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json, text/plain, */*'
    }
  });
  console.log('Status:', res.status);
  console.log('Headers:', Object.fromEntries(res.headers.entries()));
  const text = await res.text();
  console.log('Length:', text.length);
  console.log('Sample:', text.slice(0, 200));
}

check();

