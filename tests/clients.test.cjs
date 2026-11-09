const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = () => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../clients.js')).toString('base64'));
const now = Date.parse('2026-11-09T18:00:00Z');
const access = (email, fields = {}) => ({ email, status: 'active', expires_at: '2026-12-09', devices: ['device-' + email], totalPaid: 9000, notes: 'Pago anterior', ...fields });
function fakeStore(initial, fail = false) {
    let records = new Map(initial.map(({ email, ...data }) => [email, structuredClone(data)]));
    let queue = Promise.resolve();
    const context = { db: {}, doc: (_, collection, email) => email, runTransaction(_, callback) {
        const result = queue.then(async () => {
            const draft = structuredClone(records);
            const tx = { get: async email => ({ exists: () => draft.has(email), data: () => structuredClone(draft.get(email)) }),
                update(email, data) { assert(draft.has(email)); draft.set(email, { ...draft.get(email), ...data }); },
                set(email, data) { draft.set(email, data); } };
            const value = await callback(tx);
            if (fail) throw new Error('permission-denied');
            records = draft; return value;
        });
        queue = result.catch(() => {}); return result;
    } };
    return { context, data: () => structuredClone(records) };
}

test('one row per explicit client; matching notes never merge legacy people', async () => {
    const { groupClients, matchesClient } = await api();
    const list = [access('tv@test.com', { clientId: 'ana', clientName: 'Ana Méndez', clientPhone: '8888-1234' }),
        access('phone@test.com', { clientId: 'ana', clientName: 'Ana Méndez', expires_at: '2026-11-01' }),
        access('other@test.com', { notes: 'Ana Méndez' }), access('another@test.com', { notes: 'Ana Méndez' })];
    const groups = groupClients(list, now);
    assert.equal(groups.length, 3);
    const ana = groups.find(client => client.key === 'ana');
    assert.equal(ana.accesses.length, 2); assert.equal(ana.active, 1); assert.equal(ana.devices, 2);
    assert(matchesClient(ana, 'mendez')); assert(matchesClient(ana, '88881234')); assert(matchesClient(ana, 'phone@test'));
    assert(!matchesClient(ana, 'other@test'));
    assert.equal(list.length, 4); assert(!Object.hasOwn(list[2], 'clientId'));
});

test('suggests a distinct email without overwriting existing accesses', async () => {
    const { suggestEmail } = await api();
    const list = [access('88881234@boxplaytv.com'), access('88881234.2@boxplaytv.com')];
    assert.equal(suggestEmail({ phone: '8888-1234', accesses: list }, list), '88881234.3@boxplaytv.com');
    assert.equal(suggestEmail(null, list), '@boxplaytv.com');
});

test('link, edit and separate preserve per-access billing, expiry and registered devices', async () => {
    const { saveClientGroup } = await api();
    const original = [access('tv@test.com'), access('phone@test.com', { status: 'inactive', totalPaid: 12000 })];
    const store = fakeStore(original);
    const patch = { clientId: 'customer-1', clientName: 'Ana', clientPhone: '88881234', clientUpdatedAt: 'v1' };
    await saveClientGroup({ ...store.context, expected: original, patch });
    for (const sub of original) {
        const current = store.data().get(sub.email);
        for (const key of ['status', 'expires_at', 'devices', 'notes', 'totalPaid']) assert.deepEqual(current[key], sub[key]);
        assert.equal(current.clientId, 'customer-1');
    }
    const expected = original.map(sub => ({ ...sub, ...patch }));
    await saveClientGroup({ ...store.context, expected: [expected[1]], patch: { clientId: 'separate', clientName: 'Phone', clientUpdatedAt: 'v2' } });
    assert.equal(store.data().get(original[0].email).clientId, 'customer-1');
    assert.equal(store.data().get(original[1].email).clientId, 'separate');
});

test('duplicate creation and stale membership reject the complete change', async () => {
    const { saveClientGroup } = await api();
    const original = [access('a@test.com', { clientId: 'a', clientUpdatedAt: 'v1' }), access('b@test.com')];
    const store = fakeStore(original), before = store.data();
    await assert.rejects(saveClientGroup({ ...store.context, expected: [original[0]], patch: { clientName: 'Wrong' }, newAccess: original[1] }), /ya tiene un acceso/);
    assert.deepEqual(store.data(), before);
    await assert.rejects(saveClientGroup({ ...store.context, expected: [{ ...original[0], clientId: 'old' }], patch: { clientName: 'Wrong' } }), /otra sesión/);
    await assert.rejects(saveClientGroup({ ...store.context, expected: [{ ...original[0], clientUpdatedAt: 'old' }], patch: { clientName: 'Wrong' } }), /otra sesión/);
    assert.deepEqual(store.data(), before);
});

test('permission failure and competing creations cannot produce partial or duplicate clients', async () => {
    const { saveClientGroup } = await api();
    const first = access('a@test.com'), second = access('b@test.com');
    const denied = fakeStore([first], true), before = denied.data();
    await assert.rejects(saveClientGroup({ ...denied.context, expected: [first], patch: { clientId: 'new' }, newAccess: second }), /permission-denied/);
    assert.deepEqual(denied.data(), before);
    const store = fakeStore([]);
    const results = await Promise.allSettled(['one', 'two'].map(clientId => saveClientGroup({ ...store.context, expected: [], patch: { clientId }, newAccess: first })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(store.data().size, 1);
});
