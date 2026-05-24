/* Windows Firewall (pfirewall.log) parser */
import { NetworkUtils } from '../NetworkUtils.js';

const DIRECTION_TOKENS = ['SEND', 'RECEIVE', 'INBOUND', 'OUTBOUND'];
const VALID_ACTIONS = ['ALLOW', 'DROP', 'BLOCK', 'CLOSE', 'OPEN'];

export class WindowsFirewallParser {
    static isValidIp(ip) {
        if (!ip || ip === '-') return false;
        if (NetworkUtils.ipToLong(ip) !== null) return true;
        return /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(ip);
    }

    static isValidPort(value, protocol) {
        if (value === '-') return protocol.toUpperCase().startsWith('ICMP');
        const n = parseInt(value, 10);
        return !isNaN(n) && n >= 0 && n <= 65535;
    }

    static isValidTimestamp(dateStr, timeStr) {
        const combined = `${dateStr} ${timeStr}`;
        const d1 = new Date(combined);
        if (!isNaN(d1.getTime())) return true;
        const iso = `${dateStr}T${timeStr}`;
        const d2 = new Date(iso);
        return !isNaN(d2.getTime());
    }

    static isDirectionToken(token) {
        return DIRECTION_TOKENS.includes((token || '').toUpperCase());
    }

    static canParseLine(line) {
        if (!line) return false;
        const trimmed = String(line).trim();
        if (!trimmed || trimmed.startsWith('#')) return false;

        const parts = trimmed.split(/[\s\t]+/);
        if (parts.length < 8) return false;

        if (!WindowsFirewallParser.isValidTimestamp(parts[0], parts[1])) return false;

        const action = (parts[2] || '').toUpperCase();
        if (!VALID_ACTIONS.includes(action)) return false;

        if (!/^[A-Z]{2,6}$/i.test(parts[3])) return false;

        if (!WindowsFirewallParser.isValidIp(parts[4])) return false;
        if (!WindowsFirewallParser.isValidIp(parts[5])) return false;

        return true;
    }

    static parseLine(line, lineNum = 0) {
        const trimmed = String(line || '').trim();
        if (!trimmed || trimmed.startsWith('#')) return null;

        const parts = trimmed.split(/[\s\t]+/);
        if (parts.length < 8) return null;

        const date = parts[0];
        const time = parts[1];
        if (!WindowsFirewallParser.isValidTimestamp(date, time)) return null;

        const action = (parts[2] || '').toUpperCase();
        if (!VALID_ACTIONS.includes(action)) return null;

        const proto = (parts[3] || '').toUpperCase();
        const srcIp = parts[4];
        const dstIp = parts[5];
        const srcPortRaw = parts[6];
        const dstPortRaw = parts[7];

        if (!WindowsFirewallParser.isValidIp(srcIp) || !WindowsFirewallParser.isValidIp(dstIp)) return null;
        if (srcIp === '-' || dstIp === '-') return null;

        if (!WindowsFirewallParser.isValidPort(srcPortRaw, proto)) return null;
        if (!WindowsFirewallParser.isValidPort(dstPortRaw, proto)) return null;

        let size = '-';
        let flags = '-';
        let path = '-';
        let direction = '';

        if (parts.length > 8) {
            const trailingStart = 8;
            if (parts.length >= trailingStart + 9) {
                const candidatePath = parts[trailingStart + 8];
                if (WindowsFirewallParser.isDirectionToken(candidatePath)) {
                    size = parts[trailingStart];
                    flags = parts[trailingStart + 1];
                    path = candidatePath;
                    direction = candidatePath;
                }
            }

            if (!direction) {
                for (let i = parts.length - 1; i >= trailingStart; i--) {
                    if (WindowsFirewallParser.isDirectionToken(parts[i])) {
                        path = parts[i];
                        direction = parts[i];
                        // Extract size from the first trailing field (e.g. "5242880 SEND")
                        if (i > trailingStart) {
                            size = parts[trailingStart];
                        }
                        break;
                    }
                }
            }
        }

        const normalizedAction = action === 'ACCEPT' ? 'ALLOW' : (action === 'REJECT' || action === 'BLOCK' ? 'DROP' : action);

        return {
            date,
            time,
            action: normalizedAction,
            proto,
            src: srcIp,
            dst: dstIp,
            sport: srcPortRaw === '-' ? '-' : srcPortRaw,
            dport: dstPortRaw === '-' ? '-' : dstPortRaw,
            size: size === '-' ? '0' : size,
            flags,
            info: '-',
            path: path || '-',
            direction: direction || '',
            line: lineNum
        };
    }
}
