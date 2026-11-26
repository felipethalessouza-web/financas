// ===== Controle Financeiro — dados salvos no localStorage do navegador =====
const CHAVE = 'controle-financeiro-v1';

const PADRAO = {
  transacoes: [],
  categorias: {
    despesa: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Contas', 'Outros'],
    receita: ['Salário', 'Freelance', 'Investimentos', 'Outros'],
  },
  orcamentos: {},
  metas: [],
};

let dados = carregar();
let mesAtual = hojeISO().slice(0, 7);

// ---------- utilidades ----------
function carregar() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE));
    if (salvo) return { ...structuredClone(PADRAO), ...salvo };
  } catch (e) { /* ignora dados corrompidos */ }
  return structuredClone(PADRAO);
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
function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
function gastosPorCategoria(mes) {
  const r = {};
  dados.transacoes.filter(t => t.tipo === 'despesa' && t.data.startsWith(mes))
    .forEach(t => { r[t.categoria] = (r[t.categoria] || 0) + t.valor; });
  return r;
}

// ---------- navegação ----------
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
  renderPainel();
  renderLancamentos();
  renderOrcamento();
  renderMetas();
  atualizarSelectCategorias();
}

function renderPainel() {
  const rec = somaMes(mesAtual, 'receita');
  const desp = somaMes(mesAtual, 'despesa');
  const saldo = rec - desp;
  const fimMes = mesAtual + '-31';
  const total = dados.transacoes.filter(t => t.data <= fimMes)
    .reduce((s, t) => s + (t.tipo === 'receita' ? t.valor : -t.valor), 0);
  $('#cReceitas').textContent = fmt(rec);
  $('#cDespesas').textContent = fmt(desp);
  $('#cSaldoMes').textContent = fmt(saldo);
  $('#cSaldoMes').className = saldo >= 0 ? 'pos' : 'neg';
  $('#cSaldoTotal').textContent = fmt(total);
  $('#cSaldoTotal').className = total >= 0 ? 'pos' : 'neg';

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

function renderLancamentos() {
  const f = $('#filtro').value.trim().toLowerCase();
  const lista = dados.transacoes
    .filter(t => t.data.startsWith(mesAtual))
    .filter(t => !f || (t.descricao + ' ' + t.categoria).toLowerCase().includes(f))
    .sort((a, b) => b.data.localeCompare(a.data));
  $('#tabelaLanc').innerHTML = lista.map(t => `
    <tr>
      <td>${t.data.split('-').reverse().join('/')}</td>
      <td>${esc(t.descricao)}</td>
      <td>${esc(t.categoria)}</td>
      <td class="dir ${t.tipo === 'receita' ? 'pos' : 'neg'}">${t.tipo === 'receita' ? '+' : '−'} ${fmt(t.valor)}</td>
      <td class="dir">
        <button class="mini" title="Editar" data-editar="${t.id}">✎</button>
        <button class="mini" title="Excluir" data-excluir="${t.id}">🗑</button>
      </td>
    </tr>`).join('');
  $('#semLanc').style.display = lista.length ? 'none' : 'block';
}

function atualizarSelectCategorias() {
  const sel = $('#lCat'), atual = sel.value;
  sel.innerHTML = dados.categorias[$('#lTipo').value].map(c => `<option>${esc(c)}</option>`).join('');
  if ([...sel.options].some(o => o.value === atual)) sel.value = atual;
}

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

  ['despesa', 'receita'].forEach(tipo => {
    $(tipo === 'despesa' ? '#catsDespesa' : '#catsReceita').innerHTML = dados.categorias[tipo]
      .map((c, i) => `<li>${esc(c)}<button title="Remover" data-remcat="${tipo}:${i}">×</button></li>`).join('');
  });
}

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

// ---------- lançamentos ----------
$('#lTipo').addEventListener('change', atualizarSelectCategorias);
$('#filtro').addEventListener('input', renderLancamentos);
$('#lData').value = hojeISO();

$('#formLanc').addEventListener('submit', e => {
  e.preventDefault();
  const base = {
    tipo: $('#lTipo').value,
    data: $('#lData').value,
    valor: Math.round(parseFloat($('#lValor').value) * 100) / 100,
    descricao: $('#lDesc').value.trim(),
    categoria: $('#lCat').value,
  };
  const editId = $('#lId').value;
  if (editId) {
    Object.assign(dados.transacoes.find(t => t.id === editId), base);
  } else {
    const n = Math.max(1, parseInt($('#lRepetir').value) || 1);
    const [a, m, d] = base.data.split('-').map(Number);
    for (let i = 0; i < n; i++) {
      const mes = addMeses(`${a}-${String(m).padStart(2, '0')}`, i);
      const [aa, mm] = mes.split('-').map(Number);
      const dia = Math.min(d, new Date(aa, mm, 0).getDate());
      dados.transacoes.push({ ...base, id: id(), data: `${mes}-${String(dia).padStart(2, '0')}`,
        descricao: n > 1 ? `${base.descricao} (${i + 1}/${n})` : base.descricao });
    }
  }
  limparForm();
  salvar();
});

function limparForm() {
  const tipo = $('#lTipo').value;
  $('#formLanc').reset();
  $('#lTipo').value = tipo;
  $('#lId').value = '';
  $('#lData').value = mesAtual === hojeISO().slice(0, 7) ? hojeISO() : mesAtual + '-01';
  $('#tituloForm').textContent = 'Novo lançamento';
  $('#cancelarEdicao').classList.add('oculto');
  $('#lRepetir').disabled = false;
  atualizarSelectCategorias();
}
$('#cancelarEdicao').addEventListener('click', limparForm);

$('#tabelaLanc').addEventListener('click', e => {
  const ed = e.target.dataset.editar, ex = e.target.dataset.excluir;
  if (ex && confirm('Excluir este lançamento?')) {
    dados.transacoes = dados.transacoes.filter(t => t.id !== ex);
    salvar();
  }
  if (ed) {
    const t = dados.transacoes.find(t => t.id === ed);
    $('#lId').value = t.id;
    $('#lTipo').value = t.tipo;
    atualizarSelectCategorias();
    if (![...$('#lCat').options].some(o => o.value === t.categoria))
      $('#lCat').insertAdjacentHTML('beforeend', `<option>${esc(t.categoria)}</option>`);
    $('#lCat').value = t.categoria;
    $('#lData').value = t.data;
    $('#lValor').value = t.valor;
    $('#lDesc').value = t.descricao;
    $('#lRepetir').value = 1;
    $('#lRepetir').disabled = true;
    $('#tituloForm').textContent = 'Editar lançamento';
    $('#cancelarEdicao').classList.remove('oculto');
    $('#formLanc').scrollIntoView({ behavior: 'smooth' });
  }
});

// ---------- orçamento e categorias ----------
$('#tabelaOrc').addEventListener('change', e => {
  if (!e.target.dataset.cat) return;
  const v = parseFloat(e.target.value);
  if (v > 0) dados.orcamentos[e.target.dataset.cat] = Math.round(v * 100) / 100;
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

$('#orcamento').addEventListener('click', e => {
  if (!e.target.dataset.remcat) return;
  const [tipo, i] = e.target.dataset.remcat.split(':');
  const nome = dados.categorias[tipo][i];
  if (confirm(`Remover a categoria "${nome}"? Os lançamentos existentes são mantidos.`)) {
    dados.categorias[tipo].splice(i, 1);
    if (tipo === 'despesa') delete dados.orcamentos[nome];
    salvar();
  }
});

// ---------- metas ----------
$('#formMeta').addEventListener('submit', e => {
  e.preventDefault();
  dados.metas.push({ id: id(), nome: $('#mNome').value.trim(), alvo: parseFloat($('#mAlvo').value), guardado: 0, prazo: $('#mPrazo').value });
  e.target.reset();
  salvar();
});

$('#listaMetas').addEventListener('click', e => {
  const { depmeta, retmeta, delmeta } = e.target.dataset;
  const mid = depmeta || retmeta || delmeta;
  if (!mid) return;
  const meta = dados.metas.find(m => m.id === mid);
  if (delmeta) {
    if (confirm(`Excluir a meta "${meta.nome}"?`)) { dados.metas = dados.metas.filter(m => m.id !== mid); salvar(); }
    return;
  }
  const v = parseFloat(document.querySelector(`[data-valmeta="${mid}"]`).value);
  if (!(v > 0)) return alert('Informe um valor positivo.');
  meta.guardado = Math.max(0, Math.round((meta.guardado + (depmeta ? v : -v)) * 100) / 100);
  salvar();
});

// ---------- backup ----------
function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}
$('#exportar').addEventListener('click', () =>
  baixar(`financas-backup-${hojeISO()}.json`, JSON.stringify(dados, null, 2), 'application/json'));

$('#exportarCsv').addEventListener('click', () => {
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor']]
    .concat([...dados.transacoes].sort((a, b) => a.data.localeCompare(b.data))
      .map(t => [t.data, t.tipo, t.descricao, t.categoria, t.valor.toFixed(2).replace('.', ',')]));
  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  baixar(`lancamentos-${hojeISO()}.csv`, '﻿' + csv, 'text/csv');
});

$('#importar').addEventListener('change', async e => {
  const arq = e.target.files[0];
  if (!arq) return;
  try {
    const novo = JSON.parse(await arq.text());
    if (!Array.isArray(novo.transacoes)) throw new Error('formato');
    if (confirm('Substituir os dados atuais pelos do backup?')) {
      dados = { ...structuredClone(PADRAO), ...novo };
      salvar();
      alert('Backup importado com sucesso.');
    }
  } catch { alert('Arquivo inválido.'); }
  e.target.value = '';
});

$('#apagarTudo').addEventListener('click', () => {
  if (confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita (exporte um backup antes).')) {
    dados = structuredClone(PADRAO);
    salvar();
  }
});

render();

// Instalação como app (PWA) e funcionamento offline
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Pede ao navegador para não apagar os dados automaticamente
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
