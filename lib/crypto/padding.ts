const BLOCK_SIZE = 256; // bytes

export function padPlaintext(input: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(input);
    const targetLength = Math.ceil((bytes.length + 4) / BLOCK_SIZE) * BLOCK_SIZE;

    // Prepend 4-byte real length, then pad with random bytes
    const padded = new Uint8Array(targetLength);
    const view = new DataView(padded.buffer);
    view.setUint32(0, bytes.length, false);
    padded.set(bytes, 4);

    // Fill remainder with cryptographically random bytes
    const paddingLength = targetLength - bytes.length - 4;
    if (paddingLength > 0) {
        const padding = crypto.getRandomValues(new Uint8Array(paddingLength));
        padded.set(padding, 4 + bytes.length);
    }

    return btoa(String.fromCharCode(...padded));
}

export function unpadPlaintext(padded: string): string {
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const realLength = view.getUint32(0, false);
    const real = bytes.slice(4, 4 + realLength);
    return new TextDecoder().decode(real);
}
