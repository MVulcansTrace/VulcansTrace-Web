/* Network utilities for IP and CIDR operations */
export class NetworkUtils {
    static ipToLong(ip) {
        const p = ip.split('.');
        if (p.length !== 4) return null; // Sentinel NULL

        const octets = [];
        for (let i = 0; i < 4; i++) {
            const n = parseInt(p[i], 10);
            if (isNaN(n) || n < 0 || n > 255) return null; // Sentinel NULL
            octets.push(n);
        }

        return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    }

    static cidrToRange(cidr) {
        const parts = cidr.split('/');
        if (parts.length !== 2) return null;

        const ip = NetworkUtils.ipToLong(parts[0]);
        if (ip === null) return null; // Check Sentinel

        let bits = parseInt(parts[1], 10);
        if (isNaN(bits) || bits < 0 || bits > 32) return null;

        const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
        return { ip: (ip & mask) >>> 0, mask };
    }

    static ipInCidr(ip, cidrObj) {
        const target = NetworkUtils.ipToLong(ip);
        if (target === null) return false;

        let range = cidrObj;
        if (typeof cidrObj === 'string') {
            range = NetworkUtils.cidrToRange(cidrObj);
        }
        if (!range) return false;

        return (target & range.mask) === (range.ip & range.mask);
    }

    static resolveRole(ip, topology) {
        if (ip === '::1' || ip === '127.0.0.1') return "[HOST]";
        if (NetworkUtils.ipToLong(ip) === null) return "[INVALID]";

        for (const rule of topology) {
            if (NetworkUtils.ipInCidr(ip, rule.cidr)) return `[${rule.name}]`;
        }
        return "[WAN]";
    }

    static parseDateTime(dStr, tStr) {
        if (!dStr && !tStr) return 0;
        if (dStr && tStr) return new Date(`${dStr}T${tStr}`).getTime();
        if (dStr) return new Date(`${dStr}T00:00:00`).getTime();
        const today = new Date().toISOString().split('T')[0];
        return new Date(`${today}T${tStr}`).getTime();
    }
}
