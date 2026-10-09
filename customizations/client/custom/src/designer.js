// Lienzo de diseño de correos por bloques: se arrastran bloques (cabecera, título, texto, imagen, botón…), se ajustan sus propiedades y se genera HTML
// compatible con Gmail/Outlook (tablas y estilos en línea). Cada diseño se guarda como JSON para poder seguir editándolo.
define('custom:designer', ['custom:ui', 'custom:mail-send'], function (ChUi, MailSend) {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const FONTS = [['Arial, Helvetica, sans-serif', 'Arial'], ['Georgia, serif', 'Georgia'], ['Verdana, Geneva, sans-serif', 'Verdana'], ['Trebuchet MS, sans-serif', 'Trebuchet'], ['Tahoma, sans-serif', 'Tahoma']];
    const THEME = {bg: '#eef1f7', card: '#ffffff', brand: '#2f43c4', text: '#161b2e', font: FONTS[0][0], width: 600};
    const ALIGN = [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']];

    // Tipos de bloque: etiqueta, icono, valores por defecto y campos editables
    const TYPES = {
        header: {label: 'Cabecera', icon: 'fas fa-window-maximize', d: {logo: true, name: true, bg: '', align: 'left'},
            f: [['logo', 'Mostrar el logo de la empresa', 'check'], ['name', 'Mostrar el nombre de la empresa', 'check'], ['bg', 'Color de fondo (vacío = color de marca)', 'color'], ['align', 'Alineación', 'select', ALIGN]]},
        heading: {label: 'Título', icon: 'fas fa-heading', d: {text: 'Hola {nombre}', size: 26, align: 'left', color: ''},
            f: [['text', 'Texto', 'text'], ['size', 'Tamaño', 'range', [16, 44]], ['align', 'Alineación', 'select', ALIGN], ['color', 'Color (vacío = texto del tema)', 'color']]},
        text: {label: 'Texto', icon: 'fas fa-align-left', d: {html: '<p>Escribe aquí tu mensaje. Usa las variables de abajo para personalizarlo.</p>', align: 'left'},
            f: [['html', 'Contenido', 'rich'], ['align', 'Alineación', 'select', ALIGN]]},
        image: {label: 'Imagen', icon: 'fas fa-image', d: {url: '', alt: '', link: '', width: 100, align: 'center'},
            f: [['url', 'Dirección de la imagen (https://…) o {logo}', 'text'], ['alt', 'Texto alternativo', 'text'], ['link', 'Enlace al hacer clic (opcional)', 'text'], ['width', 'Ancho (%)', 'range', [20, 100]], ['align', 'Alineación', 'select', ALIGN]]},
        button: {label: 'Botón', icon: 'fas fa-hand-pointer', d: {label: 'Ver más', url: 'https://', bg: '', color: '#ffffff', radius: 10, align: 'center'},
            f: [['label', 'Texto del botón', 'text'], ['url', 'Enlace (https://…)', 'text'], ['bg', 'Color de fondo (vacío = color de marca)', 'color'], ['color', 'Color del texto', 'color'], ['radius', 'Redondeo', 'range', [0, 30]], ['align', 'Alineación', 'select', ALIGN]]},
        columns: {label: 'Dos columnas', icon: 'fas fa-table-columns', d: {left: '<p>Columna izquierda</p>', right: '<p>Columna derecha</p>'},
            f: [['left', 'Columna izquierda', 'rich'], ['right', 'Columna derecha', 'rich']]},
        callout: {label: 'Destacado', icon: 'fas fa-circle-exclamation', d: {html: '<p><b>Importante:</b> escribe aquí lo que quieres resaltar.</p>', bg: '#eef1ff', border: ''},
            f: [['html', 'Contenido', 'rich'], ['bg', 'Color de fondo', 'color'], ['border', 'Color del borde (vacío = color de marca)', 'color']]},
        divider: {label: 'Separador', icon: 'fas fa-minus', d: {color: '#dfe4f3'}, f: [['color', 'Color', 'color']]},
        spacer: {label: 'Espacio', icon: 'fas fa-arrows-up-down', d: {h: 24}, f: [['h', 'Alto (px)', 'range', [8, 80]]]},
        footer: {label: 'Pie', icon: 'fas fa-shoe-prints', d: {text: '{empresa} · Recibes este mensaje porque te pusiste en contacto con nosotros.'}, f: [['text', 'Texto', 'text']]},
    };

    const FONT = t => `font-family:${t.font};`;
    const P = (v, d) => (v === '' || v == null ? d : v);
    // Una fila de la tabla del correo por bloque
    function row(b, t) {
        const p = b.props, brand = t.brand, txt = t.text;
        switch (b.type) {
            case 'header': {
                const bg = P(p.bg, brand), parts = [];
                if (p.logo) { parts.push(`<img src="{logo}" alt="{empresa}" height="40" style="height:40px;max-width:200px;border:0;vertical-align:middle">`); }
                if (p.name) { parts.push(`<span style="font:700 20px ${t.font};color:#ffffff;vertical-align:middle;padding-left:${p.logo ? 10 : 0}px">{empresa}</span>`); }
                return `<tr><td style="background:${esc(bg)};padding:22px 28px;text-align:${esc(p.align)}">${parts.join('')}</td></tr>`;
            }
            case 'heading': return `<tr><td style="padding:22px 28px 6px;${FONT(t)}font-size:${+p.size || 26}px;font-weight:700;line-height:1.25;color:${esc(P(p.color, txt))};text-align:${esc(p.align)}">${esc(p.text)}</td></tr>`;
            case 'text': return `<tr><td style="padding:8px 28px;${FONT(t)}font-size:15px;line-height:1.6;color:${esc(txt)};text-align:${esc(p.align)}">${p.html || ''}</td></tr>`;
            case 'image': {
                if (!p.url) { return `<tr><td style="padding:8px 28px;text-align:${esc(p.align)}"><div style="border:2px dashed #c9d0e6;border-radius:10px;padding:26px;color:#7a8296;font:13px ${t.font};text-align:center">Imagen: escribe su dirección en las propiedades</div></td></tr>`; }
                const img = `<img src="${esc(p.url)}" alt="${esc(p.alt)}" style="max-width:${+p.width || 100}%;height:auto;border:0;display:inline-block">`;
                return `<tr><td style="padding:8px 28px;text-align:${esc(p.align)}">${p.link ? `<a href="${esc(p.link)}">${img}</a>` : img}</td></tr>`;
            }
            case 'button': return `<tr><td style="padding:14px 28px;text-align:${esc(p.align)}"><a href="${esc(p.url)}" style="display:inline-block;background:${esc(P(p.bg, brand))};color:${esc(P(p.color, '#ffffff'))};padding:12px 28px;border-radius:${+p.radius || 0}px;font:700 15px ${t.font};text-decoration:none">${esc(p.label)}</a></td></tr>`;
            case 'columns': return `<tr><td style="padding:8px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="50%" valign="top" style="padding-right:10px;${FONT(t)}font-size:15px;line-height:1.55;color:${esc(txt)}">${p.left || ''}</td><td width="50%" valign="top" style="padding-left:10px;${FONT(t)}font-size:15px;line-height:1.55;color:${esc(txt)}">${p.right || ''}</td></tr></table></td></tr>`;
            case 'callout': return `<tr><td style="padding:10px 28px"><div style="background:${esc(p.bg)};border-left:4px solid ${esc(P(p.border, brand))};border-radius:8px;padding:12px 16px;${FONT(t)}font-size:15px;line-height:1.55;color:${esc(txt)}">${p.html || ''}</div></td></tr>`;
            case 'divider': return `<tr><td style="padding:10px 28px"><div style="height:1px;line-height:1px;font-size:0;background:${esc(p.color)}">&nbsp;</div></td></tr>`;
            case 'spacer': return `<tr><td style="height:${+p.h || 24}px;line-height:${+p.h || 24}px;font-size:0">&nbsp;</td></tr>`;
            case 'footer': return `<tr><td style="padding:16px 28px;${FONT(t)}font-size:12px;line-height:1.5;color:#7a8296;text-align:center;border-top:1px solid #e6e9f2">${esc(p.text)}</td></tr>`;
        }
        return '';
    }
    const table = (rows, t) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${+t.width || 600}px;margin:0 auto;background:${esc(t.card)};border-radius:12px;overflow:hidden;border-collapse:separate"><tbody>${rows}</tbody></table>`;
    function renderEmail(design) {
        const t = {...THEME, ...(design.theme || {})};
        return `<div data-ch-design="1" style="background:${esc(t.bg)};padding:22px 8px;${FONT(t)}">${table(design.blocks.map(b => row(b, t)).join(''), t)}</div>`;
    }
    const uid = () => 'b' + Math.random().toString(36).slice(2, 9);
    const mk = type => ({id: uid(), type, props: JSON.parse(JSON.stringify(TYPES[type].d))});
    const starter = () => ({theme: {...THEME}, blocks: [mk('header'), mk('heading'), mk('text'), mk('button'), mk('footer')]});

    class Designer {
        constructor(root, design, opts) {
            this.root = root; this.opts = opts || {};
            this.design = design && design.blocks ? design : starter();
            this.design.theme = {...THEME, ...(this.design.theme || {})};
            this.sel = null; this.mobile = false; this.lastField = null; this.drag = null;
            this.build();
        }
        getDesign() { return this.design; }
        getHtml() { return renderEmail(this.design); }
        changed() { this.paintCanvas(); this.opts.onChange && this.opts.onChange(this); }

        build() {
            const pal = Object.keys(TYPES).map(k => `<a class="ch-dz-pi" draggable="true" data-type="${k}" title="Arrastra al lienzo o haz clic"><span class="${TYPES[k].icon}"></span>${TYPES[k].label}</a>`).join('');
            this.root.innerHTML = `<div class="ch-dz"><div class="ch-dz-pal"><h5>Bloques</h5>${pal}<div class="ch-muted ch-dz-tip">Arrastra un bloque al lienzo, o haz clic para añadirlo después del seleccionado.</div></div>
                <div class="ch-dz-main"><div class="ch-dz-bar"><a class="on" data-dv="d"><span class="fas fa-desktop"></span> Escritorio</a><a data-dv="m"><span class="fas fa-mobile-screen"></span> Móvil</a><a data-act="theme" class="ch-dz-theme"><span class="fas fa-palette"></span> Estilo general</a></div>
                <div class="ch-dz-stage"><div class="ch-dz-canvas"></div></div></div><div class="ch-dz-props"></div></div>`;
            this.canvas = this.root.querySelector('.ch-dz-canvas'); this.props = this.root.querySelector('.ch-dz-props');
            this.bind(); this.paintCanvas(); this.paintProps();
        }

        sample(html) { const v = this.opts.vars || {}; return this.opts.fill ? this.opts.fill(html, v) : html; }

        paintCanvas() {
            const t = this.design.theme;
            this.canvas.style.background = t.bg; this.canvas.style.fontFamily = t.font;
            this.canvas.classList.toggle('mob', this.mobile);
            this.canvas.innerHTML = `<div class="ch-dz-card" style="max-width:${this.mobile ? 360 : (+t.width || 600)}px;background:${esc(t.card)}">` + this.design.blocks.map((b, i) =>
                `<div class="ch-dz-blk ${this.sel === b.id ? 'sel' : ''}" data-id="${b.id}" draggable="true"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tbody>${this.sample(row(b, t))}</tbody></table>` +
                `<div class="ch-dz-tools"><span class="ch-dz-tag">${TYPES[b.type].label}</span><a data-ba="up" title="Subir" class="${i ? '' : 'off'}"><span class="fas fa-arrow-up"></span></a><a data-ba="down" title="Bajar" class="${i < this.design.blocks.length - 1 ? '' : 'off'}"><span class="fas fa-arrow-down"></span></a><a data-ba="dup" title="Duplicar"><span class="far fa-clone"></span></a><a data-ba="del" title="Eliminar"><span class="far fa-trash-can"></span></a></div></div>`).join('') +
                (this.design.blocks.length ? '' : '<div class="ch-dz-empty">Arrastra aquí un bloque para empezar.</div>') + '</div>';
        }

        // ---- panel de propiedades
        field(f, val, i) {
            const [k, label, type, extra] = f;
            if (type === 'check') { return `<label class="ch-dz-chk"><input type="checkbox" data-k="${k}" ${val ? 'checked' : ''}> ${esc(label)}</label>`; }
            let inp;
            if (type === 'text') { inp = `<input data-k="${k}" value="${esc(val)}">`; }
            else if (type === 'color') { inp = `<div class="ch-dz-color"><input type="color" data-kc="${k}" value="${/^#[0-9a-f]{6}$/i.test(val) ? val : '#2f43c4'}"><input data-k="${k}" value="${esc(val)}" placeholder="#rrggbb"></div>`; }
            else if (type === 'select') { inp = `<select data-k="${k}">${extra.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
            else if (type === 'range') { inp = `<div class="ch-dz-range"><input type="range" data-k="${k}" min="${extra[0]}" max="${extra[1]}" value="${+val || extra[0]}"><b>${+val || extra[0]}</b></div>`; }
            else if (type === 'rich') { inp = MailSend.editorMarkup(4).replace('name="body"', `data-rk="${k}"`); }
            return `<label class="ch-dz-l">${esc(label)}</label>${inp}`;
        }

        varsRow() { return '<div class="ch-var-row"><span class="ch-muted">Variables:</span> ' + ((this.opts.varList || []).map(([v, t]) => `<a class="ch-var" data-v="${esc(v)}" title="${esc(t)}">${esc(v)}</a>`).join('')) + '</div>'; }

        paintProps() {
            const b = this.design.blocks.find(x => x.id === this.sel);
            if (this.sel === 'theme' || !b) {
                const t = this.design.theme;
                this.props.innerHTML = `<h5><span class="fas fa-palette"></span> Estilo general</h5><label class="ch-dz-l">Color de marca</label><div class="ch-dz-color"><input type="color" data-tc="brand" value="${t.brand}"><input data-t="brand" value="${esc(t.brand)}"></div>
                    <label class="ch-dz-l">Fondo del correo</label><div class="ch-dz-color"><input type="color" data-tc="bg" value="${t.bg}"><input data-t="bg" value="${esc(t.bg)}"></div>
                    <label class="ch-dz-l">Fondo de la tarjeta</label><div class="ch-dz-color"><input type="color" data-tc="card" value="${t.card}"><input data-t="card" value="${esc(t.card)}"></div>
                    <label class="ch-dz-l">Color del texto</label><div class="ch-dz-color"><input type="color" data-tc="text" value="${t.text}"><input data-t="text" value="${esc(t.text)}"></div>
                    <label class="ch-dz-l">Tipo de letra</label><select data-t="font">${FONTS.map(([v, l]) => `<option value="${esc(v)}" ${v === t.font ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    <label class="ch-dz-l">Ancho (px)</label><div class="ch-dz-range"><input type="range" data-t="width" min="480" max="700" value="${+t.width || 600}"><b>${+t.width || 600}</b></div>
                    <div class="ch-muted ch-dz-tip">Selecciona un bloque del lienzo para editar sus propiedades.</div>`;
                this.mountRich(); return;
            }
            const T = TYPES[b.type];
            this.props.innerHTML = `<h5><span class="${T.icon}"></span> ${T.label}</h5>` + T.f.map(f => this.field(f, b.props[f[0]])).join('') + (T.f.some(f => f[2] === 'rich' || f[2] === 'text') ? this.varsRow() : '') +
                (b.type === 'image' ? '<a class="ch-dz-link" data-act="logo"><span class="fas fa-building"></span> Usar el logo de la empresa</a>' : '');
            this.mountRich(b);
        }

        mountRich(b) {
            MailSend.mountEditor(this.props);
            this.props.querySelectorAll('[data-rk]').forEach(a => {
                a.value = b.props[a.dataset.rk] || '';
                a.addEventListener('input', () => { b.props[a.dataset.rk] = a.value; this.changed(); });
                a.addEventListener('focus', () => { this.lastField = a; });
            });
        }

        // ---- eventos
        select(id) { this.sel = id; this.paintCanvas(); this.paintProps(); }
        add(type, index) {
            const b = mk(type), bl = this.design.blocks;
            const at = index != null ? index : (this.sel && bl.findIndex(x => x.id === this.sel) >= 0 ? bl.findIndex(x => x.id === this.sel) + 1 : bl.length);
            bl.splice(at, 0, b); this.sel = b.id; this.changed(); this.paintProps();
        }
        move(id, to) {
            const bl = this.design.blocks, from = bl.findIndex(x => x.id === id); if (from < 0) { return; }
            const [b] = bl.splice(from, 1); bl.splice(from < to ? to - 1 : to, 0, b); this.changed();
        }

        bind() {
            const root = this.root;
            root.addEventListener('click', e => {
                const pi = e.target.closest('.ch-dz-pi'); if (pi) { this.add(pi.dataset.type); return; }
                const dv = e.target.closest('[data-dv]'); if (dv) { this.mobile = dv.dataset.dv === 'm'; root.querySelectorAll('[data-dv]').forEach(a => a.classList.toggle('on', a === dv)); this.paintCanvas(); return; }
                if (e.target.closest('[data-act="theme"]')) { this.select('theme'); return; }
                if (e.target.closest('[data-act="logo"]')) { const b = this.cur(); if (b) { b.props.url = '{logo}'; this.paintProps(); this.changed(); } return; }
                const v = e.target.closest('.ch-var'); if (v) { this.insertVar(v.dataset.v); return; }
                const ba = e.target.closest('[data-ba]');
                if (ba) {
                    const blk = ba.closest('.ch-dz-blk'), bl = this.design.blocks, i = bl.findIndex(x => x.id === blk.dataset.id), act = ba.dataset.ba;
                    if (act === 'up' && i > 0) { [bl[i - 1], bl[i]] = [bl[i], bl[i - 1]]; } else if (act === 'down' && i < bl.length - 1) { [bl[i + 1], bl[i]] = [bl[i], bl[i + 1]]; }
                    else if (act === 'dup') { const c = JSON.parse(JSON.stringify(bl[i])); c.id = uid(); bl.splice(i + 1, 0, c); this.sel = c.id; this.paintProps(); }
                    else if (act === 'del') { bl.splice(i, 1); this.sel = null; this.paintProps(); }
                    this.changed(); return;
                }
                const blk = e.target.closest('.ch-dz-blk'); if (blk) { this.select(blk.dataset.id); return; }
                if (e.target.closest('.ch-dz-stage') && !e.target.closest('.ch-dz-card')) { this.select(null); }
            });
            root.addEventListener('input', e => {
                const el = e.target, b = this.cur();
                if (el.dataset.t) { const k = el.dataset.t; this.design.theme[k] = k === 'width' ? +el.value : el.value; if (el.type === 'range') { el.nextElementSibling.textContent = el.value; } const c = this.props.querySelector(`[data-tc="${k}"]`); if (c && /^#[0-9a-f]{6}$/i.test(el.value)) { c.value = el.value; } this.changed(); }
                else if (el.dataset.tc) { this.design.theme[el.dataset.tc] = el.value; this.props.querySelector(`[data-t="${el.dataset.tc}"]`).value = el.value; this.changed(); }
                else if (b && el.dataset.k) { const k = el.dataset.k; b.props[k] = el.type === 'checkbox' ? el.checked : (el.type === 'range' ? +el.value : el.value); if (el.type === 'range') { el.nextElementSibling.textContent = el.value; } const c = this.props.querySelector(`[data-kc="${k}"]`); if (c && /^#[0-9a-f]{6}$/i.test(el.value)) { c.value = el.value; } this.changed(); }
                else if (b && el.dataset.kc) { b.props[el.dataset.kc] = el.value; this.props.querySelector(`[data-k="${el.dataset.kc}"]`).value = el.value; this.changed(); }
            });
            root.addEventListener('focusin', e => { const el = e.target; if (el.matches && el.matches('input[data-k]') && (!el.type || el.type === 'text')) { this.lastField = el; } });
            // arrastrar y soltar: desde la paleta (nuevo) o dentro del lienzo (reordenar)
            root.addEventListener('dragstart', e => {
                const pi = e.target.closest && e.target.closest('.ch-dz-pi'), blk = e.target.closest && e.target.closest('.ch-dz-blk');
                if (pi) { this.drag = {new: pi.dataset.type}; } else if (blk) { this.drag = {id: blk.dataset.id}; } else { return; }
                e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'ch'); } catch (x) { /* noop */ }
            });
            this.canvas.addEventListener('dragover', e => {
                if (!this.drag) { return; }
                e.preventDefault(); this.clearLine();
                const blk = e.target.closest('.ch-dz-blk'); if (blk) { const r = blk.getBoundingClientRect(); blk.classList.add(e.clientY < r.top + r.height / 2 ? 'ins-before' : 'ins-after'); }
            });
            this.canvas.addEventListener('dragleave', e => { if (!this.canvas.contains(e.relatedTarget)) { this.clearLine(); } });
            this.canvas.addEventListener('drop', e => {
                if (!this.drag) { return; }
                e.preventDefault();
                const blk = e.target.closest('.ch-dz-blk'), bl = this.design.blocks;
                let at = bl.length;
                if (blk) { const r = blk.getBoundingClientRect(), i = bl.findIndex(x => x.id === blk.dataset.id); at = e.clientY < r.top + r.height / 2 ? i : i + 1; }
                this.clearLine();
                if (this.drag.new) { this.add(this.drag.new, at); } else { this.move(this.drag.id, at); }
                this.drag = null;
            });
            root.addEventListener('dragend', () => { this.drag = null; this.clearLine(); });
        }
        clearLine() { this.canvas.querySelectorAll('.ins-before,.ins-after').forEach(x => x.classList.remove('ins-before', 'ins-after')); }
        cur() { return this.design.blocks.find(x => x.id === this.sel); }

        insertVar(v) {
            const f = this.lastField; if (!f) { Espo.Ui.warning('Haz clic primero en el campo de texto donde quieres la variable.'); return; }
            if (f.isContentEditable) { f.focus(); document.execCommand('insertText', false, v); }
            else { const s = f.selectionStart || f.value.length; f.value = f.value.slice(0, s) + v + f.value.slice(f.selectionEnd || s); f.dispatchEvent(new Event('input', {bubbles: true})); f.focus(); }
        }
    }
    return {Designer, renderEmail, starter, TYPES};
});
