import { groupClients, clientKey, clientFields, devicesOf, isActive, matchesClient, suggestEmail, saveClientGroup } from './clients.js';

export function createClientManager({ db, doc, runTransaction, getSubscriptions, connectionFor, openingCell, openingStats, escapeHTML: esc, reload }) {
    const $ = id => document.getElementById(id);
    const newClientId = () => 'cliente-' + (crypto.randomUUID ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''));
    let selectedKey = null, dirty = false, busy = false;
    const groups = () => groupClients(getSubscriptions());
    const selected = () => groups().find(client => client.key === selectedKey);
    const setMessage = (id, message, error = false) => {
        $(id).hidden = false; $(id).classList.remove('hidden');
        $(id).dataset.state = error ? 'error' : 'success'; $(id).textContent = message;
    };
    async function perform(action, messageId = 'clientMsg') {
        if (busy) return;
        busy = true;
        document.querySelectorAll('[data-client-write], #createBtn').forEach(button => button.disabled = true);
        try { await action(); }
        catch (error) { setMessage(messageId, error.message || 'No se pudo guardar. Intenta de nuevo.', true); }
        finally {
            busy = false;
            document.querySelectorAll('[data-client-write], #createBtn').forEach(button => button.disabled = false);
        }
    }
    function metadata(client, values = {}) {
        return { ...clientFields(client), ...values, clientUpdatedAt: new Date().toISOString() };
    }
    const saveGroup = (expected, patch, newAccess) => saveClientGroup({ db, doc, runTransaction, expected, patch, newAccess });
    async function refresh(message) {
        if (await reload() === false) throw new Error('El cambio se guardó, pero no se pudo actualizar la lista. Pulsa Actualizar lista antes de continuar.');
        fillProfile();
        if (message) setMessage('clientMsg', message);
    }
    function updateSelect() {
        const value = $('newClient').value;
        $('newClient').innerHTML = '<option value="">Crear un cliente nuevo</option>' + groups().map(client =>
            `<option value="${esc(client.key)}">${esc(client.displayName)}${client.phone ? ' · ' + esc(client.phone) : ''} · ${client.accesses.length} acceso(s)</option>`).join('');
        if ([...$('newClient').options].some(option => option.value === value)) $('newClient').value = value;
        updateCreateFields();
    }
    function updateCreateFields() {
        const existing = !!$('newClient').value;
        $('newClientFields').hidden = existing;
        $('newClientName').required = !existing;
    }
    function openClient(key) {
        selectedKey = key; dirty = false;
        $('clientMsg').hidden = true;
        fillProfile();
        window.showSection('client');
    }
    function fillProfile() {
        const client = selected();
        if (!client) {
            if (selectedKey && !$('clientSection').hidden) window.showSection('users');
            selectedKey = null; return;
        }
        $('clientHeading').textContent = client.displayName;
        $('clientPhoneDisplay').textContent = client.phone;
        if (!dirty) {
            $('clientName').value = client.name;
            $('clientPhone').value = client.phone;
            $('clientNotes').value = client.notes;
        }
        renderAccesses(client);
        updateAttachOptions();
    }
    function renderAccesses(client) {
        const active = client.active;
        const today = client.accesses.map(sub => openingStats(sub.email));
        $('clientSummary').textContent = `${client.accesses.length} ${client.accesses.length === 1 ? 'acceso autorizado' : 'accesos autorizados'} · ${active} activo(s) · ${client.devices} equipo(s) registrado(s)`;
        $('clientOpenings').textContent = today.every(Boolean)
            ? `Aperturas del cliente · Hoy: ${today.reduce((sum, stats) => sum + stats.today, 0)} · Mes: ${today.reduce((sum, stats) => sum + stats.total, 0)}`
            : 'Aperturas del cliente: sin información completa.';
        const expanded = new Set([...$('clientAccesses').querySelectorAll('details[open]')].map(detail => detail.closest('[data-email]')?.dataset.email));
        $('clientAccesses').innerHTML = client.accesses.map((sub, index) => {
            const active = isActive(sub), days = Math.ceil((new Date(sub.expires_at) - Date.now()) / 86400000);
            const email = esc(sub.email), devices = devicesOf(sub), connection = connectionFor(sub.email);
            const expiration = new Date(sub.expires_at);
            return `<article class="access-row" data-email="${email}">
                <div class="access-heading"><div><h4>${esc(sub.accessName || 'Acceso sin nombre')}</h4><span class="subscriber-email">${email}</span></div>
                    <span class="subscription-badge ${!active ? 'badge-expired' : days <= 7 ? 'badge-pending' : 'badge-active'}">${!active ? 'Vencido' : days <= 7 ? 'Por vencer' : 'Activo'}</span></div>
                <div class="access-data"><div><p class="field-caption">Vencimiento</p><p>${Number.isFinite(expiration.getTime()) ? expiration.toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' }) : 'Sin fecha válida'}${active ? ' · ' + days + ' días' : ''}</p>
                    <button type="button" class="presence-button" data-presence-email="${email}" data-state="${connection.state}" aria-expanded="false" aria-controls="access-connection-${index}">${connection.label}</button>
                    <p id="access-connection-${index}" class="connection-detail" hidden>${esc(connection.detail)}</p></div>
                    <div><p class="field-caption">Aperturas</p>${openingCell(sub.email)}</div>
                    <div class="access-devices"><p class="field-caption">Dispositivos de este acceso</p>
                    ${devices.length > 1 ? '<p class="device-warning">Hay varios equipos registrados en este acceso. Revisa cuáles corresponden.</p>' : ''}
                    ${devices.length ? devices.map(device => `<div class="device-line"><code>${esc(device)}</code><button type="button" class="btn-secondary" data-client-write data-action="remove-device" data-device="${esc(device)}">Liberar</button></div>`).join('') : '<p>Sin equipo. El próximo que ingrese quedará vinculado.</p>'}</div></div>
                ${sub.notes ? `<p class="subscriber-note">${esc(sub.notes)}</p>` : ''}
                <div class="access-actions"><button type="button" class="btn-secondary" data-action="renew">Renovar 30 días</button><button type="button" class="btn-whatsapp" data-action="whatsapp">WhatsApp</button><button type="button" class="btn-secondary" data-client-write data-action="label">Nombrar acceso</button><button type="button" class="btn-secondary" data-action="note">Editar nota</button><button type="button" class="btn-secondary" data-action="device">Cambiar equipo</button>
                    ${client.accesses.length > 1 ? '<button type="button" class="btn-secondary" data-client-write data-action="separate">Separar del cliente</button>' : ''}<button type="button" class="btn-danger" data-action="delete">Eliminar acceso</button></div>
            </article>`;
        }).join('');
        for (const detail of $('clientAccesses').querySelectorAll('details')) if (expanded.has(detail.closest('[data-email]')?.dataset.email)) detail.open = true;
    }
    function render() {
        const all = groups(), filter = $('filterStatus').value, now = Date.now();
        const clients = all.filter(client => matchesClient(client, $('searchInput').value) && (
            filter === 'all' || filter === 'active' && client.active > 0 || filter === 'expired' && client.active < client.accesses.length
            || filter === 'expiring' && client.accesses.some(sub => isActive(sub, now) && new Date(sub.expires_at).getTime() <= now + 7 * 86400000)
            || filter === 'online' && client.accesses.some(sub => connectionFor(sub.email).state === 'online')));
        $('listCount').textContent = `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'} · ${all.length} en total · ${getSubscriptions().length} accesos`;
        $('clientsList').innerHTML = clients.length ? clients.map(client => {
            const connections = client.accesses.map(sub => connectionFor(sub.email));
            const state = connections.some(item => item.state === 'online') ? 'online' : connections.some(item => item.state === 'unknown') ? 'unknown' : 'offline';
            const label = state === 'online' ? 'En línea' : state === 'unknown' ? 'Sin información' : 'Desconectado';
            return `<div role="listitem" class="client-list-item"><button type="button" class="client-row" data-client="${esc(client.key)}" aria-label="Abrir ficha de ${esc(client.displayName)}">
                <span class="client-identity"><strong>${esc(client.displayName)}</strong><span>${esc(client.phone || (client.name ? client.accesses[0].email : 'Completa el nombre en su ficha'))}</span></span>
                <span class="client-totals"><strong>${client.accesses.length} ${client.accesses.length === 1 ? 'acceso' : 'accesos'}</strong><span>${client.active} activo(s) · ${client.accesses.length - client.active} vencido(s)</span></span>
                <span class="client-connection" data-state="${state}">${label}</span><span class="client-arrow" aria-hidden="true">›</span></button></div>`;
        }).join('') : '<p class="empty-message">No hay clientes que coincidan. Puedes crear uno desde Inicio o actualizar la lista.</p>';
        updateSelect();
        if (selectedKey) fillProfile();
    }
    function updateConnections() {
        const current = new Map(groups().map(client => [client.key, client]));
        for (const row of $('clientsList').querySelectorAll('[data-client]')) {
            const client = current.get(row.dataset.client); if (!client) continue;
            const connections = client.accesses.map(sub => connectionFor(sub.email));
            const state = connections.some(item => item.state === 'online') ? 'online' : connections.some(item => item.state === 'unknown') ? 'unknown' : 'offline';
            const badge = row.querySelector('.client-connection'); badge.dataset.state = state;
            badge.textContent = state === 'online' ? 'En línea' : state === 'unknown' ? 'Sin información' : 'Desconectado';
        }
    }
    function updateAttachOptions() {
        const client = selected(); if (!client) return;
        const q = $('attachSearch').value.trim().toLowerCase(), old = $('attachEmail').value;
        const candidates = getSubscriptions().filter(sub => clientKey(sub) !== client.key && [sub.email, sub.clientName, sub.notes].some(value => String(value || '').toLowerCase().includes(q)));
        $('attachEmail').innerHTML = '<option value="">Selecciona un acceso</option>' + candidates.map(sub => `<option value="${esc(sub.email)}">${esc(sub.email)}${sub.clientName ? ' · ' + esc(sub.clientName) : ''}</option>`).join('');
        if (candidates.some(sub => sub.email === old)) $('attachEmail').value = old;
    }
    function newAccess(key = '') {
        updateSelect(); $('newClient').value = key; updateCreateFields();
        const client = groups().find(item => item.key === key);
        $('newEmail').value = client ? suggestEmail(client, getSubscriptions()) : '@boxplaytv.com';
        $('newAccessName').value = ''; $('newNotes').value = '';
        $('createMsg').classList.add('hidden');
        if (!client) { $('newClientName').value = ''; $('newClientPhone').value = ''; }
        window.showSection('home'); $('newEmail').focus();
    }
    async function activate() {
        const email = $('newEmail').value.trim().toLowerCase();
        const validation = document.createElement('input'); validation.type = 'email'; validation.value = email; validation.required = true;
        if (!validation.checkValidity() || !$('subscriberForm').reportValidity()) return;
        const client = groups().find(item => item.key === $('newClient').value);
        if ($('newClient').value && !client) return setMessage('createMsg', 'Actualiza la lista y vuelve a seleccionar el cliente.', true);
        const existing = getSubscriptions().find(sub => sub.email === email);
        if (existing) return setMessage('createMsg', 'Este correo ya tiene un acceso. Abre su ficha para renovarlo o vincúlalo desde otra ficha.', true);
        const plan = { 1: 0, 30: 3000, 60: 6000, 90: 9000, 180: 18000, 365: 36000 }, days = Number($('newDays').value);
        if (!Object.hasOwn(plan, days)) return setMessage('createMsg', 'Selecciona una duración válida.', true);
        const target = client || { key: newClientId(), name: $('newClientName').value.trim(), phone: $('newClientPhone').value.trim(), notes: '', accesses: [] };
        if (!target.name && !client) return setMessage('createMsg', 'Escribe el nombre del cliente.', true);
        const now = new Date(), expiry = new Date(now.getTime() + days * 86400000);
        await perform(async () => {
            await saveGroup(target.accesses, metadata(target), { email, status: 'active', expires_at: expiry.toISOString(), devices: [],
                accessName: $('newAccessName').value.trim(), notes: $('newNotes').value.trim(), createdAt: now.toISOString(), lastPayment: now.toISOString(), totalPaid: plan[days] });
            selectedKey = target.key; await refresh();
            $('newEmail').value = '@boxplaytv.com'; $('newNotes').value = ''; $('newAccessName').value = '';
            openClient(target.key); setMessage('clientMsg', `Acceso ${email} activado por ${days} días.`);
        }, 'createMsg');
    }
    $('clientsList').addEventListener('click', event => {
        const button = event.target.closest('[data-client]'); if (button) openClient(button.dataset.client);
    });
    $('clientForm').addEventListener('input', () => dirty = true);
    $('clientForm').addEventListener('submit', event => {
        event.preventDefault(); const client = selected(); if (!client) return;
        const values = { clientName: $('clientName').value.trim(), clientPhone: $('clientPhone').value.trim(), clientNotes: $('clientNotes').value.trim() };
        if (!values.clientName) return setMessage('clientMsg', 'Escribe el nombre del cliente.', true);
        perform(async () => { await saveGroup(client.accesses, metadata(client, values)); dirty = false; await refresh('Ficha del cliente guardada.'); });
    });
    $('newClient').addEventListener('change', updateCreateFields);
    $('attachSearch').addEventListener('input', updateAttachOptions);
    $('addClientAccess').addEventListener('click', () => {
        if (dirty) return setMessage('clientMsg', 'Guarda los cambios de la ficha antes de añadir otro acceso.', true);
        newAccess(selectedKey);
    });
    $('newClientButton').addEventListener('click', () => newAccess());
    $('attachButton').addEventListener('click', () => {
        const client = selected(), sub = getSubscriptions().find(item => item.email === $('attachEmail').value);
        if (!client || !sub || clientKey(sub) === client.key) return setMessage('clientMsg', 'Selecciona un acceso de otro registro para vincularlo.', true);
        window.showConfirm('Vincular acceso al cliente', `${sub.email} pasará a la ficha de ${client.displayName}. Se conservarán su vencimiento, pagos y dispositivo.`, () => perform(async () => {
            await saveGroup([...client.accesses, sub], metadata(client)); await refresh('Acceso vinculado al cliente.');
        }));
    });
    $('clientAccesses').addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button) return;
        if (button.hasAttribute('data-presence-email')) {
            const detail = $(button.getAttribute('aria-controls')); detail.hidden = !detail.hidden;
            button.setAttribute('aria-expanded', String(!detail.hidden)); return;
        }
        const sub = getSubscriptions().find(item => item.email === button.closest('[data-email]')?.dataset.email); if (!sub) return;
        const actions = { renew: window.renovar, note: window.editarNota, device: window.resetDevices, delete: window.eliminar };
        if (actions[button.dataset.action]) return actions[button.dataset.action](sub.email);
        if (button.dataset.action === 'whatsapp') {
            const days = Math.ceil((new Date(sub.expires_at) - Date.now()) / 86400000);
            const text = `Hola! Te escribo de Boxplaytv. Tu acceso ${sub.accessName || sub.email} ${isActive(sub) ? 'vence en ' + days + ' días' : 'está vencido'}. ¿Deseas renovar por ₡3.000?`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
        }
        if (button.dataset.action === 'label') {
            const label = prompt('Nombre del acceso (por ejemplo, TV de la sala o Celular):', sub.accessName || '');
            if (label === null) return;
            perform(async () => {
                await saveGroup([sub], { accessName: label.trim() }); await refresh('Nombre del acceso guardado.');
            });
        }
        if (button.dataset.action === 'separate') window.showConfirm('Separar acceso del cliente', `${sub.email} tendrá su propia ficha. Se conservarán su suscripción y su equipo.`, () => perform(async () => {
            await saveGroup([sub], metadata({ key: newClientId(), name: sub.accessName || sub.email, phone: '', notes: '' }));
            await refresh('Acceso separado. Aparece como otro cliente en la lista.');
        }));
        if (button.dataset.action === 'remove-device') {
            const device = button.dataset.device;
            window.showConfirm('Liberar dispositivo', `Se quitará ${device} de ${sub.email}. Si no quedan equipos, el próximo que ingrese quedará autorizado.`, () => perform(async () => {
                await runTransaction(db, async tx => {
                    const ref = doc(db, 'suscripciones', sub.email), snap = await tx.get(ref);
                    if (!snap.exists()) throw new Error('Este acceso ya no existe. Actualiza la lista.');
                    tx.update(ref, { devices: devicesOf(snap.data()).filter(item => item !== device) });
                });
                await refresh('Dispositivo liberado.');
            }));
        }
    });
    return { render, updateConnections, openClient, activate, newAccess, groups, selected };
}
