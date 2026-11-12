// SanoGestion — Inicio / Indicadores del día
import { store } from '../store.js';
import { esc, num, usd, bs, todayKey, dayKey, addDays, fmtLongDate, emptyState, qtyFmt } from '../utils.js';
import { icon } from '../icons.js';
import { printDoc, debtStatus, openRateModal } from '../shared.js';

const activeSales = () => store.recentSales.filter((s) => s.status !== 'voided');

function saleCost(s) {
  return (s.items || []).reduce((a, it) => a + (Number(it.cost) || 0) * (Number(it.qty) || 0) * (Number(it.multiplier) || 1), 0);
}

export function mount(el, { navigate }) {
  const render = () => {
    const rate = store.rate;
    const today = todayKey();
    const sales = activeSales();
    const todaySales = sales.filter((s) => s.dayKey === today);
    const totalToday = todaySales.reduce((a, s) => a + (s.total || 0), 0);
    const profitToday = todaySales.reduce((a, s) => a + (s.total || 0) - saleCost(s), 0);
    const shift = store.openShift;
    const cashUSD = shift ? (shift.openingUSD || 0) + (shift.inUSD || 0) - (shift.outUSD || 0) : 0;
    const cashBs = shift ? (shift.openingBs || 0) + (shift.inBs || 0) - (shift.outBs || 0) : 0;
    const debts = store.openDebts;
    const receivable = debts.reduce((a, d) => a + (d.balance || 0), 0);
    const overdue = debts.filter((d) => debtStatus(d) === 'overdue').reduce((a, d) => a + (d.balance || 0), 0);
    const products = store.products;
    const low = products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= (p.minStock ?? store.settings.lowStock));
    const out = products.filter((p) => (p.stock || 0) <= 0);
    let invCost = 0, invSale = 0;
    products.forEach((p) => { const st = Math.max(0, Number(p.stock) || 0); invCost += st * (p.cost || 0); invSale += st * (p.price || 0); });

    // Últimos 7 días
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const k = dayKey(addDays(new Date(), -i));
      const tot = sales.filter((s) => s.dayKey === k).reduce((a, s) => a + (s.total || 0), 0);
      days.push({ k, tot, label: addDays(new Date(), -i).toLocaleDateString('es-VE', { weekday: 'short' }).replace('.', '') });
    }
    const maxDay = Math.max(...days.map((d) => d.tot), 1);

    // Top 5 (28 días)
    const since28 = dayKey(addDays(new Date(), -27));
    const top = {};
    sales.filter((s) => s.dayKey >= since28 && s.type !== 'service').forEach((s) => (s.items || []).forEach((it) => {
      const k = it.productId || it.name;
      top[k] ||= { name: it.name, qty: 0, total: 0 };
      top[k].qty += (it.qty || 0) * (it.multiplier || 1);
      top[k].total += it.total || 0;
    }));
    const top5 = Object.values(top).sort((a, b) => b.total - a.total).slice(0, 5);

    // Reposición (5 días)
    const since5 = dayKey(addDays(new Date(), -4));
    const repo = {};
    sales.filter((s) => s.dayKey >= since5 && s.type !== 'service').forEach((s) => (s.items || []).forEach((it) => {
      if (!it.productId) return;
      repo[it.productId] ||= { id: it.productId, name: it.name, qty: 0 };
      repo[it.productId].qty += (it.qty || 0) * (it.multiplier || 1);
    }));
    const repoList = Object.values(repo).map((r) => ({ ...r, stock: store.product(r.id)?.stock ?? 0, unit: store.product(r.id)?.unit || '' })).sort((a, b) => b.qty - a.qty);

    const critical = [...out, ...low].sort((a, b) => (a.stock || 0) - (b.stock || 0)).slice(0, 7);

    const alerts = [];
    if (!(rate > 0)) alerts.push({ tone: 'warning', ic: 'dollar', t: 'Configura la tasa del día', d: 'Necesaria para mostrar precios en bolívares y vender.', go: () => openRateModal() });
    if (!shift) alerts.push({ tone: 'info', ic: 'wallet', t: 'La caja está cerrada', d: 'Abre un turno para comenzar a vender.', go: () => navigate('caja') });
    if (out.length) alerts.push({ tone: 'danger', ic: 'box', t: `${out.length} producto${out.length > 1 ? 's' : ''} agotado${out.length > 1 ? 's' : ''}`, d: 'Revisa el inventario y reabastece.', go: () => { sessionStorage.setItem('sg_inv_filter', 'out'); navigate('inventario'); } });
    if (low.length) alerts.push({ tone: 'warning', ic: 'alert', t: `${low.length} con stock bajo`, d: 'Productos por debajo del mínimo.', go: () => { sessionStorage.setItem('sg_inv_filter', 'low'); navigate('inventario'); } });
    if (overdue > 0) alerts.push({ tone: 'danger', ic: 'card', t: `${usd(overdue)} en fiados vencidos`, d: 'Gestiona el cobro con tus clientes.', go: () => navigate('cobranza') });
    if (!products.length) alerts.push({ tone: 'brand', ic: 'plus', t: 'Agrega tus primeros productos', d: 'Carga tu inventario uno a uno o importa un archivo CSV.', go: () => navigate('inventario') });

    el.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Hola, ${esc(store.businessName)}</h1>
          <p class="view-sub">${fmtLongDate()}</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-secondary" data-go="caja">${icon('wallet')} Caja</button>
          <button class="btn btn-primary" data-go="vender">${icon('cart')} Nueva venta</button>
        </div>
      </div>

      ${alerts.length ? `<div class="grid grid-3 mb" style="margin-bottom:18px">${alerts.map((a, i) => `
        <button class="alert" data-alert="${i}">
          <span class="kpi-icon tone-${a.tone}">${icon(a.ic)}</span>
          <span class="grow"><span class="alert-title" style="display:block">${a.t}</span><span class="alert-desc">${a.d}</span></span>
          ${icon('arrowRight', '')}
        </button>`).join('')}</div>` : ''}

      <div class="kpis" data-tour="kpis">
        ${kpi('Ventas de hoy', usd(totalToday), `${bs(totalToday * rate)} · ${todaySales.length} venta${todaySales.length === 1 ? '' : 's'}`, 'trend', 'brand')}
        ${kpi('Ganancia estimada', usd(profitToday), bs(profitToday * rate), 'dollar', 'success')}
        ${kpi('Efectivo en caja', shift ? usd(cashUSD) : '—', shift ? `+ ${bs(cashBs)}` : 'Caja cerrada', 'wallet', 'info')}
        ${kpi('Por cobrar (fiados)', usd(receivable), overdue > 0 ? `<span class="text-danger">${usd(overdue)} vencido</span>` : bs(receivable * rate), 'card', 'warning')}
      </div>

      <div class="grid grid-3">
        <div class="card span-2" data-tour="chart">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('chart')}</span>Ventas de los últimos 7 días</div><span class="badge badge-neutral">${usd(days.reduce((a, d) => a + d.tot, 0))}</span></div>
          <div class="chart">${days.map((d) => `
            <div class="chart-col ${d.k === today ? 'today' : ''}">
              <span class="chart-val">${d.tot > 0 ? usd(d.tot, d.tot >= 1000 ? 0 : 2) : ''}</span>
              <div class="chart-bar" style="height:${Math.max(2, (d.tot / maxDay) * 100)}%"></div>
              <span class="chart-lbl">${d.label}</span>
            </div>`).join('')}</div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('layers')}</span>Valor del inventario</div></div>
          <div class="stack">
            <div><div class="label">Costo total (inversión)</div><div class="kpi-value" style="font-size:22px;margin:2px 0 0">${usd(invCost)}</div><div class="kpi-sub">${bs(invCost * rate)}</div></div>
            <div class="divider" style="margin:0"></div>
            <div><div class="label">Valor de venta (proyección)</div><div class="kpi-value text-brand" style="font-size:22px;margin:2px 0 0">${usd(invSale)}</div><div class="kpi-sub">Ganancia potencial: ${usd(invSale - invCost)}</div></div>
            <div class="small muted">${products.length} producto${products.length === 1 ? '' : 's'} en catálogo</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('star')}</span>Más vendidos</div><span class="badge badge-neutral">28 días</span></div>
          ${top5.length ? `<div class="list">${top5.map((p, i) => `
            <div class="list-item">
              <span class="avatar" style="background:${['#0f9d77', '#2563eb', '#7c3aed', '#d97706', '#db2777'][i]};width:30px;height:30px;font-size:12px">${i + 1}</span>
              <div class="grow"><div class="bold ellipsis">${esc(p.name)}</div><div class="small muted">${qtyFmt(p.qty)} ${p.qty === 1 ? "unidad" : "unidades"}</div></div>
              <b class="num">${usd(p.total)}</b>
            </div>`).join('')}</div>` : emptyState('star', 'Aún sin ventas', 'Aquí verás tus productos estrella.')}
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico" style="background:var(--danger-soft);color:var(--danger)">${icon('alert')}</span>Stock crítico</div><button class="btn btn-ghost btn-sm" data-go="inventario">Ver todo</button></div>
          ${critical.length ? `<div class="list">${critical.map((p) => `
            <div class="list-item">
              <div class="grow"><div class="bold ellipsis">${esc(p.name)}</div><div class="small muted">Mínimo: ${qtyFmt(p.minStock ?? store.settings.lowStock)}</div></div>
              <span class="badge ${p.stock <= 0 ? 'badge-danger' : 'badge-warning'}">${p.stock <= 0 ? 'Agotado' : qtyFmt(p.stock) + ' ' + esc(p.unit || '')}</span>
            </div>`).join('')}</div>` : emptyState('check', 'Todo en orden', 'No hay productos con stock bajo.')}
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><span class="ico">${icon('refresh')}</span>Lista de reposición</div>
            <button class="btn btn-secondary btn-sm" id="repo-print" ${repoList.length ? '' : 'disabled'}>${icon('print')} Imprimir</button>
          </div>
          <p class="small muted mb">Vendido en los últimos 5 días, para reponer.</p>
          ${repoList.length ? `<div class="list" style="max-height:260px;overflow:auto">${repoList.slice(0, 30).map((r) => `
            <div class="list-item">
              <div class="grow"><div class="bold ellipsis">${esc(r.name)}</div><div class="small muted">Stock actual: ${qtyFmt(r.stock)}</div></div>
              <span class="badge badge-info">${qtyFmt(r.qty)} vendidos</span>
            </div>`).join('')}</div>` : emptyState('refresh', 'Sin movimientos recientes')}
        </div>
      </div>`;

    el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => navigate(b.dataset.go));
    el.querySelectorAll('[data-alert]').forEach((b) => b.onclick = () => alerts[+b.dataset.alert].go());
    const rp = el.querySelector('#repo-print');
    if (rp) rp.onclick = () => printDoc('Lista de reposición (últimos 5 días)', `
      <table><thead><tr><th>#</th><th>Producto</th><th class="r">Vendido</th><th class="r">Stock actual</th><th class="r">A pedir</th></tr></thead>
      <tbody>${repoList.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td class="r">${qtyFmt(r.qty)}</td><td class="r">${qtyFmt(r.stock)}</td><td class="r">________</td></tr>`).join('')}</tbody></table>`);
  };

  render();
  const off = store.on('change', render);
  const offR = store.on('rate', render);
  return () => { off(); offR(); };
}

function kpi(label, value, sub, ic, tone) {
  return `<div class="card kpi">
    <div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon tone-${tone}">${icon(ic)}</span></div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub">${sub}</div>
  </div>`;
}
