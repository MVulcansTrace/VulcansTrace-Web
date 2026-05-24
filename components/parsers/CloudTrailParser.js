/* AWS CloudTrail JSON parser */
export class CloudTrailParser {
    static _extractRecords(parsed) {
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed.Records)) return parsed.Records;
        if (parsed && typeof parsed === 'object' && parsed.eventTime) return [parsed];
        return [];
    }

    static tryParse(text) {
        const trimmed = String(text || '').trim();
        if (!trimmed) return { ok: false };
        if (trimmed[0] !== '{' && trimmed[0] !== '[') return { ok: false };
        if (!trimmed.includes('eventTime') || !trimmed.includes('eventName')) return { ok: false };

        try {
            const parsed = JSON.parse(trimmed);
            const records = CloudTrailParser._extractRecords(parsed);
            if (!records.length) return { ok: false };
            const r0 = records[0] || {};
            if (!(r0.eventTime && r0.eventName && r0.eventSource)) return { ok: false };
            return { ok: true, parsed, records };
        } catch {
            return { ok: false };
        }
    }

    static canParse(text) {
        return CloudTrailParser.tryParse(text).ok;
    }

    static normalizeRecord(r) {
        const eventTime = r.eventTime || '';
        const eventTimeEpochMs = eventTime ? Date.parse(eventTime) : null;

        const userIdentity = r.userIdentity || {};
        const sessionContext = userIdentity.sessionContext || {};
        const sessionIssuer = (sessionContext && sessionContext.sessionIssuer) ? sessionContext.sessionIssuer : {};

        const resources = Array.isArray(r.resources) ? r.resources : [];
        const resourcesArns = resources
            .map(x => (x && (x.ARN || x.arn)) ? String(x.ARN || x.arn) : '')
            .filter(Boolean);

        return {
            eventTime,
            eventTimeEpochMs: typeof eventTimeEpochMs === 'number' && !isNaN(eventTimeEpochMs) ? eventTimeEpochMs : null,
            eventSource: r.eventSource || '',
            eventName: r.eventName || '',
            awsRegion: r.awsRegion || '',
            eventType: r.eventType || '',
            eventCategory: r.eventCategory || '',
            eventID: r.eventID || '',
            readOnly: typeof r.readOnly === 'boolean' ? r.readOnly : null,
            recipientAccountId: r.recipientAccountId || '',
            sourceIPAddress: r.sourceIPAddress || '',
            userAgent: r.userAgent || '',
            userIdentityType: userIdentity.type || '',
            userIdentityArn: userIdentity.arn || '',
            userIdentityAccountId: userIdentity.accountId || '',
            userIdentityPrincipalId: userIdentity.principalId || '',
            userIdentityUserName: userIdentity.userName || '',
            sessionIssuerArn: sessionIssuer.arn || '',
            sessionIssuerAccountId: sessionIssuer.accountId || '',
            errorCode: r.errorCode || '',
            errorMessage: r.errorMessage || '',
            resourcesCount: resources.length,
            resourcesArns: resourcesArns.join(', ')
        };
    }

    static parse(text) {
        const trimmed = String(text || '').trim();
        if (!trimmed) return [];

        const parsed = JSON.parse(trimmed);
        const records = CloudTrailParser._extractRecords(parsed);
        if (!Array.isArray(records)) return [];

        return records
            .filter(r => r && typeof r === 'object')
            .map(r => CloudTrailParser.normalizeRecord(r));
    }
}
