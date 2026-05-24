/* Predefined safe SQL investigation queries for VulcansTrace */
export const QUERY_LIBRARY = [
    // ── Overview ──────────────────────────────────────────────
    {
        name: 'Total Flow Count',
        description: 'Total number of recorded network flows',
        sql: 'SELECT count(*) AS total_flows FROM flows;',
        category: 'Overview'
    },
    {
        name: 'Protocol Breakdown',
        description: 'Flow counts grouped by protocol (TCP, UDP, ICMP, etc.)',
        sql: "SELECT protocol, count(*) AS cnt FROM flows GROUP BY protocol ORDER BY cnt DESC LIMIT 20;",
        category: 'Overview'
    },
    {
        name: 'Top Source IPs',
        description: 'Top 20 source IP addresses by flow count',
        sql: 'SELECT src, count(*) AS cnt FROM flows GROUP BY src ORDER BY cnt DESC LIMIT 20;',
        category: 'Overview'
    },
    {
        name: 'Top Destination Ports',
        description: 'Top 20 destination ports by flow count',
        sql: 'SELECT dport, count(*) AS cnt FROM flows GROUP BY dport ORDER BY cnt DESC LIMIT 20;',
        category: 'Overview'
    },

    // ── Threats ───────────────────────────────────────────────
    {
        name: 'Dropped Connections',
        description: 'All flows with action DROP, ordered by frequency of source IP',
        sql: "SELECT src, dst, dport, protocol, count(*) AS cnt FROM flows WHERE action = 'DROP' GROUP BY src, dst, dport, protocol ORDER BY cnt DESC LIMIT 50;",
        category: 'Threats'
    },
    {
        name: 'Potential Port Scanners',
        description: 'Source IPs contacting more than 50 distinct destination ports (scanner behavior)',
        sql: 'SELECT src, count(DISTINCT dport) AS unique_ports, count(*) AS total_flows FROM flows GROUP BY src HAVING unique_ports > 50 ORDER BY unique_ports DESC LIMIT 20;',
        category: 'Threats'
    },
    {
        name: 'Unusual Destination Ports',
        description: 'Flows targeting ports outside the well-known range (0-1023), excluding common high ports',
        sql: "SELECT dport, protocol, count(*) AS cnt FROM flows WHERE dport NOT IN (80, 443, 8080, 8443) AND dport > 1023 GROUP BY dport, protocol ORDER BY cnt DESC LIMIT 30;",
        category: 'Threats'
    },

    // ── Timeline ──────────────────────────────────────────────
    {
        name: 'Events Per Minute',
        description: 'Flow event counts aggregated by minute across the dataset',
        sql: "SELECT date || ' ' || substr(time, 1, 5) AS minute_bucket, count(*) AS cnt FROM flows GROUP BY minute_bucket ORDER BY minute_bucket LIMIT 200;",
        category: 'Timeline'
    },
    {
        name: 'Peak Traffic Windows',
        description: 'Top 10 highest-traffic minute windows by flow count',
        sql: "SELECT date || ' ' || substr(time, 1, 5) AS minute_bucket, count(*) AS cnt FROM flows GROUP BY minute_bucket ORDER BY cnt DESC LIMIT 10;",
        category: 'Timeline'
    },
    {
        name: 'Hourly Flow Distribution',
        description: 'Flow counts grouped by hour of the day to identify peak activity periods',
        sql: "SELECT substr(time, 1, 2) AS hour_of_day, count(*) AS cnt FROM flows GROUP BY hour_of_day ORDER BY hour_of_day;",
        category: 'Timeline'
    },

    // ── CloudTrail ────────────────────────────────────────────
    {
        name: 'Top CloudTrail Events by Source',
        description: 'Most frequent CloudTrail event names grouped by event source',
        sql: 'SELECT eventSource, eventName, count(*) AS cnt FROM cloudtrail GROUP BY eventSource, eventName ORDER BY cnt DESC LIMIT 25;',
        category: 'CloudTrail'
    },
    {
        name: 'Failed API Calls',
        description: 'CloudTrail events with error or failure indicators from errorCode or responseElements',
        sql: "SELECT eventName, eventSource, sourceIPAddress, count(*) AS cnt FROM cloudtrail WHERE eventType = 'AwsApiCall' AND (errorMessage IS NOT NULL OR errorCode IS NOT NULL) GROUP BY eventName, eventSource, sourceIPAddress ORDER BY cnt DESC LIMIT 30;",
        category: 'CloudTrail'
    },
    {
        name: 'Top CloudTrail Source IPs',
        description: 'Top 20 source IP addresses by CloudTrail event count',
        sql: 'SELECT sourceIPAddress, count(*) AS cnt FROM cloudtrail GROUP BY sourceIPAddress ORDER BY cnt DESC LIMIT 20;',
        category: 'CloudTrail'
    },
    {
        name: 'CloudTrail User Agents',
        description: 'Distinct user agents observed in CloudTrail events, sorted by frequency',
        sql: 'SELECT userAgent, count(*) AS cnt FROM cloudtrail GROUP BY userAgent ORDER BY cnt DESC LIMIT 20;',
        category: 'CloudTrail'
    }
];
