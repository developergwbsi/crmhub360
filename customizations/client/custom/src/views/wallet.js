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
            const d = this.d, zero = !d.exempt && d.balance <= 0, low = !d.exempt && d.balance <= (d.low || 0);
            const packs = (d.packs || []).map(p => `<div class="ch-wl-pack"><b>${num(p.credits)}</b><span>créditos</span><small>$ ${num(p.price)} COP</small><button class="btn btn-primary btn-sm" data-a="buy" data-c="${p.credits}" ${d.wompi ? '' : 'disabled'}>Recargar</button></div>`).join('');
            const costs = Object.values(d.costs || {}).map(c => `<tr><td>${esc(c.label)}</td><td>${num(c.credits, 2)}</td></tr>`).join('');
            const led = (d.ledger || []).map(x => `<tr><td>${esc(ChUi.fmt.dt(x.at))}</td><td>${esc(KIND[x.kind] || x.kind)}${x.service ? ' · ' + esc(SERV[x.service] || x.service) : ''}</td><td style="text-align:right">${x.credits > 0 ? '+' : ''}${num(x.credits, 2)}</td><td style="text-align:right">${num(x.balance_after, 1)}</td><td>${esc(x.note || '')}</td></tr>`).join('');
            el.innerHTML = `<div class="panel panel-default"><div class="panel-heading"><h4 class="panel-title"><span class="fas fa-coins"></span> Saldo y recargas</h4></div><div class="panel-body">` +
                (d.exempt ? '<p class="ch-muted">Tu empresa es de uso interno: lo que usas de la plataforma no se descuenta de ningún saldo.</p>' :
                `<div class="ch-wl-top"><div class="ch-wl-bal ${low ? 'low' : ''}"><span>Tu saldo</span><b>${num(d.balance, 1)}</b><small>créditos</small></div><div class="ch-wl-info"><p>Con tus créditos pagas lo que usas de <b>DigitalAlliance Hub</b>: el motor de IA de tus agentes, el buscador de prospectos y, si así lo tienes, correo, SMS, WhatsApp y llamadas. ` +
                `Lo que corre con tus <b>propios proveedores</b> no descuenta créditos.</p>${d.grant ? `<p class="ch-muted">Cada mes recibes <b>${num(d.grant)}</b> créditos de obsequio.</p>` : ''}` +
                `${zero ? '<div class="ch-warn" style="margin:8px 0">Te quedaste sin créditos: lo que usa la plataforma está en pausa hasta que recargues (o conectes tu propio motor de IA y buscador).</div>' : low ? '<div class="ch-warn" style="margin:8px 0">Te quedan pocos créditos. Recarga para que tus agentes no se detengan.</div>' : ''}</div></div>` +
                `<h5>Recargar</h5><div class="ch-wl-packs">${packs || '<span class="ch-muted">Aún no hay paquetes disponibles.</span>'}</div>` +
                (d.wompi ? `<p class="ch-muted" style="margin-top:8px">El pago se hace en Wompi${d.sandbox ? ' (<b>modo de pruebas</b>: no se cobra dinero real)' : ''}. Cuando se aprueba, tus créditos aparecen aquí en unos segundos.</p>` : '<p class="ch-muted" style="margin-top:8px">Los pagos en línea aún no están activos: pide la recarga a tu proveedor y te la acreditamos.</p>')) +
                `<h5 style="margin-top:16px">Lo que cuesta cada cosa</h5><table class="table table-condensed" style="max-width:520px"><thead><tr><th>Servicio</th><th>Créditos</th></tr></thead><tbody>${costs}</tbody></table>` +
                `<h5 style="margin-top:16px">Últimos movimientos</h5>${led ? `<div class="ch-wl-led"><table class="table table-condensed"><thead><tr><th>Cuándo</th><th>Tipo</th><th style="text-align:right">Créditos</th><th style="text-align:right">Saldo</th><th>Detalle</th></tr></thead><tbody>${led}</tbody></table></div>` : '<p class="ch-muted">Aún no hay movimientos.</p>'}</div></div>`;
            el.onclick = e => {
                const b = e.target.closest('[data-a=buy]'); if (!b) { return; }
                b.disabled = true;
                Espo.Ajax.postRequest('CrmHub/walletCheckout', {credits: +b.dataset.c, redirect: window.location.origin + '/#CrmHub/integrations'})
                    .then(r => { window.open(r.url, '_blank', 'noopener'); Espo.Ui.success('Se abrió la página de pago. Al aprobarse, tus créditos se acreditan solos.'); b.disabled = false; setTimeout(() => this.load(), 20000); })
                    .catch(xhr => { Espo.Ui.error(reason(xhr)); b.disabled = false; });
            };
        }
    };
});
