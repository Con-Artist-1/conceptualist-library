async function test() {
  const res = await fetch('https://conceptualist.uk/', { redirect: 'manual' });
  console.log('Status:', res.status);
  console.log('Location:', res.headers.get('location'));
}
test();

