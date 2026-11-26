// ===== Controle Financeiro — dados salvos no localStorage do navegador =====
const CHAVE = 'controle-financeiro-v1';

const PADRAO = {
  transacoes: [],
  contas: [],
  categorias: {
    despesa: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Contas', 'Outros'],
    receita: ['Salário', 'Freelance', 'Investimentos', 'Outros'],
    // Transferências: movimentações que NÃO são receita nem despesa
    transferencia: ['Aplicação', 'Resgate', 'Transferência entre contas', 'Pagamento de fatura'],
  },
  orcamentos: {},
  metas: [],
  excluidos: [], // ids excluídos — para a mesclagem não "ressuscitar" o que foi apagado em outro aparelho
};
const TIPOS = { despesa: 'Despesa', receita: 'Receita', transferencia: 'Transf./Invest.' };
const TIPOS_CONTA = {
  corrente: 'Conta corrente', poupanca: 'Poupança', investimento: 'Investimento',
  cartao: 'Cartão de crédito', dinheiro: 'Dinheiro / carteira', outra: 'Outra',
};

let dados = carregar();
let mesAtual = hojeISO().slice(0, 7);
let contaSel = null;            // conta com a movimentação aberta na aba Contas
let modoCartao = 'fatura';      // cartão: ver 'fatura' ou 'extrato' corrido
const selecionados = new Set(); // lançamentos marcados para exclusão em lote

// ---------- dados ----------
function migrar(d) {
  const base = { ...structuredClone(PADRAO), ...d };
  base.categorias = { ...structuredClone(PADRAO.categorias), ...(d.categorias || {}) };
  // versões antigas não tinham contas: cria uma e coloca nela todos os lançamentos
  if (!Array.isArray(base.contas) || !base.contas.length)
    base.contas = [{ id: 'principal', nome: 'Conta principal', tipo: 'corrente', saldoInicial: 0 }];
  const ids = new Set(base.contas.map(c => c.id));
  if (!Array.isArray(base.excluidos)) base.excluidos = [];
  base.transacoes.forEach(t => {
    if (!ids.has(t.conta)) t.conta = base.contas[0].id;
    if (t.contraparte && (!ids.has(t.contraparte) || t.contraparte === t.conta)) delete t.contraparte;
  });
  return base;
}
function carregar() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE));
    if (salvo) return migrar(salvo);
  } catch (e) { /* ignora dados corrompidos */ }
  return migrar({});
}
function registrarExclusao(...ids) {
  const s = new Set(dados.excluidos);
  ids.forEach(i => s.add(i));
  dados.excluidos = [...s];
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(dados)); }
  catch (e) { avisarSemArmazenamento(); }
  render();
}
function avisarSemArmazenamento() {
  if (document.getElementById('avisoArmazenamento')) return;
  document.body.insertAdjacentHTML('afterbegin',
    '<div id="avisoArmazenamento" style="background:#d97706;color:#fff;padding:8px 16px;text-align:center">' +
    'Este navegador não permite salvar dados aqui — as alterações serão perdidas ao fechar. Exporte um backup.</div>');
}

// ---------- utilidades ----------
function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const fmt = v => (Math.abs(v) < 0.005 ? 0 : v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const r2 = v => Math.round(v * 100) / 100;
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ehEntrada = t => t.tipo === 'receita' || (t.tipo === 'transferencia' && t.sentido === 'entrada');
const br = d => d.split('-').reverse().join('/');
function somaMes(mes, tipo) {
  return dados.transacoes.filter(t => t.tipo === tipo && t.data.startsWith(mes)).reduce((s, t) => s + t.valor, 0);
}
function addMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nomeMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(a).slice(2);
}
const diasEntre = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;
function gastosPorCategoria(mes) {
  const r = {};
  dados.transacoes.filter(t => t.tipo === 'despesa' && t.data.startsWith(mes))
    .forEach(t => { r[t.categoria] = (r[t.categoria] || 0) + t.valor; });
  return r;
}
function aparencia(t) {
  if (t.tipo === 'transferencia') return { cls: 'neutro', sinal: (t.sentido === 'entrada' ? '+' : '−') + ' ⇄' };
  return t.tipo === 'receita' ? { cls: 'pos', sinal: '+' } : { cls: 'neg', sinal: '−' };
}

// ---------- contas ----------
const conta = cid => dados.contas.find(c => c.id === cid);
const nomeConta = cid => conta(cid)?.nome || '—';
// quanto um lançamento altera o saldo de uma conta
function delta(t, cid) {
  const s = t.tipo === 'receita' ? 1 : t.tipo === 'despesa' ? -1 : (t.sentido === 'entrada' ? 1 : -1);
  if (t.conta === cid) return s * t.valor;
  if (t.tipo === 'transferencia' && t.contraparte === cid) return -s * t.valor;
  return 0;
}
function saldoConta(cid, ateData, inclusive = true) {
  const c = conta(cid);
  return r2((c?.saldoInicial || 0) + dados.transacoes
    .filter(t => inclusive ? t.data <= ateData : t.data < ateData)
    .reduce((s, t) => s + delta(t, cid), 0));
}
// texto "Conta X → Conta Y" exibido abaixo da descrição
function subtitulo(t, doPontoDeVista) {
  const partes = [];
  if (!doPontoDeVista && dados.contas.length > 1) partes.push(nomeConta(t.conta));
  if (t.tipo === 'transferencia' && t.contraparte) {
    if (doPontoDeVista) {
      const outra = t.conta === doPontoDeVista ? t.contraparte : t.conta;
      partes.push((delta(t, doPontoDeVista) > 0 ? 'de ' : 'para ') + nomeConta(outra));
    } else {
      partes[0] = nomeConta(t.conta) + (t.sentido === 'entrada' ? ' ← ' : ' → ') + nomeConta(t.contraparte);
    }
  }
  return partes.join(' · ');
}

// ---------- cartão de crédito e faturas ----------
// fatura identificada pelo mês de VENCIMENTO (AAAA-MM)
const ciclo = c => ({ F: c.diaFechamento || 1, V: c.diaVencimento || 10 });
function dataDia(mes, dia) {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(Math.min(dia, new Date(a, m, 0).getDate())).padStart(2, '0')}`;
}
function vespera(d) {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() - 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
// compras a partir do dia de fechamento vão para a fatura seguinte
function mesFechamento(c, data) {
  const mes = data.slice(0, 7);
  return data < dataDia(mes, ciclo(c).F) ? mes : addMeses(mes, 1);
}
const mesVencDeFech = (c, mesF) => ciclo(c).V > ciclo(c).F ? mesF : addMeses(mesF, 1);
const mesFechDeVenc = (c, mesV) => ciclo(c).V > ciclo(c).F ? mesV : addMeses(mesV, -1);
const faturaDaData = (c, data) => mesVencDeFech(c, mesFechamento(c, data));
function infoFatura(c, mesV) {
  const { F, V } = ciclo(c);
  const mesF = mesFechDeVenc(c, mesV);
  return { mesV, inicio: dataDia(addMeses(mesF, -1), F), fechamento: dataDia(mesF, F), vencimento: dataDia(mesV, V) };
}
const ehPagamentoCartao = (t, cid) => t.tipo === 'transferencia' && delta(t, cid) > 0;

// agrupa os lançamentos do cartão em faturas e distribui os pagamentos (da fatura mais antiga para a mais nova)
function faturasCartao(c) {
  const faturas = {};
  const nova = k => (faturas[k] ||= { itens: [], total: 0, pago: 0 });
  let totalPago = 0;
  dados.transacoes.forEach(t => {
    const d = delta(t, c.id);
    if (!d) return;
    if (ehPagamentoCartao(t, c.id)) { totalPago += d; return; }
    const f = nova(faturaDaData(c, t.data));
    f.itens.push({ t, valor: -d });
    f.total += -d;
  });
  if ((c.saldoInicial || 0) < 0) {
    const chaves = Object.keys(faturas).sort();
    const f = nova(chaves[0] || faturaDaData(c, hojeISO()));
    f.itens.unshift({ t: { descricao: 'Saldo devedor anterior ao app', data: '', categoria: '' }, valor: -c.saldoInicial });
    f.total += -c.saldoInicial;
  }
  let sobra = r2(totalPago);
  Object.keys(faturas).sort().forEach(k => {
    const f = faturas[k];
    f.total = r2(f.total);
    f.itens.sort((a, b) => a.t.data.localeCompare(b.t.data));
    f.pago = r2(Math.min(Math.max(f.total, 0), sobra));
    sobra = r2(sobra - f.pago);
  });
  return { faturas, credito: sobra };
}
function statusFatura(info, f) {
  const hoje = hojeISO(), resta = r2(f.total - f.pago);
  if (hoje < info.fechamento) return { txt: 'Aberta', cls: 'st-aberta' };
  if (resta <= 0) return { txt: f.total > 0 ? 'Paga' : 'Sem gastos', cls: 'st-paga' };
  if (hoje > info.vencimento) return { txt: 'Vencida', cls: 'st-vencida' };
  if (f.pago > 0) return { txt: 'Parcialmente paga', cls: 'st-parcial' };
  return { txt: 'Fechada', cls: 'st-fechada' };
}
// limite comprometido: tudo o que está devido no cartão, inclusive parcelas futuras
function limiteCartao(c) {
  const usado = Math.max(0, -r2((c.saldoInicial || 0) + dados.transacoes.reduce((s, t) => s + delta(t, c.id), 0)));
  return { limite: c.limite || 0, usado, disponivel: r2((c.limite || 0) - usado) };
}
function resumoFatura(c, mesV) {
  const { faturas, credito } = faturasCartao(c);
  const f = faturas[mesV] || { itens: [], total: 0, pago: 0 };
  const info = infoFatura(c, mesV);
  return { f, info, st: statusFatura(info, f), resta: Math.max(0, r2(f.total - f.pago)), credito };
}

// ---------- janelas de confirmação (substituem confirm/alert, que alguns navegadores bloqueiam) ----------
function dialogo(msg, { ok = 'OK', cancelar = true, perigo = false } = {}) {
  const d = $('#dialogo');
  if (!d.showModal) return Promise.resolve(cancelar ? confirm(msg) : (alert(msg), true));
  return new Promise(res => {
    $('#dlgMsg').textContent = msg;
    $('#dlgOk').textContent = ok;
    $('#dlgOk').className = perigo ? 'perigo-cheio' : 'primario';
    $('#dlgCancelar').style.display = cancelar ? '' : 'none';
    const fim = v => { d.close(); $('#dlgOk').onclick = $('#dlgCancelar').onclick = d.oncancel = null; res(v); };
    $('#dlgOk').onclick = () => fim(true);
    $('#dlgCancelar').onclick = () => fim(false);
    d.oncancel = e => { e.preventDefault(); fim(false); };
    d.showModal();
    $('#dlgOk').focus();
  });
}
const perguntar = (msg, ok = 'Confirmar', perigo = false) => dialogo(msg, { ok, perigo });
const avisar = msg => dialogo(msg, { cancelar: false });

// ---------- navegação ----------
function irPara(aba) { document.querySelector(`.aba[data-aba="${aba}"]`).click(); }
document.querySelectorAll('.aba').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.aba, .secao').forEach(e => e.classList.remove('ativa'));
  b.classList.add('ativa');
  $('#' + b.dataset.aba).classList.add('ativa');
}));
$('#mesAtual').addEventListener('change', e => { if (e.target.value) { mesAtual = e.target.value; render(); } });
$('#mesAnterior').addEventListener('click', () => { mesAtual = addMeses(mesAtual, -1); render(); });
$('#mesSeguinte').addEventListener('click', () => { mesAtual = addMeses(mesAtual, 1); render(); });

// ---------- render ----------
function render() {
  $('#mesAtual').value = mesAtual;
  preencherSelectsContas();
  renderPainel();
  renderContas();
  renderLancamentos();
  renderOrcamento();
  renderMetas();
  atualizarSelectCategorias();
}

function opcoesContas(sel, lista, vazio) {
  const atual = sel.value;
  sel.innerHTML = (vazio ? `<option value="">${vazio}</option>` : '') +
    lista.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  if ([...sel.options].some(o => o.value === atual)) sel.value = atual;
}
function preencherSelectsContas() {
  opcoesContas($('#lConta'), dados.contas);
  opcoesContas($('#lContra'), dados.contas.filter(c => c.id !== $('#lConta').value), '— nenhuma (fora do app) —');
  opcoesContas($('#filtroConta'), dados.contas, 'Todas as contas');
  opcoesContas($('#ctPagto'), dados.contas.filter(c => c.tipo !== 'cartao' && c.id !== $('#ctId').value), '— escolher na hora —');
  atualizarRotuloParcelas();
}
// em cartão de crédito, "repetir" vira "parcelas" e o valor total é dividido
function ehCompraParcelada() {
  return conta($('#lConta').value)?.tipo === 'cartao' && $('#lTipo').value === 'despesa' && !$('#lId').value;
}
function atualizarRotuloParcelas() {
  const parc = ehCompraParcelada();
  $('#lRepetirTxt').textContent = parc ? 'Parcelas (valor total é dividido)' : 'Repetir por (meses)';
  $('#lRepetirBox').title = parc ? 'Informe o valor TOTAL da compra; o app cria uma parcela por fatura' : 'Cria o mesmo lançamento nos meses seguintes';
}

function renderPainel() {
  const rec = somaMes(mesAtual, 'receita');
  const desp = somaMes(mesAtual, 'despesa');
  const saldo = rec - desp;
  const fim = mesAtual + '-31';
  const saldos = dados.contas.map(c => ({ c, s: saldoConta(c.id, fim) }));
  const total = r2(saldos.reduce((s, x) => s + x.s, 0));
  const investido = dados.transacoes
    .filter(t => t.tipo === 'transferencia' && t.data.startsWith(mesAtual) && ['Aplicação', 'Resgate'].includes(t.categoria))
    .reduce((s, t) => s + (t.sentido === 'entrada' ? -t.valor : t.valor), 0);
  $('#cReceitas').textContent = fmt(rec);
  $('#cDespesas').textContent = fmt(desp);
  $('#cSaldoMes').textContent = fmt(saldo);
  $('#cSaldoMes').className = saldo >= 0 ? 'pos' : 'neg';
  $('#cSaldoTotal').textContent = fmt(total);
  $('#cSaldoTotal').className = total >= 0 ? 'pos' : 'neg';
  $('#cInvestido').textContent = fmt(investido);

  // saldos por conta
  $('#listaSaldos').innerHTML = saldos.map(({ c, s }) => {
    let sub = TIPOS_CONTA[c.tipo] || '';
    if (c.tipo === 'cartao') {
      const { f, st, info } = resumoFatura(c, mesAtual);
      sub = `Fatura ${nomeMes(mesAtual)}: ${fmt(f.total)} · ${st.txt} · vence ${br(info.vencimento).slice(0, 5)}`;
    }
    return `
    <div class="linha-saldo">
      <span>${esc(c.nome)}<small>${sub}</small></span>
      <strong class="${s < 0 ? 'neg' : ''}">${fmt(s)}</strong>
    </div>`;
  }).join('') +
    `<div class="linha-saldo total"><span>Total em ${nomeMes(mesAtual)}</span><strong class="${total < 0 ? 'neg' : 'pos'}">${fmt(total)}</strong></div>`;

  // categorias × orçamento
  const gastos = gastosPorCategoria(mesAtual);
  const cats = [...new Set([...dados.categorias.despesa, ...Object.keys(gastos)])]
    .filter(c => gastos[c] || dados.orcamentos[c])
    .sort((a, b) => (gastos[b] || 0) - (gastos[a] || 0));
  $('#listaCategorias').innerHTML = cats.length ? cats.map(c => {
    const g = gastos[c] || 0, o = dados.orcamentos[c] || 0;
    const pct = o ? g / o * 100 : (g ? 100 : 0);
    const cls = o && pct > 100 ? 'estouro' : o && pct > 80 ? 'alerta' : '';
    return `<div class="cat-linha">
      <div class="cat-topo"><span>${esc(c)}</span><span>${fmt(g)} <small>${o ? 'de ' + fmt(o) : 'sem orçamento'}</small></span></div>
      <div class="barra"><div class="${cls}" style="width:${Math.min(pct, 100)}%"></div></div>
    </div>`;
  }).join('') : '<p class="vazio">Sem despesas ou orçamentos neste mês.</p>';

  // gráfico 6 meses
  const meses = Array.from({ length: 6 }, (_, i) => addMeses(mesAtual, i - 5));
  const vals = meses.map(m => [somaMes(m, 'receita'), somaMes(m, 'despesa')]);
  const max = Math.max(1, ...vals.flat());
  const W = 480, H = 220, base = 190, alt = 170, larg = W / 6;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas dos últimos 6 meses">`;
  meses.forEach((m, i) => {
    const x = i * larg + larg / 2;
    const [r, d] = vals[i];
    const hr = r / max * alt, hd = d / max * alt;
    svg += `<rect x="${x - 22}" y="${base - hr}" width="20" height="${hr}" rx="3" style="fill:var(--pos)"><title>Receitas ${nomeMes(m)}: ${fmt(r)}</title></rect>`;
    svg += `<rect x="${x + 2}" y="${base - hd}" width="20" height="${hd}" rx="3" style="fill:var(--neg)"><title>Despesas ${nomeMes(m)}: ${fmt(d)}</title></rect>`;
    svg += `<text x="${x}" y="${H - 8}" text-anchor="middle"${m === mesAtual ? ' style="font-weight:700;fill:var(--texto)"' : ''}>${nomeMes(m)}</text>`;
  });
  svg += `<line x1="0" x2="${W}" y1="${base}" y2="${base}" style="stroke:var(--borda)"/></svg>`;
  $('#grafico').innerHTML = svg;
}

// ---------- aba Contas ----------
function renderContas() {
  const fim = mesAtual + '-31';
  $('#listaContas').innerHTML = dados.contas.map(c => {
    const s = saldoConta(c.id, fim);
    const movs = dados.transacoes.filter(t => t.data.startsWith(mesAtual)).map(t => delta(t, c.id));
    const ent = movs.filter(v => v > 0).reduce((a, b) => a + b, 0);
    const sai = -movs.filter(v => v < 0).reduce((a, b) => a + b, 0);
    if (c.tipo === 'cartao') {
      const { f, st, info, resta } = resumoFatura(c, mesAtual);
      const lim = limiteCartao(c);
      return `<div class="painel-box conta-card ${contaSel === c.id ? 'aberta' : ''}">
        <div class="meta-topo"><h2>${esc(c.nome)}</h2><small>${TIPOS_CONTA.cartao}</small></div>
        <div><span class="badge ${st.cls}">${st.txt}</span> <small>Fatura de ${nomeMes(mesAtual)} · vence ${br(info.vencimento)}</small></div>
        <div class="conta-saldo neg">${fmt(f.total)}</div>
        <div class="cartao-info">
          ${resta > 0 && st.txt !== 'Aberta' ? `<span>Falta pagar: <b class="neg">${fmt(resta)}</b></span>` : ''}
          ${lim.limite ? `<span>Limite disponível: <b>${fmt(lim.disponivel)}</b> de ${fmt(lim.limite)}</span>` : ''}
          ${c.diaFechamento ? '' : '<span class="aviso">Configure fechamento e vencimento em Editar.</span>'}
        </div>
        <div class="acoes">
          <button class="primario" data-extrato="${c.id}">Faturas</button>
          <button data-editconta="${c.id}">Editar</button>
          <button class="perigo" data-delconta="${c.id}">Excluir</button>
        </div>
      </div>`;
    }
    return `<div class="painel-box conta-card ${contaSel === c.id ? 'aberta' : ''}">
      <div class="meta-topo"><h2>${esc(c.nome)}</h2><small>${TIPOS_CONTA[c.tipo] || ''}</small></div>
      <div class="conta-saldo ${s < 0 ? 'neg' : ''}">${fmt(s)}</div>
      <div class="meta-info"><span>Saldo no fim de ${nomeMes(mesAtual)}</span>
        <span>No mês: <span class="pos">+${fmt(ent)}</span> <span class="neg">−${fmt(sai)}</span></span></div>
      <div class="acoes">
        <button class="primario" data-extrato="${c.id}">Movimentação</button>
        <button data-editconta="${c.id}">Editar</button>
        <button class="perigo" data-delconta="${c.id}">Excluir</button>
      </div>
    </div>`;
  }).join('');
  renderExtrato();
}

function renderExtrato() {
  const c = contaSel && conta(contaSel);
  if (!c) { contaSel = null; $('#extratoConta').classList.add('oculto'); return; }
  $('#extratoConta').classList.remove('oculto');
  const cartao = c.tipo === 'cartao';
  $('#alternarModo').classList.toggle('oculto', !cartao);
  $('#alternarModo').textContent = modoCartao === 'fatura' ? 'Ver extrato corrido' : 'Ver faturas';
  if (cartao && modoCartao === 'fatura') {
    $('#tabExtrato').classList.add('oculto');
    return renderFatura(c);
  }
  $('#faturaConta').innerHTML = '';
  $('#tabExtrato').classList.remove('oculto');
  $('#tituloExtrato').textContent = `Movimentação — ${c.nome} (${nomeMes(mesAtual)})`;
  let saldo = saldoConta(c.id, mesAtual + '-01', false);
  const movs = dados.transacoes
    .filter(t => t.data.startsWith(mesAtual) && delta(t, c.id) !== 0)
    .sort((a, b) => a.data.localeCompare(b.data));
  let html = `<tr class="saldo-linha"><td colspan="3">Saldo anterior</td><td class="dir">${fmt(saldo)}</td><td></td></tr>`;
  html += movs.map(t => {
    const d = delta(t, c.id);
    saldo = r2(saldo + d);
    const cls = t.tipo === 'transferencia' ? 'neutro' : d > 0 ? 'pos' : 'neg';
    const sub = [t.categoria, subtitulo(t, c.id)].filter(Boolean).join(' · ');
    return `<tr>
      <td>${t.data.slice(8)}/${t.data.slice(5, 7)}</td>
      <td>${esc(t.descricao)}<small class="sub">${esc(sub)}</small></td>
      <td class="dir ${cls}">${d > 0 ? '+' : '−'} ${fmt(Math.abs(d))}</td>
      <td class="dir ${saldo < 0 ? 'neg' : ''}">${fmt(saldo)}</td>
      <td class="dir">
        <button class="mini" title="Editar" data-editar="${t.id}">✎</button>
        <button class="mini" title="Excluir" data-excluir="${t.id}">🗑</button>
      </td>
    </tr>`;
  }).join('');
  if (!movs.length) html += `<tr><td colspan="5" class="vazio">Nenhuma movimentação nesta conta em ${nomeMes(mesAtual)}.</td></tr>`;
  html += `<tr class="saldo-linha"><td colspan="3">Saldo final</td><td class="dir ${saldo < 0 ? 'neg' : ''}">${fmt(saldo)}</td><td></td></tr>`;
  $('#tabelaExtrato').innerHTML = html;
}

function renderFatura(c) {
  $('#tituloExtrato').textContent = `Faturas — ${c.nome}`;
  const { f, info, st, resta, credito } = resumoFatura(c, mesAtual);
  const lim = limiteCartao(c);
  const pct = lim.limite ? lim.usado / lim.limite * 100 : 0;
  const pagadoras = dados.contas.filter(x => x.id !== c.id && x.tipo !== 'cartao');
  const contaPadrao = pagadoras.some(x => x.id === c.contaPagamento) ? c.contaPagamento : pagadoras[0]?.id;
  const hoje = hojeISO();
  const itens = f.itens.map(({ t, valor }) => `
    <tr>
      <td>${t.data ? `${t.data.slice(8)}/${t.data.slice(5, 7)}` : ''}</td>
      <td>${esc(t.descricao)}${t.categoria ? `<small class="sub">${esc(t.categoria)}</small>` : ''}</td>
      <td class="dir ${valor < 0 ? 'pos' : ''}">${valor < 0 ? '− ' : ''}${fmt(Math.abs(valor))}</td>
      <td class="dir">${t.id ? `
        <button class="mini" title="Editar" data-editar="${t.id}">✎</button>
        <button class="mini" title="Excluir" data-excluir="${t.id}">🗑</button>` : ''}</td>
    </tr>`).join('');

  $('#faturaConta').innerHTML = `
  <div class="fatura-resumo">
    ${lim.limite ? `<div>
      <div class="cat-topo"><span>Limite usado: ${fmt(lim.usado)} de ${fmt(lim.limite)}</span><span>Disponível: <b>${fmt(lim.disponivel)}</b></span></div>
      <div class="barra"><div class="${pct > 100 ? 'estouro' : pct > 80 ? 'alerta' : ''}" style="width:${Math.min(pct, 100)}%"></div></div>
    </div>` : '<p class="dica">Informe o limite em "Editar" para acompanhar o limite disponível.</p>'}
    ${c.diaFechamento ? '' : '<p class="aviso">Configure os dias de fechamento e vencimento em "Editar" — por enquanto usando fechamento dia 1 e vencimento dia 10.</p>'}
    <div class="fatura-cab">
      <div>
        <span class="badge ${st.cls}">${st.txt}</span>
        <h3>Fatura de ${nomeMes(mesAtual)}</h3>
        <small>Compras de ${br(info.inicio)} a ${br(vespera(info.fechamento))}<br>Fecha em ${br(info.fechamento)} · vence em ${br(info.vencimento)}</small>
      </div>
      <div class="fatura-valores">
        <div>Total<b>${fmt(f.total)}</b></div>
        <div>Pago<b class="pos">${fmt(f.pago)}</b></div>
        <div>Falta pagar<b class="${resta > 0 ? 'neg' : ''}">${fmt(resta)}</b></div>
      </div>
    </div>
    <p class="dica">Use ‹ › no topo da tela para ver as faturas de outros meses.</p>
    ${credito > 0 ? `<p class="dica">Crédito no cartão (pago a mais): <b>${fmt(credito)}</b></p>` : ''}
    ${resta > 0 ? `<div class="acoes"><button class="primario" id="abrirPagamento">Pagar fatura</button></div>
    <form id="formPagamento" class="form oculto">
      <div class="linha">
        <label>Valor (R$) <input type="number" id="pgValor" step="0.01" min="0.01" value="${resta.toFixed(2)}" required></label>
        <label>Data <input type="date" id="pgData" value="${hoje < info.vencimento ? hoje : info.vencimento}" required></label>
        <label>Pagar com
          <select id="pgConta">${pagadoras.map(x => `<option value="${x.id}" ${x.id === contaPadrao ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}
            <option value="">— conta fora do app —</option></select>
        </label>
      </div>
      <div class="acoes"><button type="submit" class="primario">Registrar pagamento</button><button type="button" id="cancelarPagamento">Cancelar</button></div>
    </form>` : ''}
  </div>
  <table class="tab-extrato">
    <thead><tr><th>Data</th><th>Lançamento</th><th class="dir">Valor</th><th></th></tr></thead>
    <tbody>${itens || '<tr><td colspan="4" class="vazio">Nenhum lançamento nesta fatura.</td></tr>'}</tbody>
    <tfoot><tr><th colspan="2">Total da fatura</th><th class="dir">${fmt(f.total)}</th><th></th></tr></tfoot>
  </table>`;
}

function registrarPagamento(c) {
  const valor = r2(parseFloat($('#pgValor').value));
  if (!(valor > 0)) return avisar('Informe o valor do pagamento.');
  const pagadora = $('#pgConta').value;
  const t = {
    id: id(), tipo: 'transferencia', data: $('#pgData').value, valor,
    descricao: `Pagamento fatura ${c.nome} ${nomeMes(mesAtual)}`, categoria: categoriaValida('transferencia', 'Pagamento de fatura'),
  };
  // registrado na conta que paga (sai dela e entra no cartão); sem conta, entra direto no cartão
  if (pagadora) Object.assign(t, { conta: pagadora, sentido: 'saida', contraparte: c.id });
  else Object.assign(t, { conta: c.id, sentido: 'entrada' });
  t.modificado = Date.now();
  dados.transacoes.push(t);
  if (pagadora) c.contaPagamento = pagadora;
  salvar();
  avisar(`Pagamento de ${fmt(valor)} registrado na fatura de ${nomeMes(mesAtual)}.`);
}

function mostrarCamposCartao() {
  const ehCartao = $('#ctTipo').value === 'cartao';
  $('#ctCartaoBox').classList.toggle('oculto', !ehCartao);
  $('#ctDicaCartao').classList.toggle('oculto', !ehCartao);
  $('#ctFech').required = $('#ctVenc').required = ehCartao;
}
$('#ctTipo').addEventListener('change', mostrarCamposCartao);

$('#formConta').addEventListener('submit', e => {
  e.preventDefault();
  const info = {
    nome: $('#ctNome').value.trim(),
    tipo: $('#ctTipo').value,
    saldoInicial: r2(parseFloat($('#ctSaldo').value) || 0),
  };
  if (info.tipo === 'cartao') Object.assign(info, {
    limite: r2(parseFloat($('#ctLimite').value) || 0),
    diaFechamento: parseInt($('#ctFech').value) || 1,
    diaVencimento: parseInt($('#ctVenc').value) || 10,
    contaPagamento: $('#ctPagto').value || undefined,
  });
  const eid = $('#ctId').value;
  if (eid) {
    const c = conta(eid);
    ['limite', 'diaFechamento', 'diaVencimento', 'contaPagamento'].forEach(k => delete c[k]);
    Object.assign(c, info);
  } else dados.contas.push({ id: id(), ...info });
  limparFormConta();
  salvar();
});
function limparFormConta() {
  $('#formConta').reset();
  $('#ctId').value = '';
  $('#ctSaldo').value = 0;
  $('#tituloConta').textContent = 'Nova conta';
  $('#ctCancelar').classList.add('oculto');
  mostrarCamposCartao();
}
$('#ctCancelar').addEventListener('click', limparFormConta);
$('#fecharExtrato').addEventListener('click', () => { contaSel = null; renderContas(); });

$('#listaContas').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  const { extrato, editconta, delconta } = b.dataset;
  if (extrato) {
    contaSel = contaSel === extrato ? null : extrato;
    modoCartao = 'fatura';
    renderContas();
    if (contaSel) $('#extratoConta').scrollIntoView({ behavior: 'smooth' });
  }
  if (editconta) {
    const c = conta(editconta);
    $('#ctId').value = c.id;
    $('#ctNome').value = c.nome;
    $('#ctTipo').value = c.tipo;
    $('#ctSaldo').value = c.saldoInicial || 0;
    $('#ctLimite').value = c.limite || '';
    $('#ctFech').value = c.diaFechamento || '';
    $('#ctVenc').value = c.diaVencimento || '';
    preencherSelectsContas();
    $('#ctPagto').value = c.contaPagamento || '';
    mostrarCamposCartao();
    $('#tituloConta').textContent = 'Editar conta';
    $('#ctCancelar').classList.remove('oculto');
    $('#formConta').scrollIntoView({ behavior: 'smooth' });
  }
  if (delconta) {
    if (dados.contas.length === 1) return avisar('É preciso ter pelo menos uma conta. Crie outra antes de excluir esta.');
    const c = conta(delconta);
    const n = dados.transacoes.filter(t => t.conta === delconta).length;
    const msg = n
      ? `Excluir a conta "${c.nome}" e ${n === 1 ? 'o lançamento dela' : `os ${n} lançamentos dela`}?\nEsta ação não pode ser desfeita.`
      : `Excluir a conta "${c.nome}"?`;
    if (!await perguntar(msg, 'Excluir', true)) return;
    registrarExclusao(delconta, ...dados.transacoes.filter(t => t.conta === delconta).map(t => t.id));
    dados.transacoes = dados.transacoes.filter(t => t.conta !== delconta);
    dados.transacoes.forEach(t => { if (t.contraparte === delconta) delete t.contraparte; });
    dados.contas = dados.contas.filter(x => x.id !== delconta);
    if (contaSel === delconta) contaSel = null;
    salvar();
  }
});

$('#extratoConta').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.editar) editarLanc(b.dataset.editar);
  if (b.dataset.excluir) excluirLanc(b.dataset.excluir);
  if (b.id === 'abrirPagamento') { $('#formPagamento').classList.remove('oculto'); b.classList.add('oculto'); $('#pgValor').focus(); }
  if (b.id === 'cancelarPagamento') renderExtrato();
  if (b.id === 'alternarModo') { modoCartao = modoCartao === 'fatura' ? 'extrato' : 'fatura'; renderExtrato(); }
});
$('#extratoConta').addEventListener('submit', e => {
  if (e.target.id !== 'formPagamento') return;
  e.preventDefault();
  registrarPagamento(conta(contaSel));
});

// ---------- aba Lançamentos ----------
function listaVisivel() {
  const f = $('#filtro').value.trim().toLowerCase();
  const fc = $('#filtroConta').value;
  return dados.transacoes
    .filter(t => t.data.startsWith(mesAtual))
    .filter(t => !fc || t.conta === fc || t.contraparte === fc)
    .filter(t => !f || (t.descricao + ' ' + t.categoria).toLowerCase().includes(f))
    .sort((a, b) => b.data.localeCompare(a.data));
}

function renderLancamentos() {
  const lista = listaVisivel();
  const visiveis = new Set(lista.map(t => t.id));
  [...selecionados].forEach(i => { if (!visiveis.has(i)) selecionados.delete(i); });

  $('#tabelaLanc').innerHTML = lista.map(t => {
    const a = aparencia(t);
    const sub = subtitulo(t);
    return `
    <tr>
      <td><input type="checkbox" data-marca="${t.id}" ${selecionados.has(t.id) ? 'checked' : ''}></td>
      <td>${t.data.split('-').reverse().join('/')}</td>
      <td>${esc(t.descricao)}${sub ? `<small class="sub">${esc(sub)}</small>` : ''}</td>
      <td>${esc(t.categoria)}</td>
      <td class="dir ${a.cls}">${a.sinal} ${fmt(t.valor)}</td>
      <td class="dir">
        <button class="mini" title="Editar" data-editar="${t.id}">✎</button>
        <button class="mini" title="Excluir" data-excluir="${t.id}">🗑</button>
      </td>
    </tr>`;
  }).join('');
  $('#semLanc').style.display = lista.length ? 'none' : 'block';
  $('#selTodos').checked = lista.length > 0 && selecionados.size === lista.length;
  $('#excluirSel').classList.toggle('oculto', selecionados.size === 0);
  $('#excluirSel').textContent = `Excluir selecionados (${selecionados.size})`;
}

function atualizarSelectCategorias() {
  const sel = $('#lCat'), atual = sel.value, tipo = $('#lTipo').value;
  sel.innerHTML = dados.categorias[tipo].map(c => `<option>${esc(c)}</option>`).join('');
  if ([...sel.options].some(o => o.value === atual)) sel.value = atual;
  $('#lSentidoBox').classList.toggle('oculto', tipo !== 'transferencia');
  $('#lContraBox').classList.toggle('oculto', tipo !== 'transferencia' || dados.contas.length < 2);
  atualizarRotuloParcelas();
}

$('#lTipo').addEventListener('change', atualizarSelectCategorias);
$('#lConta').addEventListener('change', preencherSelectsContas);
$('#filtro').addEventListener('input', renderLancamentos);
$('#filtroConta').addEventListener('change', renderLancamentos);
$('#lData').value = hojeISO();

$('#formLanc').addEventListener('submit', e => {
  e.preventDefault();
  const base = {
    tipo: $('#lTipo').value,
    data: $('#lData').value,
    valor: r2(parseFloat($('#lValor').value)),
    descricao: $('#lDesc').value.trim(),
    categoria: $('#lCat').value,
    conta: $('#lConta').value,
  };
  if (base.tipo === 'transferencia') {
    base.sentido = $('#lSentido').value;
    const contra = $('#lContra').value;
    if (contra && contra !== base.conta) base.contraparte = contra;
  }
  const editId = $('#lId').value;
  if (editId) {
    const t = dados.transacoes.find(t => t.id === editId);
    delete t.sentido; delete t.contraparte;
    Object.assign(t, base, { modificado: Date.now() });
  } else {
    const n = Math.max(1, parseInt($('#lRepetir').value) || 1);
    const parcelado = ehCompraParcelada() && n > 1;
    const parcela = parcelado ? r2(base.valor / n) : base.valor;
    const [a, m, d] = base.data.split('-').map(Number);
    for (let i = 0; i < n; i++) {
      const mes = addMeses(`${a}-${String(m).padStart(2, '0')}`, i);
      const [aa, mm] = mes.split('-').map(Number);
      const dia = Math.min(d, new Date(aa, mm, 0).getDate());
      // a última parcela absorve a diferença de centavos
      const valor = parcelado && i === n - 1 ? r2(base.valor - parcela * (n - 1)) : parcela;
      dados.transacoes.push({ ...base, id: id(), modificado: Date.now(), valor, data: `${mes}-${String(dia).padStart(2, '0')}`,
        descricao: n > 1 ? `${base.descricao} (${i + 1}/${n})` : base.descricao });
    }
  }
  limparForm();
  salvar();
});

function limparForm() {
  const tipo = $('#lTipo').value, c = $('#lConta').value;
  $('#formLanc').reset();
  $('#lTipo').value = tipo;
  $('#lConta').value = c;
  $('#lId').value = '';
  $('#lData').value = mesAtual === hojeISO().slice(0, 7) ? hojeISO() : mesAtual + '-01';
  $('#tituloForm').textContent = 'Novo lançamento';
  $('#cancelarEdicao').classList.add('oculto');
  $('#lRepetir').disabled = false;
  preencherSelectsContas();
  atualizarSelectCategorias();
}
$('#cancelarEdicao').addEventListener('click', limparForm);

function editarLanc(lid) {
  const t = dados.transacoes.find(t => t.id === lid);
  if (!t) return;
  irPara('lancamentos');
  $('#lId').value = t.id;
  $('#lTipo').value = t.tipo;
  $('#lConta').value = t.conta;
  preencherSelectsContas();
  atualizarSelectCategorias();
  if (![...$('#lCat').options].some(o => o.value === t.categoria))
    $('#lCat').insertAdjacentHTML('beforeend', `<option>${esc(t.categoria)}</option>`);
  $('#lCat').value = t.categoria;
  $('#lSentido').value = t.sentido || 'saida';
  $('#lContra').value = t.contraparte || '';
  $('#lData').value = t.data;
  $('#lValor').value = t.valor;
  $('#lDesc').value = t.descricao;
  $('#lRepetir').value = 1;
  $('#lRepetir').disabled = true;
  $('#tituloForm').textContent = 'Editar lançamento';
  $('#cancelarEdicao').classList.remove('oculto');
  $('#formLanc').scrollIntoView({ behavior: 'smooth' });
}

async function excluirLanc(lid) {
  const t = dados.transacoes.find(t => t.id === lid);
  if (!t) return;
  if (await perguntar(`Excluir o lançamento "${t.descricao}" (${fmt(t.valor)})?`, 'Excluir', true)) {
    registrarExclusao(lid);
    dados.transacoes = dados.transacoes.filter(x => x.id !== lid);
    selecionados.delete(lid);
    salvar();
  }
}

$('#tabelaLanc').addEventListener('change', e => {
  const marca = e.target.dataset.marca;
  if (!marca) return;
  e.target.checked ? selecionados.add(marca) : selecionados.delete(marca);
  renderLancamentos();
});

$('#tabelaLanc').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.editar) editarLanc(b.dataset.editar);
  if (b.dataset.excluir) excluirLanc(b.dataset.excluir);
});

$('#selTodos').addEventListener('change', e => {
  selecionados.clear();
  if (e.target.checked) listaVisivel().forEach(t => selecionados.add(t.id));
  renderLancamentos();
});

$('#excluirSel').addEventListener('click', async () => {
  const n = selecionados.size;
  if (!n) return;
  if (await perguntar(`Excluir ${n} lançamento${n > 1 ? 's' : ''} selecionado${n > 1 ? 's' : ''}?\nEsta ação não pode ser desfeita.`, 'Excluir', true)) {
    registrarExclusao(...selecionados);
    dados.transacoes = dados.transacoes.filter(t => !selecionados.has(t.id));
    selecionados.clear();
    salvar();
  }
});

// ---------- orçamento e categorias ----------
function renderOrcamento() {
  const gastos = gastosPorCategoria(mesAtual);
  let tO = 0, tG = 0;
  $('#tabelaOrc').innerHTML = dados.categorias.despesa.map(c => {
    const o = dados.orcamentos[c] || 0, g = gastos[c] || 0;
    tO += o; tG += g;
    const resta = o - g;
    return `<tr>
      <td>${esc(c)}</td>
      <td class="dir"><input class="orc" type="number" min="0" step="0.01" data-cat="${esc(c)}" value="${o || ''}" placeholder="0,00"></td>
      <td class="dir">${fmt(g)}</td>
      <td class="dir ${o ? (resta >= 0 ? 'pos' : 'neg') : ''}">${o ? fmt(resta) : '—'}</td>
    </tr>`;
  }).join('');
  $('#orcTotal').textContent = fmt(tO);
  $('#orcGasto').textContent = fmt(tG);
  $('#orcResta').textContent = fmt(tO - tG);
  $('#orcResta').className = 'dir ' + (tO - tG >= 0 ? 'pos' : 'neg');

  const alvo = { despesa: '#catsDespesa', receita: '#catsReceita', transferencia: '#catsTransferencia' };
  Object.keys(alvo).forEach(tipo => {
    $(alvo[tipo]).innerHTML = dados.categorias[tipo]
      .map((c, i) => `<li>${esc(c)}<button title="Remover" data-remcat="${tipo}:${i}">×</button></li>`).join('');
  });
}

$('#tabelaOrc').addEventListener('change', e => {
  if (!e.target.dataset.cat) return;
  const v = parseFloat(e.target.value);
  if (v > 0) dados.orcamentos[e.target.dataset.cat] = r2(v);
  else delete dados.orcamentos[e.target.dataset.cat];
  salvar();
});

document.querySelectorAll('.add-cat').forEach(f => f.addEventListener('submit', e => {
  e.preventDefault();
  const input = f.querySelector('input'), nome = input.value.trim();
  const lista = dados.categorias[f.dataset.tipo];
  if (nome && !lista.includes(nome)) { lista.push(nome); salvar(); }
  input.value = '';
}));

$('#orcamento').addEventListener('click', async e => {
  if (!e.target.dataset.remcat) return;
  const [tipo, i] = e.target.dataset.remcat.split(':');
  const nome = dados.categorias[tipo][i];
  if (await perguntar(`Remover a categoria "${nome}"?\nOs lançamentos existentes são mantidos.`, 'Remover', true)) {
    dados.categorias[tipo].splice(i, 1);
    if (tipo === 'despesa') delete dados.orcamentos[nome];
    salvar();
  }
});

// ---------- metas ----------
function renderMetas() {
  $('#listaMetas').innerHTML = dados.metas.length ? dados.metas.map(m => {
    const pct = Math.min(100, m.guardado / m.alvo * 100);
    const falta = Math.max(0, m.alvo - m.guardado);
    let porMes = '';
    if (m.prazo && falta > 0) {
      const [a1, m1] = hojeISO().slice(0, 7).split('-').map(Number);
      const [a2, m2] = m.prazo.split('-').map(Number);
      const n = (a2 - a1) * 12 + (m2 - m1) + 1;
      porMes = n > 0 ? ` · guardar ${fmt(falta / n)}/mês até ${nomeMes(m.prazo)}` : ' · prazo vencido';
    }
    return `<div class="painel-box meta">
      <div class="meta-topo"><h2>${esc(m.nome)}</h2><strong>${pct.toFixed(0)}%</strong></div>
      <div class="barra"><div style="width:${pct}%"></div></div>
      <div class="meta-info"><span>${fmt(m.guardado)} de ${fmt(m.alvo)}</span><span>Falta ${fmt(falta)}${porMes}</span></div>
      <div class="acoes">
        <input type="number" step="0.01" placeholder="Valor" data-valmeta="${m.id}">
        <button data-depmeta="${m.id}">+ Guardar</button>
        <button data-retmeta="${m.id}">− Retirar</button>
        <button class="perigo" data-delmeta="${m.id}">Excluir meta</button>
      </div>
    </div>`;
  }).join('') : '<p class="vazio">Nenhuma meta cadastrada.</p>';
}

$('#formMeta').addEventListener('submit', e => {
  e.preventDefault();
  dados.metas.push({ id: id(), nome: $('#mNome').value.trim(), alvo: parseFloat($('#mAlvo').value), guardado: 0, prazo: $('#mPrazo').value });
  e.target.reset();
  salvar();
});

$('#listaMetas').addEventListener('click', async e => {
  const { depmeta, retmeta, delmeta } = e.target.dataset;
  const mid = depmeta || retmeta || delmeta;
  if (!mid) return;
  const meta = dados.metas.find(m => m.id === mid);
  if (delmeta) {
    if (await perguntar(`Excluir a meta "${meta.nome}"?`, 'Excluir', true)) {
      registrarExclusao(mid);
      dados.metas = dados.metas.filter(m => m.id !== mid);
      salvar();
    }
    return;
  }
  const v = parseFloat(document.querySelector(`[data-valmeta="${mid}"]`).value);
  if (!(v > 0)) return avisar('Informe um valor positivo.');
  meta.guardado = Math.max(0, r2(meta.guardado + (depmeta ? v : -v)));
  salvar();
});

// ---------- importação de extrato OFX ----------
let previa = [];       // transações em revisão
let previaBruta = [];  // como vieram do arquivo (para reclassificar ao trocar a conta)
let previaAcct = '';   // número da conta informado no OFX

const normalizar = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
// chave para reconhecer o "mesmo estabelecimento": sem números (datas, parcelas, códigos)
const chaveDesc = s => normalizar(s).replace(/[0-9]+/g, '').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();

const REGRAS = {
  despesa: [
    [/SUPERMERC|MERCADO|PADARIA|IFOOD|RESTAUR|LANCHON|ACOUGUE|HORTIFRUTI|ATACAD|ASSAI|CARREFOUR|PIZZ|BURGER|MCDONALD|CAFE/, 'Alimentação'],
    [/UBER|\b99\b|99APP|POSTO|COMBUST|SHELL|IPIRANGA|ESTACIONA|PEDAGIO|SEM PARAR|CONECTCAR|METRO|BILHETE/, 'Transporte'],
    [/FARMAC|DROGA|RAIA|PAGUE MENOS|HOSPITAL|CLINICA|LABORAT|UNIMED|ODONTO|AMIL|HAPVIDA/, 'Saúde'],
    [/ALUGUEL|CONDOMIN|IPTU/, 'Moradia'],
    [/ENERGIA|CEMIG|ENEL|LIGHT|COPEL|CPFL|CELESC|EQUATORIAL|NEOENERGIA|SABESP|COPASA|SANEAMENTO|AGUA|TELEF|INTERNET|VIVO|CLARO|\bTIM\b|\bOI\b/, 'Contas'],
    [/NETFLIX|SPOTIFY|CINEMA|DISNEY|PRIME VIDEO|AMAZON PRIME|HBO|MAX\b|GLOBOPLAY|INGRESSO|STEAM|PLAYSTATION|XBOX/, 'Lazer'],
    [/ESCOLA|COLEGIO|FACULDADE|UNIVERSIDADE|CURSO|LIVRARIA|UDEMY|ALURA/, 'Educação'],
  ],
  receita: [
    [/SALARIO|FOLHA|PROVENTO|REMUNERACAO|PAGTO SAL/, 'Salário'],
    [/RENDIMENTO|\bREND\b|DIVIDEND|JUROS/, 'Investimentos'],
  ],
};
// rendimentos (juros/CDI creditados) SÃO receita de verdade; aplicação/resgate NÃO
const RE_RENDIMENTO = /RENDIMENTO|\bREND\b|DIVIDEND|JUROS S|JUROS RECEB|PROVENTO/;
const RE_FATURA = /FATURA|PAGTO CARTAO|PGTO CARTAO|PAGAMENTO CARTAO|PAGAMENTO RECEBIDO|PAGTO RECEBIDO/;
const RE_INVEST = /APLICAC|\bAPLIC\b|APL AUT|RESGATE|\bRESG\b|INVEST|\bCDB\b|\bCDI\b|\bDI\b|\bRDB\b|\bLCI\b|\bLCA\b|POUPANCA|TESOURO|FUNDO|COFRINHO|CAIXINHA|PORQUINHO|GUARDAD|RESERVA/;
const RE_PROPRIA = /MESMA TITULARIDADE|ENTRE CONTAS|CONTA PROPRIA|TRANSF.*PROPRIA/;

function categoriaValida(tipo, cat) {
  const cats = dados.categorias[tipo];
  return cats.includes(cat) ? cat : (cats.includes('Outros') ? 'Outros' : cats[0] || 'Outros');
}

function sugerirCategoria(desc, tipo, entrada) {
  const n = normalizar(desc);
  if (tipo === 'transferencia') {
    if (RE_FATURA.test(n)) return categoriaValida(tipo, 'Pagamento de fatura');
    if (RE_INVEST.test(n)) return categoriaValida(tipo, entrada ? 'Resgate' : 'Aplicação');
    return categoriaValida(tipo, 'Transferência entre contas');
  }
  const regra = REGRAS[tipo].find(([re, cat]) => re.test(n) && dados.categorias[tipo].includes(cat));
  return categoriaValida(tipo, regra ? regra[1] : 'Outros');
}

// sugere a "outra conta" de uma transferência pelo tipo das contas cadastradas
function sugerirContra(categoria, origem) {
  const outras = dados.contas.filter(c => c.id !== origem);
  const tipoOrigem = conta(origem)?.tipo;
  if (['Aplicação', 'Resgate'].includes(categoria))
    return (outras.find(c => c.tipo === 'investimento') || outras.find(c => c.tipo === 'poupanca'))?.id || '';
  if (categoria === 'Pagamento de fatura')
    return (tipoOrigem === 'cartao' ? outras.find(c => c.tipo === 'corrente') : outras.find(c => c.tipo === 'cartao'))?.id || '';
  return '';
}

// decide tipo, categoria e outra conta de uma transação do extrato
function classificar(desc, entrada, origem) {
  const chave = chaveDesc(desc);
  // 1) aprende com lançamentos anteriores de mesma descrição e mesmo sentido
  const anterior = chave && [...dados.transacoes].reverse().find(t =>
    ehEntrada(t) === entrada && chaveDesc(t.descricao) === chave && (dados.categorias[t.tipo] || []).includes(t.categoria));
  if (anterior) {
    let contra = '';
    if (anterior.tipo === 'transferencia') {
      contra = anterior.contraparte === origem ? anterior.conta : (anterior.contraparte || '');
      if (contra === origem) contra = '';
    }
    return { tipo: anterior.tipo, categoria: anterior.categoria, contraparte: contra };
  }
  // 2) palavras-chave
  const n = normalizar(desc);
  let tipo = entrada ? 'receita' : 'despesa';
  if (!RE_RENDIMENTO.test(n) && (RE_INVEST.test(n) || RE_FATURA.test(n) || RE_PROPRIA.test(n))) tipo = 'transferencia';
  const categoria = sugerirCategoria(desc, tipo, entrada);
  return { tipo, categoria, contraparte: tipo === 'transferencia' ? sugerirContra(categoria, origem) : '' };
}

function decodificar(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); } // padrão da maioria dos bancos brasileiros
}

function numeroOFX(v) {
  v = v.replace(/\s/g, '');
  if (v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(/,/g, '');
  return parseFloat(v);
}

function lerOFX(txt) {
  const tag = (bloco, t) => {
    const m = bloco.match(new RegExp('<' + t + '>\\s*([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'") : '';
  };
  const acct = tag(txt, 'ACCTID');
  const transacoes = txt.split(/<STMTTRN>/i).slice(1).map(b => {
    b = b.split(/<\/STMTTRN>/i)[0];
    const d = tag(b, 'DTPOSTED');
    const valor = numeroOFX(tag(b, 'TRNAMT'));
    const nome = tag(b, 'NAME'), memo = tag(b, 'MEMO');
    const desc = memo && nome && !normalizar(memo).includes(normalizar(nome)) && !normalizar(nome).includes(normalizar(memo))
      ? `${nome} - ${memo}` : (memo || nome || 'Sem descrição');
    const fitid = tag(b, 'FITID');
    return {
      data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      valor, descricao: desc.replace(/\s+/g, ' ').trim(),
      fitid: fitid ? `${acct}:${fitid}` : '',
    };
  })
    .filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.data) && isFinite(t.valor) && t.valor !== 0)
    .map(t => ({ ...t, entrada: t.valor > 0, valor: r2(Math.abs(t.valor)) }))
    .sort((a, b) => a.data.localeCompare(b.data));
  return { acct, transacoes };
}

// classifica as transações e marca duplicadas para a conta escolhida
function montarPrevia(origem) {
  const fitids = new Set(dados.transacoes.map(t => t.fitid).filter(Boolean));
  const assin = (entrada, t) => `${t.conta}|${entrada}|${t.data}|${t.valor}|${chaveDesc(t.descricao)}`;
  const assinaturas = new Set(dados.transacoes.map(t => assin(ehEntrada(t), t)));
  const vistos = new Set();
  previa = previaBruta.map(bruta => {
    const t = { ...bruta, ...classificar(bruta.descricao, bruta.entrada, origem) };
    let dup = '';
    if (t.fitid ? (fitids.has(t.fitid) || vistos.has(t.fitid)) : assinaturas.has(assin(t.entrada, { ...t, conta: origem })))
      dup = 'já importado';
    // transferência já registrada a partir da outra conta (ex.: fatura paga na corrente e recebida no cartão)
    else if (t.tipo === 'transferencia' && dados.transacoes.some(o => o.tipo === 'transferencia' &&
      o.contraparte === origem && (o.sentido === 'entrada') !== t.entrada && o.valor === t.valor && diasEntre(o.data, t.data) <= 3))
      dup = 'já registrado pela outra conta';
    if (t.fitid) vistos.add(t.fitid);
    return { ...t, dup, sel: !dup };
  });
}

$('#arqOfx').addEventListener('change', async e => {
  const arq = e.target.files[0];
  e.target.value = '';
  if (!arq) return;
  const txt = decodificar(await arq.arrayBuffer());
  if (!/<STMTTRN>/i.test(txt)) {
    return avisar(/<OFX>|OFXHEADER/i.test(txt)
      ? 'O arquivo OFX não tem transações no período escolhido.'
      : 'Este arquivo não parece ser um extrato OFX.');
  }
  const { acct, transacoes } = lerOFX(txt);
  if (!transacoes.length) return avisar('Nenhuma transação válida encontrada no arquivo.');
  previaBruta = transacoes;
  previaAcct = acct;
  // conta: a que já recebeu OFX deste número; senão a filtrada/aberta; senão a primeira
  const origem = dados.contas.find(c => acct && c.ofxId === acct)?.id
    || $('#filtroConta').value || contaSel || dados.contas[0].id;
  opcoesContas($('#ofxConta'), dados.contas);
  $('#ofxConta').value = origem;
  montarPrevia(origem);
  renderPrevia();
  $('#previaOfx').classList.remove('oculto');
  $('#previaOfx').scrollIntoView({ behavior: 'smooth' });
});

$('#ofxConta').addEventListener('change', e => { montarPrevia(e.target.value); renderPrevia(); });

function renderPrevia() {
  const origem = $('#ofxConta').value;
  const outras = dados.contas.filter(c => c.id !== origem);
  const dups = previa.filter(t => t.dup).length;
  const sel = previa.filter(t => t.sel);
  const soma = tipo => sel.filter(t => t.tipo === tipo).reduce((s, t) => s + t.valor, 0);
  const nTransf = sel.filter(t => t.tipo === 'transferencia').length;
  $('#resumoOfx').innerHTML =
    `<b>${previa.length}</b> transações de ${br(previa[0].data)} a ${br(previa[previa.length - 1].data)}` +
    (previaAcct ? ` (conta nº ${esc(previaAcct)} no arquivo)` : '') + '. ' +
    (dups ? `<span class="aviso">${dups === 1 ? '1 já estava no app e foi desmarcada' : dups + ' já estavam no app e foram desmarcadas'}.</span> ` : '') +
    `<br>Selecionadas: <b>${sel.length}</b> · <span class="pos">receitas + ${fmt(soma('receita'))}</span> · <span class="neg">despesas − ${fmt(soma('despesa'))}</span>` +
    (nTransf ? `<br><span class="neutro">⇄ ${nTransf} transferência(s)/aplicação(ões) — não entram em receitas nem despesas.</span>` : '');
  $('#ofxTodos').checked = sel.length === previa.length;
  $('#tabelaOfx').innerHTML = previa.map((t, i) => {
    const tiposPossiveis = t.entrada ? ['receita', 'transferencia'] : ['despesa', 'transferencia'];
    const a = aparencia({ tipo: t.tipo, sentido: t.entrada ? 'entrada' : 'saida' });
    const selContra = t.tipo === 'transferencia' && outras.length
      ? `<select data-contrai="${i}" title="Outra conta envolvida">
          <option value="">${t.entrada ? 'de' : 'para'}: fora do app</option>
          ${outras.map(c => `<option value="${c.id}" ${c.id === t.contraparte ? 'selected' : ''}>${t.entrada ? 'de' : 'para'}: ${esc(c.nome)}</option>`).join('')}
        </select>` : '';
    return `
    <tr class="${t.dup ? 'dup' : ''}">
      <td><input type="checkbox" data-sel="${i}" ${t.sel ? 'checked' : ''}></td>
      <td>${t.data.slice(8)}/${t.data.slice(5, 7)}</td>
      <td>
        <div>${esc(t.descricao)}${t.dup ? ` <small class="aviso">(${t.dup})</small>` : ''}</div>
        <div class="sel-linha">
          <select data-tipoi="${i}">${tiposPossiveis.map(tp => `<option value="${tp}" ${tp === t.tipo ? 'selected' : ''}>${TIPOS[tp]}</option>`).join('')}</select>
          <select data-cati="${i}">${dados.categorias[t.tipo].map(c => `<option ${c === t.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          ${selContra}
        </div>
      </td>
      <td class="dir ${a.cls}">${a.sinal}&nbsp;${fmt(t.valor)}</td>
    </tr>`;
  }).join('');
}

$('#tabelaOfx').addEventListener('change', e => {
  const { sel, cati, tipoi, contrai } = e.target.dataset;
  const origem = $('#ofxConta').value;
  if (sel !== undefined) previa[sel].sel = e.target.checked;
  // mudanças valem para as outras transações do mesmo estabelecimento e mesmo sentido
  const mesmos = t => previa.filter(o => o.entrada === t.entrada && chaveDesc(o.descricao) === chaveDesc(t.descricao));
  if (tipoi !== undefined) {
    mesmos(previa[tipoi]).forEach(o => {
      o.tipo = e.target.value;
      o.categoria = sugerirCategoria(o.descricao, o.tipo, o.entrada);
      o.contraparte = o.tipo === 'transferencia' ? sugerirContra(o.categoria, origem) : '';
    });
  }
  if (cati !== undefined) {
    const t = previa[cati];
    mesmos(t).forEach(o => {
      if (o.tipo !== t.tipo) return;
      o.categoria = e.target.value;
      if (o.tipo === 'transferencia') o.contraparte = sugerirContra(o.categoria, origem) || o.contraparte;
    });
  }
  if (contrai !== undefined) {
    const t = previa[contrai];
    mesmos(t).forEach(o => { if (o.tipo === 'transferencia') o.contraparte = e.target.value; });
  }
  renderPrevia();
});

$('#ofxTodos').addEventListener('change', e => { previa.forEach(t => t.sel = e.target.checked); renderPrevia(); });

$('#ofxCancelar').addEventListener('click', () => { previa = []; $('#previaOfx').classList.add('oculto'); });

$('#ofxImportar').addEventListener('click', () => {
  const sel = previa.filter(t => t.sel);
  if (!sel.length) return avisar('Nenhuma transação selecionada.');
  const origem = $('#ofxConta').value;
  sel.forEach(t => {
    const novo = { id: id(), tipo: t.tipo, data: t.data, valor: t.valor, descricao: t.descricao, categoria: t.categoria, conta: origem };
    if (t.tipo === 'transferencia') {
      novo.sentido = t.entrada ? 'entrada' : 'saida';
      if (t.contraparte && t.contraparte !== origem) novo.contraparte = t.contraparte;
    }
    if (t.fitid) novo.fitid = t.fitid;
    novo.modificado = Date.now();
    dados.transacoes.push(novo);
  });
  // lembra o número da conta do OFX para escolher a conta automaticamente da próxima vez
  if (previaAcct) {
    dados.contas.forEach(c => { if (c.ofxId === previaAcct && c.id !== origem) delete c.ofxId; });
    conta(origem).ofxId = previaAcct;
  }
  mesAtual = sel[sel.length - 1].data.slice(0, 7);
  previa = [];
  $('#previaOfx').classList.add('oculto');
  salvar();
  avisar(`${sel.length} lançamentos importados em "${nomeConta(origem)}".`);
});

// ---------- backup ----------
function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#exportar').addEventListener('click', () =>
  baixar(`financas-backup-${hojeISO()}.json`, JSON.stringify(dados, null, 2), 'application/json'));

// ---------- sincronização manual: enviar e mesclar ----------
async function compartilharBackup() {
  const conteudo = JSON.stringify(dados);
  const base = `financas-backup-${hojeISO()}`;
  // alguns navegadores (ex.: Chrome Android) só compartilham certos tipos de arquivo: tenta .json, depois .txt
  const opcoes = [new File([conteudo], base + '.json', { type: 'application/json' }),
                  new File([conteudo], base + '.txt', { type: 'text/plain' })];
  const arq = navigator.canShare && opcoes.find(f => navigator.canShare({ files: [f] }));
  if (arq) {
    try {
      await navigator.share({ files: [arq], title: 'Backup — Controle Financeiro' });
      localStorage.setItem(CHAVE + '-envio', new Date().toLocaleString('pt-BR'));
      renderUltimoEnvio();
      return;
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  baixar(base + '.json', conteudo, 'application/json');
  avisar('Este navegador não permite compartilhar arquivos diretamente.\nO backup foi baixado: envie-o para o outro aparelho por e-mail, WhatsApp ou Drive.');
}
function renderUltimoEnvio() {
  const quando = localStorage.getItem(CHAVE + '-envio');
  $('#ultimoEnvio').textContent = quando ? `Último backup enviado deste aparelho: ${quando}` : '';
}
$('#compartilhar').addEventListener('click', compartilharBackup);

// junta os dados de outro aparelho com os deste, sem duplicar
function mesclarDados(bruto) {
  const outro = migrar(bruto);
  const res = { novos: 0, atualizados: 0, removidos: 0, contas: 0 };
  const excl = new Set([...dados.excluidos, ...outro.excluidos]);

  // contas: mesma id, mesmo número do OFX ou mesmo nome e tipo = mesma conta
  const mapa = {};
  outro.contas.forEach(c => {
    if (excl.has(c.id)) return;
    const local = conta(c.id) || dados.contas.find(x =>
      (c.ofxId && x.ofxId === c.ofxId) || (normalizar(x.nome) === normalizar(c.nome) && x.tipo === c.tipo));
    if (local) {
      mapa[c.id] = local.id;
      ['ofxId', 'limite', 'diaFechamento', 'diaVencimento'].forEach(k => { if (local[k] == null && c[k] != null) local[k] = c[k]; });
      if (!local.saldoInicial && c.saldoInicial) local.saldoInicial = c.saldoInicial;
    } else {
      dados.contas.push(structuredClone(c));
      mapa[c.id] = c.id;
      res.contas++;
    }
  });

  // lançamentos: mesmo id (fica o mais recente), mesmo FITID do banco ou idênticos = repetido
  const porId = new Map(dados.transacoes.map(t => [t.id, t]));
  const fitids = new Set(dados.transacoes.map(t => t.fitid).filter(Boolean));
  const assin = t => `${t.conta}|${t.tipo}|${t.sentido || ''}|${t.data}|${t.valor}|${normalizar(t.descricao)}`;
  const assinaturas = new Set(dados.transacoes.map(assin));
  outro.transacoes.forEach(o => {
    if (excl.has(o.id)) return;
    const t = structuredClone(o);
    t.conta = mapa[t.conta] || t.conta;
    if (t.contraparte) t.contraparte = mapa[t.contraparte] || t.contraparte;
    const local = porId.get(t.id);
    if (local) {
      if ((t.modificado || 0) > (local.modificado || 0)) {
        Object.keys(local).forEach(k => delete local[k]);
        Object.assign(local, t);
        res.atualizados++;
      }
      return;
    }
    if ((t.fitid && fitids.has(t.fitid)) || assinaturas.has(assin(t))) return;
    dados.transacoes.push(t);
    porId.set(t.id, t);
    if (t.fitid) fitids.add(t.fitid);
    assinaturas.add(assin(t));
    res.novos++;
  });

  // aplica exclusões feitas em qualquer um dos aparelhos
  const antes = dados.transacoes.length;
  dados.transacoes = dados.transacoes.filter(t => !excl.has(t.id));
  res.removidos = antes - dados.transacoes.length;
  dados.contas = dados.contas.filter(c => !excl.has(c.id));

  // categorias, orçamentos e metas: acrescenta o que falta
  Object.keys(outro.categorias).forEach(tp => {
    dados.categorias[tp] ||= [];
    outro.categorias[tp].forEach(c => { if (!dados.categorias[tp].includes(c)) dados.categorias[tp].push(c); });
  });
  Object.entries(outro.orcamentos).forEach(([k, v]) => { if (!(k in dados.orcamentos)) dados.orcamentos[k] = v; });
  outro.metas.forEach(m => { if (!dados.metas.some(x => x.id === m.id)) dados.metas.push(structuredClone(m)); });
  dados.metas = dados.metas.filter(m => !excl.has(m.id));

  dados.excluidos = [...excl];
  dados = migrar(dados);
  return res;
}

$('#mesclar').addEventListener('change', async e => {
  const arq = e.target.files[0];
  e.target.value = '';
  if (!arq) return;
  let outro;
  try {
    outro = JSON.parse(await arq.text());
    if (!Array.isArray(outro.transacoes)) throw new Error('formato');
  } catch { return avisar('Arquivo inválido. Escolha um backup gerado por este app.'); }
  if (!await perguntar(`Mesclar o backup (${outro.transacoes.length} lançamentos) com os dados deste aparelho?\nNada daqui será apagado, exceto o que foi excluído no outro aparelho.`, 'Mesclar')) return;
  const r = mesclarDados(outro);
  salvar();
  avisar(`Mesclagem concluída:\n• ${r.novos} lançamento(s) novo(s)\n• ${r.atualizados} atualizado(s)\n• ${r.removidos} removido(s) (excluídos no outro aparelho)\n• ${r.contas} conta(s) nova(s)`);
});

$('#exportarCsv').addEventListener('click', () => {
  const nomeTipo = t => t.tipo === 'transferencia' ? `transferência (${t.sentido === 'entrada' ? 'entrada' : 'saída'})` : t.tipo;
  const linhas = [['Data', 'Conta', 'Tipo', 'Descrição', 'Categoria', 'Outra conta', 'Valor']]
    .concat([...dados.transacoes].sort((a, b) => a.data.localeCompare(b.data))
      .map(t => [t.data, nomeConta(t.conta), nomeTipo(t), t.descricao, t.categoria,
        t.contraparte ? nomeConta(t.contraparte) : '', t.valor.toFixed(2).replace('.', ',')]));
  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  baixar(`lancamentos-${hojeISO()}.csv`, '﻿' + csv, 'text/csv');
});

$('#importar').addEventListener('change', async e => {
  const arq = e.target.files[0];
  e.target.value = '';
  if (!arq) return;
  try {
    const novo = JSON.parse(await arq.text());
    if (!Array.isArray(novo.transacoes)) throw new Error('formato');
    if (await perguntar('Substituir os dados atuais pelos do backup?', 'Substituir', true)) {
      dados = migrar(novo);
      contaSel = null;
      salvar();
      avisar('Backup importado com sucesso.');
    }
  } catch { avisar('Arquivo inválido.'); }
});

$('#apagarTudo').addEventListener('click', async () => {
  if (await perguntar('Apagar TODOS os dados?\nEsta ação não pode ser desfeita (exporte um backup antes).', 'Apagar tudo', true)) {
    dados = migrar({});
    contaSel = null;
    selecionados.clear();
    salvar();
  }
});

mostrarCamposCartao();
renderUltimoEnvio();
render();

// Instalação como app (PWA) e funcionamento offline
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Pede ao navegador para não apagar os dados automaticamente
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
