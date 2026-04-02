// ============================================================================
// INVESTIGATE JSON:API STRUCTURE - Deep dive into nested properties
// ============================================================================
// Вставьте этот код в console DevTools после открытия тикета на VOISO
// This will show exactly where events/messages/resolve data is stored
// ============================================================================

(function() {
    console.clear();
    console.log('%c=== JSON:API STRUCTURE DEEP DIVE ===', 'background: #007bff; color: white; padding: 10px; font-weight: bold;');

    const data = window.__interceptedApiData;

    if (!data) {
        console.log('❌ No intercepted API data. Run the main script first and reload page.');
        return;
    }

    console.log('\n%c[LEVEL 1] Top-level structure', 'background: #28a745; color: white; padding: 5px; font-weight: bold;');
    console.log('Keys:', Object.keys(data));

    console.log('\n%c[LEVEL 2] data.data structure', 'background: #28a745; color: white; padding: 5px; font-weight: bold;');
    console.log('Keys:', Object.keys(data.data || {}));
    console.log('Full data.data:', data.data);

    if (data.data.attributes) {
        console.log('\n%c[LEVEL 3] data.data.attributes (THE MAIN CONTENT)', 'background: #ffc107; color: black; padding: 5px; font-weight: bold;');
        const attrs = data.data.attributes;
        console.log('All keys:', Object.keys(attrs));

        // Look for events-like fields
        console.log('\n%c▶ Searching for events/messages fields:', 'font-weight: bold;');
        const eventFields = ['events', 'messages', 'comments', 'activities', 'history', 'timeline', 'notes', 'replies', 'responses'];
        eventFields.forEach(field => {
            if (field in attrs) {
                console.log(`✅ Found: ${field}`, attrs[field]);
            }
        });

        // Look for resolve/status fields
        console.log('\n%c▶ Searching for resolve/status fields:', 'font-weight: bold;');
        const statusFields = ['status', 'state', 'resolve_status', 'resolved_at', 'resolve_time', 'resolution_time', 'closed_at'];
        statusFields.forEach(field => {
            if (field in attrs) {
                console.log(`✅ Found: ${field}`, attrs[field]);
            }
        });

        // Show all string-like fields (potential content fields)
        console.log('\n%c▶ All attributes (string/object/array):', 'font-weight: bold;');
        Object.entries(attrs).forEach(([key, value]) => {
            const type = Array.isArray(value) ? 'ARRAY' : typeof value;
            const preview = typeof value === 'object' ? JSON.stringify(value).substring(0, 50) : String(value).substring(0, 50);
            console.log(`  ${key} (${type}):`, preview + (preview.length >= 50 ? '...' : ''));
        });
    }

    if (data.data.relationships) {
        console.log('\n%c[LEVEL 3] data.data.relationships', 'background: #ffc107; color: black; padding: 5px; font-weight: bold;');
        const rels = data.data.relationships;
        console.log('Relationship keys:', Object.keys(rels));
        console.log('Full relationships:', rels);

        // Relationships might link to included resources
        if (data.included) {
            console.log('\n%c[LEVEL 3] data.included (Related resources)', 'background: #ffc107; color: black; padding: 5px; font-weight: bold;');
            console.log(`Found ${data.included.length} included resources`);
            console.log('Types:', data.included.map(r => r.type).filter((v, i, a) => a.indexOf(v) === i));

            // Look for event-like resources
            const eventResources = data.included.filter(r =>
                r.type && (r.type.includes('event') || r.type.includes('message') || r.type.includes('activity'))
            );

            if (eventResources.length > 0) {
                console.log(`\n✅ Found ${eventResources.length} event-like resources:`, eventResources);
            }

            // Show sample of each resource type
            console.log('\n%c▶ Sample resources by type:', 'font-weight: bold;');
            const typesSeen = new Set();
            data.included.forEach(resource => {
                if (!typesSeen.has(resource.type)) {
                    typesSeen.add(resource.type);
                    console.log(`\nType "${resource.type}":`, resource);
                }
            });
        }
    }

    if (data.meta) {
        console.log('\n%c[LEVEL 2] data.meta', 'background: #28a745; color: white; padding: 5px; font-weight: bold;');
        console.log('Meta data:', data.meta);
    }

    console.log('\n%c=== NEXT STEPS ===', 'background: #6f42c1; color: white; padding: 10px; font-weight: bold;');
    console.log('1. Look at the output above to find where events/messages are stored');
    console.log('2. If in data.data.attributes, note the exact field name (e.g., "events", "messages", etc.)');
    console.log('3. If in data.included, check what "type" the events have');
    console.log('4. Report the structure to developer');

    console.log('\n%c=== CURRENT DATA PATH FINDINGS ===', 'background: #17a2b8; color: white; padding: 10px; font-weight: bold;');

    // Make predictions
    const attrs = data.data.attributes || {};
    if ('events' in attrs) {
        console.log('✅ Events found at: data.data.attributes.events');
    }
    if ('messages' in attrs) {
        console.log('✅ Messages found at: data.data.attributes.messages');
    }
    if ('status' in attrs) {
        console.log('✅ Status found at: data.data.attributes.status');
    }
    if (data.included && data.included.length > 0) {
        const types = new Set(data.included.map(r => r.type));
        if (types.has('event')) {
            console.log('ℹ️ Events stored in data.included with type="event"');
        }
        if (types.has('message')) {
            console.log('ℹ️ Messages stored in data.included with type="message"');
        }
    }

    console.log('\n%c=== END INVESTIGATION ===', 'background: #007bff; color: white; padding: 10px; font-weight: bold;');
})();
