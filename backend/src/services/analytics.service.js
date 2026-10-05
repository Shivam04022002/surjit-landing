const AnalyticsEvent = require('../models/AnalyticsEvent');

// Automated clients that execute JavaScript (and so could fire the beacon):
// search and social crawlers, headless browsers, uptime monitors and HTTP
// libraries. Basic by design — it filters honest bots, not determined ones.
const BOT_UA = /bot|crawl|spider|slurp|crawler|fetch|monitor|uptime|lighthouse|pagespeed|headless|phantom|puppeteer|playwright|selenium|preview|facebookexternalhit|embedly|quora link|whatsapp|curl|wget|python-requests|axios|node-fetch|go-http-client|java\/|okhttp|postman|insomnia|undici|^node$/i;

const isBot = (userAgent) => {
    const ua = String(userAgent || '');
    // A real browser always sends a user-agent.
    return !ua.trim() || BOT_UA.test(ua);
};

// A coarse bucket; the user-agent string itself is discarded.
const deviceTypeOf = (userAgent) => {
    const ua = String(userAgent || '').toLowerCase();
    if (!ua) return 'unknown';
    if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'tablet';
    if (/mobi|iphone|ipod|android|windows phone/.test(ua)) return 'mobile';
    return 'desktop';
};

const record = async (event, userAgent) => {
    await AnalyticsEvent.create({
        ...event,
        deviceType: deviceTypeOf(userAgent),
        occurredAt: new Date()
    });
};

module.exports = { record, isBot, deviceTypeOf };
