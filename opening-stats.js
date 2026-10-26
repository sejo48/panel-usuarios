export function costaRicaDay(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

export function monthRange(day) {
    const [year, month] = day.split('-').map(Number);
    return [day.slice(0, 7) + '-01', `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`];
}

// Rebuild from a complete snapshot: listener refreshes never add duplicates.
export function summarizeOpenings(events, month) {
    const users = new Map();
    for (const event of events) {
        const email = String(event.email || '').trim().toLowerCase();
        if (!email || !/^\d{4}-\d{2}-\d{2}$/.test(event.day) || !event.day.startsWith(month + '-')) continue;
        const counts = users.get(email) || { total: 0, days: {} };
        counts.total += 1;
        counts.days[event.day] = (counts.days[event.day] || 0) + 1;
        users.set(email, counts);
    }
    return users;
}
