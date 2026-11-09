async function checkLive() {
  const res = await fetch('https://www.conceptualist.uk');
  console.log('Live HTTP status:', res.status);
  const text = await res.text();
  console.log('Has cs_theme in index.html:', text.includes('cs_theme'));
  console.log('Has dark theme support:', text.includes('data-theme'));
}
checkLive();

