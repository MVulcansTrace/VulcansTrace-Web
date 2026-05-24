/* Remediation service: generate copy/paste plans (no execution) */
import { NetworkUtils } from './NetworkUtils.js';

function safeString(value) {
    return typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));
}

function normalizeIpCandidate(value) {
    const ip = typeof value === 'string' ? value.trim() : '';
    if (!ip) return null;
    if (NetworkUtils?.ipToLong) {
        return NetworkUtils.ipToLong(ip) === null ? null : ip;
    }
    const parts = ip.split('.').map(x => parseInt(x, 10));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
    return ip;
}

function collectBadgesFromStats(stats, ip) {
    const badges = new Set();
    if (!stats || typeof stats !== 'object') return badges;

    try {
        const focus = stats.focus && typeof stats.focus === 'object' ? stats.focus : null;
        const focusRow = focus && focus[ip] && typeof focus[ip] === 'object' ? focus[ip] : null;
        const focusBadges = focusRow && Array.isArray(focusRow.badges) ? focusRow.badges : [];
        for (const b of focusBadges) badges.add(String(b));
    } catch { }

    try {
        const riskList = Array.isArray(stats.risk) ? stats.risk : [];
        const riskRow = riskList.find(r => r && typeof r === 'object' && String(r.ip || '') === ip) || null;
        const riskBadges = riskRow && Array.isArray(riskRow.badges) ? riskRow.badges : [];
        for (const b of riskBadges) badges.add(String(b));
    } catch { }

    try {
        const s = stats.s && typeof stats.s === 'object' ? stats.s : null;
        const src = s && s.src && typeof s.src === 'object' ? s.src : null;
        const srcRow = src && src[ip] && typeof src[ip] === 'object' ? src[ip] : null;
        const riskObj = srcRow && srcRow.risk && typeof srcRow.risk === 'object' ? srcRow.risk : null;
        const riskBadges = riskObj && Array.isArray(riskObj.badges) ? riskObj.badges : [];
        for (const b of riskBadges) badges.add(String(b));
    } catch { }

    return badges;
}

function isConfirmedThreat(stats, ip) {
    const badges = collectBadgesFromStats(stats, ip);
    return badges.has('THREAT_INTEL');
}

function makeWindowsFirewallPlan(ip) {
    const safeIp = safeString(ip);
    const ipSlug = safeIp.replace(/\./g, '_');
    const inName = `VulcansTrace_Block_${ipSlug}_In`;
    const outName = `VulcansTrace_Block_${ipSlug}_Out`;

    return {
        title: 'Windows Defender Firewall (PowerShell)',
        description: `Blocks inbound and outbound traffic to/from ${safeIp} using Windows Defender Firewall rules.`,
        risk: 'High',
        warnings: [
            'Requires elevated PowerShell (run as Administrator).',
            'Blocking a remote IP can disrupt legitimate traffic; validate scope before applying broadly.',
            'Prefer applying at the perimeter (gateway/firewall) when possible to avoid breaking endpoint workflows.'
        ],
        commands: [
            `New-NetFirewallRule -Name "${inName}" -DisplayName "VulcansTrace: Block ${safeIp} (Inbound)" -Direction Inbound -Action Block -RemoteAddress "${safeIp}" -Profile Any`,
            `New-NetFirewallRule -Name "${outName}" -DisplayName "VulcansTrace: Block ${safeIp} (Outbound)" -Direction Outbound -Action Block -RemoteAddress "${safeIp}" -Profile Any`,
            `Get-NetFirewallRule -Name "${inName}","${outName}" | Select-Object Name,Enabled,Direction,Action`
        ],
        rollbackCommands: [
            `Remove-NetFirewallRule -Name "${inName}","${outName}"`
        ]
    };
}

function makeUfwPlan(ip) {
    const safeIp = safeString(ip);
    return {
        title: 'UFW (Ubuntu/Debian)',
        description: `Blocks traffic to/from ${safeIp} using uncomplicated firewall (ufw).`,
        risk: 'High',
        warnings: [
            'Requires root privileges (sudo).',
            'UFW must be enabled and in use on this host; do not mix with other firewall managers without change control.',
            'Blocking at the wrong layer can cause outages; apply at a boundary device if this IP is external.'
        ],
        commands: [
            `sudo ufw deny from ${safeIp}`,
            `sudo ufw deny to ${safeIp}`,
            'sudo ufw status numbered'
        ],
        rollbackCommands: [
            `sudo ufw delete deny from ${safeIp}`,
            `sudo ufw delete deny to ${safeIp}`
        ]
    };
}

function makeIptablesPlan(ip) {
    const safeIp = safeString(ip);
    return {
        title: 'iptables (Linux)',
        description: `Blocks traffic to/from ${safeIp} using iptables rules.`,
        risk: 'High',
        warnings: [
            'Requires root privileges (sudo).',
            'iptables rules may not persist after reboot unless saved (distribution-specific).',
            'Rollback removes matching rules; avoid running duplicates or adjust commands to your rule management practice.'
        ],
        commands: [
            `sudo iptables -I INPUT -s ${safeIp} -j DROP`,
            `sudo iptables -I OUTPUT -d ${safeIp} -j DROP`,
            `sudo iptables -S INPUT`,
            `sudo iptables -S OUTPUT`
        ],
        rollbackCommands: [
            `sudo iptables -D INPUT -s ${safeIp} -j DROP`,
            `sudo iptables -D OUTPUT -d ${safeIp} -j DROP`
        ]
    };
}

function generatePlans(context, target) {
    const ip = normalizeIpCandidate(target);
    if (!ip) return [];

    const stats = context && typeof context === 'object' ? context.stats : null;
    if (!isConfirmedThreat(stats, ip)) return [];

    return [
        makeWindowsFirewallPlan(ip),
        makeUfwPlan(ip),
        makeIptablesPlan(ip)
    ];
}

export const RemediationService = { generatePlans };
