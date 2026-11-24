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

const MAX_INFLATE_PREALLOC_BYTES = 150 * 1024 * 1024;

export async function inflateRawBytes(compressedBytes, uncompressedSize = 0) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser does not support DecompressionStream for in-browser ZIP unpacking.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  let writeError = null;
  const writeDone = writer
    .write(compressedBytes)
    .then(() => writer.close())
    .catch((err) => {
      writeError = err || new Error('ZIP decompression write stream failed.');
      try {
        ds.readable.cancel(writeError).catch(() => {});
      } catch {
        // Ignore readable cancel errors
      }
    });

  const reader = ds.readable.getReader();
  const rawExpectedLen = Number(uncompressedSize) > 0 ? Math.floor(Number(uncompressedSize)) : 0;
  const expectedLen = rawExpectedLen > 0 && rawExpectedLen <= MAX_INFLATE_PREALLOC_BYTES ? rawExpectedLen : 0;
  const out = expectedLen > 0 ? new Uint8Array(expectedLen) : null;
  let offset = 0;
  let outWritten = 0;
  const overflow = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (out && overflow.length === 0 && outWritten + value.byteLength <= out.byteLength) {
        out.set(value, outWritten);
        outWritten += value.byteLength;
      } else {
        overflow.push(value);
      }
      offset += value.byteLength;
    }
  } finally {
    await writeDone;
  }

  if (writeError) {
    throw writeError;
  }

  if (out && overflow.length === 0 && outWritten === out.byteLength) {
    return out;
  }

  const exact = new Uint8Array(offset);
  let pos = 0;
  if (out && outWritten > 0) {
    exact.set(out.subarray(0, outWritten), 0);
    pos = outWritten;
  }
  for (let i = 0; i < overflow.length; i++) {
    const chunk = overflow[i];
    exact.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return exact;
}
