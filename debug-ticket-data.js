// ============================================================================
// VOISO TICKET DATA DEBUGGING SCRIPT
// ============================================================================
// Используйте этот скрипт в DevTools Console для диагностики где находятся данные
// Скопируйте весь код вниз и вставьте в console, потом нажмите Enter
// ============================================================================

(function() {
    console.clear();
    console.log('%c=== VOISO TICKET DATA DIAGNOSTICS v1.0 ===', 'background: #007bff; color: white; padding: 10px; font-size: 14px; font-weight: bold;');
    console.log('%cTime:', 'font-weight: bold;', new Date().toLocaleString());
    console.log('%cURL:', 'font-weight: bold;', window.location.href);
    console.log('');

    const results = {
        windowVars: [],
        dataElements: [],
        scriptTags: [],
        objectsWithTicketData: [],
        apiInterceptorReady: false
    };

    // ✅ CHECK 1: Window variables
    console.log('%c[CHECK 1] Window Variables', 'background: #28a745; color: white; padding: 5px; font-weight: bold;');
    const possibleVars = [
        '__data', '__DATA__', '__INITIAL_STATE__', '__INITIAL_PROPS__',
        'initialState', 'initialProps', 'state', 'props',
        'ticketData', 'TICKET_DATA', '__TICKET__',
        'ticket', 'TICKET', 'data', 'DATA',
        'store', 'Store', 'appState', 'appdata',
        'ticketStore', 'supportData', 'chatData'
    ];

    possibleVars.forEach(varName => {
        try {
            const val = window[varName];
            if (val !== undefined) {
                const isObj = typeof val === 'object';
                const hasTicketData = isObj && JSON.stringify(val).includes('ticket');
                const hasEvents = isObj && (val.events || val.messages || val.data?.events);

                if (isObj && (hasTicketData || hasEvents)) {
                    console.log(`✅ window.${varName}:`, val);
                    results.windowVars.push(varName);
                } else if (isObj) {
                    console.log(`ℹ️ window.${varName}: ${JSON.stringify(val).substring(0, 100)}...`);
                }
            }
        } catch(e) {}
    });

    if (results.windowVars.length === 0) {
        console.log('❌ No ticket data found in window variables');
    }

    // ✅ CHECK 2: DOM data attributes
    console.log('\n%c[CHECK 2] DOM Data Elements', 'background: #28a745; color: white; padding: 5px; font-weight: bold;');
    const dataElements = document.querySelectorAll('[data-ticket-json], [data-ticket-data], [data-initial-state], [data-*]');
    console.log(`Found ${dataElements.length} elements with data attributes:`);

    dataElements.forEach((el, idx) => {
        const attrs = [...el.attributes].filter(attr => attr.name.startsWith('data-'));
        attrs.forEach(attr => {
            const val = attr.value;
            const preview = val.substring(0, 100);
            try {
                const parsed = JSON.parse(val);
                console.log(`✅ ${attr.name}:`, parsed);
                results.dataElements.push(attr.name);
            } catch(e) {
                console.log(`ℹ️ ${attr.name}: ${preview}${val.length > 100 ? '...' : ''}`);
            }
        });
    });

    if (results.dataElements.length === 0) {
        console.log('❌ No JSON data found in DOM elements');
    }

    // ✅ CHECK 3: Script tags
    console.log('\n%c[CHECK 3] Script Tags', 'background: #28a745; color: white; padding: 5px; font-weight: bold;');
    const scripts = document.querySelectorAll('script');
    let scriptCount = 0;

    scripts.forEach((script, idx) => {
        const content = script.textContent;
        const isInline = script.src === '';

        if (isInline && content.length > 100) {
            if (content.includes('ticket') || content.includes('__data')) {
                scriptCount++;
                console.log(`✅ Script #${idx} (inline, ${content.length} chars):`);
                console.log(`   Contains "ticket":`, content.includes('ticket'));
                console.log(`   Contains "__data":`, content.includes('__data'));
                console.log(`   Preview:`, content.substring(0, 150) + '...');
                results.scriptTags.push(idx);
            }
        }
    });

    if (scriptCount === 0) {
        console.log('❌ No ticket data found in script tags');
    }

    // ✅ CHECK 4: Deep object scan
    console.log('\n%c[CHECK 4] Deep Object Search', 'background: #28a745; color: white; padding: 5px; font-weight: bold;');
    try {
        const ticketLikeObjects = [];

        for (const key of Object.keys(window)) {
            try {
                const val = window[key];
                if (typeof val === 'object' && val !== null) {
                    const str = JSON.stringify(val);
                    if ((str.includes('events') && str.includes('created_at')) ||
                        (str.includes('messages') && str.includes('from_email')) ||
                        (str.includes('ticket_id') && str.includes('status'))) {
                        console.log(`✅ window.${key}:`, val);
                        ticketLikeObjects.push(key);
                    }
                }
            } catch(e) {}
        }

        if (ticketLikeObjects.length === 0) {
            console.log('❌ No ticket-like objects found');
        }
        results.objectsWithTicketData = ticketLikeObjects;
    } catch(e) {
        console.log('❌ Error during deep scan:', e.message);
    }

    // ✅ CHECK 5: Setup API interceptor
    console.log('\n%c[CHECK 5] API Interceptor Setup', 'background: #28a745; color: white; padding: 5px; font-weight: bold;');
    try {
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0];
            return originalFetch.apply(this, args).then(response => {
                const clone = response.clone();
                clone.json()
                    .then(data => {
                        const str = JSON.stringify(data);
                        if (str.includes('ticket') || str.includes('event') || str.includes('message')) {
                            console.log('%c🎯 TICKET DATA INTERCEPTED', 'background: #ffc107; color: black; padding: 5px; font-weight: bold;');
                            console.log('URL:', url);
                            console.log('Data:', data);
                            window.__interceptedTicketData = data;
                        }
                    })
                    .catch(e => {});
                return response;
            });
        };
        console.log('✅ Fetch interceptor installed');
        console.log('ℹ️ Now reload the page or navigate to a ticket');
        console.log('ℹ️ API responses will be logged automatically');
        results.apiInterceptorReady = true;
    } catch(e) {
        console.log('❌ Error setting up interceptor:', e.message);
    }

    // ============================================================================
    // RESULTS SUMMARY
    // ============================================================================
    console.log('\n%c=== SUMMARY ===', 'background: #17a2b8; color: white; padding: 10px; font-weight: bold;');

    if (results.windowVars.length > 0) {
        console.log('%c✅ FOUND in window:', 'color: green; font-weight: bold;', results.windowVars);
    }

    if (results.dataElements.length > 0) {
        console.log('%c✅ FOUND in DOM:', 'color: green; font-weight: bold;', results.dataElements);
    }

    if (results.objectsWithTicketData.length > 0) {
        console.log('%c✅ FOUND objects:', 'color: green; font-weight: bold;', results.objectsWithTicketData);
    }

    if (results.windowVars.length === 0 && results.dataElements.length === 0 && results.objectsWithTicketData.length === 0) {
        console.log('%c⚠️  Ticket data NOT FOUND in window or DOM', 'color: orange; font-weight: bold;');
        console.log('ℹ️ Possible reasons:');
        console.log('   1. Portal uses API to fetch data (interceptor will catch it)');
        console.log('   2. Data is loaded after page render (wait a few seconds and try again)');
        console.log('   3. Data structure is different than expected');
    } else {
        console.log('%c✅ Ticket data FOUND!', 'color: green; font-weight: bold;');
    }

    console.log('\n%c=== NEXT STEPS ===', 'background: #6f42c1; color: white; padding: 10px; font-weight: bold;');
    console.log('1. Check results above');
    console.log('2. If data found, note the variable/location name');
    console.log('3. Run this analysis code in console:');
    console.log('\n   // Если в window.__data:');
    console.log('   Object.keys(window.__data)');
    console.log('   window.__data.events || window.__data.messages');
    console.log('   window.__data.events[0]  // First event');
    console.log('\n4. Report findings to developer');

    console.log('\n%c=== DEBUG COMPLETE ===', 'background: #007bff; color: white; padding: 10px; font-weight: bold;');

})();
