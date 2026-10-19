/**
 * Fórmulas de los formularios internos en el navegador (campos calculados y plan de pagos). Es el mismo lenguaje que evalúa el Hub (hub-service/app/formula.py):
 * + - * / ^, paréntesis, % pospuesto, comparaciones, Y/O/NO y funciones REDONDEAR, REDONDEAR_ARRIBA/ABAJO, MIN, MAX, SUMA, PROMEDIO, ABS, POTENCIA, SI y CUOTA.
 * Argumentos con «;» (la coma es decimal) o con «,» (punto decimal). evaluate(src, env) lanza Error con un mensaje claro; schedule(...) arma la tabla de amortización.
 */
define('custom:formula', [], function () {
    const FUNCS = new Set(['REDONDEAR', 'REDONDEAR_ARRIBA', 'REDONDEAR_ABAJO', 'MIN', 'MAX', 'SUMA', 'PROMEDIO', 'ABS', 'POTENCIA', 'SI', 'CUOTA', 'ROUND', 'IF', 'SUM', 'AVG', 'PMT', 'POW', 'Y', 'O', 'AND', 'OR', 'NO', 'NOT']);
    const round = (x, d) => { const f = Math.pow(10, d || 0); return Math.floor(Math.abs(x) * f + 0.5 + 1e-9) / f * (x >= 0 ? 1 : -1); };

    function tokens(src) {
        src = String(src).trim();
        if (src.includes(';')) { src = src.replace(/(?<=\d),(?=\d)/g, '.'); }
        const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|<>|[-+*/^%(),;<>=]))/y, out = [];
        let pos = 0;
        while (pos < src.length) {
            re.lastIndex = pos; const m = re.exec(src);
            if (!m || re.lastIndex === pos) { throw new Error('No entiendo «' + src.slice(pos, pos + 12).trim() + '» en la fórmula.'); }
            pos = re.lastIndex;
            out.push(m[1] !== undefined ? ['n', parseFloat(m[1])] : m[2] !== undefined ? ['i', m[2]] : ['o', m[3]]);
        }
        return out;
    }

    function refs(src) {
        try { const t = tokens(src); return t.filter((x, i) => x[0] === 'i' && !FUNCS.has(x[1].toUpperCase()) && !(t[i + 1] && t[i + 1][0] === 'o' && t[i + 1][1] === '(') && !['VERDADERO', 'FALSO', 'TRUE', 'FALSE'].includes(x[1].toUpperCase())).map(x => x[1]); } catch (e) { return []; }
    }

    function pmt(rate, n, pv) { const r = rate / 100; n = Math.round(n); if (n <= 0) { throw new Error('CUOTA necesita al menos un periodo.'); } return r === 0 ? pv / n : pv * r / (1 - Math.pow(1 + r, -n)); }

    function evaluate(src, env) {
        if (!String(src || '').trim()) { throw new Error('La fórmula está vacía.'); }
        const t = tokens(src); let i = 0;
        const peek = () => t[i] || [null, null], is = (k, v) => { const p = peek(); return p[0] === k && p[1] === v; };
        const eat = (k, v) => { const p = peek(); if (p[0] === null || (k && p[0] !== k) || (v !== undefined && p[1] !== v)) { throw new Error('La fórmula está incompleta o mal escrita.'); } i++; return p[1]; };
        const isOp = (...o) => peek()[0] === 'o' && o.includes(peek()[1]);
        function args() { const a = []; eat('o', '('); if (is('o', ')')) { i++; return a; } for (;;) { a.push(orE()); if (isOp(',', ';')) { i++; continue; } eat('o', ')'); return a; } }
        function call(name, a) {
            const need = n => { if (a.length < n) { throw new Error(name + ' necesita ' + n + ' dato(s).'); } };
            switch (name) {
                case 'REDONDEAR': case 'ROUND': need(1); return round(a[0], a[1] || 0);
                case 'REDONDEAR_ARRIBA': { need(1); const f = Math.pow(10, a[1] || 0); return Math.ceil(a[0] * f - 1e-9) / f; }
                case 'REDONDEAR_ABAJO': { need(1); const f = Math.pow(10, a[1] || 0); return Math.floor(a[0] * f + 1e-9) / f; }
                case 'MIN': need(1); return Math.min(...a);
                case 'MAX': need(1); return Math.max(...a);
                case 'SUMA': case 'SUM': return a.reduce((x, y) => x + y, 0);
                case 'PROMEDIO': case 'AVG': need(1); return a.reduce((x, y) => x + y, 0) / a.length;
                case 'ABS': need(1); return Math.abs(a[0]);
                case 'POTENCIA': case 'POW': need(2); return Math.pow(a[0], a[1]);
                case 'CUOTA': case 'PMT': need(3); return pmt(a[0], a[1], a[2]);
                case 'NO': case 'NOT': need(1); return a[0] ? 0 : 1;
                case 'Y': case 'AND': return a.every(Boolean) ? 1 : 0;
                case 'O': case 'OR': return a.some(Boolean) ? 1 : 0;
                default: throw new Error('Función «' + name + '» no disponible.');
            }
        }
        function atom() {
            const [k, v] = peek();
            if (k === 'n') { i++; return v; }
            if (k === 'o' && v === '(') { i++; const x = orE(); eat('o', ')'); return x; }
            if (k === 'i') {
                i++; const name = v.toUpperCase();
                if (is('o', '(') && FUNCS.has(name)) { const a = args(); if (name === 'SI' || name === 'IF') { if (a.length !== 3) { throw new Error('SI necesita tres partes: SI(condición; si es cierto; si es falso).'); } return a[0] ? a[1] : a[2]; } return call(name, a); }
                if (Object.prototype.hasOwnProperty.call(env, v)) { const x = env[v]; return x === null || x === '' || x === undefined ? 0 : Number(x); }
                if (name === 'VERDADERO' || name === 'TRUE') { return 1; }
                if (name === 'FALSO' || name === 'FALSE') { return 0; }
                throw new Error('No existe el campo «' + v + '».');
            }
            throw new Error('La fórmula está incompleta o mal escrita.');
        }
        function post() { let v = atom(); while (is('o', '%')) { i++; v /= 100; } return v; }
        function unary() { if (is('o', '-')) { i++; return -unary(); } if (is('o', '+')) { i++; return unary(); } return post(); }
        function pow() { const v = unary(); if (is('o', '^')) { i++; return Math.pow(v, pow()); } return v; }
        function mul() { let v = pow(); while (isOp('*', '/')) { const op = eat(); const w = pow(); if (op === '/') { if (w === 0) { throw new Error('División entre cero.'); } v /= w; } else { v *= w; } } return v; }
        function add() { let v = mul(); while (isOp('+', '-')) { const op = eat(); const w = mul(); v = op === '+' ? v + w : v - w; } return v; }
        function cmp() { let v = add(); while (isOp('>', '<', '>=', '<=', '==', '=', '!=', '<>')) { const op = eat(), w = add(); v = ({'>': v > w, '<': v < w, '>=': v >= w, '<=': v <= w, '==': v === w, '=': v === w, '!=': v !== w, '<>': v !== w})[op] ? 1 : 0; } return v; }
        function andE() { let v = cmp(); while (is('i', 'Y') || is('i', 'AND')) { i++; const w = cmp(); v = v && w ? 1 : 0; } return v; }
        function orE() { let v = andE(); while (is('i', 'O') || is('i', 'OR')) { i++; const w = andE(); v = v || w ? 1 : 0; } return v; }
        const r = orE();
        if (i !== t.length) { throw new Error('Sobra texto al final de la fórmula.'); }
        if (!Number.isFinite(r)) { throw new Error('El resultado no es un número válido.'); }
        return r;
    }

    const FREQ = {mensual: [12, 30], quincenal: [24, 15], semanal: [52, 7]};
    function addPeriod(d, freq, n) {
        if (freq === 'mensual') { const m = d.getMonth() + n, y = d.getFullYear() + Math.floor(m / 12), mo = ((m % 12) + 12) % 12, last = new Date(y, mo + 1, 0).getDate(); return new Date(y, mo, Math.min(d.getDate(), last)); }
        const x = new Date(d); x.setDate(x.getDate() + FREQ[freq][1] * n); return x;
    }
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    // Tabla de amortización: frances (cuota fija), aleman (abono fijo a capital), simple (interés simple, cuota fija) y sininteres
    function schedule(o) {
        const n = Math.round(o.n), freq = FREQ[o.freq] ? o.freq : 'mensual', dec = o.decimals || 0;
        if (!(n >= 1 && n <= 480)) { throw new Error('El número de cuotas debe estar entre 1 y 480.'); }
        if (o.principal < 0) { throw new Error('El valor a financiar no puede ser negativo.'); }
        let r = (o.rate / 100) / (o.rateType === 'anual' ? FREQ[freq][0] : 1), method = o.method || 'frances';
        if (method === 'sininteres' || r === 0) { method = 'sininteres'; r = 0; }
        const P = o.principal, start = o.start || new Date(), off = o.firstIsStart ? 1 : 0;
        const fixed = method === 'frances' ? P * r / (1 - Math.pow(1 + r, -n)) : method === 'simple' ? P * (1 + r * n) / n : P / n;
        let bal = P; const rows = [];
        for (let k = 1; k <= n; k++) {
            let pay, interest, cap;
            if (method === 'aleman') { cap = P / n; interest = bal * r; pay = cap + interest; } else if (method === 'simple') { interest = P * r; pay = fixed; cap = pay - interest; } else { interest = bal * r; pay = fixed; cap = pay - interest; }
            if (k === n) { cap = bal; pay = cap + interest; }
            bal = Math.max(0, bal - cap);
            rows.push({n: k, date: iso(addPeriod(start, freq, k - off)), pay: round(pay, dec), interest: round(interest, dec), capital: round(cap, dec), balance: round(bal, dec)});
        }
        const total = rows.reduce((a, x) => a + x.pay, 0);
        return {rows, total: round(total, dec), interest: round(total - P, dec), firstPay: rows[0].pay, n};
    }

    return {evaluate, refs, schedule, round};
});
