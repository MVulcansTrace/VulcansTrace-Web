/* AWS VPC Flow Logs parser */
export class VpcFlowParser {
    static canParseParts(parts) {
        if (parts.length < 14) return false;

        const version = parts[0];
        if (!/^\d+$/.test(version)) return false;

        const accountId = parts[1];
        if (!/^\d{12}$/.test(accountId)) return false;

        const iface = parts[2];
        if (!/^eni-[a-z0-9]+$/i.test(iface) && !/^vif-[a-z0-9]+$/i.test(iface)) return false;

        const action = (parts[12] || '').toUpperCase();
        const logStatus = (parts[13] || '').toUpperCase();
        if (!['ACCEPT', 'REJECT'].includes(action)) return false;
        if (!['OK', 'NODATA', 'SKIPDATA'].includes(logStatus)) return false;

        return true;
    }

    static canParseLine(line) {
        if (!line) return false;
        const trimmed = String(line).trim();
        if (!trimmed || trimmed.startsWith('#')) return false;

        const parts = trimmed.split(/\s+/);
        return VpcFlowParser.canParseParts(parts);
    }

    static protocolToName(protoVal) {
        const n = parseInt(protoVal, 10);
        if (n === 6) return 'TCP';
        if (n === 17) return 'UDP';
        if (n === 1) return 'ICMP';
        return 'OTHER';
    }

    static parseLine(line, lineNum = 0) {
        const trimmed = String(line || '').trim();
        if (!trimmed || trimmed.startsWith('#')) return null;

        const parts = trimmed.split(/\s+/);
        if (!VpcFlowParser.canParseParts(parts)) return null;

        const src = parts[3] || 'Unknown';
        const dst = parts[4] || 'Unknown';

        const sport = parts[5] || '-';
        const dport = parts[6] || '-';
        const proto = VpcFlowParser.protocolToName(parts[7]);

        const bytes = parts[9] || '0';
        const startEpoch = parseInt(parts[10], 10);

        const actionRaw = (parts[12] || '').toUpperCase();
        const logStatus = (parts[13] || '').toUpperCase();
        if (logStatus !== 'OK') return null;

        const action = actionRaw === 'ACCEPT' ? 'ALLOW' : (actionRaw === 'REJECT' ? 'DROP' : 'UNKNOWN');

        let date = '';
        let time = '';
        if (!isNaN(startEpoch) && startEpoch > 0) {
            const iso = new Date(startEpoch * 1000).toISOString();
            date = iso.slice(0, 10);
            time = iso.slice(11);
        }

        return {
            date,
            time,
            action,
            proto,
            src,
            dst,
            sport,
            dport,
            size: String(bytes),
            flags: '-',
            info: '-',
            path: '-',
            line: lineNum
        };
    }
}
