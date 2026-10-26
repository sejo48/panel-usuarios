# Conteo diario y mensual

La columna Aperturas muestra Hoy, Mes y un detalle desplegable por día para cada suscriptor. El CSV incluye `Aperturas_Hoy` y `Aperturas_Mes`. El mes y el día siguen America/Costa_Rica; la consulta cambia automáticamente al entrar un nuevo mes. Un error de acceso se muestra como Sin información, nunca como cero. Actualizar lista permite reintentar la consulta.

Requiere publicar también el registro de aperturas de `sejo48/StreamTube-V20` y revisar las reglas desplegadas de Firestore para la nueva colección `aperturas`. No se han modificado reglas ni datos de producción. Los ceros indican que no hay eventos registrados, no demuestran que el usuario nunca abrió una versión anterior de la aplicación.

El panel consulta `day >= primer día del mes` y `day < primer día del mes siguiente`, con el índice habitual de campo único de Firestore para `day`. Si ese índice fue deshabilitado en la configuración desplegada, deberá habilitarse. Cada apertura es un documento; el costo de lectura crece con el número de aperturas del mes.

Pruebas sin conexión a producción:

- `node --test tests/opening-stats.test.cjs`
- `node tests/openings-browser.cjs` (Playwright y Chromium en `/usr/bin/chromium`).
