// Plantillas personales del usuario (correo, WhatsApp, Telegram, SMS): carga, variables y relleno. Las plantillas son privadas de cada usuario.
define('custom:tpl', [], function () {
    const CH = {email: {label: 'Correo', icon: 'fas fa-envelope', color: '#f59e0b'}, whatsapp: {label: 'WhatsApp', icon: 'fab fa-whatsapp', color: '#25d366'},
        telegram: {label: 'Telegram', icon: 'fab fa-telegram', color: '#229ed9'}, sms: {label: 'SMS', icon: 'fas fa-comment-sms', color: '#0ea5e9'}};
    const VARS = [['{nombre}', 'Nombre del cliente'], ['{apellido}', 'Apellido'], ['{nombre_completo}', 'Nombre completo'], ['{asesor}', 'Tu nombre'], ['{empresa}', 'Tu empresa']];
    let cache = null;

    function load(force) {
        if (cache && !force) { return Promise.resolve(cache); }
        return Espo.Ajax.getRequest('CrmHub/templates').then(r => { cache = r; return r; }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return {items: [], max: 10}; });
    }
    function invalidate() { cache = null; }
    function forChannel(r, ch) { return (r.items || []).filter(t => t.channel === ch); }

    // Variables a partir de un nombre completo, el usuario y la empresa
    function vars(fullName, userName, company) {
        const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
        return {nombre: parts[0] || '', apellido: parts.slice(1).join(' '), nombre_completo: parts.join(' '), asesor: userName || '', empresa: company || ''};
    }
    function fill(text, v) { return String(text || '').replace(/\{(nombre_completo|nombre|apellido|asesor|empresa)\}/g, (m, k) => v[k] || ''); }
    // Los textos de error viajan en una cabecera HTTP y el navegador los lee como Latin-1: se corrige la codificación (hasta dos veces)
    function reason(xhr, fallback) {
        let s = (xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || '';
        for (let i = 0; i < 2 && /[\u00c2\u00c3]/.test(s); i++) { try { s = decodeURIComponent(escape(s)); } catch (e) { break; } }
        return s || fallback;
    }
    return {reason, CH, VARS, load, invalidate, forChannel, vars, fill};
});
