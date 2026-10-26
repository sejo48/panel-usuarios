const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const load = () => import('data:text/javascript;base64,' + fs.readFileSync(require('node:path').join(__dirname, '../opening-stats.js')).toString('base64'));
test('independent daily/monthly totals; rebuilding snapshots never increments counts', async () => {
    const { summarizeOpenings } = await load();
    const events = [
        { email: ' A@EXAMPLE.COM ', day: '2026-10-26' }, { email: 'a@example.com', day: '2026-10-26' },
        { email: 'a@example.com', day: '2026-10-25' }, { email: 'b@example.com', day: '2026-10-26' },
        { email: 'a@example.com', day: '2026-09-26' }, { email: 'a@example.com', day: '<script>' }
    ];
    const counts = summarizeOpenings(events, '2026-10');
    assert.deepEqual(counts.get('a@example.com'), { total: 3, days: { '2026-10-26': 2, '2026-10-25': 1 } });
    assert.equal(counts.get('b@example.com').total, 1);
    assert.deepEqual(summarizeOpenings(events, '2026-10'), counts);
});
test('month boundaries include December rollover and Costa Rica midnight', async () => {
    const { monthRange, costaRicaDay } = await load();
    assert.deepEqual(monthRange('2026-12-31'), ['2026-12-01', '2027-01-01']);
    assert.equal(costaRicaDay(new Date('2026-11-01T05:59:59Z')), '2026-10-31');
    assert.equal(costaRicaDay(new Date('2026-11-01T06:00:00Z')), '2026-11-01');
});
