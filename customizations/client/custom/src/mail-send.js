// Envío de correo «como el usuario»: lo manda el Hub con tu nombre, tu firma y un Reply-To personal (las respuestas vuelven solo a ti).
// Si la empresa no tiene el correo del Centro de control, se usa el envío normal de Espo.
define('custom:mail-send', [], function () {
    const toText = h => String(h || '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|blockquote)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

    // Editor con formato: conserva el HTML de las plantillas (colores, listas, enlaces). `.value` devuelve/recibe HTML para usarlo como un campo normal.
    const editorMarkup = (rows) => '<div class="ch-ed"><div class="ch-ed-bar">' +
        '<button type="button" data-cmd="bold" title="Negrita"><b>B</b></button><button type="button" data-cmd="italic" title="Cursiva"><i>I</i></button>' +
        '<button type="button" data-cmd="insertUnorderedList" title="Lista"><span class="fas fa-list-ul"></span></button><button type="button" data-cmd="createLink" title="Enlace"><span class="fas fa-link"></span></button>' +
        '<button type="button" data-cmd="removeFormat" title="Quitar formato"><span class="fas fa-eraser"></span></button></div>' +
        '<div class="ch-ed-area" name="body" contenteditable="true" data-ph="Escribe el correo…" style="min-height:' + ((rows || 6) * 22) + 'px"></div></div>';

    function mountEditor(root) {
        root.querySelectorAll('.ch-ed').forEach(ed => {
            const area = ed.querySelector('.ch-ed-area');
            if (area._mounted) { return; }
            area._mounted = true;
            Object.defineProperty(area, 'value', {
                get() { return (!area.textContent.trim() && !area.querySelector('img,table')) ? '' : area.innerHTML; },
                set(v) { area.innerHTML = v || ''; }
            });
            ed.querySelector('.ch-ed-bar').addEventListener('mousedown', e => e.preventDefault());
            ed.querySelector('.ch-ed-bar').addEventListener('click', e => {
                const b = e.target.closest('button'); if (!b) { return; }
                area.focus();
                if (b.dataset.cmd === 'createLink') { const u = window.prompt('Dirección del enlace (https://…)'); if (u && /^(https?:|mailto:)/i.test(u)) { document.execCommand('createLink', false, u); } return; }
                document.execCommand(b.dataset.cmd, false, null);
            });
            area.addEventListener('paste', e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
        });
    }

    const quoteHtml = t => '<br><br><blockquote style="margin:0;padding-left:10px;border-left:3px solid #c9d0e6;color:#5d6678">' + String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</blockquote>';

    function signature() { return Espo.Ajax.getRequest('CrmHub/emailSignature').catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return {html: ''}; }); }

    async function send(o) {
        const r = await Espo.Ajax.postRequest('CrmHub/email/send', {to: o.to, cc: o.cc || '', subject: o.subject, body: o.body, isHtml: true, parentType: o.parentType || null, parentId: o.parentId || null, inReplyTo: o.inReplyTo || null, references: o.references || []});
        if (!r.fallback) { return r; }
        const ch = await Espo.Ajax.getRequest('CrmHub/channels');
        const text = String(o.body);
        return Espo.Ajax.postRequest('Email', {name: o.subject, body: text, bodyPlain: toText(o.body), isHtml: true, to: [].concat(o.to).join(';'), cc: [].concat(o.cc || []).join(';'),
            status: 'Sending', from: ch.emailFrom || undefined, parentType: o.parentType || undefined, parentId: o.parentId || undefined});
    }

    function reason(xhr) { return (xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo enviar el correo. Revisa la configuración de correo de la empresa.'; }

    return {toText, editorMarkup, mountEditor, quoteHtml, signature, send, reason};
});
