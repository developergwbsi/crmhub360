/**
 * Saldo y recargas (Integraciones → Saldo y recargas): los créditos prepagados con los que la empresa paga lo que usa de la plataforma
 * (IA, búsqueda, correo, SMS, WhatsApp, llamadas). Muestra el saldo, el obsequio del mes, lo que cuesta cada cosa, los paquetes de recarga (pago con Wompi) y los últimos movimientos.
 * Endpoints: GET CrmHub/wallet, POST CrmHub/walletCheckout. Hub: /v1/wallet. Solo admin.
 * Peculiaridad: el pago es en Wompi (se abre su página); el saldo se acredita solo cuando Wompi avisa que fue aprobado, así que tras pagar puede tardar unos segundos.
 */
define('custom:views/wallet', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const num = (n, d) => Number(n || 0).toLocaleString('es-CO', {maximumFractionDigits: d == null ? 0 : d});
    const reason = xhr => { const r = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } return r || 'No se pudo completar.'; };
    const KIND = {topup: 'Recarga', grant: 'Obsequio del mes', usage: 'Consumo', adjust: 'Ajuste'};
    const SERV = {ai: 'IA', search: 'Búsqueda', email: 'Correo', sms: 'SMS', whatsapp: 'WhatsApp', voice: 'Llamadas'};
    return class extends Dep {
        templateContent = '<div class="ch-wl"></div>'
        d = null
        afterRender() { this.load(); }
        load() {
            Espo.Ajax.getRequest('CrmHub/wallet').then(r => { this.d = r; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const el = this.el.querySelector('.ch-wl'); if (el) { el.innerHTML = '<div class="ch-chat-err">No se pudo cargar tu saldo.</div>'; } });
        }
        draw() {
            const el = this.el.querySelector('.ch-wl'); if (!el || !this.d) { return; }
            const d = this.d, zero = !d.exempt && d.balance <= 0, low = !d.exempt && d.balance <= (d.low || 0), mon = new Date().toISOString().slice(0, 7);
            const led = d.ledger || [], used = led.filter(x => x.kind === 'usage' && String(x.at).slice(0, 7) === mon).reduce((a, x) => a - x.credits, 0);
            const lastTop = led.find(x => x.kind === 'topup'), cop = c => '$ ' + num(c * (d.price_cop || 0)) + ' COP';
            const st = zero ? ['Sin créditos', 'bad'] : low ? ['Saldo bajo', 'warn'] : ['Al día', 'ok'];
            const ICON = {ai_in: 'fa-brain', ai_out: 'fa-brain', search: 'fa-magnifying-glass', email: 'fa-envelope', sms: 'fa-comment-sms', whatsapp: 'fa-whatsapp', voice: 'fa-phone'};
            const per = x => (x.price / x.credits), base = d.price_cop || 0, mid = (d.packs || []).length >= 3 ? 1 : -1;
            const packs = (d.packs || []).map((p, k) => { const sv = base && per(p) < base ? Math.round((1 - per(p) / base) * 100) : 0;
                return `<div class="ch-w-pack ${k === mid ? 'pop' : ''}">${k === mid ? '<em>Más elegido</em>' : ''}<div class="n">${num(p.credits)}</div><div class="u">créditos</div><div class="pr">$ ${num(p.price)} <small>COP</small></div>` +
                    `<div class="pp">$ ${num(per(p), 1)} por crédito${sv ? ` · <b>ahorras ${sv} %</b>` : ''}</div><button class="btn btn-primary" data-a="buy" data-c="${p.credits}" ${d.wompi ? '' : 'disabled'}><span class="fas fa-lock"></span> Recargar</button></div>`; }).join('');
            const costs = Object.entries(d.costs || {}).map(([k, c]) => `<div class="ch-w-cost"><span class="ic"><i class="${k === 'whatsapp' ? 'fab' : 'fas'} ${ICON[k] || 'fa-coins'}"></i></span><div><b>${esc(c.label)}</b><small>${num(c.credits, 2)} créditos · ${cop(c.credits)}</small></div></div>`).join('');
            const rows = x => `<tr><td>${esc(ChUi.fmt.dt(x.at))}</td><td><span class="ch-w-tag ${x.kind}">${esc(KIND[x.kind] || x.kind)}</span>${x.service ? ' <span class="ch-w-svc">' + esc(SERV[x.service] || x.service) + '</span>' : ''}</td><td class="${x.credits > 0 ? 'pos' : 'neg'}">${x.credits > 0 ? '+' : '−'}${num(Math.abs(x.credits), 2)}</td><td>${num(x.balance_after, 1)}</td><td class="mut">${esc(x.note || '')}</td></tr>`;
            const f = this.f || 'all', shown = led.filter(x => f === 'all' || (f === 'in' ? x.credits > 0 : x.credits < 0));
            el.innerHTML = `<div class="ch-w">` +
                (d.exempt ? '<div class="ch-w-note"><span class="fas fa-circle-info"></span> Esta empresa es de <b>uso interno</b>: no se le descuenta ningún saldo. Los botones de recarga se muestran solo para poder probar el pago.</div>' : '') +
                `<div class="ch-w-hero"><div class="ch-w-bal ${st[1]}"><div class="lab"><span class="fas fa-coins"></span> Tu saldo <i class="ch-w-chip ${st[1]}">${st[0]}</i></div><div class="big">${num(d.balance, 1)}</div><div class="sub">créditos · equivale a ${cop(d.balance)}</div>` +
                `<div class="msg">${zero ? 'Lo que usa la plataforma está en pausa hasta que recargues, o conectes tu propio motor de IA y buscador.' : low ? 'Te quedan pocos créditos: recarga para que tus agentes no se detengan.' : 'Tus agentes, el buscador y tus canales pagados trabajan con normalidad.'}</div></div>` +
                `<div class="ch-w-kpis"><div class="k"><span>Usados este mes</span><b>${num(used, 1)}</b><small>créditos</small></div><div class="k"><span>Obsequio mensual</span><b>${num(d.grant)}</b><small>${d.grant ? 'créditos cada mes' : 'sin obsequio'}</small></div><div class="k"><span>Última recarga</span><b>${lastTop ? '+' + num(lastTop.credits) : '—'}</b><small>${lastTop ? esc(ChUi.fmt.dt(lastTop.at)) : 'aún no hay'}</small></div></div></div>` +
                `<h4 class="ch-w-h">Recargar créditos</h4><div class="ch-w-packs">${packs || '<span class="ch-muted">Aún no hay paquetes disponibles.</span>'}</div>` +
                (d.wompi ? `<p class="ch-w-sec"><span class="fas fa-shield-halved"></span><span>Pago seguro con Wompi${d.sandbox ? ' · <b>modo de pruebas: no se cobra dinero real</b>' : ''}. Cuando se aprueba, tus créditos aparecen aquí en unos segundos.</span></p>` : '<p class="ch-w-sec"><span class="fas fa-circle-info"></span><span>Los pagos en línea aún no están activos: pide la recarga a tu proveedor y te la acreditamos.</span></p>') +
                `<h4 class="ch-w-h">¿En qué se usan los créditos?</h4><div class="ch-w-costs">${costs}</div><p class="ch-w-sec"><span class="fas fa-plug"></span><span>Lo que corre con tus <b>propios proveedores</b> (tu motor de IA, tu buscador, tu correo, tu WhatsApp) no descuenta créditos.</span></p>` +
                `<div class="ch-w-led-h"><h4 class="ch-w-h" style="margin:0">Movimientos</h4><div class="ch-w-flt">${[['all', 'Todos'], ['in', 'Entradas'], ['out', 'Consumo']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-a="flt" data-f="${k}">${l}</button>`).join('')}</div></div>` +
                (shown.length ? `<div class="ch-w-led"><table><thead><tr><th>Cuándo</th><th>Movimiento</th><th>Créditos</th><th>Saldo</th><th>Detalle</th></tr></thead><tbody>${shown.map(rows).join('')}</tbody></table></div>` : '<div class="ch-w-empty">Aún no hay movimientos.</div>') + '</div>';
            el.onclick = e => {
                const fl = e.target.closest('[data-a=flt]'); if (fl) { this.f = fl.dataset.f; this.draw(); return; }
                const b = e.target.closest('[data-a=buy]'); if (!b) { return; }
                b.disabled = true;
                Espo.Ajax.postRequest('CrmHub/walletCheckout', {credits: +b.dataset.c, redirect: window.location.origin + '/#CrmHub/integrations'})
                    .then(r => { window.open(r.url, '_blank', 'noopener'); Espo.Ui.success('Se abrió la página de pago. Al aprobarse, tus créditos se acreditan solos.'); b.disabled = false; setTimeout(() => this.load(), 20000); })
                    .catch(xhr => { Espo.Ui.error(reason(xhr)); b.disabled = false; });
            };
        }
    };
});
