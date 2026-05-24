/* ZIP file generation utility */
export class ZipWriter {
    constructor() {
        this.files = [];
    }

    add(name, content) {
        const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
        this.files.push({ name, data });
    }

    async generate() {
        const parts = [];
        let cd = [];
        let off = 0;

        for (const f of this.files) {
            const n = new TextEncoder().encode(f.name);
            const l = f.data.length;
            const c = this.crc32(f.data);

            // Local file header
            const h = new Uint8Array(30 + n.length);
            const v = new DataView(h.buffer);
            v.setUint32(0, 0x04034b50, true);
            v.setUint16(4, 20, true);
            v.setUint16(6, 0, true);
            v.setUint16(8, 0, true);
            v.setUint32(14, c, true);
            v.setUint32(18, l, true);
            v.setUint32(22, l, true);
            v.setUint16(26, n.length, true);
            v.setUint16(28, 0, true);
            h.set(n, 30);
            parts.push(h);
            parts.push(f.data);

            // Central directory entry
            const d = new Uint8Array(46 + n.length);
            const dv = new DataView(d.buffer);
            dv.setUint32(0, 0x02014b50, true);
            dv.setUint16(4, 20, true);
            dv.setUint16(6, 20, true);
            dv.setUint16(8, 0, true);
            dv.setUint16(10, 0, true);
            dv.setUint32(16, c, true);
            dv.setUint32(20, l, true);
            dv.setUint32(24, l, true);
            dv.setUint16(28, n.length, true);
            dv.setUint16(30, 0, true);
            dv.setUint16(32, 0, true);
            dv.setUint16(34, 0, true);
            dv.setUint16(36, 0, true);
            dv.setUint32(38, 0, true);
            dv.setUint32(42, off, true);
            d.set(n, 46);
            cd.push(d);
            off += h.length + l;
        }

        const cdLen = cd.reduce((a, b) => a + b.length, 0);

        // End of central directory record
        const e = new Uint8Array(22);
        const ev = new DataView(e.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(4, 0, true);
        ev.setUint16(6, 0, true);
        ev.setUint16(8, this.files.length, true);
        ev.setUint16(10, this.files.length, true);
        ev.setUint32(12, cdLen, true);
        ev.setUint32(16, off, true);

        return new Blob([...parts, ...cd, e], { type: 'application/zip' });
    }

    crc32(d) {
        let c = -1;
        for (let i = 0; i < d.length; i++) {
            c ^= d[i];
            for (let j = 0; j < 8; j++)
                c = (c >>> 1) ^ ((c & 1) ? 0xEDB88320 : 0);
        }
        return (c ^ -1) >>> 0;
    }
}