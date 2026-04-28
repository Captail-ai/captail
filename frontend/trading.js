import { t } from './i18n.js';
import * as R from './router.js';
import { live } from './app.js';

function statusText(s) {
  return t('status.' + s) || s;
}

async function viewTrading(el, params) {
  const initSymbol = params.symbol && live.symbols.find(s => s.symbol === params.symbol)
    ? params.symbol : (live.symbols[0] && live.symbols[0].symbol) || 'XAU';

  const s = {
    symbol: initSymbol, interval: '1D', side: 'buy', type: 'limit',
    pane: 'orders', orders: [], trades: [], positions: [], cash: 0,
    chart: null, view: 'candle', depthChart: null, extras: {},
    lastBar: null, mas: {},
    mode: 'perp',
    opt: { cfg: null, dir: 'up', dur: 0, amount: 0, active: [], history: [] },
  };

  const IVS = ['1m','5m','15m','30m','1h','4h','1D'];

  el.innerHTML = `
    <div class="dk">
      <div class="dk-statbar">
        <div class="sb-sym">
          <div class="sb-ic" id="sb-ic">${s.symbol[1] || s.symbol[0]}</div>
          <div>
            <div class="sb-title"><b id="sb-pair">${s.symbol}USDT</b><span class="perp">Perp</span></div>
            <div class="sb-tags">Regular <span class="gold-tag">🪙 ${t('sb.gold')}</span></div>
          </div>
        </div>
        <div class="sb-price">
          <b id="sb-price">—</b>
          <small id="sb-chg">—</small>
        </div>
        <div class="sb-cell"><label>${t('sb.mark')}</label><span id="sb-mark">—</span></div>
        <div class="sb-cell"><label>${t('sb.index')}</label><span id="sb-index">—</span></div>
        <div class="sb-cell"><label>${t('sb.funding')}</label><span id="sb-funding">—</span></div>
        <div class="sb-cell"><label>${t('sb.high24')}</label><span id="sb-high">—</span></div>
        <div class="sb-cell"><label>${t('sb.low24')}</label><span id="sb-low">—</span></div>
        <div class="sb-cell"><label>${t('sb.vol24_base')}(<span id="sb-base-lbl">${s.symbol}</span>)</label><span id="sb-volb">—</span></div>
        <div class="sb-cell"><label>${t('sb.vol24_quote')}(USDT)</label><span id="sb-volq">—</span></div>
        <div class="sb-cell"><label>${t('sb.oi')}(USDT)</label><span id="sb-oi">—</span></div>
      </div>
      <div class="dk-layout">
        <aside class="dk-symbols">
          <h3>${t('trading.symbol')}</h3>
          <ul id="symbol-list">
            ${live.symbols.map(sy => {
              const ti = live.ticker[sy.symbol] || {};
              const up = (ti.price || 0) >= (ti.prev || 0);
              return `<li data-sym="${sy.symbol}" class="${sy.symbol === s.symbol ? 'active' : ''}">
                <div><div class="sym">${sy.symbol}</div><small>${sy.name}</small></div>
                <div><div class="price ${up ? 'up' : 'down'}" data-role="price">${R.fmt(ti.price)}</div></div>
              </li>`;
            }).join('')}
          </ul>
        </aside>
        <section class="dk-center">
          <div class="dk-subtabs">
            <button class="st active">${t('sb.tab.chart')}</button>
            <button class="st">${t('sb.tab.info')}</button>
            <button class="st">${t('sb.tab.data')}</button>
          </div>
          <div class="dk-toolbar">
            <span class="tb-lbl">${t('sb.time')}</span>
            <div class="iv-group">
              ${IVS.map(iv => `<button class="iv ${iv === s.interval ? 'active' : ''}" data-iv="${iv}">${iv.toUpperCase()}</button>`).join('')}
            </div>
            <span class="tb-spacer"></span>
            <div class="view-group">
              <button class="vw active" data-view="candle">${t('sb.view.original')}</button>
              <button class="vw" data-view="depth">${t('sb.view.depth')}</button>
            </div>
          </div>
          <div class="dk-chart-host">
            <div class="ohlc-overlay" id="ohlc-overlay"></div>
            <div class="ma-overlay" id="ma-overlay"></div>
            <div class="wm-overlay">CAPTAIL</div>
            <div id="kline" class="kline"></div>
            <div id="depth-view" class="depth-view hidden"></div>
          </div>
        </section>
        <aside class="dk-right">
          <div class="mode-tabs">
            <button class="md active" data-mode="perp">${t('trading.mode.perp')}</button>
            <button class="md" data-mode="opt">${t('trading.mode.opt')}</button>
          </div>
          <div id="perp-pane">
            <div class="side-tabs">
              <button class="side buy active" data-side="buy">${t('trading.buy')}</button>
              <button class="side sell" data-side="sell">${t('trading.sell')}</button>
            </div>
            <div class="type-tabs">
              <button class="ty active" data-type="limit">${t('trading.limit')}</button>
              <button class="ty" data-type="market">${t('trading.market')}</button>
            </div>
            <form id="order-form">
              <div class="field"><label>${t('trading.price')}</label>
                <input name="price" type="number" step="0.01" min="0"/></div>
              <div class="field"><label>${t('trading.qty')}</label>
                <input name="qty" type="number" step="0.0001" min="0" required/></div>
              <div class="rows">
                <div><span>${t('trading.ref_price')}</span><b id="ref-price">—</b></div>
                <div><span>${t('trading.ref_cash')}</span><b id="ref-cash">—</b></div>
                <div><span>${t('trading.ref_pos')}</span><b id="ref-pos">—</b></div>
                <div><span>${t('trading.ref_notional')}</span><b id="ref-notional">—</b></div>
              </div>
              <button type="submit" id="submit-order" class="btn buy big block">${t('trading.buy')}</button>
              <div id="order-msg" class="msg"></div>
            </form>
            <a id="spot-link" class="spot-link">${t('trading.spot.link')}</a>
          </div>
          <div id="opt-pane" class="hidden"></div>
        </aside>
        <div class="dk-tabbar">
          <button class="tb active" data-pane="orders">${t('trading.current_orders')}</button>
          <button class="tb" data-pane="history">${t('trading.order_history')}</button>
          <button class="tb" data-pane="trades">${t('trading.trades')}</button>
          <button class="tb" data-pane="positions">${t('trading.positions')}</button>
          <button class="tb" data-pane="opt_active">${t('trading.opt_active')}</button>
          <button class="tb" data-pane="opt_history">${t('trading.opt_history')}</button>
        </div>
        <div class="dk-tables" id="dk-tables"></div>
      </div>
    </div>`;

  const root = el;
  const $ = (q) => root.querySelector(q);
  const $$ = (q) => [...root.querySelectorAll(q)];

  // 缓存每 tick 都会访问的 DOM 引用，避免重复 querySelector 开销
  const dom = {
    price: $('#sb-price'), chg: $('#sb-chg'),
    mark:  $('#sb-mark'),  index: $('#sb-index'), funding: $('#sb-funding'),
    high:  $('#sb-high'),  low:   $('#sb-low'),
    volb:  $('#sb-volb'),  volq:  $('#sb-volq'), oi: $('#sb-oi'),
    pair:  $('#sb-pair'),  ic:    $('#sb-ic'),   baseLbl: $('#sb-base-lbl'),
    refPrice: $('#ref-price'), refCash: $('#ref-cash'),
    refPos: $('#ref-pos'), refNotional: $('#ref-notional'),
    ohlc:  $('#ohlc-overlay'), ma: $('#ma-overlay'),
    klineEl: $('#kline'), depthEl: $('#depth-view'),
    tables: $('#dk-tables'), orderForm: $('#order-form'),
    submit: $('#submit-order'), orderMsg: $('#order-msg'),
    symbolList: $('#symbol-list'),
  };

  // 图表相关
  s.chart = echarts.init(dom.klineEl, null, { renderer: 'canvas' });
  const onResize = () => { if (s.chart) s.chart.resize();
                           if (s.depthChart && s.view === 'depth') s.depthChart.resize(); };
  window.addEventListener('resize', onResize);

  // 各周期下"最近约 1 个月"所需的近似 K 线条数
  // (1m is capped by Yahoo's 7-day history quota).
  const LIMIT_BY_IV = {
    '1m': 10000, '5m': 8640, '15m': 2880, '30m': 1440,
    '1h': 720,   '4h':  180, '1D':   60,
  };
  async function loadCandles() {
    const limit = LIMIT_BY_IV[s.interval] || 500;
    const rows = await R.api(`/api/candles?symbol=${s.symbol}&interval=${s.interval}&limit=${limit}`, { auth: false });
    s.rows = rows;
    drawChart(rows);
  }

  function fmtBarDate(ts) {
    const d = new Date(ts);
    if (['1D','4h'].includes(s.interval))
      return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    const m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0');
    return `${m}/${day} ${hh}:${mm}`;
  }

  const MA_CONF = [
    { n: 7,  color: '#f0b90b', label: 'MA(7)' },
    { n: 25, color: '#c65aff', label: 'MA(25)' },
    { n: 99, color: '#6fa8ff', label: 'MA(99)' },
  ];

  function drawChart(rows) {
    const cats = rows.map(r => fmtBarDate(r.ts));
    const kdata = rows.map(r => [r.open, r.close, r.low, r.high]);
    const closes = rows.map(r => r.close);
    s.mas = {};
    const maSeries = MA_CONF.map(m => {
      const arr = R.sma(closes, m.n);
      s.mas[m.n] = arr;
      return {
        type: 'line', name: m.label, data: arr, smooth: true, symbol: 'none',
        lineStyle: { width: 1, color: m.color }, z: 3,
      };
    });

    const lastClose = rows.length ? rows[rows.length - 1].close : null;
    const lastUp = rows.length ? rows[rows.length - 1].close >= rows[rows.length - 1].open : true;

    s.chart.setOption({
      backgroundColor: 'transparent', animation: false,
      grid: [{ left: 8, right: 72, top: 12, height: '68%' },
             { left: 8, right: 72, top: '82%', height: '15%' }],
      graphic: [{
        type: 'text', left: 'center', top: 'middle', silent: true, z: 0,
        style: { text: 'CAPTAIL', fontSize: 80, fontWeight: 700,
          fill: 'rgba(140, 160, 200, 0.05)', letterSpacing: 6 },
      }],
      xAxis: [
        { type: 'category', data: cats, axisLine: { lineStyle: { color: '#24407a' } },
          axisLabel: { color: '#8793b8', fontSize: 11, hideOverlap: true } },
        { type: 'category', gridIndex: 1, data: cats, axisLabel: { show: false },
          axisTick: { show: false }, axisLine: { lineStyle: { color: '#24407a' } } },
      ],
      yAxis: [
        { scale: true, position: 'right', splitNumber: 5,
          splitLine: { lineStyle: { color: '#1a2e5a', type: 'dashed' } },
          axisLabel: { color: '#8793b8', fontSize: 11, inside: false, hideOverlap: true } },
        { scale: true, gridIndex: 1, position: 'right', splitNumber: 2,
          splitLine: { show: false },
          axisLabel: { color: '#8793b8', fontSize: 10, hideOverlap: true } },
      ],
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross',
          crossStyle: { color: '#8793b8' }, label: { backgroundColor: '#1a2e5a' } },
        backgroundColor: '#112752', borderColor: '#24407a', borderWidth: 1,
        textStyle: { color: '#eaf0ff', fontSize: 11 },
        formatter: () => '' /* 详细数据由上层叠加层呈现 */ },
      dataZoom: [{ type: 'inside', xAxisIndex: [0, 1],
        start: rows.length > 150 ? (1 - 150 / rows.length) * 100 : 0, end: 100 }],
      series: [
        { type: 'candlestick', name: s.symbol, data: kdata, z: 2,
          itemStyle: { color: '#26d17c', color0: '#ff5a7a',
            borderColor: '#26d17c', borderColor0: '#ff5a7a' },
          markLine: lastClose == null ? null : {
            symbol: 'none', silent: true, animation: false,
            label: { position: 'end', formatter: R.fmt(lastClose),
              color: '#fff', backgroundColor: lastUp ? '#26d17c' : '#ff5a7a',
              padding: [2, 6], borderRadius: 2, fontSize: 11 },
            lineStyle: { color: lastUp ? '#26d17c' : '#ff5a7a',
              type: 'dashed', width: 1 },
            data: [{ yAxis: lastClose }],
          } },
        ...maSeries,
        { type: 'bar', xAxisIndex: 1, yAxisIndex: 1, name: 'Vol',
          data: rows.map(r => ({ value: r.volume,
            itemStyle: { color: r.close >= r.open ? '#26d17c88' : '#ff5a7a88' } })) },
      ],
    }, true);

    updateOhlcOverlay(rows.length - 1);
    updateMaOverlay(rows.length - 1);
  }

  // 仅在值变化时才写入 DOM，避免每 tick 无谓的布局开销
  function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
  function setClass(el, v) { if (el && el.className !== v) el.className = v; }

  function updateOhlcOverlay(idx) {
    if (!dom.ohlc || !s.rows || idx < 0 || idx >= s.rows.length) return;
    const r = s.rows[idx];
    const chg = r.close - r.open;
    const pct = r.open ? (chg / r.open * 100) : 0;
    const range = r.low ? ((r.high - r.low) / r.low * 100) : 0;
    const cls = chg >= 0 ? 'up' : 'down';
    dom.ohlc.innerHTML = `<span class="ol-date">${fmtBarDate(r.ts)}</span>
      <span>Open <b>${R.fmt(r.open)}</b></span>
      <span>High <b>${R.fmt(r.high)}</b></span>
      <span>Low <b>${R.fmt(r.low)}</b></span>
      <span>Close <b>${R.fmt(r.close)}</b></span>
      <span class="${cls}">CHANGE <b>${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</b></span>
      <span>Range <b>${range.toFixed(2)}%</b></span>`;
  }

  function updateMaOverlay(idx) {
    if (!dom.ma) return;
    dom.ma.innerHTML = MA_CONF.map(m => {
      const v = (s.mas[m.n] || [])[idx];
      return `<span style="color:${m.color}">${m.label} <b>${typeof v === 'number' ? R.fmt(v) : '—'}</b></span>`;
    }).join('');
  }

  // 单根 K 线对应的毫秒跨度（1D 以 UTC 午夜对齐为桶起点）
  const IV_MS = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '30m': 1.8e6,
                  '1h': 3.6e6, '4h': 14.4e6, '1D': 86.4e6 };
  function bucketStart(ts, iv) {
    if (iv === '1D') {
      const d = new Date(ts);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    return Math.floor(ts / IV_MS[iv]) * IV_MS[iv];
  }

  // 对 s.rows 中最后 n 个收盘价求和（直到 idx 为止）。窗口未填满时返回 null，
  // 语义与 R.sma 的热身阶段保持一致。
  function smaAt(idx, n) {
    if (idx < n - 1) return null;
    let sum = 0;
    for (let k = idx - n + 1; k <= idx; k++) sum += s.rows[k].close;
    return +(sum / n).toFixed(4);
  }

  // 用 requestAnimationFrame 节流图表局部更新，WS 密集 tick 每帧只渲染一次。
  // 当前时间跨过桶边界时 push 一根全新 bar，让图表随时间推进，
  // 而不是把最后一根不断拉长。MA 数组同步维护以保证图例/均线正确。
  const appendKline = R.rafThrottle((price) => {
    if (!s.chart || !s.rows || !s.rows.length) return;
    const last = s.rows[s.rows.length - 1];
    const now = Date.now();
    const curBucket = bucketStart(now, s.interval);
    const lastBucket = bucketStart(last.ts, s.interval);
    const opt = s.chart.getOption();
    const kdata = (opt.series[0] && opt.series[0].data) || [];
    const cats = (opt.xAxis && opt.xAxis[0] && opt.xAxis[0].data) || [];
    if (!kdata.length) return;

    const isNewBar = curBucket > lastBucket;
    if (isNewBar) {
      const bar = { ts: curBucket, open: price, close: price,
                    high: price, low: price, volume: 0 };
      s.rows.push(bar);
      kdata.push([bar.open, bar.close, bar.low, bar.high]);
      cats.push(fmtBarDate(bar.ts));
      for (const m of MA_CONF) (s.mas[m.n] = s.mas[m.n] || []).push('-');
    } else {
      last.close = price;
      last.high = Math.max(last.high, price);
      last.low  = Math.min(last.low, price);
      const [o] = kdata[kdata.length - 1];
      kdata[kdata.length - 1] = [o, last.close, last.low, last.high];
    }

    const idx = s.rows.length - 1;
    // 只重算每条 MA 的尾值，数组其余部分保持不动
    const maPatch = MA_CONF.map(m => {
      const v = smaAt(idx, m.n);
      s.mas[m.n][idx] = v == null ? '-' : v;
      return { data: s.mas[m.n] };
    });

    // series 顺序约定：[蜡烛图, ...MA 线, 成交量柱]
    const volIdx = 1 + MA_CONF.length;
    const seriesUpdate = [{ data: kdata }, ...maPatch];
    if (isNewBar) {
      const volSeries = opt.series[volIdx];
      const volData = (volSeries && volSeries.data) || [];
      volData.push({ value: 0, itemStyle: { color: '#26d17c88' } });
      seriesUpdate[volIdx] = { data: volData };
    }
    s.chart.setOption(
      isNewBar ? { xAxis: [{ data: cats }], series: seriesUpdate }
               : { series: seriesUpdate }, false);
  });

  function updateHead() {
    const cur = live.ticker[s.symbol]; if (!cur) return;
    const base = cur.prevClose ?? cur.prev;
    const diff = cur.price - base;
    const pct = base ? (diff / base * 100) : 0;
    const up = diff >= 0;
    const cls = up ? 'up' : 'down';

    setText(dom.price, R.fmt(cur.price));
    setClass(dom.price, cls);
    setText(dom.chg, `${up ? '+' : ''}${R.fmt(diff)} ${up ? '+' : ''}${pct.toFixed(2)}%`);
    setClass(dom.chg, cls);
    setText(dom.high, R.fmt(cur.high24));
    setText(dom.low,  R.fmt(cur.low24));

    const ex = s.extras[s.symbol] || {};
    setText(dom.mark,  R.fmt(ex.mark  ?? cur.price));
    setText(dom.index, R.fmt(ex.index ?? cur.price));
    const fundPct = ((ex.funding ?? 0.0001) * 100).toFixed(5);
    const remain = (ex.fundingCountdown ?? 0) - (Date.now() - (ex._asOf || Date.now()));
    dom.funding.innerHTML =
      `<span class="up">${fundPct}%</span> / <span>${R.fmtCountdown(remain)}</span>`;
    setText(dom.volb, R.fmtCompact(ex.vol24Base  || 0));
    setText(dom.volq, R.fmtCompact(ex.vol24Quote || 0));
    setText(dom.oi,   R.fmtCompact((ex.openInterest || 0) * cur.price));
    setText(dom.refPrice, R.fmt(cur.price));
    updateFormRefs();
  }
  async function refreshExtras() {
    try {
      const snap = await R.api('/api/ticker', { auth: false });
      const now = Date.now();
      for (const [k, v] of Object.entries(snap)) { v._asOf = now; s.extras[k] = v; }
      updateHead();
    } catch (_) {}
  }
  const extrasTimer = setInterval(refreshExtras, 5000);
  const countdownTimer = setInterval(() => {
    const ex = s.extras[s.symbol]; if (!ex || !dom.funding) return;
    const remain = (ex.fundingCountdown || 0) - (Date.now() - (ex._asOf || Date.now()));
    const spans = dom.funding.querySelectorAll('span');
    if (spans[1]) setText(spans[1], R.fmtCountdown(remain));
  }, 1000);

  // 按品种缓存列表行引用，updateListPrices 无需重复 querySelector
  const listRows = {};
  $$('#symbol-list li').forEach(li => {
    listRows[li.dataset.sym] = { li, price: li.querySelector('[data-role=price]') };
  });
  function updateListPrices() {
    for (const sym in listRows) {
      const ti = live.ticker[sym]; if (!ti) continue;
      const up = ti.price >= ti.prev;
      const cell = listRows[sym].price;
      if (!cell) continue;
      setText(cell, R.fmt(ti.price));
      setClass(cell, 'price ' + (up ? 'up' : 'down'));
    }
  }
  function updateFormRefs() {
    const price = (live.ticker[s.symbol] || {}).price || 0;
    const form = dom.orderForm;
    const pos = s.positions.find(p => p.symbol === s.symbol);
    setText(dom.refCash, R.fmt(s.cash));
    setText(dom.refPos, pos ? R.fmt(pos.qty, 4) : '0.0000');
    if (!form) return;
    const qty = Number(form.qty.value) || 0;
    const p = s.type === 'market' ? price : (Number(form.price.value) || 0);
    setText(dom.refNotional, R.fmt(p * qty));
    if (s.type === 'limit' && !form.price.value && price) form.price.value = price.toFixed(2);
  }

  // 下方委托/持仓/成交表
  function renderTable() {
    const thead = [], tbody = [];
    if (s.pane === 'orders' || s.pane === 'history') {
      thead.push(`<tr><th>${t('trading.col.time')}</th><th>${t('trading.col.symbol')}</th>
        <th>${t('trading.col.side')}</th><th>${t('trading.col.type')}</th>
        <th>${t('trading.col.price')}</th><th>${t('trading.col.qty')}</th>
        <th>${t('trading.col.filled')}</th><th>${t('trading.col.avg')}</th>
        <th>${t('trading.col.status')}</th><th></th></tr>`);
      const rows = s.pane === 'orders'
        ? s.orders.filter(o => o.status === 'open')
        : s.orders.filter(o => o.status !== 'open');
      rows.forEach(o => tbody.push(`<tr>
        <td>${R.fmtTs(o.created_at)}</td><td>${o.symbol}</td>
        <td class="${o.side}">${o.side === 'buy' ? t('trading.buy') : t('trading.sell')}</td>
        <td>${o.type === 'market' ? t('trading.market') : t('trading.limit')}</td>
        <td>${o.price != null ? R.fmt(o.price) : '—'}</td>
        <td>${R.fmt(o.qty, 4)}</td><td>${R.fmt(o.filled_qty, 4)}</td>
        <td>${o.avg_fill ? R.fmt(o.avg_fill) : '—'}</td>
        <td>${statusText(o.status)}</td>
        <td>${o.status === 'open' ? `<button data-cancel="${o.id}">${t('trading.cancel')}</button>` : ''}</td>
      </tr>`));
    } else if (s.pane === 'trades') {
      thead.push(`<tr><th>${t('trading.col.time')}</th><th>${t('trading.col.symbol')}</th>
        <th>${t('trading.col.side')}</th><th>${t('trading.col.price')}</th>
        <th>${t('trading.col.qty')}</th><th>${t('trading.col.fee')}</th>
        <th>${t('trading.col.amount')}</th></tr>`);
      s.trades.forEach(tr => tbody.push(`<tr>
        <td>${R.fmtTs(tr.created_at)}</td><td>${tr.symbol}</td>
        <td class="${tr.side}">${tr.side === 'buy' ? t('trading.buy') : t('trading.sell')}</td>
        <td>${R.fmt(tr.price)}</td><td>${R.fmt(tr.qty, 4)}</td>
        <td>${R.fmt(tr.fee, 4)}</td><td>${R.fmt(tr.price * tr.qty)}</td></tr>`));
    } else if (s.pane === 'positions') {
      thead.push(`<tr><th>${t('trading.col.symbol')}</th><th>${t('trading.col.qty')}</th>
        <th>${t('trading.col.cost')}</th><th>${t('trading.col.last')}</th>
        <th>${t('trading.col.value')}</th><th>${t('trading.col.pnl')}</th></tr>`);
      s.positions.forEach(p => tbody.push(`<tr>
        <td>${p.symbol}</td><td>${R.fmt(p.qty, 4)}</td>
        <td>${R.fmt(p.avg_price)}</td><td>${R.fmt(p.last)}</td>
        <td>${R.fmt(p.market_value)}</td>
        <td class="${p.pnl >= 0 ? 'buy' : 'sell'}">${R.fmt(p.pnl)}</td></tr>`));
    } else if (s.pane === 'opt_active') {
      thead.push(`<tr><th>${t('sec.col.symbol')}</th><th>${t('sec.col.dir')}</th>
        <th>${t('sec.col.duration')}</th><th>${t('sec.col.amount')}</th>
        <th>${t('sec.col.open')}</th><th>${t('sec.col.countdown')}</th></tr>`);
      s.opt.active.forEach(c => tbody.push(`<tr data-id="${c.id}" data-settle="${c.settle_at}">
        <td>${c.symbol}</td>
        <td class="${c.direction === 'up' ? 'buy' : 'sell'}">${c.direction === 'up' ? '▲ ' + t('sec.dir.up') : '▼ ' + t('sec.dir.down')}</td>
        <td>${c.duration}s</td>
        <td>$${R.fmt(c.amount)}</td>
        <td>${R.fmt(c.open_price)}</td>
        <td data-role="cd">—</td></tr>`));
    } else if (s.pane === 'opt_history') {
      thead.push(`<tr><th>${t('sec.col.time')}</th><th>${t('sec.col.symbol')}</th>
        <th>${t('sec.col.dir')}</th><th>${t('sec.col.duration')}</th>
        <th>${t('sec.col.amount')}</th><th>${t('sec.col.open')}</th>
        <th>${t('sec.col.settle')}</th><th>${t('sec.col.status')}</th>
        <th>${t('sec.col.pnl')}</th></tr>`);
      s.opt.history.forEach(c => tbody.push(`<tr>
        <td>${R.fmtTs(c.created_at)}</td><td>${c.symbol}</td>
        <td class="${c.direction === 'up' ? 'buy' : 'sell'}">${c.direction === 'up' ? '▲' : '▼'}</td>
        <td>${c.duration}s</td>
        <td>$${R.fmt(c.amount)}</td>
        <td>${R.fmt(c.open_price)}</td>
        <td>${c.settle_price != null ? R.fmt(c.settle_price) : '—'}</td>
        <td><span class="badge ${c.status === 'won' ? 'approved' : c.status === 'lost' ? 'rejected' : 'open'}">${t('sec.status.' + c.status)}</span></td>
        <td class="${c.pnl > 0 ? 'up' : c.pnl < 0 ? 'down' : ''}">${c.pnl != null ? (c.pnl >= 0 ? '+' : '') + R.fmt(c.pnl) : '—'}</td></tr>`));
    }
    dom.tables.innerHTML = `<table><thead>${thead.join('')}</thead><tbody>${tbody.join('')}</tbody></table>`;
  }
  // 撤单按钮使用事件委托，避免给每行单独绑定监听器
  dom.tables.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-cancel]');
    if (!btn) return;
    try { await R.api('/api/orders/' + btn.dataset.cancel, { method: 'DELETE' }); refreshAll(); }
    catch (err) { R.toast(err.message, 'error'); }
  });

  async function refreshAll() {
    const a = R.auth();
    if (!a.token) { setText(dom.refCash, '—'); renderTable(); return; }
    try {
      const [acc, orders, trades] = await Promise.all([
        R.api('/api/account'), R.api('/api/orders'), R.api('/api/trades'),
      ]);
      // 现货撮合从期权钱包扣款，故交易页展示 option_cash
      s.cash = (acc.option_cash != null) ? acc.option_cash : acc.cash;
      s.positions = acc.positions;
      s.orders = orders; s.trades = trades;
      updateFormRefs(); renderTable();
    } catch (_) {}
  }

  // ===== 期权（秒级合约）=====
  async function loadOptCfg() {
    if (s.opt.cfg) return s.opt.cfg;
    try {
      s.opt.cfg = await R.api('/api/seconds/config', { auth: false });
      const ds = s.opt.cfg.durations || [];
      s.opt.dur = (ds[1] && ds[1].duration) || (ds[0] && ds[0].duration) || 60;
      s.opt.amount = Math.max(s.opt.cfg.min_amount || 10, 100);
    } catch (_) { s.opt.cfg = { durations: [], min_amount: 10, max_amount: 50000 }; }
    return s.opt.cfg;
  }
  function payoutOf(d) {
    const it = (s.opt.cfg.durations || []).find(x => x.duration === Number(d));
    return it ? it.payout_rate : 0;
  }
  function renderOptPane() {
    const pane = $('#opt-pane');
    if (!pane) return;
    const cfg = s.opt.cfg || { durations: [], min_amount: 10, max_amount: 50000 };
    const price = (live.ticker[s.symbol] || {}).price;
    pane.innerHTML = `
      <form id="opt-form">
        <div class="field"><label>${t('sec.duration')}</label>
          <div class="tabs-pill" id="opt-dur">
            ${cfg.durations.map(d => `<button type="button" data-d="${d.duration}"
              class="${d.duration === s.opt.dur ? 'active' : ''}">${d.duration}s · +${(d.payout_rate*100).toFixed(0)}%</button>`).join('')}
          </div></div>
        <div class="field"><label>${t('sec.direction')}</label>
          <div class="tabs-pill" id="opt-dir">
            <button type="button" data-v="up"   class="${s.opt.dir === 'up' ? 'active' : ''}">▲ ${t('sec.dir.up')}</button>
            <button type="button" data-v="down" class="${s.opt.dir === 'down' ? 'active' : ''}">▼ ${t('sec.dir.down')}</button>
          </div></div>
        <div class="field"><label>${t('sec.amount')}</label>
          <input name="amount" type="number" min="${cfg.min_amount}" max="${cfg.max_amount}"
            step="1" value="${s.opt.amount}" required/>
          <small>${t('sec.min_max').replace('{min}', cfg.min_amount).replace('{max}', cfg.max_amount)}</small>
        </div>
        <div class="kv">
          <label>${t('sec.balance')}</label><b id="opt-balance">$${R.fmt(s.cash)}</b>
          <label>${t('sec.open_price')}</label><b id="opt-open">${R.fmt(price)}</b>
          <label>${t('sec.payout')}</label><b id="opt-payout">+${(payoutOf(s.opt.dur) * 100).toFixed(0)}%</b>
        </div>
        <button class="btn primary big block" type="submit">${t('sec.place')}</button>
        <div class="msg" id="opt-msg"></div>
        <small style="color:var(--dk-muted);display:block;margin-top:6px">${t('sec.tip')}</small>
      </form>
      <a id="spot-link-opt" class="spot-link">${t('trading.spot.link')}</a>`;
    bindOptPane();
  }
  function bindOptPane() {
    const pane = $('#opt-pane');
    pane.querySelectorAll('#opt-dur button').forEach(b => b.addEventListener('click', () => {
      s.opt.dur = Number(b.dataset.d); renderOptPane();
    }));
    pane.querySelectorAll('#opt-dir button').forEach(b => b.addEventListener('click', () => {
      s.opt.dir = b.dataset.v; renderOptPane();
    }));
    pane.querySelector('input[name=amount]').addEventListener('change', (e) => {
      s.opt.amount = Number(e.target.value) || 0;
    });
    pane.querySelector('#opt-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!R.auth().token) { R.navigate('/login'); return; }
      const msg = pane.querySelector('#opt-msg');
      msg.className = 'msg'; msg.textContent = t('common.loading');
      try {
        await R.api('/api/seconds/orders', { method: 'POST', body: {
          symbol: s.symbol, direction: s.opt.dir,
          amount: s.opt.amount, duration: s.opt.dur } });
        msg.className = 'msg ok'; msg.textContent = t('sec.placed');
        R.toast(t('sec.placed'), 'ok');
        await refreshOpt(); refreshAll();
      } catch (err) {
        msg.className = 'msg'; msg.textContent = err.message;
        R.toast(err.message, 'error');
      }
    });
    pane.querySelector('#spot-link-opt').addEventListener('click', openSpotModal);
  }
  async function refreshOpt() {
    if (!R.auth().token) return;
    try {
      const [active, history] = await Promise.all([
        R.api('/api/seconds/orders/active'),
        R.api('/api/seconds/orders?limit=50'),
      ]);
      s.opt.active = active;
      s.opt.history = history.filter(c => c.status !== 'open');
      if (s.pane === 'opt_active' || s.pane === 'opt_history') renderTable();
    } catch (_) {}
  }

  // ===== 现货购买 modal =====
  function openSpotModal() {
    if (!R.auth().token) { R.navigate('/login'); return; }
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal-card">
      <h3>${t('trading.spot.link').replace(' →','')}</h3>
      <form id="spot-form" class="space-y">
        <div class="field"><label>${t('trading.symbol')}</label>
          <select name="symbol">${live.symbols.map(sy =>
            `<option value="${sy.symbol}" ${sy.symbol === s.symbol ? 'selected' : ''}>${sy.symbol} · ${sy.name}</option>`).join('')}</select></div>
        <div class="field"><label>${t('trading.qty')}</label>
          <input name="qty" type="number" step="0.0001" min="0" required/></div>
        <div class="msg" id="spot-msg"></div>
        <div class="row" style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
          <button type="button" class="btn ghost" data-act="cancel">${t('common.cancel') || 'Cancel'}</button>
          <button type="submit" class="btn primary">${t('trading.buy')}</button>
        </div>
      </form></div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.querySelector('[data-act=cancel]').addEventListener('click', close);
    back.querySelector('#spot-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = back.querySelector('#spot-msg');
      msg.className = 'msg'; msg.textContent = t('common.loading');
      try {
        const o = await R.api('/api/orders', { method: 'POST', body: {
          symbol: fd.get('symbol'), side: 'buy', type: 'market',
          qty: Number(fd.get('qty')) } });
        R.toast(`${t('trading.buy')} ${o.symbol} #${o.id}`, 'ok');
        close(); refreshAll();
      } catch (err) {
        msg.className = 'msg'; msg.textContent = err.message;
      }
    });
  }

  async function switchSymbol(sym) {
    s.symbol = sym;
    for (const k in listRows) listRows[k].li.classList.toggle('active', k === sym);
    setText(dom.pair, sym + 'USDT');
    setText(dom.ic, sym[1] || sym[0]);
    setText(dom.baseLbl, sym);
    await loadCandles();
    await refreshExtras();
    updateHead();
    if (s.view === 'depth') loadDepthChart();
  }

  async function loadDepthChart() {
    if (!s.depthChart) s.depthChart = echarts.init(dom.depthEl, null, { renderer: 'canvas' });
    try {
      const d = await R.api(`/api/depth?symbol=${s.symbol}&levels=30`, { auth: false });
      const bidsAcc = d.bids.map(l => [l.price, l.cum]);
      const asksAcc = d.asks.map(l => [l.price, l.cum]);
      s.depthChart.setOption({
        backgroundColor: 'transparent', animation: false,
        grid: { left: 56, right: 56, top: 24, bottom: 36 },
        xAxis: { type: 'value', scale: true,
          axisLine: { lineStyle: { color: '#24407a' } },
          axisLabel: { color: '#8793b8' },
          splitLine: { lineStyle: { color: '#1a2e5a' } } },
        yAxis: { type: 'value',
          axisLine: { lineStyle: { color: '#24407a' } },
          axisLabel: { color: '#8793b8' },
          splitLine: { lineStyle: { color: '#1a2e5a' } } },
        tooltip: { trigger: 'axis', backgroundColor: '#112752',
          borderColor: '#24407a', textStyle: { color: '#eaf0ff' } },
        series: [
          { type: 'line', name: 'Bids', data: bidsAcc, step: 'end', symbol: 'none',
            lineStyle: { color: '#26d17c' }, areaStyle: { color: 'rgba(38,209,124,.2)' } },
          { type: 'line', name: 'Asks', data: asksAcc, step: 'start', symbol: 'none',
            lineStyle: { color: '#ff5a7a' }, areaStyle: { color: 'rgba(255,90,122,.2)' } },
        ],
      }, true);
      s.depthChart.resize();
    } catch (_) {}
  }
  const depthTimer = setInterval(() => { if (s.view === 'depth') loadDepthChart(); }, 3000);

  // 十字光标事件 -> 刷新 OHLC / MA 叠加层
  s.chart.on('updateAxisPointer', (e) => {
    if (!s.rows) return;
    const axes = e.axesInfo || [];
    const xa = axes.find(a => a.axisDim === 'x');
    if (!xa) return;
    const idx = xa.value;
    if (typeof idx === 'number' && idx >= 0 && idx < s.rows.length) {
      updateOhlcOverlay(idx);
      updateMaOverlay(idx);
    }
  });
  dom.klineEl.addEventListener('mouseleave', () => {
    if (!s.rows) return;
    const last = s.rows.length - 1;
    updateOhlcOverlay(last);
    updateMaOverlay(last);
  });

  // 小工具：在同级里只给被点击的元素加 .active，其他去掉
  function setActive(group, matchFn) {
    group.forEach(x => x.classList.toggle('active', matchFn(x)));
  }

  // 绑定事件（多子元素共享同一处理器时使用事件委托）
  dom.symbolList.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-sym]');
    if (li) switchSymbol(li.dataset.sym);
  });
  const ivBtns = $$('.iv');
  ivBtns.forEach(b => b.addEventListener('click', () => {
    s.interval = b.dataset.iv;
    setActive(ivBtns, x => x === b);
    loadCandles();
  }));
  const vwBtns = $$('.vw');
  vwBtns.forEach(b => b.addEventListener('click', () => {
    s.view = b.dataset.view;
    setActive(vwBtns, x => x === b);
    const isDepth = s.view === 'depth';
    dom.depthEl.classList.toggle('hidden', !isDepth);
    dom.klineEl.classList.toggle('hidden', isDepth);
    dom.ohlc.classList.toggle('hidden', isDepth);
    dom.ma.classList.toggle('hidden', isDepth);
    if (isDepth) loadDepthChart();
    else if (s.chart) s.chart.resize();
  }));
  const stBtns = $$('.dk-subtabs .st');
  stBtns.forEach(b => b.addEventListener('click', () => setActive(stBtns, x => x === b)));
  const paneBtns = $$('.dk-tabbar .tb');
  paneBtns.forEach(b => b.addEventListener('click', () => {
    s.pane = b.dataset.pane;
    setActive(paneBtns, x => x === b);
    renderTable();
  }));
  const sideBtns = $$('.side');
  sideBtns.forEach(b => b.addEventListener('click', () => {
    s.side = b.dataset.side;
    setActive(sideBtns, x => x === b);
    dom.submit.textContent = s.side === 'buy' ? t('trading.buy') : t('trading.sell');
    dom.submit.classList.toggle('buy', s.side === 'buy');
    dom.submit.classList.toggle('sell', s.side === 'sell');
  }));
  const tyBtns = $$('.ty');
  tyBtns.forEach(b => b.addEventListener('click', () => {
    s.type = b.dataset.type;
    setActive(tyBtns, x => x === b);
    const inp = dom.orderForm.querySelector('[name=price]');
    inp.disabled = s.type === 'market';
    inp.required = s.type === 'limit';
    if (s.type === 'market') inp.value = '';
    updateFormRefs();
  }));
  dom.orderForm.addEventListener('input', updateFormRefs);

  dom.orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!R.auth().token) { R.navigate('/login'); return; }
    const fd = new FormData(e.target);
    const body = {
      symbol: s.symbol, side: s.side, type: s.type,
      qty: Number(fd.get('qty')),
    };
    if (s.type === 'limit') body.price = Number(fd.get('price'));
    const msg = dom.orderMsg;
    msg.className = 'msg'; msg.textContent = t('common.loading');
    try {
      const o = await R.api('/api/orders', { method: 'POST', body });
      msg.className = 'msg ok';
      msg.textContent = `#${o.id} ${o.status === 'filled' ? t('status.filled') : t('status.open')}`;
      e.target.qty.value = '';
      R.toast(`${t(o.side === 'buy' ? 'trading.buy' : 'trading.sell')} ${o.symbol} #${o.id}`, 'ok');
      refreshAll();
    } catch (err) {
      msg.className = 'msg'; msg.textContent = err.message;
      R.toast(err.message, 'error');
    }
  });

  // 期权/永续 二级 tab 切换
  const mdBtns = $$('.mode-tabs .md');
  const perpPane = $('#perp-pane'), optPane = $('#opt-pane');
  mdBtns.forEach(b => b.addEventListener('click', async () => {
    s.mode = b.dataset.mode;
    setActive(mdBtns, x => x === b);
    perpPane.classList.toggle('hidden', s.mode !== 'perp');
    optPane.classList.toggle('hidden', s.mode !== 'opt');
    if (s.mode === 'opt') {
      await loadOptCfg();
      renderOptPane();
      refreshOpt();
      // 默认切到期权持仓 pane
      s.pane = 'opt_active';
      setActive(paneBtns, x => x.dataset.pane === 'opt_active');
      renderTable();
    } else {
      s.pane = 'orders';
      setActive(paneBtns, x => x.dataset.pane === 'orders');
      renderTable();
    }
  }));
  $('#spot-link').addEventListener('click', openSpotModal);

  // 按帧合并密集 WS tick；顶部价/列表最多 60 fps 更新一次
  const renderTick = R.rafThrottle(() => { updateListPrices(); updateHead(); });
  const liveFn = (m) => {
    if (m.type === 'ticks') {
      renderTick();
      const cur = m.data.find(tk => tk.symbol === s.symbol);
      if (cur) appendKline(cur.price);
      // 期权 pane 的开仓参考价跟随 tick
      if (s.mode === 'opt') {
        const op = optPane.querySelector('#opt-open');
        if (op && cur) op.textContent = R.fmt(cur.price);
      }
    } else if (m.type === 'trade') {
      refreshAll();
    }
  };
  live.listeners.add(liveFn);

  // 期权持仓倒计时：每秒刷新；到期项触发 refreshOpt 拉结算结果
  const optCdTimer = setInterval(() => {
    if (s.pane !== 'opt_active') return;
    const now = Date.now();
    let expired = false;
    dom.tables.querySelectorAll('tr[data-settle]').forEach(tr => {
      const left = Number(tr.dataset.settle) - now;
      const cd = tr.querySelector('[data-role=cd]');
      if (left <= 0) { if (cd) cd.textContent = '0s'; expired = true; }
      else if (cd)   { cd.textContent = Math.ceil(left / 1000) + 's'; }
    });
    if (expired) refreshOpt();
  }, 1000);

  // 初始化
  await switchSymbol(s.symbol);
  await refreshAll();
  // 已登录用户预拉一次期权数据，避免切到 opt 时空白
  if (R.auth().token) { loadOptCfg().then(refreshOpt); }

  return () => {
    window.removeEventListener('resize', onResize);
    live.listeners.delete(liveFn);
    clearInterval(depthTimer);
    clearInterval(extrasTimer);
    clearInterval(countdownTimer);
    clearInterval(optCdTimer);
    if (s.chart) { try { s.chart.dispose(); } catch (_) {} }
    if (s.depthChart) { try { s.depthChart.dispose(); } catch (_) {} }
  };
}

export function registerTrading() {
  R.register('/trading', { render: viewTrading, bodyClass: 'trading-page', dark: true });
}



