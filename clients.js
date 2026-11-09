// Agrupación explícita: nunca se unen personas por similitud de nombres o notas.
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export const clientKey = sub => String(sub.clientId || `legacy:${sub.email}`);
export const isActive = (sub, now = Date.now()) => sub.status === 'active' && new Date(sub.expires_at).getTime() > Number(now);
export const devicesOf = sub => [...new Set((Array.isArray(sub.devices) ? sub.devices : []).filter(value => typeof value === 'string' && value.trim()))];
export const clientFields = client => ({ clientId: client.key, clientName: client.name, clientPhone: client.phone, clientNotes: client.notes });

export function groupClients(subscriptions, now = Date.now()) {
    const groups = new Map();
    for (const sub of subscriptions) {
        const key = clientKey(sub);
        if (!groups.has(key)) groups.set(key, { key, accesses: [] });
        groups.get(key).accesses.push(sub);
    }
    return [...groups.values()].map(group => {
        const members = [...group.accesses].sort((a, b) => String(b.clientUpdatedAt || '').localeCompare(String(a.clientUpdatedAt || '')));
        const field = name => String(members.find(item => item[name])?.[name] || '');
        const name = field('clientName');
        return { ...group, name, phone: field('clientPhone'), notes: field('clientNotes'),
            displayName: name || String(members[0].notes || '').split('\n')[0].slice(0, 90) || members[0].email,
            active: members.filter(sub => isActive(sub, now)).length,
            devices: members.reduce((count, sub) => count + devicesOf(sub).length, 0) };
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'es', { sensitivity: 'base', numeric: true }) || a.key.localeCompare(b.key));
}

export function matchesClient(client, search) {
    const q = normalize(search);
    if (!q) return true;
    const fields = [client.name, client.displayName, client.phone, client.notes,
        ...client.accesses.flatMap(sub => [sub.email, sub.notes, sub.accessName, ...devicesOf(sub)])];
    if (fields.some(value => normalize(value).includes(q))) return true;
    const phoneQuery = q.replace(/[\s()+.-]/g, '');
    return /^\d+$/.test(phoneQuery) && client.phone.replace(/\D/g, '').includes(phoneQuery);
}

export function suggestEmail(client, subscriptions) {
    const first = client?.accesses[0]?.email || '';
    const [original, domain] = first.split('@');
    let base = (client?.phone || '').replace(/\D/g, '') || original?.replace(/\.\d+$/, '');
    if (!base) return '@boxplaytv.com';
    const host = domain || 'boxplaytv.com';
    const used = new Set(subscriptions.map(sub => normalize(sub.email)));
    let candidate = `${base}@${host}`, number = 2;
    while (used.has(normalize(candidate))) candidate = `${base}.${number++}@${host}`;
    return candidate;
}

// Se comprueba la pertenencia dentro de la transacción, antes de cualquier escritura.
export async function saveClientGroup({ db, doc, runTransaction, expected, patch, newAccess = null }) {
    const members = [...new Map(expected.map(sub => [sub.email, sub])).values()];
    if (members.length + (newAccess ? 1 : 0) > 450) throw new Error('Este cliente tiene demasiados accesos para guardar juntos.');
    return runTransaction(db, async transaction => {
        const snapshots = await Promise.all(members.map(sub => transaction.get(doc(db, 'suscripciones', sub.email))));
        let createdSnapshot;
        if (newAccess) createdSnapshot = await transaction.get(doc(db, 'suscripciones', newAccess.email));
        snapshots.forEach((snapshot, index) => {
            const old = members[index];
            if (!snapshot.exists() || clientKey({ ...snapshot.data(), email: old.email }) !== clientKey(old)
                || snapshot.data().clientUpdatedAt !== old.clientUpdatedAt) {
                throw new Error('La ficha cambió en otra sesión. Actualiza la lista antes de guardar.');
            }
        });
        if (createdSnapshot?.exists()) throw new Error('Ese correo ya tiene un acceso. Usa Vincular acceso existente en la ficha.');
        for (const old of members) transaction.update(doc(db, 'suscripciones', old.email), patch);
        if (newAccess) {
            const { email, ...data } = newAccess;
            transaction.set(doc(db, 'suscripciones', email), { ...data, ...patch });
        }
    });
}
