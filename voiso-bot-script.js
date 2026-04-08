// ==UserScript==
// @name         VOISO Support - AI Bot Assistant
// @namespace    http://tampermonkey.net/
// @version      3.3.14
// @description  Sticky AI panel + стабильный parser + live AI request
// @author       Ной V3.3
// @match        https://support.voiso.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      lk01.nl.wavix.net
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/mikepz47/voiso-bot-script/main/voiso-bot-script.meta.js
// @downloadURL  https://raw.githubusercontent.com/mikepz47/voiso-bot-script/main/voiso-bot-script.user.js
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // ============================================================================
    // CONFIG - настройки интеграции AI
    // ============================================================================
    const AI_CHAT_ENDPOINT = 'https://lk01.nl.wavix.net:8444/v1/chat';
    const AI_FALLBACK_RESPONSE_MARKERS = [
        "i'm sorry, i couldn't find the information",
        "please try again with a different query"
    ];
    const AI_REQUEST_TIMEOUT_MS = 300000;
    const FEEDBACK_REQUEST_TIMEOUT_MS = 20000;
    const AI_TYPING_EFFECT_ENABLED = true;
    const AI_TYPING_EFFECT_MAX_CHARS = 3000;
    const AI_TYPING_EFFECT_INTERVAL_MS = 16;
    const AI_TYPING_EFFECT_SPEED_MULTIPLIER = 3;
    const USERSCRIPT_DOWNLOAD_URL_DEFAULT = 'https://raw.githubusercontent.com/mikepz47/voiso-bot-script/main/voiso-bot-script.user.js';

    function extractRequestUrl(fetchArg) {
        if (!fetchArg) return '';
        if (typeof fetchArg === 'string') return fetchArg;
        if (typeof fetchArg.url === 'string') return fetchArg.url;
        return String(fetchArg);
    }

    function isJsonContentType(contentType) {
        const normalized = String(contentType || '').toLowerCase();
        return normalized.includes('application/json') || normalized.includes('+json');
    }

    function hasFastTicketSignals(candidate) {
        if (!candidate || typeof candidate !== 'object') return false;

        if (getRepliesFromTicketData(candidate).length > 0) return true;
        if (looksLikeTicketData(candidate, { fast: true })) return true;

        const ticketId = getTicketIdFromPayload(candidate);
        if (!ticketId) return false;

        return Boolean(
            candidate.data ||
            candidate.ticket ||
            candidate.currentTicket ||
            candidate.current_ticket ||
            candidate.included
        );
    }

    function shouldStoreInterceptedPayload(data) {
        if (!data || typeof data !== 'object') return false;

        const candidates = [
            data,
            data.ticket,
            data.currentTicket,
            data.current_ticket,
            data.ticketData,
            data.data,
            data.data?.ticket,
            data.payload,
            data.response
        ];

        for (const candidate of candidates) {
            if (hasFastTicketSignals(candidate)) {
                return true;
            }
        }

        return false;
    }

    function getAiApiKey() {
        try {
            return String(
                pageWindow.VOISO_AI_API_KEY ||
                pageWindow.__VOISO_AI_API_KEY ||
                localStorage.getItem('voiso_ai_api_key') ||
                ''
            ).trim();
        } catch (e) {
            return '';
        }
    }

    function getFeedbackEndpoint() {
        try {
            return String(
                pageWindow.VOISO_FEEDBACK_ENDPOINT ||
                pageWindow.__VOISO_FEEDBACK_ENDPOINT ||
                localStorage.getItem('voiso_feedback_endpoint') ||
                ''
            ).trim();
        } catch (e) {
            return '';
        }
    }

    function getAiUserApiToken() {
        try {
            return (
                pageWindow.VOISO_USER_API_TOKEN ||
                pageWindow.__VOISO_USER_API_TOKEN ||
                localStorage.getItem('voiso_user_api_token') ||
                ''
            );
        } catch (e) {
            return '';
        }
    }

    function getTampermonkeyRequestFn() {
        if (typeof GM_xmlhttpRequest === 'function') {
            return GM_xmlhttpRequest;
        }
        return null;
    }

    function getTampermonkeyMenuCommandFn() {
        if (typeof GM_registerMenuCommand === 'function') {
            return GM_registerMenuCommand;
        }
        return null;
    }

    function getTampermonkeyOpenInTabFn() {
        if (typeof GM_openInTab === 'function') {
            return GM_openInTab;
        }
        return null;
    }

    function getUserscriptDownloadUrl() {
        try {
            return String(
                pageWindow.VOISO_USERSCRIPT_DOWNLOAD_URL ||
                pageWindow.__VOISO_USERSCRIPT_DOWNLOAD_URL ||
                localStorage.getItem('voiso_userscript_download_url') ||
                USERSCRIPT_DOWNLOAD_URL_DEFAULT
            ).trim();
        } catch (e) {
            return USERSCRIPT_DOWNLOAD_URL_DEFAULT;
        }
    }

    function withCacheBuster(url) {
        const normalized = String(url || '').trim();
        if (!normalized) return '';
        const delimiter = normalized.includes('?') ? '&' : '?';
        return `${normalized}${delimiter}ts=${Date.now()}`;
    }

    function openUserscriptDownloadUrl(url) {
        const openInTab = getTampermonkeyOpenInTabFn();
        if (openInTab) {
            openInTab(url, { active: true, insert: true, setParent: true });
            return true;
        }

        if (typeof pageWindow.open === 'function') {
            pageWindow.open(url, '_blank', 'noopener');
            return true;
        }

        return false;
    }

    function registerManualUpdateMenuCommand() {
        const registerMenuCommand = getTampermonkeyMenuCommandFn();
        if (!registerMenuCommand) return;

        registerMenuCommand('VOISO Bot: Check script update now', () => {
            const downloadUrl = getUserscriptDownloadUrl();
            if (!/^https?:\/\//i.test(downloadUrl)) {
                logger.warn('Manual update URL is not configured.', { download_url: downloadUrl || '(empty)' });
                pageWindow.alert(
                    'Userscript update URL is not configured.\n\n' +
                    'Set localStorage["voiso_userscript_download_url"] to your hosted .user.js URL.'
                );
                return;
            }

            const finalUrl = withCacheBuster(downloadUrl);
            const opened = openUserscriptDownloadUrl(finalUrl);
            if (!opened) {
                logger.warn('Unable to open userscript download URL', { download_url: finalUrl });
            }
        });
    }

    // ============================================================================
    // API INTERCEPTOR - Перехватываем fetch запросы и сохраняем данные
    // ============================================================================
    const originalFetch = pageWindow.fetch
        ? pageWindow.fetch.bind(pageWindow)
        : window.fetch.bind(window);
    pageWindow.fetch = function(...args) {
        const requestUrl = extractRequestUrl(args[0]);

        // Не смешиваем ответы AI-чата с ticket payload
        if (requestUrl.includes(AI_CHAT_ENDPOINT)) {
            return originalFetch(...args);
        }

        return originalFetch(...args).then(response => {
            const contentType = String(response.headers?.get('content-type') || '');
            if (!isJsonContentType(contentType)) {
                return response;
            }

            const clone = response.clone();
            clone.json()
                .then(data => {
                    try {
                        if (shouldStoreInterceptedPayload(data)) {
                            console.log('[VOISO BOT] 🎯 API DATA INTERCEPTED from:', requestUrl || args[0]);
                            storeInterceptedApiData(data, requestUrl);
                        }
                    } catch(e) {}
                })
                .catch(e => {});
            return response;
        });
    };

    // ============================================================================
    // LOGGER - удобное логирование
    // ============================================================================
    const logger = {
        log: (msg, data) => {
            console.log(`[VOISO BOT] ${msg}`, data || '');
        },
        error: (msg, error) => {
            console.error(`[VOISO BOT] ERROR: ${msg}`, error || '');
        },
        warn: (msg, data) => {
            console.warn(`[VOISO BOT] WARN: ${msg}`, data || '');
        },
        info: (msg, data) => {
            console.info(`[VOISO BOT] INFO: ${msg}`, data || '');
        }
    };

    // Показывать JSON preview в панели только для разработки
    const DEBUG_UI_PAYLOAD = false;

    // ============================================================================
    // PARSER - функции для поиска и обработки данных
    // ============================================================================

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function safeJsonParse(raw) {
        if (typeof raw !== 'string') return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function pickFirstString(values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim()) return value.trim();
            if (typeof value === 'number') return String(value);
        }
        return '';
    }

    function parseTimestampMs(value) {
        if (value === null || value === undefined || value === '') return NaN;

        if (typeof value === 'number' && Number.isFinite(value)) {
            return value < 1e12 ? value * 1000 : value;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return NaN;

            if (/^\d+(\.\d+)?$/.test(trimmed)) {
                const numeric = Number(trimmed);
                if (!Number.isFinite(numeric)) return NaN;
                return numeric < 1e12 ? numeric * 1000 : numeric;
            }

            const parsed = new Date(trimmed).getTime();
            return Number.isFinite(parsed) ? parsed : NaN;
        }

        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    function normalizeTextForKey(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeDirectionValue(value) {
        const normalized = String(value || '').toLowerCase().trim();
        if (!normalized) return '';

        if (
            normalized === 'inbound' ||
            normalized === 'incoming' ||
            normalized === 'in' ||
            normalized === 'email in' ||
            normalized === 'from_customer' ||
            normalized === 'from_user' ||
            normalized === 'customer' ||
            normalized === 'client'
        ) {
            return 'inbound';
        }

        if (
            normalized === 'outbound' ||
            normalized === 'outgoing' ||
            normalized === 'out' ||
            normalized === 'email out' ||
            normalized === 'from_agent' ||
            normalized === 'agent' ||
            normalized === 'support'
        ) {
            return 'outbound';
        }

        if (normalized.includes('inbound') || normalized.includes('incoming') || normalized.includes('from_customer') || normalized.includes('from_user')) {
            return 'inbound';
        }

        if (normalized.includes('outbound') || normalized.includes('outgoing') || normalized.includes('from_agent')) {
            return 'outbound';
        }

        return '';
    }

    function normalizeSideValue(value) {
        const normalized = String(value || '').toLowerCase().trim();
        if (!normalized) return '';

        if (normalized === 'left' || normalized.includes('left')) return 'left';
        if (normalized === 'right' || normalized.includes('right')) return 'right';
        return '';
    }

    function isSystemBannerText(text) {
        const normalized = String(text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        if (!normalized) return false;

        return (
            /^(resolved|forwarded|assigned)(\b|:)/.test(normalized) ||
            /^(ticket\s+)?(resolved|forwarded|assigned)\b/.test(normalized) ||
            /^(status|state)\s*[:\-]?\s*(resolved|forwarded|assigned)\b/.test(normalized) ||
            /^(set|marked)\s+as\s+(resolved|forwarded|assigned)\b/.test(normalized)
        );
    }

    function normalizeTicketId(value, options = {}) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(Math.trunc(value));
        }

        const normalized = String(value || '').trim();
        if (!normalized) return '';

        if (/^\d+$/.test(normalized)) {
            return normalized;
        }

        if (options.allowTicketPrefix) {
            const prefixedMatch = normalized.match(/^ticket[\s:_-]*(\d+)$/i);
            if (prefixedMatch) return prefixedMatch[1];
        }

        return '';
    }

    function extractTicketIdFromUrl(url) {
        const rawUrl = String(url || '');
        if (!rawUrl) return '';

        const match = rawUrl.match(/tickets\/(\d+)/i);
        if (!match) return '';

        return normalizeTicketId(match[1]);
    }

    function getCurrentTicketIdFromLocation() {
        return extractTicketIdFromUrl(pageWindow.location?.href || window.location?.href || '');
    }

    function getTicketIdFromPayload(data) {
        if (!data || typeof data !== 'object') return '';

        const candidates = [
            data.ticket_id,
            data.ticketId,
            data.data?.attributes?.ticket_id,
            data.data?.attributes?.ticketId,
            data.data?.ticket?.ticket_id,
            data.data?.ticket?.ticketId,
            data.data?.ticket?.id,
            data.ticket?.id,
            data.ticket?.ticket_id,
            data.ticket?.ticketId,
            data.currentTicket?.id,
            data.currentTicket?.ticket_id,
            data.currentTicket?.ticketId,
            data.current_ticket?.id,
            data.current_ticket?.ticket_id,
            data.current_ticket?.ticketId
        ];

        for (const candidate of candidates) {
            const normalized = normalizeTicketId(candidate, { allowTicketPrefix: true });
            if (normalized) return normalized;
        }

        return '';
    }

    function clearInterceptedApiData(reason) {
        if (pageWindow.__interceptedApiData || pageWindow.__interceptedApiDataMeta) {
            logger.info(`Clearing intercepted API data: ${reason}`);
        }

        pageWindow.__interceptedApiData = null;
        pageWindow.__interceptedApiDataMeta = null;
    }

    function storeInterceptedApiData(data, requestUrl) {
        const currentTicketId = getCurrentTicketIdFromLocation();
        const unwrapped = unwrapTicketDataCandidate(data) || data;
        const payloadTicketId = getTicketIdFromPayload(unwrapped);
        const requestTicketId = extractTicketIdFromUrl(requestUrl);
        const effectiveTicketId = payloadTicketId || requestTicketId || currentTicketId;

        if (currentTicketId && effectiveTicketId && currentTicketId !== effectiveTicketId) {
            logger.warn('Skip intercepted payload from another ticket', {
                current_ticket_id: currentTicketId,
                intercepted_ticket_id: effectiveTicketId,
                source_url: requestUrl || ''
            });
            return;
        }

        const incomingQuality = scoreTicketDataCandidate(unwrapped);
        const existingUnwrapped = unwrapTicketDataCandidate(pageWindow.__interceptedApiData) || pageWindow.__interceptedApiData;
        const existingQuality = scoreTicketDataCandidate(existingUnwrapped);

        if (existingUnwrapped && existingQuality.score > incomingQuality.score) {
            logger.info('Skip weaker intercepted payload', {
                kept_score: existingQuality.score,
                incoming_score: incomingQuality.score,
                kept_ticket_id: existingQuality.ticket_id || '',
                incoming_ticket_id: incomingQuality.ticket_id || '',
                source_url: requestUrl || ''
            });
            return;
        }

        pageWindow.__interceptedApiData = data;
        pageWindow.__interceptedApiDataMeta = {
            ticket_id: effectiveTicketId || '',
            source_url: requestUrl || '',
            captured_at: Date.now(),
            quality_score: incomingQuality.score,
            quality: incomingQuality
        };
    }

    function validateInterceptedApiDataForCurrentTicket() {
        const currentTicketId = getCurrentTicketIdFromLocation();
        if (!currentTicketId) return;

        const metaTicketId = normalizeTicketId(pageWindow.__interceptedApiDataMeta?.ticket_id);
        if (metaTicketId && metaTicketId !== currentTicketId) {
            clearInterceptedApiData(`ticket changed (${metaTicketId} -> ${currentTicketId})`);
            return;
        }

        const unwrapped = unwrapTicketDataCandidate(pageWindow.__interceptedApiData) || pageWindow.__interceptedApiData;
        const payloadTicketId = getTicketIdFromPayload(unwrapped);
        if (payloadTicketId && payloadTicketId !== currentTicketId) {
            clearInterceptedApiData(`intercepted payload mismatch (${payloadTicketId} != ${currentTicketId})`);
        }
    }

    function getRepliesFromTicketData(data) {
        if (!data || typeof data !== 'object') return [];
        const replies = data.data?.attributes?.replies_info?.replies;
        return Array.isArray(replies) ? replies : [];
    }

    function looksLikeTicketData(data, options = {}) {
        if (!data || typeof data !== 'object') return false;

        if (Array.isArray(data.events) || Array.isArray(data.messages) || Array.isArray(data.comments)) {
            return true;
        }

        if (Array.isArray(data.data?.events) || Array.isArray(data.data?.messages) || Array.isArray(data.data?.comments)) {
            return true;
        }

        if (Array.isArray(data.included)) {
            return true;
        }

        const replies = data.data?.attributes?.replies_info?.replies;
        if (Array.isArray(replies)) {
            return true;
        }

        const attrs = data.data?.attributes;
        if (attrs && (
            Array.isArray(attrs.events) ||
            Array.isArray(attrs.messages) ||
            Array.isArray(attrs.comments) ||
            Array.isArray(attrs.timeline) ||
            Array.isArray(attrs.history) ||
            Array.isArray(attrs.activities)
        )) {
            return true;
        }

        if (options.fast === true) {
            return false;
        }

        try {
            const str = JSON.stringify(data);
            return str.includes('created_at') && (str.includes('resolve') || str.includes('from_email') || str.includes('ticket'));
        } catch (e) {
            return false;
        }
    }

    function extractTimestampFromRawEventEntry(rawEvent) {
        if (!rawEvent || typeof rawEvent !== 'object') return NaN;

        const attrs = isObject(rawEvent.attributes) ? rawEvent.attributes : {};
        const timestampCandidates = [
            rawEvent.created_at,
            rawEvent.createdAt,
            rawEvent.updated_at,
            rawEvent.updatedAt,
            rawEvent.occurred_at,
            rawEvent.occurredAt,
            rawEvent.event_time,
            rawEvent.eventTime,
            rawEvent.timestamp,
            rawEvent.time,
            rawEvent.sent_at,
            rawEvent.sentAt,
            rawEvent.received_at,
            rawEvent.receivedAt,
            rawEvent.date_time,
            rawEvent.datetime,
            rawEvent.date,
            rawEvent.created,
            attrs.created_at,
            attrs.createdAt,
            attrs.updated_at,
            attrs.updatedAt,
            attrs.occurred_at,
            attrs.occurredAt,
            attrs.event_time,
            attrs.eventTime,
            attrs.timestamp,
            attrs.time,
            attrs.sent_at,
            attrs.sentAt,
            attrs.received_at,
            attrs.receivedAt,
            attrs.date_time,
            attrs.datetime,
            attrs.date,
            attrs.created
        ];
        const timestamp = pickFirstString(timestampCandidates);

        return parseTimestampMs(timestamp);
    }

    function isRawResolveLikeEntry(rawEvent) {
        if (!rawEvent || typeof rawEvent !== 'object') return false;

        const attrs = isObject(rawEvent.attributes) ? rawEvent.attributes : {};
        const markerText = [
            rawEvent.r_type,
            attrs.r_type,
            rawEvent.event_type,
            attrs.event_type,
            rawEvent.type,
            attrs.type,
            rawEvent.status,
            attrs.status,
            rawEvent.action,
            attrs.action,
            rawEvent.state,
            attrs.state,
            rawEvent.to_status,
            attrs.to_status,
            rawEvent.new_status,
            attrs.new_status,
            rawEvent.event_name,
            attrs.event_name,
            rawEvent.title,
            attrs.title,
            rawEvent.label,
            attrs.label,
            rawEvent.name,
            attrs.name,
            rawEvent.text,
            rawEvent.body,
            rawEvent.message,
            rawEvent.content,
            attrs.text,
            attrs.body,
            attrs.message,
            attrs.content
        ]
            .map(value => String(value || '').toLowerCase().trim())
            .filter(Boolean)
            .join(' ');

        return (
            /\bresolve(?:d|r)?\b/.test(markerText) ||
            markerText.includes('resolution') ||
            /\b(closed?|solved?|done)\b/.test(markerText) ||
            /\bstatus(?:_|\s)*(?:to|changed)?(?:_|\s)*resolved\b/.test(markerText)
        );
    }

    function scoreTicketDataCandidate(ticketData) {
        if (!ticketData || typeof ticketData !== 'object') {
            return {
                score: -1,
                total_items: 0,
                replies_count: 0,
                resolve_hits: 0,
                timestamp_hits: 0,
                ticket_id: ''
            };
        }

        const repliesCount = getRepliesFromTicketData(ticketData).length;
        const collections = collectRawEventCollections(ticketData);
        const ticketId = getTicketIdFromPayload(ticketData);
        const includedCount = Array.isArray(ticketData.included) ? ticketData.included.length : 0;

        let totalItems = 0;
        let historyCollections = 0;
        let eventCollections = 0;
        let timestampHits = 0;
        let resolveHits = 0;
        let scanned = 0;
        const sampleLimit = 300;

        for (const collection of collections) {
            totalItems += collection.items.length;

            if (/replies_info\.replies/.test(collection.source)) historyCollections += 2;
            if (/history|timeline|activities/.test(collection.source)) historyCollections += 1;
            if (/events|messages|comments/.test(collection.source)) eventCollections += 1;

            for (const rawEvent of collection.items) {
                if (scanned >= sampleLimit) break;
                scanned += 1;

                if (Number.isFinite(extractTimestampFromRawEventEntry(rawEvent))) {
                    timestampHits += 1;
                }

                if (isRawResolveLikeEntry(rawEvent)) {
                    resolveHits += 1;
                }
            }
        }

        let score = 0;
        if (looksLikeTicketData(ticketData)) score += 20;
        if (ticketId) score += 40;
        if (repliesCount > 0) score += 180 + Math.min(repliesCount, 120);
        score += Math.min(totalItems, 120);
        score += historyCollections * 35;
        score += eventCollections * 18;
        score += Math.min(timestampHits * 4, 90);
        score += Math.min(resolveHits * 20, 180);
        score += Math.min(includedCount, 30);

        if (timestampHits === 0) score -= 30;
        if (resolveHits === 0) score -= 20;

        return {
            score,
            total_items: totalItems,
            replies_count: repliesCount,
            resolve_hits: resolveHits,
            timestamp_hits: timestampHits,
            ticket_id: ticketId
        };
    }

    function unwrapTicketDataCandidate(candidate) {
        if (!candidate || typeof candidate !== 'object') return null;

        const candidates = [
            candidate,
            candidate.ticket,
            candidate.currentTicket,
            candidate.current_ticket,
            candidate.ticketData,
            candidate.data,
            candidate.data?.ticket,
            candidate.payload,
            candidate.response
        ];

        for (const item of candidates) {
            if (getRepliesFromTicketData(item).length > 0) {
                return item;
            }
        }

        for (const item of candidates) {
            if (looksLikeTicketData(item)) {
                return item;
            }
        }

        return null;
    }

    function extractBalancedJsonObject(text, startIndex) {
        if (startIndex < 0 || startIndex >= text.length || text[startIndex] !== '{') {
            return null;
        }

        let depth = 0;
        let inString = false;
        let quote = '';
        let escaped = false;

        for (let i = startIndex; i < text.length; i++) {
            const ch = text[i];

            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (ch === quote) {
                    inString = false;
                    quote = '';
                }
                continue;
            }

            if (ch === '"' || ch === '\'' || ch === '`') {
                inString = true;
                quote = ch;
                continue;
            }

            if (ch === '{') {
                depth++;
                continue;
            }

            if (ch === '}') {
                depth--;
                if (depth === 0) {
                    return text.slice(startIndex, i + 1);
                }
            }
        }

        return null;
    }

    function findTicketDataInDataAttributes(options = {}) {
        const collectAll = options.collectAll === true;
        const attrPriority = [
            'data-ticket-json',
            'data-ticket-data',
            'data-initial-state',
            'data-state',
            'data-store',
            'data-json'
        ];
        const matches = [];
        const MAX_DATA_ATTRIBUTE_SCAN_ELEMENTS = 6000;

        const priorityElements = document.querySelectorAll(
            '[data-ticket-json], [data-ticket-data], [data-initial-state], [data-state], [data-store], [data-json]'
        );
        const seenElements = new Set();
        const elements = [];

        for (const element of priorityElements) {
            elements.push(element);
            seenElements.add(element);
        }

        const root = document.body || document.documentElement;
        if (root) {
            const showElement = pageWindow.NodeFilter ? pageWindow.NodeFilter.SHOW_ELEMENT : 1;
            const walker = document.createTreeWalker(root, showElement);
            let scanned = 0;
            let node = walker.currentNode;

            while (node && scanned < MAX_DATA_ATTRIBUTE_SCAN_ELEMENTS) {
                scanned += 1;

                if (!seenElements.has(node)) {
                    const attrs = node.attributes;
                    if (attrs && attrs.length > 0) {
                        for (let i = 0; i < attrs.length; i++) {
                            const attrName = attrs[i]?.name || '';
                            if (attrName.startsWith('data-')) {
                                elements.push(node);
                                seenElements.add(node);
                                break;
                            }
                        }
                    }
                }

                node = walker.nextNode();
            }

            if (node) {
                logger.info('Data-attribute scan limit reached', {
                    limit: MAX_DATA_ATTRIBUTE_SCAN_ELEMENTS
                });
            }
        }

        for (const element of elements) {
            for (const attrName of attrPriority) {
                const raw = element.getAttribute(attrName);
                if (!raw) continue;

                const parsed = unwrapTicketDataCandidate(safeJsonParse(raw));
                if (parsed) {
                    logger.log(`Found data in DOM attribute ${attrName}`);
                    if (!collectAll) return parsed;
                    matches.push(parsed);
                }
            }

            for (const attr of Array.from(element.attributes)) {
                if (!attr.name.startsWith('data-')) continue;
                const rawValue = String(attr.value || '').trim();
                if (!rawValue || (rawValue[0] !== '{' && rawValue[0] !== '[')) continue;

                const parsed = unwrapTicketDataCandidate(safeJsonParse(rawValue));
                if (parsed) {
                    logger.log(`Found data in DOM attribute ${attr.name}`);
                    if (!collectAll) return parsed;
                    matches.push(parsed);
                }
            }
        }

        return collectAll ? matches : null;
    }

    function findTicketDataInInlineScripts(options = {}) {
        const collectAll = options.collectAll === true;
        const scripts = document.querySelectorAll('script');
        const assignmentPattern = /(?:window\.)?(?:__interceptedApiData|__data|__DATA__|__INITIAL_STATE__|__INITIAL_PROPS__|ticketData|TICKET_DATA|initialState|appState)\s*=\s*/g;
        const matches = [];

        for (const script of scripts) {
            const text = script.textContent;
            if (!text || text.length < 20) continue;

            if (script.type && (
                script.type.toLowerCase() === 'application/json' ||
                script.type.toLowerCase() === 'application/ld+json'
            )) {
                const parsedJson = unwrapTicketDataCandidate(safeJsonParse(text.trim()));
                if (parsedJson) {
                    logger.log(`Found data in inline ${script.type} script`);
                    if (!collectAll) return parsedJson;
                    matches.push(parsedJson);
                }
            }

            assignmentPattern.lastIndex = 0;
            let match = assignmentPattern.exec(text);
            while (match) {
                const objectStart = text.indexOf('{', match.index + match[0].length);
                if (objectStart !== -1) {
                    const jsonText = extractBalancedJsonObject(text, objectStart);
                    const parsedJson = unwrapTicketDataCandidate(safeJsonParse(jsonText));
                    if (parsedJson) {
                        logger.log('Found data in inline script assignment');
                        if (!collectAll) return parsedJson;
                        matches.push(parsedJson);
                    }
                }
                match = assignmentPattern.exec(text);
            }
        }

        return collectAll ? matches : null;
    }

    /**
     * Пытается найти JSON данные тикета в приоритетном порядке:
     * 1) перехваченный API JSON
     * 2) window переменные
     * 3) data-* атрибуты
     * 4) inline script JSON
     */
    function findTicketData() {
        logger.log('Searching for ticket data...');
        validateInterceptedApiDataForCurrentTicket();
        const currentTicketId = getCurrentTicketIdFromLocation();
        const candidates = [];
        const seenPayloads = new WeakSet();

        function pushCandidate(rawCandidate, source) {
            const payload = unwrapTicketDataCandidate(rawCandidate);
            if (!payload || typeof payload !== 'object') return;
            if (seenPayloads.has(payload)) return;

            const ticketId = getTicketIdFromPayload(payload);
            if (currentTicketId && ticketId && ticketId !== currentTicketId) {
                logger.info(`Skip candidate with foreign ticket id (${ticketId}) from ${source}`);
                return;
            }

            const quality = scoreTicketDataCandidate(payload);
            candidates.push({
                source,
                payload,
                quality,
                ticket_id: ticketId || ''
            });
            seenPayloads.add(payload);
        }

        // 1) Перехваченный API JSON (оба debug-контейнера)
        pushCandidate(pageWindow.__interceptedApiData, 'window.__interceptedApiData');
        pushCandidate(pageWindow.__interceptedTicketData, 'window.__interceptedTicketData');

        // 2) Window переменные
        const windowVars = [
            '__data',
            '__DATA__',
            '__TICKET__',
            '__INITIAL_STATE__',
            '__INITIAL_PROPS__',
            'ticketData',
            'TICKET_DATA',
            'initialState',
            'appState',
            'ticketStore'
        ];

        for (const varName of windowVars) {
            pushCandidate(pageWindow[varName], `window.${varName}`);
        }

        // 3) DOM data-* атрибуты
        const dataAttributePayloads = findTicketDataInDataAttributes({ collectAll: true });
        for (let i = 0; i < dataAttributePayloads.length; i++) {
            pushCandidate(dataAttributePayloads[i], `dom.data-attributes#${i}`);
        }

        // 4) Inline script JSON
        const inlineScriptPayloads = findTicketDataInInlineScripts({ collectAll: true });
        for (let i = 0; i < inlineScriptPayloads.length; i++) {
            pushCandidate(inlineScriptPayloads[i], `dom.inline-script#${i}`);
        }

        if (candidates.length === 0) {
            logger.warn('Could not find ticket data in any known location');
            return null;
        }

        candidates.sort((a, b) => {
            if (b.quality.score !== a.quality.score) return b.quality.score - a.quality.score;
            if (b.quality.resolve_hits !== a.quality.resolve_hits) return b.quality.resolve_hits - a.quality.resolve_hits;
            if (b.quality.replies_count !== a.quality.replies_count) return b.quality.replies_count - a.quality.replies_count;
            return b.quality.timestamp_hits - a.quality.timestamp_hits;
        });

        const best = candidates[0];
        logger.info('Ticket data candidate ranking', candidates.slice(0, 5).map(candidate => ({
            source: candidate.source,
            score: candidate.quality.score,
            ticket_id: candidate.ticket_id || '',
            replies: candidate.quality.replies_count,
            resolve_hits: candidate.quality.resolve_hits,
            timestamp_hits: candidate.quality.timestamp_hits,
            total_items: candidate.quality.total_items
        })));
        logger.log(`Selected ticket payload source: ${best.source}`, {
            score: best.quality.score,
            ticket_id: best.ticket_id || ''
        });

        return best.payload;
    }

    function pushCollection(target, source, items) {
        if (Array.isArray(items) && items.length > 0) {
            target.push({ source, items });
        }
    }

    function collectRawEventCollections(ticketData) {
        const collections = [];
        if (!ticketData || typeof ticketData !== 'object') return collections;

        pushCollection(collections, 'events', ticketData.events);
        pushCollection(collections, 'messages', ticketData.messages);
        pushCollection(collections, 'comments', ticketData.comments);
        pushCollection(collections, 'data.events', ticketData.data?.events);
        pushCollection(collections, 'data.messages', ticketData.data?.messages);
        pushCollection(collections, 'data.comments', ticketData.data?.comments);

        const attrs = ticketData.data?.attributes;
        if (isObject(attrs)) {
            pushCollection(collections, 'data.attributes.events', attrs.events);
            pushCollection(collections, 'data.attributes.messages', attrs.messages);
            pushCollection(collections, 'data.attributes.comments', attrs.comments);
            pushCollection(collections, 'data.attributes.timeline', attrs.timeline);
            pushCollection(collections, 'data.attributes.history', attrs.history);
            pushCollection(collections, 'data.attributes.activities', attrs.activities);
            pushCollection(collections, 'data.attributes.replies_info.replies', attrs.replies_info?.replies);
        }

        pushCollection(collections, 'included', ticketData.included);
        return collections;
    }

    function getNodeMarkerText(node) {
        if (!node || typeof node !== 'object') return '';

        const parts = [];
        const maxAncestors = 4;
        let current = node;
        let depth = 0;

        while (current && depth < maxAncestors) {
            if (typeof current.className === 'string') parts.push(current.className);
            if (typeof current.id === 'string') parts.push(current.id);
            if (current.getAttribute) {
                parts.push(current.getAttribute('data-direction') || '');
                parts.push(current.getAttribute('data-side') || '');
                parts.push(current.getAttribute('data-align') || '');
                parts.push(current.getAttribute('data-testid') || '');
            }
            current = current.parentElement;
            depth += 1;
        }

        return parts
            .map(part => String(part || '').toLowerCase())
            .filter(Boolean)
            .join(' ');
    }

    function extractExplicitDomRoleFromMarker(markerText) {
        const marker = String(markerText || '').toLowerCase();
        if (!marker) return '';

        const hasClient = /(customermessage|commentssectioncustomer)/.test(marker);
        const hasAgent = /(agentmessage|commentssectionagent)/.test(marker);

        if (hasClient && hasAgent) {
            return '';
        }

        if (hasClient) {
            return 'client';
        }
        if (hasAgent) {
            return 'agent';
        }
        return '';
    }

    function isNoiseMarkerText(markerText) {
        const marker = String(markerText || '').toLowerCase();
        if (!marker) return false;

        return (
            marker.includes('ant-collapse-arrow') ||
            marker.includes('collapse-arrow') ||
            marker.includes('anticon') ||
            /(^|[\s_-])icon($|[\s_-])/.test(marker)
        );
    }

    function isLikelyMessageBubbleNode(node, markerText) {
        if (!node || typeof node !== 'object') return false;

        const marker = String(markerText || '').toLowerCase();
        const tag = String(node.tagName || '').toLowerCase();
        if (['svg', 'path', 'img', 'button', 'input'].includes(tag)) return false;

        const explicitRole = extractExplicitDomRoleFromMarker(marker);
        if (explicitRole) return true;

        if (isNoiseMarkerText(marker) && !/(message|comment|bubble|thread|conversation)/.test(marker)) {
            return false;
        }

        const looksLikeBubble = /\b(message|comment|bubble|chat)\b/.test(marker);
        const looksLikeContainer = /\b(thread|conversation|container|wrapper|list|section)\b/.test(marker);
        return looksLikeBubble && !looksLikeContainer;
    }

    function buildTextKeyVariants(rawText) {
        const source = String(rawText || '');
        if (!source.trim()) return [];

        const variants = new Set();
        const fullNormalized = normalizeTextForKey(source);
        if (fullNormalized) variants.add(fullNormalized);

        const lines = source
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .slice(0, 20);

        for (const line of lines) {
            if (line.length > 500) continue;

            const lineKey = normalizeTextForKey(line);
            if (lineKey) variants.add(lineKey);

            const compact = normalizeTextForKey(line.replace(/[^\w@.\-\s]/g, ' '));
            if (compact) variants.add(compact);
        }

        return Array.from(variants)
            .filter(key => key.length > 0 && key.length <= 1200)
            .slice(0, 30);
    }

    function scoreDomHint(hint) {
        if (!hint || typeof hint !== 'object') return -1;

        let score = 0;
        if ((hint.explicit_client || 0) > 0 || (hint.explicit_agent || 0) > 0) {
            score += 40;
        }
        if (hint.role_ambiguous) {
            score -= 35;
        } else if (hint.explicit_role === 'client' || hint.explicit_role === 'agent') {
            score += 20;
        }

        if (hint.side_ambiguous) {
            score -= 15;
        } else if (hint.dom_side === 'left' || hint.dom_side === 'right') {
            score += 10;
        }

        score += Math.min(Number(hint.total) || 0, 10);
        return score;
    }

    function pickBestDomHintForText(rawText, domMessageHints) {
        if (!domMessageHints || typeof domMessageHints.get !== 'function') return null;

        const textVariants = buildTextKeyVariants(rawText);
        if (textVariants.length === 0) return null;

        let bestHint = null;
        let bestScore = -Infinity;

        for (const textKey of textVariants) {
            const hint = domMessageHints.get(textKey);
            if (!hint) continue;

            const score = scoreDomHint(hint);
            if (score > bestScore) {
                bestScore = score;
                bestHint = hint;
            }
        }

        return bestHint;
    }

    function detectDomBubbleSide(node, markerText = '', explicitRole = '') {
        const marker = String(markerText || getNodeMarkerText(node)).toLowerCase();

        if (explicitRole === 'client') return 'left';
        if (explicitRole === 'agent') return 'right';

        if (
            !isNoiseMarkerText(marker) &&
            /\b(left|inbound|incoming|customer|client|requester|visitor|from-customer|from_customer)\b/.test(marker)
        ) {
            return 'left';
        }

        if (
            !isNoiseMarkerText(marker) &&
            /\b(right|outbound|outgoing|agent|support|staff|from-agent|from_agent|mine|from-me)\b/.test(marker)
        ) {
            return 'right';
        }

        if (node && node.getAttribute) {
            const directionAttr = normalizeDirectionValue(node.getAttribute('data-direction'));
            if (directionAttr === 'inbound') return 'left';
            if (directionAttr === 'outbound') return 'right';
        }

        if (node && node.getBoundingClientRect) {
            const rect = node.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && window.innerWidth > 0) {
                const center = rect.left + rect.width / 2;
                const middle = window.innerWidth / 2;

                if (rect.width < window.innerWidth * 0.92) {
                    if (center < middle * 0.95) return 'left';
                    if (center > middle * 1.05) return 'right';
                }
            }
        }

        return '';
    }

    function isSystemBannerNode(node, text) {
        const markerText = getNodeMarkerText(node);
        if (isSystemBannerText(text)) return true;

        return (
            /\b(system|divider|status|event|timeline-separator|activity-separator)\b/.test(markerText) &&
            /\b(resolved|forwarded|assigned)\b/i.test(String(text || ''))
        );
    }

    function buildDomMessageHintsIndex() {
        const selectors = [
            '[class*="customerMessage--"]',
            '[class*="commentsSectionCustomer--"]',
            '[class*="agentMessage--"]',
            '[class*="commentsSectionAgent--"]',
            '[data-testid*="message"]',
            '[data-testid*="comment"]',
            '[data-testid*="bubble"]',
            '[class*="message"]',
            '[class*="comment"]',
            '[class*="bubble"]'
        ];

        const rawNodes = Array.from(document.querySelectorAll(selectors.join(', ')));
        if (rawNodes.length === 0) return new Map();

        const dedupNodes = [];
        const seenNodes = new Set();
        for (const node of rawNodes) {
            if (!node || seenNodes.has(node)) continue;
            seenNodes.add(node);
            dedupNodes.push(node);
        }

        const hints = new Map();
        const seenTexts = new Set();
        const MAX_SCANNED = 12000;
        let scanned = 0;

        for (const node of dedupNodes) {
            scanned += 1;
            if (scanned > MAX_SCANNED) break;

            const markerText = getNodeMarkerText(node);
            if (!isLikelyMessageBubbleNode(node, markerText)) continue;

            const rawText = String(node.innerText || node.textContent || '');
            const text = rawText.replace(/\s+/g, ' ').trim();
            if (!text || text.length < 1 || text.length > 2000) continue;

            const textVariants = buildTextKeyVariants(rawText);
            if (textVariants.length === 0) continue;

            // Dedup exact text+node marker footprint to reduce noisy repeats.
            const dedupKey = `${textVariants.slice(0, 4).join('|')}|${markerText.slice(0, 120)}`;
            if (seenTexts.has(dedupKey)) continue;
            seenTexts.add(dedupKey);

            const explicitRole = extractExplicitDomRoleFromMarker(markerText);
            const side = detectDomBubbleSide(node, markerText, explicitRole);
            const systemBanner = isSystemBannerNode(node, text);

            for (const textKey of textVariants) {
                const entry = hints.get(textKey) || {
                    left: 0,
                    right: 0,
                    system: 0,
                    total: 0,
                    explicit_client: 0,
                    explicit_agent: 0,
                    explicit_role: '',
                    dom_side: '',
                    role_ambiguous: false,
                    side_ambiguous: false
                };

                if (side === 'left') entry.left += 1;
                if (side === 'right') entry.right += 1;
                if (explicitRole === 'client') entry.explicit_client += 1;
                if (explicitRole === 'agent') entry.explicit_agent += 1;
                if (systemBanner) entry.system += 1;
                entry.total += 1;

                entry.role_ambiguous = entry.explicit_client > 0 && entry.explicit_agent > 0;
                entry.side_ambiguous = entry.left > 0 && entry.right > 0;
                entry.explicit_role = entry.role_ambiguous
                    ? ''
                    : entry.explicit_client > 0
                        ? 'client'
                        : entry.explicit_agent > 0
                            ? 'agent'
                            : '';
                entry.dom_side = entry.side_ambiguous
                    ? ''
                    : entry.left > 0
                        ? 'left'
                        : entry.right > 0
                            ? 'right'
                            : '';

                hints.set(textKey, entry);
            }
        }

        logger.info('DOM message hints collected', {
            keys: hints.size,
            scanned_nodes: Math.min(scanned, MAX_SCANNED)
        });

        return hints;
    }

    function normalizeResolveSignalValue(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[\s\-]+/g, '_')
            .replace(/[^a-z0-9_:]/g, '')
            .trim();
    }

    function isResolveSignal(signal) {
        if (!signal) return false;

        return (
            signal === 'resolve' ||
            signal === 'resolved' ||
            signal === 'resolution' ||
            signal === 'status_resolved' ||
            signal === 'ticket_resolved' ||
            signal === 'mark_as_resolved' ||
            signal === 'closed' ||
            signal === 'close' ||
            signal === 'solved' ||
            signal === 'done' ||
            signal.includes('resolve') ||
            signal.includes('resolution') ||
            /(^|_)(closed?|solved?|done)(_|$)/.test(signal)
        );
    }

    function isResolveCandidateSignal(signal) {
        if (!signal) return false;
        return (
            isResolveSignal(signal) ||
            signal.includes('status') ||
            signal.includes('state')
        );
    }

    function normalizeEvent(rawEvent, source, index, domMessageHints = null) {
        if (!rawEvent || typeof rawEvent !== 'object') return null;

        const attrs = isObject(rawEvent.attributes) ? rawEvent.attributes : {};
        const rawApiRole = pickFirstString([rawEvent.r_source, attrs.r_source]).toLowerCase().trim();
        const apiRole = rawApiRole === 'customer' ? 'customer' : rawApiRole === 'agent' ? 'agent' : '';
        const email = pickFirstString([
            rawEvent.from_email,
            rawEvent.email,
            rawEvent.sender_email,
            attrs.from_email,
            attrs.email,
            attrs.sender_email
        ]);
        const text = pickFirstString([
            rawEvent.text,
            rawEvent.body,
            rawEvent.message,
            rawEvent.content,
            rawEvent.description,
            attrs.text,
            attrs.body,
            attrs.message,
            attrs.content,
            attrs.description
        ]);
        const domHint = pickBestDomHintForText(text, domMessageHints);
        const domExplicitRole = domHint && (domHint.explicit_role === 'client' || domHint.explicit_role === 'agent')
            ? domHint.explicit_role
            : '';
        const domSide = normalizeSideValue(domHint?.dom_side || '');
        const domRoleAmbiguous = Boolean(domHint?.role_ambiguous);
        const domSideAmbiguous = Boolean(domHint?.side_ambiguous);

        const timestampCandidates = [
            rawEvent.created_at,
            rawEvent.createdAt,
            rawEvent.updated_at,
            rawEvent.updatedAt,
            rawEvent.occurred_at,
            rawEvent.occurredAt,
            rawEvent.event_time,
            rawEvent.eventTime,
            rawEvent.timestamp,
            rawEvent.time,
            rawEvent.sent_at,
            rawEvent.sentAt,
            rawEvent.received_at,
            rawEvent.receivedAt,
            rawEvent.date_time,
            rawEvent.datetime,
            rawEvent.date,
            rawEvent.created,
            attrs.created_at,
            attrs.createdAt,
            attrs.updated_at,
            attrs.updatedAt,
            attrs.occurred_at,
            attrs.occurredAt,
            attrs.event_time,
            attrs.eventTime,
            attrs.timestamp,
            attrs.time,
            attrs.sent_at,
            attrs.sentAt,
            attrs.received_at,
            attrs.receivedAt,
            attrs.date_time,
            attrs.datetime,
            attrs.date,
            attrs.created
        ];
        const timestamp = pickFirstString(timestampCandidates);

        const action = pickFirstString([
            rawEvent.action,
            rawEvent.event_action,
            attrs.action,
            attrs.event_action
        ]).toLowerCase();
        const state = pickFirstString([
            rawEvent.state,
            rawEvent.status_state,
            attrs.state,
            attrs.status_state
        ]).toLowerCase();
        const toStatus = pickFirstString([
            rawEvent.to_status,
            rawEvent.toStatus,
            rawEvent.status_to,
            attrs.to_status,
            attrs.toStatus,
            attrs.status_to
        ]).toLowerCase();
        const newStatus = pickFirstString([
            rawEvent.new_status,
            rawEvent.newStatus,
            rawEvent.status_after,
            attrs.new_status,
            attrs.newStatus,
            attrs.status_after
        ]).toLowerCase();
        const eventName = pickFirstString([
            rawEvent.event_name,
            rawEvent.eventName,
            attrs.event_name,
            attrs.eventName
        ]).toLowerCase();
        const title = pickFirstString([
            rawEvent.title,
            attrs.title
        ]).toLowerCase();
        const label = pickFirstString([
            rawEvent.label,
            attrs.label
        ]).toLowerCase();
        const apiDirection = normalizeDirectionValue(pickFirstString([
            rawEvent.direction,
            attrs.direction,
            rawEvent.message_direction,
            attrs.message_direction,
            rawEvent.reply_direction,
            attrs.reply_direction,
            rawEvent.flow_direction,
            attrs.flow_direction
        ]));

        const eventType = pickFirstString([
            rawEvent.r_type,
            attrs.r_type,
            rawEvent.event_type,
            attrs.event_type,
            eventName,
            action,
            rawEvent.type,
            attrs.type,
            rawEvent.status,
            attrs.status
        ]).toLowerCase();
        const status = pickFirstString([
            rawEvent.status,
            attrs.status,
            state,
            toStatus,
            newStatus
        ]).toLowerCase();
        const rawType = pickFirstString([
            rawEvent.type,
            attrs.type,
            eventName
        ]).toLowerCase();
        const author = pickFirstString([
            rawEvent.author_name,
            typeof rawEvent.author === 'string' ? rawEvent.author : '',
            rawEvent.from_name,
            attrs.author_name,
            typeof attrs.author === 'string' ? attrs.author : '',
            attrs.from_name,
            email,
            'Unknown'
        ]);
        const id = pickFirstString([
            rawEvent.id,
            attrs.id,
            rawEvent.event_id,
            attrs.event_id,
            rawEvent.uuid,
            attrs.uuid
        ]);

        const resolveSignals = Array.from(new Set([
            rawEvent.r_type,
            attrs.r_type,
            rawEvent.event_type,
            attrs.event_type,
            rawEvent.type,
            attrs.type,
            rawEvent.status,
            attrs.status,
            action,
            state,
            toStatus,
            newStatus,
            eventName,
            title,
            label,
            rawEvent.name,
            attrs.name
        ]
            .map(normalizeResolveSignalValue)
            .filter(Boolean)));

        const resolveMarkerText = `${eventType} ${status} ${rawType} ${action} ${state} ${toStatus} ${newStatus} ${eventName} ${title} ${label} ${text}`.toLowerCase();
        const regexResolve = /\bresolve(?:d|r)?\b/.test(resolveMarkerText) || resolveMarkerText.includes('resolution');
        const resolveLikeSignals = resolveSignals.filter(isResolveSignal);
        const resolveCandidateSignals = resolveSignals.filter(isResolveCandidateSignal);
        const resolveCandidate = resolveCandidateSignals.length > 0 || /\b(resolve(?:d|r)?|resolution|closed?|solved?|done)\b/.test(resolveMarkerText);
        const isResolve = resolveLikeSignals.length > 0 || regexResolve;
        const direction = apiDirection ||
            (domExplicitRole === 'client' ? 'inbound' : domExplicitRole === 'agent' ? 'outbound' : '') ||
            (domSide === 'left' ? 'inbound' : domSide === 'right' ? 'outbound' : '');
        const isSystemBanner = Boolean(
            isSystemBannerText(text) ||
            (domHint && domHint.system > 0 && domHint.system >= Math.max(domHint.left, domHint.right))
        );

        const timestampMs = parseTimestampMs(timestamp);
        const isEventLike = Boolean(
            timestamp ||
            email ||
            text ||
            eventType ||
            status ||
            rawType.includes('event') ||
            rawType.includes('message') ||
            source.includes('events') ||
            source.includes('messages') ||
            resolveCandidate
        );

        if (!isEventLike) return null;

        return {
            id: id || `${source}:${index}`,
            timestamp: timestamp || '',
            time: timestamp || '',
            timestamp_ms: timestampMs,
            timestamp_candidates: Array.from(new Set(
                timestampCandidates
                    .map(value => (typeof value === 'string' ? value.trim() : value))
                    .filter(value => value !== null && value !== undefined && value !== '')
            )).slice(0, 20),
            author: author || 'Unknown',
            email: email || '',
            text: text || '',
            event_type: eventType || 'unknown',
            status: status || '',
            raw_type: rawType || '',
            source,
            is_resolve: isResolve,
            direction,
            api_direction: apiDirection,
            api_role: apiRole,
            dom_explicit_role: domExplicitRole,
            dom_side: domSide,
            dom_role_ambiguous: domRoleAmbiguous,
            dom_side_ambiguous: domSideAmbiguous,
            is_system_banner: isSystemBanner,
            resolve_candidate: resolveCandidate,
            resolve_signals: resolveLikeSignals,
            resolve_debug: {
                action,
                state,
                to_status: toStatus,
                new_status: newStatus,
                event_name: eventName,
                title,
                label
            }
        };
    }

    function buildEventStableKey(event) {
        if (event.id && !event.id.includes(':')) {
            return [
                `id:${String(event.id).toLowerCase()}`,
                `type:${event.event_type}`,
                `time:${event.timestamp_ms}`
            ].join('|');
        }

        return [
            `time:${event.timestamp_ms}`,
            `email:${String(event.email || '').toLowerCase()}`,
            `type:${event.event_type}`,
            `text:${normalizeTextForKey(event.text)}`
        ].join('|');
    }

    function normalizeEvents(ticketData, domMessageHints = null) {
        const collections = collectRawEventCollections(ticketData);
        const uniqueEvents = new Map();

        logger.log(`Collected ${collections.length} event collections`);

        for (const collection of collections) {
            collection.items.forEach((rawEvent, index) => {
                const normalized = normalizeEvent(rawEvent, collection.source, index, domMessageHints);
                if (!normalized) return;

                const key = buildEventStableKey(normalized);
                if (!uniqueEvents.has(key)) {
                    uniqueEvents.set(key, normalized);
                }
            });
        }

        const events = Array.from(uniqueEvents.values()).sort((a, b) => {
            const aValid = Number.isFinite(a.timestamp_ms);
            const bValid = Number.isFinite(b.timestamp_ms);

            if (aValid && bValid) return a.timestamp_ms - b.timestamp_ms;
            if (aValid) return -1;
            if (bValid) return 1;
            return 0;
        });

        logger.log(`Normalized ${events.length} unique events`);
        return events;
    }

    function recoverResolveTimestampMs(event) {
        if (!event || typeof event !== 'object') return NaN;

        const candidates = [
            event.timestamp,
            event.time,
            event.resolve_debug?.occurred_at,
            event.resolve_debug?.updated_at,
            event.resolve_debug?.created_at,
            ...(Array.isArray(event.timestamp_candidates) ? event.timestamp_candidates : [])
        ];

        for (const candidate of candidates) {
            const parsed = parseTimestampMs(candidate);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        const fromText = extractTimelineTimestampMs(event.text || '');
        if (Number.isFinite(fromText)) {
            return fromText;
        }

        return NaN;
    }

    function getResolveEvents(normalizedEvents) {
        if (!Array.isArray(normalizedEvents) || normalizedEvents.length === 0) return [];

        const resolveEvents = [];

        for (const event of normalizedEvents) {
            if (!event || event.is_resolve !== true) continue;

            let timestampMs = event.timestamp_ms;
            let timestamp = event.timestamp || event.time || '';

            if (!Number.isFinite(timestampMs)) {
                timestampMs = recoverResolveTimestampMs(event);
                if (Number.isFinite(timestampMs)) {
                    timestamp = timestamp || new Date(timestampMs).toISOString();
                    logger.info('Recovered missing resolve timestamp', {
                        id: event.id,
                        source: event.source,
                        recovered_timestamp: timestamp
                    });
                }
            }

            if (!Number.isFinite(timestampMs)) continue;

            resolveEvents.push({
                ...event,
                timestamp_ms: timestampMs,
                timestamp,
                time: timestamp
            });
        }

        return resolveEvents.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    }

    function getResolveCandidateEvents(normalizedEvents) {
        if (!Array.isArray(normalizedEvents) || normalizedEvents.length === 0) return [];

        return normalizedEvents.filter(event => event.resolve_candidate === true);
    }

    function buildResolveDebugSample(event) {
        return {
            id: event.id,
            source: event.source,
            timestamp: event.timestamp || '',
            event_type: event.event_type || '',
            status: event.status || '',
            raw_type: event.raw_type || '',
            resolve_signals: Array.isArray(event.resolve_signals) ? event.resolve_signals : [],
            resolve_debug: event.resolve_debug || {},
            text_preview: String(event.text || '').slice(0, 220)
        };
    }

    function extractTimelineTimestampMs(text) {
        const raw = String(text || '');
        if (!raw) return NaN;

        const patterns = [
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/,
            /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?/,
            /\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?/
        ];

        for (const pattern of patterns) {
            const match = raw.match(pattern);
            if (!match) continue;
            const ts = parseTimestampMs(match[0]);
            if (Number.isFinite(ts)) return ts;
        }

        const atMatch = raw.match(/\bat\s+(.+)$/i);
        if (atMatch && atMatch[1]) {
            const ts = parseTimestampMs(atMatch[1].trim());
            if (Number.isFinite(ts)) return ts;
        }

        return NaN;
    }

    function findLastResolveFromDomTimeline() {
        const rootCandidates = [
            document.querySelector('main'),
            ...document.querySelectorAll(
                '[role="main"], [role="feed"], [role="log"], [aria-label*="timeline" i], [aria-label*="history" i], [aria-label*="activity" i], [data-testid*="timeline"], [data-testid*="history"], [data-testid*="activity"], [class*="timeline"], [class*="history"], [class*="activity"], [class*="event"], [class*="message"], [id*="timeline"], [id*="history"], [id*="activity"]'
            )
        ].filter(Boolean);

        if (rootCandidates.length === 0 && document.body) {
            rootCandidates.push(document.body);
        }

        const uniqueRoots = [];
        const seenRoots = new Set();
        for (const root of rootCandidates) {
            if (seenRoots.has(root)) continue;
            seenRoots.add(root);
            uniqueRoots.push(root);
        }

        if (uniqueRoots.length === 0) return null;

        const seen = new Set();
        const candidates = [];
        const MAX_SCANNED_NODES = 30000;
        const MAX_RESOLVED_CANDIDATES = 300;
        let scannedNodes = 0;

        scanRoots:
        for (const root of uniqueRoots) {
            const nodes = [root, ...root.querySelectorAll('li, div, p, span, td, article')];

            for (const node of nodes) {
                scannedNodes += 1;
                if (scannedNodes > MAX_SCANNED_NODES) {
                    logger.warn('DOM resolve fallback scan limit reached', {
                        scanned_nodes: scannedNodes,
                        resolved_candidates: candidates.length
                    });
                    break scanRoots;
                }

                const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
                if (!text || text.length < 10 || text.length > 500) continue;

                const normalized = normalizeTextForKey(text);
                if (seen.has(normalized)) continue;
                seen.add(normalized);

                if (
                    !/\bresolved?\b/.test(normalized) &&
                    !/\b(marked|set)\b.*\bresolved?\b/.test(normalized) &&
                    !/\bstatus\b.*\bresolved?\b/.test(normalized)
                ) {
                    continue;
                }

                const timestampMs = extractTimelineTimestampMs(text);
                if (!Number.isFinite(timestampMs)) continue;

                const resolvedByMatch = text.match(/resolved\s+by\s+(.+?)\s+(?:at|on)\b/i);
                const author = resolvedByMatch ? resolvedByMatch[1].trim() : 'Timeline';

                candidates.push({
                    timestamp_ms: timestampMs,
                    timestamp: new Date(timestampMs).toISOString(),
                    author,
                    text
                });

                if (candidates.length >= MAX_RESOLVED_CANDIDATES) {
                    break scanRoots;
                }
            }
        }

        if (!candidates.length) return null;

        candidates.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
        const last = candidates[candidates.length - 1];

        return {
            id: `dom-timeline-resolve:${last.timestamp_ms}`,
            timestamp: last.timestamp,
            time: last.timestamp,
            timestamp_ms: last.timestamp_ms,
            author: last.author || 'Timeline',
            email: '',
            text: last.text || 'Resolved (DOM timeline fallback)',
            event_type: 'resolve',
            status: 'resolved',
            raw_type: 'dom_timeline',
            source: 'dom.timeline',
            is_resolve: true,
            resolve_candidate: true,
            resolve_signals: ['dom_timeline_resolved'],
            resolve_debug: {
                action: 'resolved',
                source: 'dom.timeline'
            }
        };
    }

    function findLastResolve(normalizedEvents) {
        const resolveEvents = getResolveEvents(normalizedEvents);

        if (resolveEvents.length === 0) {
            const resolveCandidates = getResolveCandidateEvents(normalizedEvents);
            const preview = resolveCandidates.slice(0, 3).map(buildResolveDebugSample);

            logger.warn('No resolve event found in normalized events', {
                total_events: Array.isArray(normalizedEvents) ? normalizedEvents.length : 0,
                resolve_candidates: resolveCandidates.length,
                resolve_candidates_preview: preview
            });
            return null;
        }

        const lastResolve = resolveEvents[resolveEvents.length - 1];

        logger.log('Found last resolve event by max timestamp:', lastResolve);
        return lastResolve;
    }

    // Agent classification is static: listed emails are agents, any other email is treated as client.
    const AGENT_EMAILS = new Set([
        'i.letnikov@didlogic.com',
        'mike.pz@voiso.com',
        's.zholmakhanbet@voiso.com',
        'y.kumashev@voiso.com',
        'b.mohamed@voiso.com',
        'a.orazmukhamet@voiso.com',
        'g.aniate@voiso.com',
        'd.assetova@voiso.com'
    ]);

    function normalizeEmail(value) {
        return String(value || '').toLowerCase().trim();
    }

    function isAgentEmail(email) {
        const normalized = normalizeEmail(email);
        if (!normalized) return false;
        return AGENT_EMAILS.has(normalized);
    }

    function buildMessageStableKey(message) {
        return [
            `time:${parseTimestampMs(message.timestamp)}`,
            `email:${String(message.email || '').toLowerCase()}`,
            `text:${normalizeTextForKey(message.text)}`
        ].join('|');
    }

    function resolveMessageRoleByEmail(event) {
        const email = normalizeEmail(event?.email);
        if (!email) return { role: '', source: 'missing_email' };

        return isAgentEmail(email)
            ? { role: 'agent', source: 'agent_email_list' }
            : { role: 'client', source: 'non_agent_email' };
    }

    function findLastAgentEmail(normalizedEvents) {
        if (!Array.isArray(normalizedEvents) || normalizedEvents.length === 0) return '';

        // Ensure ascending order by timestamp so iterating backward gives the latest event.
        const sorted = [...normalizedEvents].sort((a, b) => {
            const aMs = Number.isFinite(a.timestamp_ms) ? a.timestamp_ms : 0;
            const bMs = Number.isFinite(b.timestamp_ms) ? b.timestamp_ms : 0;
            return aMs - bMs;
        });

        // Prefer the latest real chat-like message from known agent email.
        for (let i = sorted.length - 1; i >= 0; i--) {
            const event = sorted[i];
            const email = normalizeEmail(event?.email);
            if (!email || !isAgentEmail(email)) continue;
            const text = String(event?.text || '').trim();
            if (!text) continue;
            if (isSystemBannerText(text)) continue;
            return email;
        }

        // Fallback: latest agent event with email.
        for (let i = sorted.length - 1; i >= 0; i--) {
            const email = normalizeEmail(sorted[i]?.email);
            if (email && isAgentEmail(email)) return email;
        }

        return '';
    }

    function logRejectedMessageCandidate(event, reason, extra = {}) {
        logger.info(`Skip message candidate: ${reason}`, {
            id: event?.id || '',
            source: event?.source || '',
            timestamp: event?.timestamp || '',
            email: event?.email || '',
            direction: event?.direction || '',
            api_direction: event?.api_direction || '',
            dom_explicit_role: event?.dom_explicit_role || '',
            dom_side: event?.dom_side || '',
            role_source: extra.role_source || '',
            text_preview: String(event?.text || '').replace(/\s+/g, ' ').slice(0, 180)
        });
    }

    function filterClientMessagesByWindow(normalizedEvents, windowStartExclusiveMs, windowEndInclusiveMs) {
        if (!Array.isArray(normalizedEvents)) return [];

        const hasStartBoundary = Number.isFinite(windowStartExclusiveMs);
        const hasEndBoundary = Number.isFinite(windowEndInclusiveMs);
        const uniqueMessages = new Map();

        for (const event of normalizedEvents) {
            if (!Number.isFinite(event.timestamp_ms)) continue;
            if (hasStartBoundary && event.timestamp_ms <= windowStartExclusiveMs) {
                logRejectedMessageCandidate(event, 'before_resolve');
                continue;
            }
            if (hasEndBoundary && event.timestamp_ms > windowEndInclusiveMs) continue;

            const systemBanner = event.is_system_banner === true || isSystemBannerText(event.text);
            if (systemBanner) {
                logRejectedMessageCandidate(event, 'system_banner');
                continue;
            }

            // Priority 1: explicit r_source field from API
            let isClientMessage;
            let roleSource;
            if (event.api_role === 'customer') {
                isClientMessage = true;
                roleSource = 'api_role_customer';
            } else if (event.api_role === 'agent') {
                isClientMessage = false;
                roleSource = 'api_role_agent';
            } else {
                // Fallback: email-based role detection
                const role = resolveMessageRoleByEmail(event);
                isClientMessage = role.role === 'client';
                roleSource = role.source;
            }

            if (!isClientMessage) {
                logRejectedMessageCandidate(
                    event,
                    roleSource === 'missing_email' ? 'missing_email' : 'agent_email',
                    { role_source: roleSource }
                );
                continue;
            }

            if (!event.text) continue;

            const message = {
                timestamp: event.timestamp || new Date(event.timestamp_ms).toISOString(),
                text: event.text,
                email: normalizeEmail(event.email),
                author: event.author || event.email || 'Unknown',
                event_type: event.event_type,
                direction: event.direction || '',
                api_direction: event.api_direction || '',
                dom_explicit_role: event.dom_explicit_role || '',
                dom_side: event.dom_side || ''
            };

            const key = buildMessageStableKey(message);
            if (!uniqueMessages.has(key)) {
                uniqueMessages.set(key, message);
            }
        }

        return Array.from(uniqueMessages.values()).sort((a, b) =>
            parseTimestampMs(a.timestamp) - parseTimestampMs(b.timestamp)
        );
    }

    /**
     * Фильтровать клиентские сообщения после последнего resolve
     */
    function filterClientMessages(normalizedEvents, lastResolveEvent) {
        if (!Array.isArray(normalizedEvents) || !lastResolveEvent) return [];

        const resolveTimestamp = lastResolveEvent.timestamp_ms;
        if (!Number.isFinite(resolveTimestamp)) {
            logger.error('Invalid resolve timestamp:', lastResolveEvent.timestamp);
            return [];
        }

        const clientMessages = filterClientMessagesByWindow(
            normalizedEvents,
            resolveTimestamp,
            NaN
        );

        logger.log(`Found ${clientMessages.length} unique client messages after resolve`);
        return clientMessages;
    }

    /**
     * Новый алгоритм: найти сообщения клиента относительно последнего клиентского сообщения.
     * 1. Взять все клиентские сообщения (api_role или email-fallback), с непустым текстом.
     * 2. Если нет — вернуть пусто.
     * 3. T_last_client = timestamp последнего клиентского сообщения.
     * 4. T_boundary = timestamp последнего resolve строго до T_last_client.
     * 5. Если T_boundary есть — вернуть клиентские сообщения строго после T_boundary.
     * 6. Если resolve до последнего клиентского нет — вернуть все клиентские сообщения.
     * Returns { messages, boundaryResolveTs }
     */
    function findClientMessagesForContext(normalizedEvents) {
        if (!Array.isArray(normalizedEvents)) return { messages: [], boundaryResolveTs: null };

        // Step 1: Collect all client events (same role logic as filterClientMessagesByWindow)
        const allClientEvents = [];
        for (const event of normalizedEvents) {
            if (!Number.isFinite(event.timestamp_ms)) continue;
            if (event.is_system_banner === true || isSystemBannerText(event.text)) continue;
            if (!event.text) continue;
            let isClient;
            if (event.api_role === 'customer') {
                isClient = true;
            } else if (event.api_role === 'agent') {
                isClient = false;
            } else {
                const role = resolveMessageRoleByEmail(event);
                isClient = role.role === 'client';
            }
            if (isClient) allClientEvents.push(event);
        }

        // Step 2: No client messages → empty
        if (allClientEvents.length === 0) return { messages: [], boundaryResolveTs: null };

        // Step 3: T_last_client (normalizedEvents are pre-sorted, so last element is the latest)
        const tLastClient = allClientEvents[allClientEvents.length - 1].timestamp_ms;

        // Step 4: Find last resolve strictly before T_last_client
        let boundaryResolveTs = null;
        for (const ev of normalizedEvents) {
            if (ev.is_resolve && Number.isFinite(ev.timestamp_ms) && ev.timestamp_ms < tLastClient) {
                if (boundaryResolveTs === null || ev.timestamp_ms > boundaryResolveTs) {
                    boundaryResolveTs = ev.timestamp_ms;
                }
            }
        }

        // Step 5: Filter to events after boundary (or all if no boundary)
        const filteredEvents = boundaryResolveTs !== null
            ? allClientEvents.filter(ev => ev.timestamp_ms > boundaryResolveTs)
            : allClientEvents;

        // Step 6: Build message objects and deduplicate (same format as filterClientMessagesByWindow)
        const uniqueMessages = new Map();
        for (const event of filteredEvents) {
            const message = {
                timestamp: event.timestamp || new Date(event.timestamp_ms).toISOString(),
                text: event.text,
                email: normalizeEmail(event.email),
                author: event.author || event.email || 'Unknown',
                event_type: event.event_type,
                direction: event.direction || '',
                api_direction: event.api_direction || '',
                dom_explicit_role: event.dom_explicit_role || '',
                dom_side: event.dom_side || ''
            };
            const key = buildMessageStableKey(message);
            if (!uniqueMessages.has(key)) {
                uniqueMessages.set(key, message);
            }
        }

        const messages = Array.from(uniqueMessages.values()).sort((a, b) =>
            parseTimestampMs(a.timestamp) - parseTimestampMs(b.timestamp)
        );

        return { messages, boundaryResolveTs };
    }

    function buildNormalizedTicketContext(ticketData) {
        const repliesCount = getRepliesFromTicketData(ticketData).length;
        const domMessageHints = buildDomMessageHintsIndex();
        const normalizedEvents = normalizeEvents(ticketData, domMessageHints);
        const resolveEvents = getResolveEvents(normalizedEvents);
        const resolveCandidateEvents = getResolveCandidateEvents(normalizedEvents);
        let lastResolveEvent = findLastResolve(normalizedEvents);
        let domResolveFallbackUsed = false;

        if (!lastResolveEvent) {
            const domResolveEvent = findLastResolveFromDomTimeline();
            if (domResolveEvent) {
                lastResolveEvent = domResolveEvent;
                domResolveFallbackUsed = true;
                logger.info('Resolve found via DOM timeline fallback', buildResolveDebugSample(domResolveEvent));
            }
        }

        const { messages: clientMessages, boundaryResolveTs } = findClientMessagesForContext(normalizedEvents);
        const usedResolveEvent = boundaryResolveTs !== null
            ? (normalizedEvents.find(ev => ev.is_resolve && ev.timestamp_ms === boundaryResolveTs) || lastResolveEvent)
            : lastResolveEvent;

        const resolveCount = resolveEvents.length;
        const resolveDiagnostics = {
            total_events: normalizedEvents.length,
            resolve_candidates: resolveCandidateEvents.length,
            resolve_candidates_preview: resolveCandidateEvents.slice(0, 3).map(buildResolveDebugSample)
        };

        logger.info(
            `Diagnostics counters: replies=${repliesCount}, resolve=${resolveCount}, resolve_candidates=${resolveCandidateEvents.length}, selected_client_messages=${clientMessages.length}, boundary_resolve_ts=${boundaryResolveTs}, new_algo_used=true, dom_resolve_fallback=${domResolveFallbackUsed}`
        );

        return {
            normalized_events: normalizedEvents,
            last_resolve_event: lastResolveEvent,
            used_resolve_event: usedResolveEvent,
            dom_resolve_fallback_used: domResolveFallbackUsed,
            fallback_used: false,
            client_messages: clientMessages,
            resolve_diagnostics: resolveDiagnostics
        };
    }

    function isAttachmentMarkerLine(line) {
        const normalized = String(line || '').trim().toLowerCase();
        if (!normalized) return false;

        return /^\[?\s*attachments?\s*:?\s*\]?$/.test(normalized);
    }

    function sanitizeMessageTextForAi(rawText) {
        return String(rawText || '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !isAttachmentMarkerLine(line))
            .join('\n')
            .trim();
    }

    function normalizeAiAnswerFormatting(text) {
        return String(text || '')
            .split(/\r?\n/)
            .map(line => line.replace(/\*\*([^*\n]+)\*\*/g, '*$1*'))
            .join('\n')
            .trim();
    }

    /**
     * Сформировать formatted текст сообщений
     */
    function formatMessagesText(messages) {
        if (!Array.isArray(messages) || messages.length === 0) return '';

        return messages
            .map(msg => sanitizeMessageTextForAi(msg?.text))
            .filter(Boolean)
            .join('\n');
    }

    /**
     * Получить ticket ID из URL или данных
     */
    function getTicketId(ticketData) {
        // Способ 1: из URL
        const urlMatch = pageWindow.location.href.match(/tickets\/(\d+)/);
        if (urlMatch) return urlMatch[1];

        // Способ 2: только явные ticket-поля из payload
        const payloadTicketId = getTicketIdFromPayload(ticketData);
        if (payloadTicketId) return payloadTicketId;

        return 'unknown';
    }

    /**
     * Собрать все данные для preview
     */
    function collectPreviewData() {
        try {
            const ticketData = findTicketData();
            if (!ticketData) {
                return {
                    success: false,
                    error: 'Unable to load ticket data.'
                };
            }

            const normalizedContext = buildNormalizedTicketContext(ticketData);
            const lastResolve = normalizedContext.last_resolve_event;
            const clientMessages = normalizedContext.client_messages;

            if ((!lastResolve || !lastResolve.timestamp) && clientMessages.length === 0) {
                logger.warn('Resolve not found diagnostics', normalizedContext.resolve_diagnostics || {});
                return {
                    success: false,
                    error: 'The last resolve event was not found in ticket history.'
                };
            }

            if (clientMessages.length === 0) {
                return {
                    success: false,
                    warning: 'No new client messages after the last resolve.'
                };
            }

            const ticketId = getTicketId(ticketData);
            const usedResolveTime = normalizedContext.used_resolve_event?.timestamp || lastResolve?.timestamp || '';
            const fallbackUsed = normalizedContext.fallback_used === true;
            const lastAgentEmail = findLastAgentEmail(normalizedContext.normalized_events);
            const normalizedPayload = {
                ticket_id: ticketId,
                last_resolve_time: lastResolve?.timestamp || '',
                used_resolve_time: usedResolveTime,
                fallback_used: fallbackUsed,
                client_messages: clientMessages
            };

            return {
                success: true,
                ticket_id: ticketId,
                last_resolve_time: lastResolve?.timestamp || '',
                used_resolve_time: usedResolveTime,
                fallback_used: fallbackUsed,
                client_messages: clientMessages,
                last_agent_email: lastAgentEmail,
                formatted_text: formatMessagesText(clientMessages),
                normalized_payload: normalizedPayload,
                normalized_events: normalizedContext.normalized_events
            };
        } catch (e) {
            logger.error('Error collecting preview data', e);
            return {
                success: false,
                error: `Processing error: ${e.message}`
            };
        }
    }

    // ============================================================================
    // PANEL STYLES - стили для sticky-панели
    // ============================================================================
    const modalStyles = `
        #ai-bot-modal-overlay {
            position: fixed;
            top: 76px;
            right: 14px;
            width: min(460px, calc(100vw - 20px));
            z-index: 10000;
            font-family: system-ui, -apple-system, sans-serif;
            background: transparent;
            pointer-events: none;
        }

        #ai-bot-modal {
            background: white;
            border-radius: 10px;
            border: 1px solid #d9e1ea;
            box-shadow: 0 8px 30px rgba(15, 23, 42, 0.18);
            width: 100%;
            max-height: calc(100vh - 92px);
            display: flex;
            flex-direction: column;
            animation: slideIn 0.2s ease-out;
            pointer-events: auto;
            overflow: hidden;
        }

        @keyframes slideIn {
            from {
                transform: translateX(14px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        #ai-bot-modal-header {
            padding: 12px 14px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }

        #ai-bot-modal-header h2 {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: #333;
        }

        .ai-bot-panel-actions {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .ai-bot-panel-control {
            border: 1px solid #d0d7de;
            background: #fff;
            border-radius: 6px;
            color: #334155;
            font-size: 12px;
            font-weight: 600;
            padding: 5px 8px;
            cursor: pointer;
            line-height: 1;
            min-height: 28px;
        }

        .ai-bot-panel-control:hover {
            background: #f3f4f6;
        }

        #ai-bot-modal-close {
            min-width: 28px;
            width: 28px;
            padding: 0;
        }

        #ai-bot-modal.ai-bot-panel-collapsed #ai-bot-modal-content,
        #ai-bot-modal.ai-bot-panel-collapsed #ai-bot-modal-footer {
            display: none;
        }

        #ai-bot-modal.ai-bot-panel-collapsed #ai-bot-modal-header {
            border-bottom: none;
        }

        @media (max-width: 900px) {
            #ai-bot-modal-overlay {
                top: 64px;
                right: 8px;
                width: calc(100vw - 16px);
            }
        }

        #ai-bot-modal-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            color: #333;
            line-height: 1.6;
        }

        .ai-bot-section {
            margin-bottom: 24px;
        }

        .ai-bot-section-title {
            font-size: 14px;
            font-weight: 600;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 10px;
            letter-spacing: 0.5px;
        }

        .ai-bot-formatted-text {
            background-color: #f5f5f5;
            border-left: 3px solid #007bff;
            padding: 12px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 13px;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-x: auto;
        }

        .ai-bot-json {
            background-color: #f5f5f5;
            border-left: 3px solid #28a745;
            padding: 12px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-x: auto;
            max-height: 300px;
        }

        .ai-bot-answer {
            background-color: #f8f9fa;
            border-left: 3px solid #007bff;
            padding: 12px;
            border-radius: 4px;
            white-space: pre-wrap;
            word-wrap: break-word;
            max-height: 320px;
            overflow-y: auto;
        }

        .ai-bot-answer.ai-bot-answer-fallback {
            background-color: #fff3cd;
            border-left: 3px solid #ffc107;
            color: #856404;
        }

        .ai-bot-error {
            background-color: #fff3cd;
            border-left: 3px solid #ffc107;
            padding: 12px;
            border-radius: 4px;
            color: #856404;
        }

        .ai-bot-warning {
            background-color: #d1ecf1;
            border-left: 3px solid #17a2b8;
            padding: 12px;
            border-radius: 4px;
            color: #0c5460;
        }

        #ai-bot-modal-footer {
            padding: 16px 20px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }

        .ai-bot-button {
            padding: 8px 16px;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            background: white;
            color: #333;
        }

        .ai-bot-button:hover {
            background-color: #f0f0f0;
            border-color: #bbb;
        }

        .ai-bot-button-primary {
            background-color: #007bff;
            color: white;
            border-color: #007bff;
        }

        .ai-bot-button-primary:hover {
            background-color: #0056b3;
            border-color: #0056b3;
        }

        /* Textarea styling */
        .ai-bot-textarea {
            width: 100%;
            padding: 12px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 13px;
            border: 1px solid #ddd;
            border-radius: 4px;
            resize: vertical;
            min-height: 250px;
            color: #333;
            line-height: 1.5;
            box-sizing: border-box;
        }

        .ai-bot-textarea:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
        }

        .ai-bot-error-message {
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 12px;
        }

        /* Scrollbar styling */
        #ai-bot-modal-content::-webkit-scrollbar {
            width: 8px;
        }

        #ai-bot-modal-content::-webkit-scrollbar-track {
            background: #f1f1f1;
        }

        #ai-bot-modal-content::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 4px;
        }

        #ai-bot-modal-content::-webkit-scrollbar-thumb:hover {
            background: #555;
        }

        .ai-bot-rating-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 8px;
        }

        .ai-bot-rating-button {
            padding: 7px 12px;
            border: 1px solid #d0d7de;
            border-radius: 6px;
            cursor: pointer;
            background: #fff;
            color: #333;
            font-size: 13px;
        }

        .ai-bot-rating-button:hover {
            background: #f3f4f6;
        }

        .ai-bot-rating-button.ai-bot-rating-active {
            border-color: #007bff;
            background: #e8f1ff;
            color: #004fa6;
        }

        .ai-bot-rating-form {
            margin-top: 12px;
        }

        .ai-bot-rating-form label {
            display: block;
            margin-bottom: 6px;
            font-size: 12px;
            color: #555;
        }

        .ai-bot-rating-form-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .ai-bot-rating-input {
            flex: 1;
            min-width: 220px;
            padding: 8px 10px;
            border: 1px solid #d0d7de;
            border-radius: 6px;
            font-size: 13px;
            color: #333;
        }

        .ai-bot-rating-status {
            margin-top: 8px;
            font-size: 12px;
            color: #0c5460;
            display: none;
        }

        #ai-bot-inject-button {
            padding: 6px 10px;
            margin: 0 0 6px 0;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            position: relative;
            white-space: nowrap;
            min-width: 108px;
            min-height: 30px;
        }

        #ai-bot-inject-button:hover:not(:disabled) {
            background-color: #0056b3;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        #ai-bot-inject-button:disabled {
            opacity: 0.85;
            cursor: default;
        }

        #ai-bot-inject-button.ai-bot-help-success {
            background-color: #198754;
        }

        #ai-bot-inject-button.ai-bot-help-error {
            background-color: #dc3545;
        }

        #ai-bot-inject-button.ai-bot-help-loading {
            background: #0d6efd;
            animation: ai-bot-pulse 1.2s ease-in-out infinite;
        }

        @keyframes ai-bot-pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.5; }
        }

        .ai-bot-loading-section {
            display: none;
            background: #eef5ff;
            border: 1px dashed #98b9ff;
            border-radius: 8px;
            padding: 12px;
            color: #1e3a8a;
        }

        .ai-bot-loading-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .ai-bot-loading-note {
            font-size: 12px;
            color: #334155;
        }

    `;

    const AI_HELP_BUTTON_ID = 'ai-bot-inject-button';
    const AI_HELP_BUTTON_LABEL = 'AI BOT';
    const AI_HELP_BUTTON_STATE = {
        IDLE: 'idle',
        LOADING: 'loading',
        SUCCESS: 'success',
        ERROR: 'error'
    };
    let aiHelpButtonCurrentState = AI_HELP_BUTTON_STATE.IDLE;
    let aiHelpButtonResetTimer = null;
    let aiHelpButtonMotionRafId = null;

    function logPhase(phase, data = {}) {
        logger.info(phase, data);
    }

    function clearAiHelpButtonResetTimer() {
        if (aiHelpButtonResetTimer) {
            clearTimeout(aiHelpButtonResetTimer);
            aiHelpButtonResetTimer = null;
        }
    }

    function getAiHelpButtonElement() {
        return document.getElementById(AI_HELP_BUTTON_ID);
    }

    function clearAiHelpButtonMotionFrame() {
        if (aiHelpButtonMotionRafId) {
            cancelAnimationFrame(aiHelpButtonMotionRafId);
            aiHelpButtonMotionRafId = null;
        }
    }

    function stopAiHelpButtonMotion(button = getAiHelpButtonElement()) {
        clearAiHelpButtonMotionFrame();
        if (!button) return;
        button.removeAttribute('data-ai-bot-motion');
    }

    function startAiHelpButtonMotion(button) {
        if (!button) return;
        // Pulse animation is handled entirely via CSS @keyframes ai-bot-pulse.
        // No JS animation loop needed.
        button.setAttribute('data-ai-bot-motion', 'active');
    }

    function renderAiHelpButtonState(button, state) {
        if (!button) return;

        button.classList.remove('ai-bot-help-loading', 'ai-bot-help-success', 'ai-bot-help-error');
        button.removeAttribute('aria-busy');
        button.textContent = AI_HELP_BUTTON_LABEL;

        if (state === AI_HELP_BUTTON_STATE.LOADING) {
            button.disabled = true;
            button.classList.add('ai-bot-help-loading');
            button.setAttribute('aria-busy', 'true');
            startAiHelpButtonMotion(button);
            return;
        }

        stopAiHelpButtonMotion(button);
        button.disabled = false;

        if (state === AI_HELP_BUTTON_STATE.SUCCESS) {
            button.classList.add('ai-bot-help-success');
            return;
        }

        if (state === AI_HELP_BUTTON_STATE.ERROR) {
            button.classList.add('ai-bot-help-error');
        }
    }

    function setAiHelpButtonState(state, options = {}) {
        const nextState = String(state || AI_HELP_BUTTON_STATE.IDLE);
        const button = getAiHelpButtonElement();
        aiHelpButtonCurrentState = nextState;
        clearAiHelpButtonResetTimer();
        renderAiHelpButtonState(button, nextState);

        const resetAfterMs = Number(options.resetAfterMs || 0);
        if (resetAfterMs > 0 && nextState !== AI_HELP_BUTTON_STATE.IDLE) {
            aiHelpButtonResetTimer = setTimeout(() => {
                setAiHelpButtonState(AI_HELP_BUTTON_STATE.IDLE);
            }, resetAfterMs);
        }
    }

    async function copyTextToClipboardSafe(text) {
        const value = String(text || '');
        if (!value) throw new Error('empty');

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(value);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
            throw new Error('copy-failed');
        }
    }

    const WIDGET_STATE_CACHE_BY_TICKET_ID = new Map();

    // ============================================================================
    // PANEL CLASS - единый sticky-panel flow
    // ============================================================================
    class BotPreviewModal {
        constructor() {
            this.overlay = null;
            this.modal = null;
            this.data = null;
            this.ticketId = 'unknown';
            this.editedContent = '';
            this.cachedAiAnswer = '';
            this.selectedRating = '';
            this.pendingRating = '';
            this.ratingSubject = '';
            this.lastRequestForAi = '';
            this.lastResponseForAi = '';
            this.lastAgentEmail = '';
            this.escapeListener = null;
            this.typingEffectTimer = null;
            this.requestAbortController = null;
            this.isCollapsed = false;
            this.isSubmitInFlight = false;
            this.isFeedbackInFlight = false;
        }

        getCachedTicketState(ticketId = this.ticketId) {
            const key = String(ticketId || 'unknown');
            return WIDGET_STATE_CACHE_BY_TICKET_ID.get(key) || {
                edited_content: '',
                ai_answer: '',
                rating: '',
                subject: '',
                last_request: '',
                last_response: '',
                last_agent_email: ''
            };
        }

        saveCachedTicketState(partial = {}) {
            const key = String(this.ticketId || 'unknown');
            const current = this.getCachedTicketState(key);
            const next = { ...current, ...partial };
            WIDGET_STATE_CACHE_BY_TICKET_ID.set(key, next);
            return next;
        }

        restoreStateFromCache(data) {
            this.ticketId = String(data?.ticket_id || 'unknown');
            const hasCachedState = WIDGET_STATE_CACHE_BY_TICKET_ID.has(this.ticketId);
            const cached = this.getCachedTicketState(this.ticketId);

            this.editedContent = (hasCachedState && typeof cached.edited_content === 'string')
                ? cached.edited_content
                : String(data?.formatted_text || '');
            this.cachedAiAnswer = (hasCachedState && typeof cached.ai_answer === 'string') ? cached.ai_answer : '';
            this.selectedRating = (hasCachedState && typeof cached.rating === 'string') ? cached.rating : '';
            this.ratingSubject = (hasCachedState && typeof cached.subject === 'string') ? cached.subject : '';
            this.lastRequestForAi = (hasCachedState && typeof cached.last_request === 'string') ? cached.last_request : '';
            this.lastResponseForAi = (hasCachedState && typeof cached.last_response === 'string')
                ? cached.last_response
                : this.cachedAiAnswer;
            // Always prefer fresh agent email derived from live normalized events.
            // Cache is only used as a last resort when live data yields nothing.
            const incomingAgentEmail = normalizeEmail(
                findLastAgentEmail(data?.normalized_events) ||
                data?.last_agent_email
            );
            this.lastAgentEmail = incomingAgentEmail || (
                hasCachedState && typeof cached.last_agent_email === 'string'
                    ? normalizeEmail(cached.last_agent_email)
                    : ''
            );
            this.pendingRating = (this.selectedRating === 'not_great' || this.selectedRating === 'bad')
                ? this.selectedRating
                : '';

            this.saveCachedTicketState({
                edited_content: this.editedContent,
                ai_answer: this.cachedAiAnswer,
                rating: this.selectedRating,
                subject: this.ratingSubject,
                last_request: this.lastRequestForAi,
                last_response: this.lastResponseForAi,
                last_agent_email: this.lastAgentEmail
            });
        }

        setCollapsed(collapsed) {
            this.isCollapsed = Boolean(collapsed);
            if (this.modal) {
                this.modal.classList.toggle('ai-bot-panel-collapsed', this.isCollapsed);
            }

            const toggleButton = document.getElementById('ai-bot-panel-toggle');
            if (toggleButton) {
                toggleButton.textContent = this.isCollapsed ? 'Expand' : 'Collapse';
                toggleButton.setAttribute('aria-pressed', this.isCollapsed ? 'true' : 'false');
            }
        }

        toggleCollapsed() {
            this.setCollapsed(!this.isCollapsed);
        }

        stopTypingEffect() {
            if (this.typingEffectTimer) {
                clearInterval(this.typingEffectTimer);
                this.typingEffectTimer = null;
            }
        }

        abortActiveRequest() {
            if (this.requestAbortController) {
                try {
                    this.requestAbortController.abort();
                } catch (e) {}
                this.requestAbortController = null;
            }
        }

        setSubmitButtonState(submitBtn, state) {
            if (!submitBtn) return;

            if (state === 'loading') {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Generating...';
                return;
            }

            submitBtn.disabled = false;
            submitBtn.textContent = 'Get Answer from AI Bot';
        }

        setLoadingLayout(loading) {
            const isLoading = Boolean(loading);
            const inputSection = document.getElementById('ai-bot-input-section');
            const loadingSection = document.getElementById('ai-bot-loading-section');

            if (inputSection) {
                inputSection.style.display = isLoading ? 'none' : 'block';
            }

            if (loadingSection) {
                loadingSection.style.display = isLoading ? 'block' : 'none';
            }
        }

        showError(errorContainer, errorMessage, message) {
            if (errorMessage) {
                errorMessage.textContent = String(message || 'An unexpected error occurred.');
            }
            if (errorContainer) {
                errorContainer.style.display = 'block';
            }
        }

        hideError(errorContainer) {
            if (errorContainer) {
                errorContainer.style.display = 'none';
            }
        }

        setRatingSectionVisibility(visible) {
            const ratingSection = document.getElementById('ai-bot-rating-section');
            if (!ratingSection) return;
            ratingSection.style.display = visible ? 'block' : 'none';
        }

        setRatingButtonsState(activeRating) {
            const scopeNode = this.modal || document;
            const buttons = scopeNode.querySelectorAll('.ai-bot-rating-button');
            buttons.forEach(button => {
                const isActive = button.getAttribute('data-rating') === activeRating;
                button.classList.toggle('ai-bot-rating-active', isActive);
            });
        }

        setRatingFormVisibility(visible) {
            const ratingForm = document.getElementById('ai-bot-rating-form');
            if (!ratingForm) return;
            ratingForm.style.display = visible ? 'block' : 'none';
        }

        setRatingStatus(message) {
            const statusNode = document.getElementById('ai-bot-rating-status');
            if (!statusNode) return;

            const text = String(message || '').trim();
            if (!text) {
                statusNode.style.display = 'none';
                statusNode.textContent = '';
                return;
            }

            statusNode.textContent = text;
            statusNode.style.display = 'block';
        }

        clearAiAnswer(answerSection, answerContent) {
            this.stopTypingEffect();
            if (answerContent) {
                answerContent.textContent = '';
            }
            if (answerSection) {
                answerSection.style.display = 'none';
            }

            this.setRatingSectionVisibility(false);
            this.setRatingStatus('');
        }

        isAiFallbackResponse(text) {
            const lower = String(text || '').toLowerCase();
            return AI_FALLBACK_RESPONSE_MARKERS.some(marker => lower.includes(marker));
        }

        renderAiAnswer(answerSection, answerContent, text) {
            if (!answerSection || !answerContent) return;

            const answer = String(text || '');
            const isFallback = this.isAiFallbackResponse(answer);
            answerSection.style.display = 'block';
            // If fallback response — hide rating section, style as warning
            this.setRatingSectionVisibility(!isFallback && answer.length > 0);
            answerContent.classList.toggle('ai-bot-answer-fallback', isFallback);
            this.setRatingStatus('');
            this.cachedAiAnswer = answer;
            this.lastResponseForAi = answer;
            this.saveCachedTicketState({
                ai_answer: answer,
                last_response: this.lastResponseForAi
            });

            this.stopTypingEffect();

            if (
                !AI_TYPING_EFFECT_ENABLED ||
                answer.length === 0 ||
                answer.length > AI_TYPING_EFFECT_MAX_CHARS
            ) {
                answerContent.textContent = answer;
                return;
            }

            answerContent.textContent = '';
            let index = 0;
            this.typingEffectTimer = setInterval(() => {
                if (!document.body.contains(answerContent)) {
                    this.stopTypingEffect();
                    return;
                }

                index += AI_TYPING_EFFECT_SPEED_MULTIPLIER;
                answerContent.textContent = answer.slice(0, index);

                if (index >= answer.length) {
                    this.stopTypingEffect();
                }
            }, AI_TYPING_EFFECT_INTERVAL_MS);
        }

        async copyTextToClipboard(text) {
            await copyTextToClipboardSafe(text);
        }

        resolveAgentEmailForFeedback() {
            const fromState = normalizeEmail(this.lastAgentEmail);
            if (fromState) return fromState;

            const fromData = normalizeEmail(
                this.data?.last_agent_email ||
                findLastAgentEmail(this.data?.normalized_events)
            );
            if (!fromData) return '';

            this.lastAgentEmail = fromData;
            this.saveCachedTicketState({ last_agent_email: fromData });
            return fromData;
        }

        buildFeedbackPayload(feedback, subject, responseText) {
            const feedbackValue = String(feedback || '').trim().toLowerCase();
            const subjectValue = String(subject || '').trim();
            const requestText = String(this.lastRequestForAi || '');
            const responseValue = responseText !== undefined && responseText !== null
                ? String(responseText)
                : String(this.lastResponseForAi || this.cachedAiAnswer || '');
            const ticketId = String(this.ticketId || this.data?.ticket_id || 'unknown');
            const agentEmail = this.resolveAgentEmailForFeedback();

            return {
                ticket_id: ticketId,
                agent: agentEmail,
                request: requestText,
                response: responseValue,
                feedback: feedbackValue,
                subject: subjectValue
            };
        }

        async sendFeedbackToSpreadsheet(payload) {
            const feedbackEndpoint = getFeedbackEndpoint();
            if (!feedbackEndpoint) {
                throw new Error('Feedback endpoint was not found. Set localStorage["voiso_feedback_endpoint"].');
            }

            const tmRequestFn = getTampermonkeyRequestFn();
            const headers = {
                'Content-Type': 'application/json'
            };

            let responseStatus = 0;
            let responseText = '';

            if (tmRequestFn) {
                try {
                    const tmResponse = await new Promise((resolve, reject) => {
                        tmRequestFn({
                            method: 'POST',
                            url: feedbackEndpoint,
                            headers,
                            data: JSON.stringify(payload),
                            timeout: FEEDBACK_REQUEST_TIMEOUT_MS,
                            onload: resolve,
                            onerror: () => reject(new Error('network')),
                            ontimeout: () => reject(new Error('timeout')),
                            onabort: () => reject(new Error('aborted'))
                        });
                    });

                    responseStatus = Number(tmResponse?.status) || 0;
                    responseText = String(tmResponse?.responseText || '');
                } catch (error) {
                    if (error && (error.message === 'timeout' || error.name === 'timeout')) {
                        throw new Error('Feedback request timed out.');
                    }
                    if (error && (error.message === 'aborted' || error.name === 'AbortError')) {
                        throw new Error('Feedback request was cancelled.');
                    }
                    throw new Error('Network error while sending feedback.');
                }
            } else {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), FEEDBACK_REQUEST_TIMEOUT_MS);

                try {
                    const response = await originalFetch(feedbackEndpoint, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    });

                    responseStatus = Number(response.status) || 0;
                    responseText = await response.text();
                } catch (error) {
                    if (error && error.name === 'AbortError') {
                        throw new Error('Feedback request timed out.');
                    }
                    throw new Error('Network error while sending feedback.');
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            if (responseStatus < 200 || responseStatus >= 300) {
                const backendMessage = String(responseText || '').trim();
                if (backendMessage) {
                    throw new Error(`Feedback server returned HTTP ${responseStatus}: ${backendMessage}`);
                }
                throw new Error(`Feedback server returned HTTP ${responseStatus}.`);
            }
        }

        async submitAgentFeedback(feedback, subject, responseText, options = {}) {
            const feedbackValue = String(feedback || '').trim().toLowerCase();
            const subjectValue = String(subject || '').trim();

            const silent = options.silent === true;
            if (!['good', 'not_great', 'bad', 'error'].includes(feedbackValue)) {
                if (!silent) this.setRatingStatus('Unknown feedback value.');
                return false;
            }

            if ((feedbackValue === 'not_great' || feedbackValue === 'bad') && !subjectValue && !silent) {
                this.setRatingStatus('Please enter a subject.');
                return false;
            }

            if (this.isFeedbackInFlight) {
                this.setRatingStatus('Feedback is already being sent...');
                return false;
            }

            const payload = this.buildFeedbackPayload(feedbackValue, subjectValue, responseText);
            if (!String(payload.agent || '').trim()) {
                if (!silent) this.setRatingStatus('Feedback cannot be sent: agent email was not found.');
                return false;
            }
            if (!String(payload.request || '').trim()) {
                if (!silent) this.setRatingStatus('Feedback cannot be sent: request is missing.');
                return false;
            }
            if (!String(payload.response || '').trim()) {
                this.setRatingStatus('Feedback cannot be sent: response is missing.');
                return false;
            }

            this.isFeedbackInFlight = true;
            this.setRatingStatus('Sending feedback...');
            logPhase('feedback_submit_start', {
                ticket_id: payload.ticket_id,
                feedback: payload.feedback
            });

            try {
                await this.sendFeedbackToSpreadsheet(payload);

                this.selectedRating = feedbackValue;
                this.pendingRating = feedbackValue === 'not_great' || feedbackValue === 'bad'
                    ? feedbackValue
                    : '';
                this.ratingSubject = subjectValue;
                this.lastRequestForAi = payload.request;
                this.lastResponseForAi = payload.response;
                this.lastAgentEmail = payload.agent;

                this.saveCachedTicketState({
                    rating: feedbackValue,
                    subject: subjectValue,
                    last_request: this.lastRequestForAi,
                    last_response: this.lastResponseForAi,
                    last_agent_email: this.lastAgentEmail
                });

                logPhase('feedback_submit_success', {
                    ticket_id: payload.ticket_id,
                    feedback: payload.feedback
                });
                this.setRatingStatus(String(options.successMessage || 'Feedback sent successfully.'));
                return true;
            } catch (error) {
                logger.error('Feedback submit failed', {
                    ticket_id: payload.ticket_id,
                    feedback: payload.feedback,
                    error: String(error?.message || error)
                });
                logPhase('feedback_submit_failed', {
                    ticket_id: payload.ticket_id,
                    feedback: payload.feedback,
                    error: String(error?.message || error)
                });
                this.setRatingStatus(String(error?.message || 'Failed to send feedback.'));
                return false;
            } finally {
                this.isFeedbackInFlight = false;
            }
        }

        buildAiRequestBody(finalPayload, apiKey = '') {
            const ticketId = String(finalPayload?.ticket_id || 'unknown');
            const contentForAi = typeof finalPayload?.content_for_ai === 'string'
                ? finalPayload.content_for_ai
                : '';
            // user_api_token: explicit token if set, otherwise fall back to the Bearer API key
            const userApiToken = getAiUserApiToken() || apiKey;

            const body = {
                session_id: `voiso-ticket-${ticketId}`,
                messages: [
                    {
                        content: { text: contentForAi },
                        direction: 'inbound'
                    }
                ],
                variables: {}
            };

            if (userApiToken) {
                body.variables.user_api_token = userApiToken;
            }

            return body;
        }

        extractAiAnswerText(responseData) {
            if (!responseData || typeof responseData !== 'object') return '';

            const choices = Array.isArray(responseData.choices) ? responseData.choices : [];
            const directCandidates = [
                responseData.output_text,
                responseData.answer,
                responseData.text,
                responseData.message?.content,
                responseData.result?.answer,
                responseData.result?.text
            ];

            for (const candidate of directCandidates) {
                const directText = this.extractTextFromContent(candidate);
                if (directText) return directText;
            }

            const messageContent = choices[0]?.message?.content;
            const deltaContent = choices
                .map(choice => this.extractTextFromContent(choice?.delta?.content))
                .filter(Boolean)
                .join('');
            if (deltaContent) return deltaContent.trim();

            if (messageContent !== undefined) {
                const messageText = this.extractTextFromContent(messageContent);
                if (messageText) return messageText;
            }

            const messages = Array.isArray(responseData.messages) ? responseData.messages : [];
            for (let i = messages.length - 1; i >= 0; i--) {
                const messageText = this.extractTextFromContent(messages[i]?.content);
                if (messageText) return messageText;
            }

            return '';
        }

        extractTextFromContent(content) {
            if (typeof content === 'string') return content.trim();
            if (!content) return '';

            if (Array.isArray(content)) {
                return content
                    .map(part => this.extractTextFromContent(part))
                    .filter(Boolean)
                    .join('\n')
                    .trim();
            }

            if (typeof content === 'object') {
                const nestedCandidates = [
                    content.text,
                    content.value,
                    content.content,
                    content.output_text,
                    content.answer,
                    content.delta?.content
                ];

                for (const candidate of nestedCandidates) {
                    const nested = this.extractTextFromContent(candidate);
                    if (nested) return nested;
                }
            }

            return '';
        }

        createAiStreamAccumulator() {
            return {
                line_buffer: '',
                accumulated_text: ''
            };
        }

        resetAiStreamAccumulator(accumulator) {
            if (!accumulator || typeof accumulator !== 'object') return;
            accumulator.line_buffer = '';
            accumulator.accumulated_text = '';
        }

        mergeAiStreamPiece(accumulator, piece) {
            const textPiece = String(piece || '');
            if (!textPiece || !accumulator) return;

            if (!accumulator.accumulated_text) {
                accumulator.accumulated_text = textPiece;
                return;
            }

            if (textPiece.startsWith(accumulator.accumulated_text)) {
                // Some backends stream full snapshots instead of token deltas.
                accumulator.accumulated_text = textPiece;
                return;
            }

            if (!accumulator.accumulated_text.endsWith(textPiece)) {
                accumulator.accumulated_text += textPiece;
            }
        }

        consumeAiStreamChunk(chunk, accumulator, options = {}) {
            if (!accumulator || typeof accumulator !== 'object') return '';

            const flush = options.flush === true;
            const chunkText = String(chunk || '');
            if (!chunkText && !flush) {
                return String(accumulator.accumulated_text || '');
            }

            accumulator.line_buffer += chunkText;
            const lines = accumulator.line_buffer.split(/\r?\n/);

            if (flush) {
                accumulator.line_buffer = '';
            } else {
                accumulator.line_buffer = lines.pop() || '';
            }

            for (const line of lines) {
                const trimmed = String(line || '').trim();
                if (!trimmed) continue;

                const payload = trimmed.startsWith('data:')
                    ? trimmed.replace(/^data:\s*/, '')
                    : trimmed;

                if (!payload || payload === '[DONE]') continue;

                const parsed = safeJsonParse(payload);
                if (!parsed) continue;

                const piece = this.extractAiAnswerText(parsed);
                this.mergeAiStreamPiece(accumulator, piece);
            }

            return String(accumulator.accumulated_text || '');
        }

        extractAiAnswerTextFromRawResponse(rawResponseText) {
            const raw = String(rawResponseText || '').trim();
            if (!raw) return '';

            const directParsed = safeJsonParse(raw);
            if (directParsed) {
                return this.extractAiAnswerText(directParsed);
            }

            const lines = raw.split(/\r?\n/);
            let streamAccumulatedText = '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const payload = trimmed.startsWith('data:')
                    ? trimmed.replace(/^data:\s*/, '')
                    : trimmed;

                if (!payload || payload === '[DONE]') continue;

                const parsed = safeJsonParse(payload);
                if (!parsed) continue;

                const piece = this.extractAiAnswerText(parsed);
                if (piece) {
                    if (!streamAccumulatedText) {
                        streamAccumulatedText = piece;
                    } else if (piece.startsWith(streamAccumulatedText)) {
                        // Some backends stream full snapshots instead of token deltas.
                        streamAccumulatedText = piece;
                    } else if (!streamAccumulatedText.endsWith(piece)) {
                        streamAccumulatedText += piece;
                    }
                }
            }

            if (streamAccumulatedText.trim()) {
                return streamAccumulatedText.trim();
            }

            return '';
        }

        async requestAiAnswer(finalPayload) {
            const apiKey = getAiApiKey();
            if (!apiKey) {
                throw new Error(
                    'API key was not found. Set window.VOISO_AI_API_KEY or localStorage["voiso_ai_api_key"].'
                );
            }

            const requestBody = this.buildAiRequestBody(finalPayload, apiKey);
            const requestStartedAt = Date.now();
            const timeoutSeconds = Math.round(AI_REQUEST_TIMEOUT_MS / 1000);
            logPhase('ai_request_start', {
                endpoint: AI_CHAT_ENDPOINT,
                session_id: requestBody.session_id
            });
            logger.info('AI request started', {
                endpoint: AI_CHAT_ENDPOINT,
                session_id: requestBody.session_id,
                has_user_api_token: Boolean(requestBody.variables.user_api_token)
            });

            const headers = {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            };

            const curlCommand = [
                `curl -X POST '${AI_CHAT_ENDPOINT}'`,
                `  -H 'Authorization: Bearer ${apiKey}'`,
                `  -H 'Content-Type: application/json'`,
                `  --data-raw '${JSON.stringify(requestBody).replace(/'/g, "'\\''")}'`
            ].join(' \\\n');
            logger.info('AI request CURL equivalent:\n' + curlCommand);

            let responseStatus = 0;
            let responseOk = false;
            let responseText = '';
            let responseContentType = '';

            const tmRequestFn = getTampermonkeyRequestFn();

            if (tmRequestFn) {
                try {
                    let partialResponseText = '';
                    let partialAnswer = '';
                    let processedProgressLength = 0;
                    const streamAccumulator = this.createAiStreamAccumulator();
                    const tmResponse = await new Promise((resolve, reject) => {
                        const requestHandle = tmRequestFn({
                            method: 'POST',
                            url: AI_CHAT_ENDPOINT,
                            headers,
                            data: JSON.stringify(requestBody),
                            timeout: AI_REQUEST_TIMEOUT_MS,
                            onload: resolve,
                            onerror: (err) => {
                                logger.error('GM_xmlhttpRequest onerror', {
                                    status: err?.status,
                                    statusText: err?.statusText,
                                    error: String(err?.error || ''),
                                    responseText: String(err?.responseText || '').slice(0, 300)
                                });
                                const errMsg = String(err?.error || err?.statusText || 'unknown');
                                reject(new Error('Network error: ' + errMsg));
                            },
                            onprogress: event => {
                                const nextResponseText = String(event?.responseText || partialResponseText || '');
                                if (!nextResponseText) return;

                                if (nextResponseText.length < processedProgressLength) {
                                    processedProgressLength = 0;
                                    this.resetAiStreamAccumulator(streamAccumulator);
                                }

                                const deltaChunk = nextResponseText.slice(processedProgressLength);
                                processedProgressLength = nextResponseText.length;
                                partialResponseText = nextResponseText;

                                if (!deltaChunk) return;
                                const incrementalAnswer = normalizeAiAnswerFormatting(
                                    this.consumeAiStreamChunk(deltaChunk, streamAccumulator)
                                );
                                if (incrementalAnswer) {
                                    partialAnswer = incrementalAnswer;
                                }
                            },
                            ontimeout: () => {
                                const elapsed = Date.now() - requestStartedAt;
                                logger.error('GM_xmlhttpRequest ontimeout', {
                                    elapsed_ms: elapsed,
                                    timeout_ms: AI_REQUEST_TIMEOUT_MS
                                });
                                const timeoutError = new Error('timeout');
                                timeoutError.partial_response_text = partialResponseText;
                                timeoutError.partial_answer = partialAnswer;
                                reject(timeoutError);
                            },
                            onabort: () => reject(new Error('aborted'))
                        });

                        this.requestAbortController = requestHandle || null;
                    });

                    responseStatus = Number(tmResponse?.status) || 0;
                    responseOk = responseStatus >= 200 && responseStatus < 300;
                    responseText = String(tmResponse?.responseText || '') || partialResponseText;
                    const tmHeaders = String(tmResponse?.responseHeaders || '');
                    const tmContentType = tmHeaders.match(/content-type:\s*([^\r\n;]+)/i);
                    responseContentType = tmContentType ? tmContentType[1].trim() : '';
                } catch (error) {
                    if (error && (error.message === 'timeout' || error.name === 'timeout')) {
                        const partialResponseText = String(error?.partial_response_text || '');
                        const fallbackAnswer = normalizeAiAnswerFormatting(
                            String(error?.partial_answer || '') ||
                            this.extractAiAnswerTextFromRawResponse(partialResponseText)
                        );
                        const elapsedMs = Date.now() - requestStartedAt;

                        logger.error('AI request timed out', {
                            session_id: requestBody.session_id,
                            elapsed_ms: elapsedMs,
                            status: responseStatus,
                            response_text_length: partialResponseText.length
                        });

                        if (fallbackAnswer) {
                            logger.warn('Timeout reached but answer was recovered from partial response', {
                                session_id: requestBody.session_id,
                                answer_length: fallbackAnswer.length
                            });
                            logPhase('ai_request_success', {
                                session_id: requestBody.session_id,
                                answer_length: fallbackAnswer.length,
                                recovered_after_timeout: true
                            });
                            return fallbackAnswer;
                        }

                        throw new Error(`AI request timed out after ${timeoutSeconds} seconds.`);
                    }
                    if (error && (error.message === 'aborted' || error.name === 'AbortError')) {
                        throw new Error('The AI request was cancelled.');
                    }
                    // Preserve network error details from onerror handler
                    if (error && error.message && error.message.startsWith('Network error:')) {
                        throw error;
                    }
                    throw new Error('Network error while requesting AI (endpoint may be unavailable).');
                } finally {
                    this.requestAbortController = null;
                }
            } else {
                const controller = new AbortController();
                this.requestAbortController = controller;
                const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
                let partialResponseText = '';
                let partialAnswer = '';
                const streamAccumulator = this.createAiStreamAccumulator();

                try {
                    const response = await originalFetch(AI_CHAT_ENDPOINT, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(requestBody),
                        signal: controller.signal
                    });

                    responseStatus = response.status;
                    responseOk = response.ok;
                    responseContentType = String(response.headers?.get('content-type') || '');

                    if (response.body && typeof response.body.getReader === 'function') {
                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            const decodedChunk = decoder.decode(value, { stream: true });
                            partialResponseText += decodedChunk;
                            const incrementalAnswer = normalizeAiAnswerFormatting(
                                this.consumeAiStreamChunk(decodedChunk, streamAccumulator)
                            );
                            if (incrementalAnswer) {
                                partialAnswer = incrementalAnswer;
                            }
                        }

                        const trailingChunk = decoder.decode();
                        if (trailingChunk) {
                            partialResponseText += trailingChunk;
                            const trailingAnswer = normalizeAiAnswerFormatting(
                                this.consumeAiStreamChunk(trailingChunk, streamAccumulator)
                            );
                            if (trailingAnswer) {
                                partialAnswer = trailingAnswer;
                            }
                        }

                        const flushedAnswer = normalizeAiAnswerFormatting(
                            this.consumeAiStreamChunk('', streamAccumulator, { flush: true })
                        );
                        if (flushedAnswer) {
                            partialAnswer = flushedAnswer;
                        }

                        responseText = partialResponseText;
                    } else {
                        responseText = await response.text();
                    }
                } catch (error) {
                    if (error && error.name === 'AbortError') {
                        const fallbackAnswer = normalizeAiAnswerFormatting(
                            partialAnswer ||
                            this.extractAiAnswerTextFromRawResponse(partialResponseText)
                        );
                        const elapsedMs = Date.now() - requestStartedAt;

                        logger.error('AI request timed out', {
                            session_id: requestBody.session_id,
                            elapsed_ms: elapsedMs,
                            status: responseStatus,
                            response_text_length: partialResponseText.length
                        });

                        if (fallbackAnswer) {
                            logger.warn('Timeout reached but answer was recovered from partial stream', {
                                session_id: requestBody.session_id,
                                answer_length: fallbackAnswer.length
                            });
                            logPhase('ai_request_success', {
                                session_id: requestBody.session_id,
                                answer_length: fallbackAnswer.length,
                                recovered_after_timeout: true
                            });
                            return fallbackAnswer;
                        }

                        throw new Error(`AI request timed out after ${timeoutSeconds} seconds.`);
                    }
                    throw new Error('Network error while requesting AI (possible CORS issue or unreachable endpoint).');
                } finally {
                    clearTimeout(timeoutId);
                    this.requestAbortController = null;
                }
            }

            logger.info('AI raw response body', {
                status: responseStatus,
                content_type: responseContentType,
                body: String(responseText || '').slice(0, 2000)
            });

            const responseData = safeJsonParse(responseText);

            if (!responseOk) {
                const backendMessage = pickFirstString([
                    responseData?.error?.message,
                    responseData?.error,
                    responseData?.message,
                    responseData?.detail,
                    this.extractAiAnswerTextFromRawResponse(responseText),
                    responseText
                ]);

                if (backendMessage) {
                    throw new Error(`AI server returned HTTP ${responseStatus}: ${backendMessage}`);
                }

                throw new Error(`AI server returned HTTP ${responseStatus}.`);
            }

            const aiAnswer = normalizeAiAnswerFormatting(
                this.extractAiAnswerText(responseData) ||
                this.extractAiAnswerTextFromRawResponse(responseText)
            );
            if (!aiAnswer) {
                logger.error('AI returned empty answer — raw response', {
                    session_id: requestBody.session_id,
                    status: responseStatus,
                    content_type: responseContentType,
                    response_text: String(responseText || '').slice(0, 1000)
                });
                throw new Error('AI returned an empty answer.');
            }

            logger.log('AI response received successfully', {
                session_id: requestBody.session_id,
                answer_length: aiAnswer.length
            });
            logger.info('AI response meta', {
                session_id: requestBody.session_id,
                status: responseStatus,
                content_type: responseContentType || 'unknown',
                response_text_length: String(responseText || '').length
            });
            logPhase('ai_request_success', {
                session_id: requestBody.session_id,
                answer_length: aiAnswer.length
            });

            return aiAnswer;
        }

        create(data) {
            this.close();

            this.data = data;
            this.restoreStateFromCache(data);

            this.overlay = document.createElement('div');
            this.overlay.id = 'ai-bot-modal-overlay';

            this.modal = document.createElement('div');
            this.modal.id = 'ai-bot-modal';
            this.modal.innerHTML = this.renderContent(data);

            this.overlay.appendChild(this.modal);
            document.body.appendChild(this.overlay);

            this.setupEventListeners();
            this.setCollapsed(this.isCollapsed);

            this.escapeListener = (e) => {
                if (e.key !== 'Escape') return;
                if (!this.overlay) return;

                const activeElement = document.activeElement;
                const focusInPanel = activeElement && this.overlay.contains(activeElement);
                if (focusInPanel) {
                    this.close();
                }
            };
            document.addEventListener('keydown', this.escapeListener);

            logger.log('AI panel created and displayed');
        }

        renderContent(data) {
            if (!data.success && data.error) {
                return `
                    <div id="ai-bot-modal-header">
                        <h2>Error</h2>
                        <div class="ai-bot-panel-actions">
                            <button id="ai-bot-panel-toggle" class="ai-bot-panel-control" type="button">${this.isCollapsed ? 'Expand' : 'Collapse'}</button>
                            <button id="ai-bot-modal-close" class="ai-bot-panel-control" type="button">✕</button>
                        </div>
                    </div>
                    <div id="ai-bot-modal-content">
                        <div class="ai-bot-error">
                            ${this.escapeHtml(data.error)}
                        </div>
                    </div>
                    <div id="ai-bot-modal-footer">
                        <button class="ai-bot-button" id="ai-bot-close-btn">Close</button>
                    </div>
                `;
            }

            if (!data.success && data.warning) {
                return `
                    <div id="ai-bot-modal-header">
                        <h2>Info</h2>
                        <div class="ai-bot-panel-actions">
                            <button id="ai-bot-panel-toggle" class="ai-bot-panel-control" type="button">${this.isCollapsed ? 'Expand' : 'Collapse'}</button>
                            <button id="ai-bot-modal-close" class="ai-bot-panel-control" type="button">✕</button>
                        </div>
                    </div>
                    <div id="ai-bot-modal-content">
                        <div class="ai-bot-warning">
                            ${this.escapeHtml(data.warning)}
                        </div>
                    </div>
                    <div id="ai-bot-modal-footer">
                        <button class="ai-bot-button" id="ai-bot-close-btn">Close</button>
                    </div>
                `;
            }

            const initialPayload = this.buildPayload(this.editedContent);
            const hasCachedAnswer = Boolean(this.cachedAiAnswer);
            const showSubjectForm = this.selectedRating === 'not_great' || this.selectedRating === 'bad';
            const fallbackInfo = data.fallback_used
                ? `
                    <div class="ai-bot-section">
                        <div class="ai-bot-warning">
                            No messages were found after the latest resolve. Showing messages between the previous and latest resolve.
                        </div>
                    </div>
                `
                : '';
            const payloadPreviewSection = DEBUG_UI_PAYLOAD
                ? `
                    <div class="ai-bot-section">
                        <div class="ai-bot-section-title">JSON Payload Preview</div>
                        <div class="ai-bot-json" id="ai-bot-payload-preview">${this.escapeHtml(JSON.stringify(initialPayload, null, 2))}</div>
                    </div>
                `
                : '';

            return `
                <div id="ai-bot-modal-header">
                    <h2>AI Bot Assistant</h2>
                    <div class="ai-bot-panel-actions">
                        <button id="ai-bot-panel-toggle" class="ai-bot-panel-control" type="button">${this.isCollapsed ? 'Expand' : 'Collapse'}</button>
                        <button id="ai-bot-modal-close" class="ai-bot-panel-control" type="button">✕</button>
                    </div>
                </div>
                <div id="ai-bot-modal-content">
                    ${fallbackInfo}
                    <div class="ai-bot-section ai-bot-loading-section" id="ai-bot-loading-section">
                        <div class="ai-bot-loading-title">AI Bot is generating response...</div>
                        <div class="ai-bot-loading-note">Please wait while we prepare the answer.</div>
                    </div>

                    <div class="ai-bot-section" id="ai-bot-input-section">
                        <div class="ai-bot-section-title">Editable Content</div>
                        <textarea
                            id="ai-bot-content-editor"
                            class="ai-bot-textarea"
                            placeholder="Edit the message content here...">${this.escapeHtml(this.editedContent)}</textarea>
                    </div>

                    <div class="ai-bot-section" id="ai-bot-answer-section" style="display: ${hasCachedAnswer ? 'block' : 'none'};">
                        <div class="ai-bot-section-title">AI Answer</div>
                        <div class="ai-bot-answer" id="ai-bot-answer-content">${this.escapeHtml(this.cachedAiAnswer)}</div>
                    </div>

                    <div class="ai-bot-section" id="ai-bot-rating-section" style="display: ${hasCachedAnswer ? 'block' : 'none'};">
                        <div class="ai-bot-section-title">Rate This Answer</div>
                        <div class="ai-bot-rating-buttons">
                            <button class="ai-bot-rating-button${this.selectedRating === 'good' ? ' ai-bot-rating-active' : ''}" id="ai-bot-rating-good" data-rating="good">Good</button>
                            <button class="ai-bot-rating-button${this.selectedRating === 'not_great' ? ' ai-bot-rating-active' : ''}" id="ai-bot-rating-not-great" data-rating="not_great">Not great</button>
                            <button class="ai-bot-rating-button${this.selectedRating === 'bad' ? ' ai-bot-rating-active' : ''}" id="ai-bot-rating-bad" data-rating="bad">Bad</button>
                        </div>
                        <div id="ai-bot-rating-form" class="ai-bot-rating-form" style="display: ${showSubjectForm ? 'block' : 'none'};">
                            <label for="ai-bot-rating-subject-input">Enter request subject</label>
                            <div class="ai-bot-rating-form-row">
                                <input
                                    id="ai-bot-rating-subject-input"
                                    class="ai-bot-rating-input"
                                    type="text"
                                    maxlength="200"
                                    value="${this.escapeHtml(this.ratingSubject)}"
                                    placeholder="Short subject..." />
                                <button class="ai-bot-button" id="ai-bot-rating-submit-btn">Submit</button>
                            </div>
                        </div>
                        <div id="ai-bot-rating-status" class="ai-bot-rating-status"></div>
                    </div>

                    <div id="ai-bot-error-container" style="display: none;">
                        <div class="ai-bot-error-message" id="ai-bot-error-message"></div>
                    </div>

                    ${payloadPreviewSection}
                </div>
                <div id="ai-bot-modal-footer">
                    <button class="ai-bot-button" id="ai-bot-close-btn">Close</button>
                    <button class="ai-bot-button ai-bot-button-primary" id="ai-bot-submit-btn">Get Answer from AI Bot</button>
                </div>
            `;
        }

        buildPayload(contentForAi) {
            return {
                ticket_id: this.data?.ticket_id || 'unknown',
                last_resolve_time: this.data?.last_resolve_time || '',
                used_resolve_time: this.data?.used_resolve_time || this.data?.last_resolve_time || '',
                fallback_used: this.data?.fallback_used === true,
                client_messages: this.data?.client_messages || [],
                content_for_ai: typeof contentForAi === 'string' ? contentForAi : ''
            };
        }

        updatePayloadPreview(contentForAi) {
            const payloadPreview = document.getElementById('ai-bot-payload-preview');
            if (!payloadPreview) return;

            const payload = this.buildPayload(contentForAi);
            payloadPreview.textContent = JSON.stringify(payload, null, 2);
        }

        setupEventListeners() {
            const panelToggleBtn = document.getElementById('ai-bot-panel-toggle');
            if (panelToggleBtn) {
                panelToggleBtn.addEventListener('click', () => this.toggleCollapsed());
            }

            const closeHeaderBtn = document.getElementById('ai-bot-modal-close');
            if (closeHeaderBtn) {
                closeHeaderBtn.addEventListener('click', () => this.close());
            }

            const closeFooterBtn = document.getElementById('ai-bot-close-btn');
            if (closeFooterBtn) {
                closeFooterBtn.addEventListener('click', () => this.close());
            }

            if (!this.data?.success) return;

            const submitBtn = document.getElementById('ai-bot-submit-btn');
            const contentEditor = document.getElementById('ai-bot-content-editor');
            const errorContainer = document.getElementById('ai-bot-error-container');
            const errorMessage = document.getElementById('ai-bot-error-message');
            const answerSection = document.getElementById('ai-bot-answer-section');
            const answerContent = document.getElementById('ai-bot-answer-content');
            const ratingSubjectInput = document.getElementById('ai-bot-rating-subject-input');
            const ratingSubmitBtn = document.getElementById('ai-bot-rating-submit-btn');
            const ratingButtons = document.querySelectorAll('.ai-bot-rating-button');

            this.setRatingButtonsState(this.selectedRating);
            this.setRatingFormVisibility(this.selectedRating === 'not_great' || this.selectedRating === 'bad');
            this.setLoadingLayout(false);

            if (contentEditor) {
                const syncPayloadPreview = () => {
                    this.editedContent = contentEditor.value;
                    this.updatePayloadPreview(this.editedContent);
                    this.saveCachedTicketState({ edited_content: this.editedContent });
                };

                contentEditor.addEventListener('input', syncPayloadPreview);
                syncPayloadPreview();
                logger.log('Textarea-to-JSON live sync initialized');
            }

            ratingButtons.forEach(button => {
                button.addEventListener('click', async () => {
                    const rating = String(button.getAttribute('data-rating') || '');
                    if (!rating) return;
                    if (this.isFeedbackInFlight) {
                        this.setRatingStatus('Feedback is already being sent...');
                        return;
                    }

                    this.setRatingStatus('');

                    if (rating === 'good') {
                        const answerText = String(answerContent?.textContent || this.cachedAiAnswer || '');
                        if (!answerText.trim()) {
                            this.setRatingStatus('No answer available to copy.');
                            return;
                        }

                        let copiedToClipboard = false;
                        try {
                            await this.copyTextToClipboard(answerText);
                            copiedToClipboard = true;
                        } catch (error) {
                            logger.error('Copy to clipboard failed', error);
                        }

                        this.selectedRating = 'good';
                        this.pendingRating = '';
                        this.ratingSubject = '';
                        if (ratingSubjectInput) {
                            ratingSubjectInput.value = '';
                        }
                        this.setRatingButtonsState('good');
                        this.setRatingFormVisibility(false);

                        await this.submitAgentFeedback(
                            'good',
                            '',
                            answerText,
                            {
                                successMessage: copiedToClipboard
                                    ? 'Copied to clipboard. Feedback sent successfully.'
                                    : 'Feedback sent successfully. Unable to copy to clipboard.'
                            }
                        );
                        return;
                    }

                    if (rating === 'not_great' || rating === 'bad') {
                        this.selectedRating = rating;
                        this.pendingRating = rating;
                        this.setRatingButtonsState(rating);
                        this.setRatingFormVisibility(true);
                        if (ratingSubjectInput) {
                            ratingSubjectInput.focus();
                        }
                    }
                });
            });

            if (ratingSubmitBtn) {
                ratingSubmitBtn.addEventListener('click', async () => {
                    if (this.isFeedbackInFlight) {
                        this.setRatingStatus('Feedback is already being sent...');
                        return;
                    }

                    const rating = this.pendingRating || this.selectedRating;
                    if (rating !== 'not_great' && rating !== 'bad') {
                        this.setRatingStatus('Select "Not great" or "Bad" first.');
                        return;
                    }

                    const subject = String(ratingSubjectInput?.value || '').trim();
                    if (!subject) {
                        this.setRatingStatus('Please enter a subject.');
                        return;
                    }

                    this.selectedRating = rating;
                    this.ratingSubject = subject;
                    this.setRatingButtonsState(rating);
                    this.setRatingFormVisibility(true);
                    this.saveCachedTicketState({
                        rating,
                        subject
                    });

                    const answerText = String(answerContent?.textContent || this.cachedAiAnswer || '');
                    if (!answerText.trim()) {
                        this.setRatingStatus('No answer available for feedback.');
                        return;
                    }

                    await this.submitAgentFeedback(rating, subject, answerText);
                });
            }

            if (submitBtn) {
                submitBtn.addEventListener('click', async () => {
                    if (this.isSubmitInFlight) return;

                    const currentContent = contentEditor ? contentEditor.value : this.editedContent;
                    if (!currentContent.trim()) {
                        this.showError(errorContainer, errorMessage, 'Content cannot be empty');
                        this.setSubmitButtonState(submitBtn, 'error');
                        setAiHelpButtonState(AI_HELP_BUTTON_STATE.ERROR, { resetAfterMs: 2600 });
                        logger.warn('Submit blocked: content is empty');
                        return;
                    }

                    this.hideError(errorContainer);
                    this.clearAiAnswer(answerSection, answerContent);
                    this.setSubmitButtonState(submitBtn, 'loading');
                    this.setLoadingLayout(true);
                    setAiHelpButtonState(AI_HELP_BUTTON_STATE.LOADING);
                    this.isSubmitInFlight = true;

                    this.editedContent = currentContent;
                    this.lastRequestForAi = currentContent;
                    this.saveCachedTicketState({
                        edited_content: currentContent,
                        last_request: this.lastRequestForAi
                    });
                    const finalPayload = this.buildPayload(currentContent);

                    logger.log('Payload ready for API submission', finalPayload);
                    logger.info('Payload JSON', JSON.stringify(finalPayload, null, 2));

                    try {
                        const aiAnswer = await this.requestAiAnswer(finalPayload);

                        if (!this.overlay || !this.modal) {
                            setAiHelpButtonState(AI_HELP_BUTTON_STATE.IDLE);
                            return;
                        }

                        this.renderAiAnswer(answerSection, answerContent, aiAnswer);
                        this.lastResponseForAi = aiAnswer;

                        if (this.isAiFallbackResponse(aiAnswer)) {
                            logger.warn('AI returned fallback response — auto-submitting error feedback');
                            await this.submitAgentFeedback('error', 'empty', aiAnswer, { silent: true });
                        }
                        this.saveCachedTicketState({
                            last_response: this.lastResponseForAi
                        });
                        setAiHelpButtonState(AI_HELP_BUTTON_STATE.SUCCESS, { resetAfterMs: 1800 });

                        this.setSubmitButtonState(submitBtn, 'done');
                    } catch (e) {
                        logger.error('AI request failed', e);

                        if (!this.overlay || !this.modal) {
                            setAiHelpButtonState(AI_HELP_BUTTON_STATE.IDLE);
                            return;
                        }

                        const userMessage = pickFirstString([e?.message, 'Unable to get a response from AI.']);
                        this.showError(errorContainer, errorMessage, userMessage);
                        this.setSubmitButtonState(submitBtn, 'error');
                        setAiHelpButtonState(AI_HELP_BUTTON_STATE.ERROR, { resetAfterMs: 3200 });
                    } finally {
                        this.isSubmitInFlight = false;
                        if (this.overlay && this.modal) {
                            this.setLoadingLayout(false);
                        }
                    }
                });
            }
        }

        close() {
            this.stopTypingEffect();
            this.abortActiveRequest();
            setAiHelpButtonState(AI_HELP_BUTTON_STATE.IDLE);

            if (this.escapeListener) {
                document.removeEventListener('keydown', this.escapeListener);
            }
            if (this.overlay && this.overlay.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
            }

            this.overlay = null;
            this.modal = null;
            this.data = null;
            this.ticketId = 'unknown';
            this.editedContent = '';
            this.cachedAiAnswer = '';
            this.selectedRating = '';
            this.pendingRating = '';
            this.ratingSubject = '';
            this.lastRequestForAi = '';
            this.lastResponseForAi = '';
            this.lastAgentEmail = '';
            this.escapeListener = null;
            this.typingEffectTimer = null;
            this.requestAbortController = null;
            this.isSubmitInFlight = false;
            this.isFeedbackInFlight = false;
            logger.log('AI panel closed');
        }

        escapeHtml(text) {
            const safeText = String(text ?? '');
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return safeText.replace(/[&<>"']/g, m => map[m]);
        }
    }

    // ============================================================================
    // BUTTON INJECTION - инжекция кнопки в UI
    // ============================================================================

    const modal = new BotPreviewModal();

    function createAiHelpButtonIfNeeded() {
        let button = document.getElementById(AI_HELP_BUTTON_ID);
        if (!button) {
            button = document.createElement('button');
            button.id = AI_HELP_BUTTON_ID;
            button.type = 'button';
            button.textContent = AI_HELP_BUTTON_LABEL;
        }

        if (!button.dataset.aiBotBound) {
            button.dataset.aiBotBound = '1';
            button.addEventListener('click', () => {
                if (aiHelpButtonCurrentState === AI_HELP_BUTTON_STATE.LOADING) {
                    return;
                }

                logPhase('button_clicked', {
                    ticket_id: getCurrentTicketIdFromLocation()
                });
                const previewData = collectPreviewData();
                modal.create(previewData);
            });
        }

        return button;
    }

    function placeAiButtonAsFallback(button) {
        if (!button || !document.body) return false;

        if (button.parentElement !== document.body) {
            document.body.appendChild(button);
        }

        button.style.position = 'fixed';
        button.style.top = '30px';
        button.style.bottom = '';
        button.style.right = '70px';
        button.style.zIndex = '9999';
        button.style.display = 'block';
        button.style.margin = '0';
        return true;
    }

    function injectButton() {
        const button = createAiHelpButtonIfNeeded();
        const previousParent = button.parentElement;
        const previousNextSibling = button.nextElementSibling;

        if (aiHelpButtonCurrentState === AI_HELP_BUTTON_STATE.LOADING) {
            if (button.parentElement !== document.body && document.body) {
                document.body.appendChild(button);
            }
            button.style.position = 'fixed';
            button.style.zIndex = '9999';
            button.style.display = 'block';
            button.style.margin = '0';
        } else {
            placeAiButtonAsFallback(button);
        }

        if (button.parentElement !== previousParent || button.nextElementSibling !== previousNextSibling) {
            logger.log('Floating AI panel trigger button injected');
        }

        renderAiHelpButtonState(button, aiHelpButtonCurrentState);
    }

    // ============================================================================
    // STYLES INJECTION - инжекция CSS стилей
    // ============================================================================
    function injectStyles() {
        if (document.getElementById('ai-bot-styles')) {
            return;
        }

        const styleTag = document.createElement('style');
        styleTag.id = 'ai-bot-styles';
        styleTag.textContent = modalStyles;
        document.head.appendChild(styleTag);
        logger.log('Styles injected');
    }

    // ============================================================================
    // INITIALIZATION - инициализация скрипта
    // ============================================================================
    let observerTimeout;
    let observer = null;
    let lastObservedTicketId = '';

    function init() {
        try {
            logger.log('Script initializing...');
            logger.log(`Current URL: ${pageWindow.location.href}`);
            validateInterceptedApiDataForCurrentTicket();
            lastObservedTicketId = getCurrentTicketIdFromLocation();

            // Инжектируем стили
            injectStyles();

            // Инжектируем кнопку
            injectButton();

            // Регистрируем ручную проверку обновлений через меню Tampermonkey
            registerManualUpdateMenuCommand();

            // Запускаем SPA observer после появления body
            startSpaObserver();

            logger.log('Script initialized successfully');
        } catch (e) {
            logger.error('Error during initialization', e);
        }
    }

    // Запускаем инициализацию
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Дополнительная инициализация при изменении DOM (для SPA приложений)

    function handleTicketUrlChange() {
        const currentTicketId = getCurrentTicketIdFromLocation();
        if (currentTicketId === lastObservedTicketId) return;

        logger.info(`Ticket URL changed: ${lastObservedTicketId || 'none'} -> ${currentTicketId || 'none'}`);
        lastObservedTicketId = currentTicketId;

        if (!currentTicketId) {
            clearInterceptedApiData('navigated away from ticket URL');
            return;
        }

        validateInterceptedApiDataForCurrentTicket();
    }

    function shouldReinjectAiButton() {
        const button = getAiHelpButtonElement();
        if (!button || !button.isConnected) return true;
        if (!document.body) return false;
        return button.parentElement !== document.body;
    }

    function startSpaObserver() {
        if (observer || !document.body) return;

        observer = new MutationObserver(() => {
            clearTimeout(observerTimeout);
            observerTimeout = setTimeout(() => {
                const prevTicketId = lastObservedTicketId;
                handleTicketUrlChange();
                const ticketChanged = prevTicketId !== lastObservedTicketId;
                if (ticketChanged || shouldReinjectAiButton()) {
                    injectButton();
                }
            }, 120);  // Дебаунс 120ms
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        logger.log('SPA observer started');
    }

    logger.log('VOISO Support AI Bot Assistant loaded');
})();
