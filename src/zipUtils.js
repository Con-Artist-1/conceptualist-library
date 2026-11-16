// Shared low-level ZIP parsing & DEFLATE decompression helpers

export function getFileExt(fileName) {
  const clean = String(fileName || '').trim().toLowerCase();
  const dotIdx = clean.lastIndexOf('.');
  if (dotIdx === -1) return '';
  return clean.slice(dotIdx + 1);
}

export function findEocdOffset(bytes, view) {
  const minOffset = Math.max(0, bytes.byteLength - 65558);
  for (let i = bytes.byteLength - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      return i;
    }
  }
  return -1;
}

export async function inflateRawBytes(compressedBytes, uncompressedSize = 0) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser does not support DecompressionStream for in-browser ZIP unpacking.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer
    .write(compressedBytes)
    .then(() => writer.close())
    .catch(() => {});

  const reader = ds.readable.getReader();
  const expectedLen = Number(uncompressedSize) > 0 ? Number(uncompressedSize) : 0;
  const out = expectedLen > 0 ? new Uint8Array(expectedLen) : null;
  let offset = 0;
  const overflow = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (out && offset + value.byteLength <= out.byteLength) {
      out.set(value, offset);
    } else {
      overflow.push(value);
    }
    offset += value.byteLength;
  }

  if (out && overflow.length === 0 && offset === out.byteLength) {
    return out;
  }

  const exact = new Uint8Array(offset);
  let pos = 0;
  if (out && offset > 0) {
    const copied = Math.min(offset, out.byteLength);
    exact.set(out.subarray(0, copied), 0);
    pos = copied;
  }
  for (let i = 0; i < overflow.length; i++) {
    const chunk = overflow[i];
    exact.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return exact;
}
