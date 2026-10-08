// Envío de correo «como el usuario»: lo manda el Hub con tu nombre, tu firma y un Reply-To personal (las respuestas vuelven solo a ti).
// Si la empresa no tiene el correo del Centro de control, se usa el envío normal de Espo.
define('custom:mail-send', [], function () {
    const toText = h => String(h || '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|blockquote)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

    function signature() { return Espo.Ajax.getRequest('CrmHub/emailSignature').catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return {html: ''}; }); }

    async function send(o) {
        const r = await Espo.Ajax.postRequest('CrmHub/email/send', {to: o.to, cc: o.cc || '', subject: o.subject, body: o.body, parentType: o.parentType || null, parentId: o.parentId || null, inReplyTo: o.inReplyTo || null, references: o.references || []});
        if (!r.fallback) { return r; }
        const ch = await Espo.Ajax.getRequest('CrmHub/channels');
        const text = String(o.body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
        return Espo.Ajax.postRequest('Email', {name: o.subject, body: text, bodyPlain: o.body, isHtml: true, to: [].concat(o.to).join(';'), cc: [].concat(o.cc || []).join(';'),
            status: 'Sending', from: ch.emailFrom || undefined, parentType: o.parentType || undefined, parentId: o.parentId || undefined});
    }

    function reason(xhr) { return (xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo enviar el correo. Revisa la configuración de correo de la empresa.'; }

    return {toText, signature, send, reason};
});
