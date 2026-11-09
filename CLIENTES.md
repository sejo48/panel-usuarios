# Clientes y accesos

En **Clientes** se muestra una lista de una fila por persona. Busca por nombre, teléfono (con o sin guiones), correo, nombre del acceso o notas. Pulsa la fila para abrir la ficha. Los filtros muestran clientes que tienen al menos un acceso en el estado elegido; una persona con accesos activos y vencidos puede aparecer en ambos filtros.

La ficha muestra todos los accesos, equipos, vencimientos y aperturas. **Editar datos del cliente** permite guardar nombre, teléfono y notas comunes. **Nuevo acceso** abre el alta con ese cliente seleccionado y propone un correo que no esté ocupado. El dominio predeterminado sigue siendo `@boxplaytv.com`. Cada acceso tiene su nombre opcional (TV de la sala, celular…), correo, suscripción y un equipo. El precio de cada acceso permanece en ₡3.000 por 30 días.

Para reunir registros anteriores, abre la ficha de la persona, despliega **Vincular acceso existente**, busca el correo, selecciónalo y confirma. Se mueve únicamente ese acceso y se conservan pagos acumulados, notas anteriores, equipos y fechas. No se agrupan personas automáticamente por nombres, notas o teléfonos parecidos. **Separar del cliente** revierte una agrupación sin borrar el acceso. **Eliminar acceso** conserva la confirmación existente y afecta solo al correo seleccionado.

**Renovar 30 días**, notas y WhatsApp permanecen disponibles por acceso. Se muestran todos los identificadores registrados, incluidos registros antiguos con varios equipos. **Liberar** quita solo el equipo elegido; **Cambiar equipo** libera los equipos de ese acceso. Si no queda ningún equipo, el próximo que ingrese quedará autorizado. El CSV conserva una fila por acceso e incorpora identificador, nombre y teléfono del cliente y nombre del acceso; los campos con comas o saltos de línea se entrecomillan.

## Datos y compatibilidad

Se conserva `suscripciones/{correo}` y las colecciones existentes de presencia/aperturas. Los campos adicionales son `clientId`, `clientName`, `clientPhone`, `clientNotes`, `clientUpdatedAt` y `accessName`. La agrupación y los datos comunes se escriben juntos en una transacción; los registros existentes permanecen intactos hasta una acción explícita del administrador. La vinculación no reescribe campos de facturación ni autorización de equipos. Las transacciones rechazan un correo duplicado o una ficha cuyo grupo o versión haya cambiado en otra sesión.

No se modificaron reglas de Firestore, autenticación del administrador ni datos de producción. Se mantienen los permisos existentes de la colección `suscripciones`; reglas desplegadas que permitan únicamente determinados campos deben admitir los nuevos campos al guardar. Una transacción rechazada se muestra como error. La interfaz de administración no sustituye la autorización que impongan las reglas desplegadas.

En `sejo48/StreamTube-V20`, web y Smart TV comparten `device-access.js`: la lectura y la primera vinculación del equipo ocurren en la misma transacción. Dos primeras activaciones simultáneas no pueden registrar equipos distintos con un solo acceso. Un error al guardar ya no concede acceso. Los registros antiguos con varios equipos no se alteran automáticamente; el administrador puede revisarlos en la ficha.

## Validación

`node --test tests/clients.test.cjs tests/opening-stats.test.cjs` comprueba agrupación explícita, búsqueda, correos únicos, conservación de datos, conflictos y fallos sin escrituras parciales. `tests/openings-browser.cjs` sigue comprobando las aperturas y el CSV desde la nueva ficha. La revisión visual se realizó con datos ficticios y Firebase simulado en escritorio y en un marco de 390 px: búsqueda, edición, vinculación, alta y liberación de un equipo.

La aplicación principal comprueba activaciones concurrentes, rechazos y aperturas con `node --test tests/device-access.test.cjs tests/app-openings.test.cjs`. Las pruebas usan almacenamiento simulado y no registran equipos o pagos reales.
