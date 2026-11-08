const url = 'https://huggingface.co/datasets/Diavlon/mcmaster-docs-library/raw/main/live_index.json';

async function check() {
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    console.log('HF Status:', res.status, 'Content-Length:', res.headers.get('content-length'), 'Elapsed:', Date.now() - t0);
    const text = await res.text();
    console.log('HF Body length:', text.length, 'Sample:', text.slice(0, 100));
  } catch (e) {
    console.error('HF Fetch error:', e.message);
  }
}

check();
