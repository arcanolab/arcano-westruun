// Westruun — Mapa (Arcano Lab) — Foundry VTT v14
// Construtor: pastas, diários por ala e por local, NPCs (ficha SRD + retrato + token + onde aparecem), cenas internas, cena principal
// (mapa cru 16k, título, nomes, pins, luzes de rua/marcos/casas, regiões das alas e de clima, sons), playlists por momento.
// PT = versão da campanha (tudo da mesa marcado com a flag "campanha" e removível com api.removerCampanha()); EN = versão pública.
// Painel do mestre: mostrar/esconder pin, diário e nome de cada local; luzes das casas; raios; remover campanha.
const MOD = "arcano-westruun";
const ROOT = `modules/${MOD}`;
const NIVEIS = CONST.DOCUMENT_OWNERSHIP_LEVELS;
const F = (o = {}) => ({ [MOD]: o });

/* ---------------------------------------------------------------- configurações ---------------------------------------------------------------- */
Hooks.once("init", () => {
  game.settings.register(MOD, "idioma", { name: "ARCWES.Idioma", hint: "ARCWES.IdiomaHint", scope: "client", config: true, type: String, default: "auto", requiresReload: true,
    choices: { auto: "ARCWES.IdiomaAuto", pt: "Português", en: "English" } });
  game.settings.register(MOD, "raio", { name: "ARCWES.Raio", hint: "ARCWES.RaioHint", scope: "world", config: true, type: Boolean, default: true, onChange: () => Raio.reiniciar() });
  game.settings.register(MOD, "raioMin", { name: "ARCWES.RaioMin", scope: "world", config: true, type: Number, default: 18 });
  game.settings.register(MOD, "raioMax", { name: "ARCWES.RaioMax", scope: "world", config: true, type: Number, default: 45 });
  game.settings.register(MOD, "diariosClaros", { name: "ARCWES.Claros", hint: "ARCWES.ClarosHint", scope: "world", config: true, type: Boolean, default: true });
  game.settings.register(MOD, "ciclo", { name: "ARCWES.Ciclo", hint: "ARCWES.CicloHint", scope: "world", config: true, type: Boolean, default: true });
  CONFIG.fontDefinitions["IM Fell English"] = { editor: true, fonts: [
    { urls: [`${ROOT}/assets/fontes/IMFeENrm28P.ttf`] }, { urls: [`${ROOT}/assets/fontes/IMFeENit28P.ttf`], style: "italic" }] };
  CONFIG.fontDefinitions["IM Fell English SC"] = { editor: true, fonts: [{ urls: [`${ROOT}/assets/fontes/IMFeENsc28P.ttf`] }] };
  CONFIG.fontDefinitions["UnifrakturMaguntia"] = { editor: true, fonts: [{ urls: [`${ROOT}/assets/fontes/UnifrakturMaguntia-Book.ttf`] }] };
});
/* Idioma das telas do módulo (painel, configurações, botões, avisos): segue o Foundry ou fica fixo em português ou inglês, por escolha de cada usuário.
   Com idioma fixo, os textos do arquivo escolhido entram por cima dos que o Foundry carregou. */
Hooks.once("i18nInit", async () => {
  let v = "auto"; try { v = game.settings.get(MOD, "idioma"); } catch (e) { /* configuração ainda não registrada */ }
  if (v !== "pt" && v !== "en") return;
  try {
    const r = await fetch(`${ROOT}/lang/${v === "pt" ? "pt-BR" : "en"}.json`); if (!r.ok) return;
    foundry.utils.mergeObject(game.i18n.translations, foundry.utils.expandObject(await r.json()));
  } catch (e) { console.warn("Westruun: não consegui carregar o idioma escolhido.", e); }
});
/* assinatura do Arcano Lab no fim das configurações do módulo, como nos outros módulos do Lab */
Hooks.on("renderSettingsConfig", (app, el) => {
  const raiz = el instanceof HTMLElement ? el : el?.[0];
  const campo = raiz?.querySelector(`[name="${MOD}.idioma"]`); if (!campo) return;
  const caixa = campo.closest(".tab[data-tab]") ?? campo.closest("section") ?? campo.closest(".form-group")?.parentElement;
  if (!caixa || caixa.querySelector(".aw-assinatura")) return;
  const div = document.createElement("div"); div.className = `${MOD}-painel aw-cfg-assinatura`; div.innerHTML = assinatura(); caixa.append(div);
});
Hooks.once("ready", () => {
  game.modules.get(MOD).api = { construir, Painel, exportarAventura, removerCampanha, Raio, cenaWestruun, criarClima, criarComportamentosAlas, lerDados, alternarLuzesCasas, atualizar,
    instalar, reparar, organizarDiarios, garantirClima, consertarRotulos, garantirCenas, garantirNuvens, garantirCreditos, consertarTokens, cenaDaImagem, curarCaminhos, temWestruun };
  Raio.reiniciar();
});

/* O compêndio de Aventura é só a porta de entrada: quem monta a cidade é sempre data/westruun_<lang>.json (a fonte única, sempre atual).
   Assim a importação nunca sai com retratos, imagens ou páginas de uma exportação antiga. */
Hooks.on("preImportAdventure", adv => {
  const m = /^arcano-westruun\.westruun-(pt|en)$/.exec(adv?.pack ?? ""); if (!m) return;
  instalar({ lang: m[1] }).catch(e => { console.error(e); ui.notifications.error(`Westruun: ${e.message ?? e}`); });
  return false;
});
let noGrupoArcano = false;
Hooks.once("setup", () => {
  // com o Arcano Lab Hub ativo, o botão do painel vai para o grupo "Arcano Lab" da barra
  const hub = game.modules.get("arcano-hub");
  if (!hub?.active || typeof hub.api?.registerTool !== "function") return;
  noGrupoArcano = true;
  noGrupoArcano = hub.api.registerTool({ name: MOD, title: () => game.i18n.localize("ARCWES.Painel"), icon: "modules/arcano-hub/assets/tools/map.svg",
    visible: () => game.user.isGM, onClick: () => Painel.abrir() });
});
Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM || noGrupoArcano) return;
  const notas = controls.notes ?? controls.find?.(c => c.name === "notes"); if (!notas) return;
  const tool = { name: MOD, title: game.i18n.localize("ARCWES.Painel"), icon: "fa-solid fa-map-location-dot", button: true, order: 99, visible: true,
    onChange: () => Painel.abrir(), onClick: () => Painel.abrir() };
  if (Array.isArray(notas.tools)) notas.tools.push(tool); else notas.tools[MOD] = tool;
});

/* diários em tema claro: só a janela do diário muda (classes de tema do próprio Foundry); a configuração de tema do cliente não é tocada */
Hooks.on("renderJournalEntrySheet", (app, el) => {
  const e = el instanceof HTMLElement ? el : app.element; if (!e?.classList) return;
  e.classList.add("aw-diario");
  if (game.settings.get(MOD, "diariosClaros")) { e.classList.remove("theme-dark"); e.classList.add("themed", "theme-light"); }
  // cada ilustração de local é também uma cena: o mestre ganha, em cima da imagem, os botões de ativar e de ver a cena
  const entry = app.document ?? app.entry ?? app.object;
  if (!game.user.isGM || !entry?.pages) return;
  porBotoesDeCena(e, entry);
  if (!e._awObs) { e._awObs = new MutationObserver(() => porBotoesDeCena(e, entry)); e._awObs.observe(e, { childList: true, subtree: true }); }
});
function porBotoesDeCena(raiz, entry) {
  for (const art of raiz.querySelectorAll(".journal-entry-page.image")) {
    const pg = entry.pages.get(art.dataset.pageId ?? art.closest("[data-page-id]")?.dataset.pageId);
    if (!pg?.src || art.querySelector(":scope .aw-cena")) continue;
    const cena = cenaDaImagem(pg.src); if (!cena && !entry.getFlag(MOD, "local")) continue;
    const bar = document.createElement("div"); bar.className = "aw-cena";
    bar.innerHTML = cena
      ? `<button type="button" data-aw-cena="ativar" title="${esc(L("CenaAtivarDica"))}"><i class="fa-solid fa-bullseye"></i> ${L("CenaAtivar")}</button>
         <button type="button" data-aw-cena="ver" title="${esc(L("CenaVerDica"))}"><i class="fa-solid fa-eye"></i> ${L("CenaVer")}</button>`
      : `<button type="button" data-aw-cena="criar"><i class="fa-solid fa-plus"></i> ${L("CenaCriar")}</button>`;
    bar.querySelectorAll("button").forEach(b => b.addEventListener("click", async ev => {
      ev.preventDefault(); ev.stopPropagation();
      try {
        const acao = b.dataset.awCena; let c = cenaDaImagem(pg.src);
        if (acao === "criar") { await garantirCenas(); bar.remove(); return porBotoesDeCena(raiz, entry); }
        if (!c) return ui.notifications.warn(L("CenaSumiu"));
        if (acao === "ativar") await c.activate(); else await c.view();
      } catch (err) { console.error(err); ui.notifications.error(`Westruun: ${err.message ?? err}`); }
    }));
    const cab = art.querySelector(":scope > header, :scope > .journal-page-header");
    if (cab) cab.after(bar); else art.prepend(bar);
  }
}

/* ---------------------------------------------------------------- utilidades ---------------------------------------------------------------- */
function cenaWestruun() { return canvas.scene?.getFlag(MOD, "mapa") ? canvas.scene : (game.scenes.find(s => s.getFlag(MOD, "mapa")) ?? null); }
/* nomes que vêm dos dados (alas, portões, título) e aparecem nas telas do módulo: saem no idioma das telas, seja qual for o idioma em que o mundo foi montado */
const FIXOS = { "ala da lama": "lama", "mud ward": "lama", "ala negra": "negra", "black ward": "negra", "ala dos templos": "templos", "temple ward": "templos",
  "ala do mercado": "mercado", "market ward": "mercado", "ala residencial": "residencial", "residential ward": "residencial", "ala opalina": "opalina", "opal ward": "opalina",
  "ala escolástica": "escolastica", "scholar ward": "escolastica", "subpassagem": "subpassagem", "the underwalk": "subpassagem", "arredores e outros": "arredores", "outskirts and others": "arredores",
  "via do mercado": "viaMercado", "market's way": "viaMercado", "via silvercut": "viaSilvercut", "silvercut's way": "viaSilvercut", "portão de parchwood": "parchwood", "parchwood gate": "parchwood",
  "portão negro": "portaoNegro", "the black gate": "portaoNegro", "portão da fortaleza": "fortaleza", "keep's gate": "fortaleza", "portão de gat": "gat", "gat's gate": "gat", "título": "titulo", "title": "titulo" };
function nomeTela(nome) { const k = FIXOS[String(nome ?? "").replace(/\u2019/g, "'").trim().toLowerCase()]; return k ? game.i18n.localize(`ARCWES.P.N_${k}`) : String(nome ?? ""); }
function tipoTela(tipo) { const k = `ARCWES.P.Tipo_${tipo}`, t = game.i18n.localize(k); return t === k ? String(tipo ?? "") : t; }
const L = (k, d) => d ? game.i18n.format(`ARCWES.P.${k}`, d) : game.i18n.localize(`ARCWES.P.${k}`);
function esc(t) { return foundry.utils.escapeHTML(String(t ?? "")); }
async function lerDados(lang) { const r = await fetch(`${ROOT}/data/westruun_${lang}.json`); if (!r.ok) throw new Error(L("SemDados", { arq: `data/westruun_${lang}.json` })); return r.json(); }
const link = (doc, nome) => doc ? `@UUID[${doc.uuid}]{${esc(nome ?? doc.name)}}` : esc(nome);
const pagTexto = (name, html, sort, { gm = false, camp = false } = {}) => ({ name, type: "text", text: { content: html, format: 1 }, sort,
  ownership: gm ? { default: NIVEIS.NONE } : { default: -1 }, flags: camp ? F({ campanha: true }) : {} });
const paginasProntas = ps => ps.map((p, i) => Object.assign(p.tipo === "image" ? pagImg(p.nome, p.src, (i + 1) * 100, !!p.gm, p.leg ?? "")
  : pagTexto(p.nome, p.html, (i + 1) * 100, { gm: !!p.gm, camp: !!p.camp }), { _mudou: p.mudou !== false }));
const pagImg = (name, src, sort, gm = false, leg = "") => ({ name, type: "image", src, sort, image: { caption: leg }, ...(gm ? { ownership: { default: NIVEIS.NONE } } : {}) });
const semMarca = p => { const o = { ...p }; delete o._mudou; return o; };
const dadosLuz = (z, k) => ({ x: Math.round(z.x * k), y: Math.round(z.y * k), walls: false, vision: false,
  config: { dim: z.dim, bright: z.bright, color: z.cor, alpha: z.alpha ?? 0.45, coloration: 1, luminosity: 0.5,
    animation: z.anim ? { type: z.anim, speed: z.vel ?? 2, intensity: z.int ?? 3 } : { type: null }, darkness: { min: z.escMin ?? 0.4, max: 1 } },
  flags: F({ luz: z.tipo }) });
/* marcadores dos textos -> links. {{mundo:Scene|JournalEntry|Actor:Nome}} liga a algo que outra macro criou no mundo (mapas de batalha), se existir */
function fazResolver(X) {
  const COL = { Scene: () => game.scenes, JournalEntry: () => game.journal, Actor: () => game.actors };
  return html => html.replace(/\{\{(npc|ficha|local|cenas|mundo):([^}]+)\}\}/g, (_, k, id) => {
    if (k === "npc") return link(X.npcJ[id], X.nomeNpc[id]);
    if (k === "ficha") return X.atores[id] ? link(X.atores[id], X.pt ? "Abrir ficha" : "Open sheet") + (X.baseSRD[id] ? ` <span class="aw-base">(${X.pt ? "base" : "based on"}: ${esc(X.baseSRD[id])}, SRD)</span>` : "") : "";
    if (k === "local") return X.diarios[id] ? link(X.diarios[id], X.nomeLocal[id]) : esc(X.nomeLocal[id] ?? id);
    if (k === "mundo") { const i = id.indexOf(":"), nome = id.slice(i + 1), doc = COL[id.slice(0, i)]?.().getName(nome);
      return doc ? link(doc) : `<em>${esc(nome)}</em> (${X.pt ? "não está neste mundo" : "not in this world"})`; }
    return (X.cenasLocal[id] ?? []).map(c => link(c)).join(" · ");
  });
}

/* fichas-base do SRD (compêndio do dnd5e): procura o primeiro nome da lista que existir */
let _idxSRD = null;
async function fichaSRD(nomes) {
  if (!_idxSRD) {
    _idxSRD = [];
    for (const p of game.packs.filter(p => p.documentName === "Actor" && p.metadata.packageName === "dnd5e")) {
      const idx = await p.getIndex(); for (const e of idx) _idxSRD.push({ pack: p, id: e._id, name: e.name });
    }
  }
  for (const n of nomes) {
    const hit = _idxSRD.find(e => e.name.toLowerCase() === n.toLowerCase());
    if (hit) { const doc = await hit.pack.getDocument(hit.id); const o = doc.toObject(); o._base = hit.name; return o; }
  }
  return null;
}

/* ---------------------------------------------------------------- construtor ---------------------------------------------------------------- */
async function construir({ lang = "pt", resolucao = "16k" } = {}) {
  if (!game.user.isGM) return ui.notifications.warn(L("SoMestre"));
  const D = await lerDados(lang), T = D.textos, pt = lang === "pt";
  ui.notifications.info(L("Construindo", { lang: lang.toUpperCase() }));
  const pasta = (name, type, parent = null, color = null, flags = {}) => Folder.create({ name, type, folder: parent?.id ?? null, color, sorting: "a", flags });
  const AZUL = "#1e3a6e", CAMPC = "#7a1f1f";

  // ---- pastas
  const fJ = await pasta(T.pasta, "JournalEntry", null, AZUL, F({ raiz: true }));
  const fCidade = await pasta(T.cidade, "JournalEntry", fJ), fAlas = await pasta(T.alas, "JournalEntry", fJ);
  const fNpcJ = await pasta(T.npcs, "JournalEntry", fJ), fHist = await pasta(T.hist, "JournalEntry", fJ);
  const fAla = {}; for (const a of D.alas) fAla[a.id] = await pasta(a.nome, "JournalEntry", fAlas);
  const fOutros = await pasta(pt ? "Arredores e outros" : "Outskirts and others", "JournalEntry", fAlas);
  const fA = await pasta(T.pasta, "Actor", null, AZUL, F({ raiz: true }));
  const fS = await pasta(T.pasta, "Scene", null, AZUL, F({ raiz: true })), fInt = await pasta(T.interiores, "Scene", fS);
  const fIntAla = {};
  const fP = await pasta(T.pasta, "Playlist", null, AZUL, F({ raiz: true }));

  // ---- NPCs: atores com ficha SRD
  const atores = {}, baseSRD = {};
  for (const n of D.npcs) {
    let o = await fichaSRD(n.base);
    if (!o) o = { type: "npc", system: {} };
    const base = o._base; delete o._base; delete o._id; delete o.folder; delete o._stats; delete o.ownership; delete o.sort;
    o.name = n.nome; o.img = n.img; o.folder = fA.id;
    o.prototypeToken = foundry.utils.mergeObject(o.prototypeToken ?? {}, { name: n.nome, actorLink: true, displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
      disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL, texture: { src: n.tok || n.img }, ring: { enabled: !!n.ring, subject: { texture: n.img } } });
    baseSRD[n.id] = base; foundry.utils.setProperty(o, "system.details.biography.value", n.ficha);
    if (n.golem) { foundry.utils.setProperty(o, "system.abilities.int.value", 18); foundry.utils.setProperty(o, "system.abilities.cha.value", 18);
      foundry.utils.setProperty(o, "system.attributes.movement.walk", 60); }
    o.flags = foundry.utils.mergeObject(o.flags ?? {}, F({ npc: n.id }));
    atores[n.id] = await Actor.create(o);
  }

  // ---- cenas dos locais: cada ilustração vira uma cena pronta (fundo, sem grade, luz geral, ligada ao diário)
  const cenasLocal = {}, IMG = await lerImagens();
  for (const c of listaCenas(D, IMG)) {
    const s = await Scene.create(dadosCena(c, (await pastaCenas(D, c.ala)).id));
    if (c.local) (cenasLocal[c.local] ??= []).push(s);
  }
  if (D.caverna) { const d = foundry.utils.deepClone(D.caverna.dados); fIntAla.subpassagem ??= await pasta(D.alas.find(a => a.id === "subpassagem")?.nome ?? "Underwalk", "Scene", fInt);
    d.folder = fIntAla.subpassagem.id; d.flags = F({ interna: D.caverna.local }); (cenasLocal[D.caverna.local] ??= []).push(await Scene.create(d)); }

  // ---- diários de NPC
  const npcJ = {};
  for (const n of D.npcs) {
    const pages = [pagTexto(T.ficha, n.ficha, 0)]; if (!n.faltaImg) pages.push(pagImg(T.retrato, n.img, 100));
    npcJ[n.id] = await JournalEntry.create({ name: n.nome, folder: fNpcJ.id, pages, ownership: { default: NIVEIS.NONE }, flags: F({ npc: n.id }) });
  }
  for (const h of D.historicos) await JournalEntry.create({ name: h.nome, folder: fHist.id, pages: [pagTexto(h.nome, h.desc, 0)], ownership: { default: NIVEIS.NONE }, flags: F({ hist: true }) });

  // ---- diários dos locais
  const diarios = {};
  for (const l of D.locais) {
    const pages = paginasProntas(l.paginas.filter(p => pt || !p.camp)).map(semMarca);
    const nivel = l.descoberto ? NIVEIS.OBSERVER : NIVEIS.NONE;
    const pastaL = l.campanhaSo ? null : (fAla[l.ala] ?? fOutros);
    diarios[l.id] = await JournalEntry.create({ name: l.nome, folder: (pastaL ?? fOutros).id, pages, ownership: { default: nivel },
      flags: F({ local: l.id, ala: l.ala, descoberto: !!l.descoberto, secreto: !!l.secreto, campanha: !!l.campanhaSo }) });
    for (const c of cenasLocal[l.id] ?? []) await c.update({ journal: diarios[l.id].id });
  }
  // ---- diário de cada ala
  for (const a of D.alasDiario) {
    const ls = D.locais.filter(l => l.ala === a.id && !l.campanhaSo).sort((x, y) => x.nome.localeCompare(y.nome));
    const pages = paginasProntas(a.paginas).map(semMarca);
    await JournalEntry.create({ name: `${a.nome} — ${pt ? "visão geral" : "overview"}`, folder: (fAla[a.id] ?? fAlas).id, pages, ownership: { default: NIVEIS.OBSERVER }, flags: F({ ala: a.id }) });
  }
  // ---- marcadores {{npc:}} {{ficha:}} {{local:}} {{cenas:}} viram links (diários e biografias)
  const nomeNpc = Object.fromEntries(D.npcs.map(n => [n.id, n.nome])), nomeLocal = Object.fromEntries(D.locais.map(l => [l.id, l.nome]));
  const resolver = fazResolver({ npcJ, atores, diarios, cenasLocal, baseSRD, nomeNpc, nomeLocal, pt });
  for (const j of game.journal.filter(j => j.getFlag(MOD, "local") || j.getFlag(MOD, "npc") || j.getFlag(MOD, "ala"))) {
    const upd = j.pages.filter(p => p.text?.content?.includes("{{")).map(p => ({ _id: p.id, "text.content": resolver(p.text.content) }));
    if (upd.length) await j.updateEmbeddedDocuments("JournalEntryPage", upd);
  }
  for (const n of D.npcs) await atores[n.id].update({ "system.details.biography.value": resolver(n.ficha) + `<p>${link(npcJ[n.id])}</p>` });
  // ---- diários gerais
  for (const g of D.diariosGerais) {
    const pages = g.paginas.map((p, i) => p.tipo === "image" ? pagImg(p.nome, p.src, i * 100) : pagTexto(p.nome, p.html, i * 100));
    await JournalEntry.create({ name: g.nome, folder: fCidade.id, pages, ownership: { default: g.jogadores ? NIVEIS.OBSERVER : NIVEIS.NONE }, flags: F({ geral: g.id }) });
  }
  await garantirCreditos({ lang, pasta: fJ });
  await garantirCenas({ lang, D });                                 // liga cada cena à página do diário que mostra a mesma imagem

  // ---- cena principal
  const C = D.cena, mapa = resolucao === "8k" ? C.mapa8k : C.mapa, k = resolucao === "8k" ? 0.5 : 1;
  const notes = D.locais.filter(l => diarios[l.id] && l.x != null).map(l => ({ entryId: diarios[l.id].id, x: Math.round(l.x * k), y: Math.round(l.y * k),
    iconSize: Math.round(C.iconePin * k), global: true, texture: { src: l.icone, tint: l.secreto ? "#b48cff" : "#f0d27a" }, text: "", flags: F({ local: l.id, campanha: !!l.campanhaSo }) }));
  // no v14 o x,y do Tile é o ponto de âncora da textura (padrão: o CENTRO). Os rótulos são medidos pelo canto, então a âncora vai para 0,0
  // (sem isso o título e os nomes sobem e vão para a esquerda meia largura, e o título sai cortado pela borda de cima do mapa)
  const tiles = D.rotulos.map((r, i) => ({ x: Math.round(r.x * k), y: Math.round(r.y * k), width: Math.round(r.w * k), height: Math.round(r.h * k), texture: { src: r.src, anchorX: 0, anchorY: 0 },
    hidden: !r.visivel, sort: 1000 + i, elevation: 0, locked: true, flags: F({ rotulo: r.tipo, id: r.id }) }));
  const lights = C.luzes.map(z => dadosLuz(z, k));
  const regions = C.alas.map(a => ({ name: a.nome, color: a.cor, visibility: 0, shapes: [{ type: "polygon", points: a.pontos.map(v => Math.round(v * k)) }], flags: F({ ala: a.id }) }));
  const sounds = (C.sons ?? []).map(s => ({ x: Math.round(s.x * k), y: Math.round(s.y * k), radius: s.raio, path: s.src, volume: s.vol ?? 0.5, walls: false, easing: true,
    darkness: s.noite === true ? { min: 0.5, max: 1 } : (s.noite === false ? { min: 0, max: 0.5 } : { min: 0, max: 1 }), flags: F({ som: s.id }) }));
  const cena = await Scene.create({
    name: C.nome, folder: fS.id, navigation: true, navName: C.nome, width: Math.round(C.largura * k), height: Math.round(C.altura * k), padding: 0,
    levels: [{ name: C.nome, background: { src: mapa, color: "#1b1712" }, elevation: { bottom: 0, top: 20 } }],
    grid: { type: CONST.GRID_TYPES.GRIDLESS, size: Math.round(60 * k), distance: 10, units: "m", alpha: 0 },
    tokenVision: false, fog: { mode: CONST.FOG_EXPLORATION_MODES.DISABLED },
    environment: { darknessLevel: 0, globalLight: { enabled: true, darkness: { min: 0, max: 0.6 } } },
    notes, tiles, lights, regions, sounds, journal: game.journal.find(j => j.getFlag(MOD, "geral") === "cidade")?.id ?? null,
    flags: F({ mapa: true, lang, rotulosOk: true, trovao: C.trovao ?? null, trovoes: C.trovoes ?? [], geracao: D.geracao ?? null, raio: { x: Math.round(C.torre.x * k), y: Math.round(C.torre.y * k), escala: k } })
  });
  await criarComportamentosAlas(cena, C.alas);
  await garantirClima(cena, C, k);
  await garantirNuvens(cena);

  // ---- playlists (por momento de uso)
  let primeira = null;
  for (const p of D.playlists) {
    const pl = await Playlist.create({ name: p.nome, folder: fP.id, mode: CONST.PLAYLIST_MODES.SEQUENTIAL, fade: 2000,
      sounds: p.faixas.map(f => ({ name: f.nome, path: f.src, repeat: false, volume: 0.5, description: f.desc })) });
    primeira ??= pl;
  }
  if (primeira) await cena.update({ playlist: primeira.id });

  // ---- campanha (só PT): atores e diários da mesa, tudo marcado e numa pasta própria
  if (D.campanha) {
    const fCJ = await pasta(T.camp, "JournalEntry", null, CAMPC, F({ campanha: true })), fCA = await pasta(T.camp, "Actor", null, CAMPC, F({ campanha: true }));
    const sub = {};
    for (const a of D.campanha.atores) {
      const nomeP = a.flags?.[MOD]?.pasta ?? "Westruun"; sub[nomeP] ??= await pasta(nomeP, "Actor", fCA, null, F({ campanha: true }));
      const o = foundry.utils.deepClone(a); o.folder = sub[nomeP].id; await Actor.create(o);
    }
    for (const j of D.campanha.diarios) await JournalEntry.create({ name: j.name, folder: fCJ.id, pages: j.pages, ownership: { default: NIVEIS.NONE }, flags: F({ campanha: true }) });
    for (const l of D.locais.filter(x => x.campanhaSo)) await diarios[l.id].update({ folder: fCJ.id });
  }
  await cena.view();
  ui.notifications.info(L("Pronto", { locais: D.locais.length, npcs: D.npcs.length, nomes: tiles.length, luzes: lights.length, playlists: D.playlists.length }));
  return cena;
}

/* nome da ala na tela quando um token entra nela */
async function criarComportamentosAlas(cena, alas) {
  for (const reg of cena.regions) {
    const a = alas.find(x => x.id === reg.getFlag(MOD, "ala")); if (!a) continue;
    if (reg.behaviors.size) await reg.deleteEmbeddedDocuments("RegionBehavior", reg.behaviors.map(b => b.id));
    await reg.createEmbeddedDocuments("RegionBehavior", [{ name: a.nome, type: "displayScrollingText",
      system: { events: ["tokenAnimateIn"], text: a.texto, color: "#f6eed8", visibility: 2, once: false } }]);
  }
}
/* clima por região (FXMaster) */
async function criarClima(cena, C, k = 1) {
  if (!game.modules.get("fxmaster")?.active || !CONFIG.RegionBehavior.dataModels["fxmaster.particleEffectsRegion"]) return;
  const tipo = "fxmaster.particleEffectsRegion", lama = C.alas.find(a => a.id === "lama"), pt = (cena.getFlag(MOD, "lang") ?? "pt") === "pt";
  const regs = [
    { nome: pt ? "Tempestade da Torre de Ardósia" : "Greystone Tower storm", cor: "#5a4b8a", shapes: [{ type: "ellipse", x: Math.round(C.torre.x * k), y: Math.round(C.torre.y * k), radiusX: Math.round(780 * k), radiusY: Math.round(780 * k) }],
      fx: { rain_enabled: true, rain_topDown: true, rain_splash: true, rain_density: 0.9, rain_alpha: 0.6, rain_speed: 1.2,
            clouds_enabled: true, clouds_density: 0.2, clouds_alpha: 0.3, clouds_scale: 1.3, clouds_dropShadow: true, clouds_shadowOpacity: 0.35 } },
    lama && { nome: pt ? "Névoa da Ala da Lama" : "Mud Ward fog", cor: "#7a5a33", shapes: [{ type: "polygon", points: lama.pontos.map(v => Math.round(v * k)) }],
      fx: { fog_enabled: true, fog_density: 0.12, fog_alpha: 0.3, fog_scale: 1.6, fog_speed: 0.6 } },
    { nome: pt ? "Pássaros do Bramblewood" : "Bramblewood birds", cor: "#2f5a2f", shapes: [{ type: "rectangle", x: Math.round(250 * k), y: Math.round(1200 * k), width: Math.round(2600 * k), height: Math.round(9000 * k) }],
      fx: { birds_enabled: true, birds_density: 0.004, birds_scale: 0.8, birds_alpha: 0.9 } }
  ].filter(Boolean);
  for (const r of regs) {
    const [reg] = await cena.createEmbeddedDocuments("Region", [{ name: r.nome, color: r.cor, visibility: 0, shapes: r.shapes, flags: F({ clima: true }) }]);
    const [b] = await reg.createEmbeddedDocuments("RegionBehavior", [{ name: r.nome, type: tipo, system: { _edgeFadePercent: 0.6, ...r.fx } }]);
    await b.update({ disabled: true }); await b.update({ disabled: false });
  }
}
/* Nuvens, chuva, névoa e pássaros: garante que existem e que estão desenhando.
   Cena que veio de importação antiga, ou montada com o FXMaster desligado, fica sem o clima: aqui ele é criado (ou religado) uma vez por cena.
   Roda sozinho quando o mestre abre a cena de Westruun com o FXMaster ativo. */
async function garantirClima(cena = cenaWestruun(), C = null, k = null) {
  if (!cena || !game.user.isGM) return false;
  if (!game.modules.get("fxmaster")?.active || !CONFIG.RegionBehavior.dataModels["fxmaster.particleEffectsRegion"]) return false;
  const regs = cena.regions.filter(r => r.getFlag(MOD, "clima"));
  const comFx = regs.filter(r => r.behaviors.some(b => b.type === "fxmaster.particleEffectsRegion"));
  if (!comFx.length) {
    C ??= (await lerDados(cena.getFlag(MOD, "lang") ?? "pt")).cena; k ??= cena.width / C.largura < 0.75 ? 0.5 : 1;
    if (regs.length) await cena.deleteEmbeddedDocuments("Region", regs.map(r => r.id));          // regiões de clima vazias (o comportamento se perdeu na importação)
    await criarClima(cena, C, k);
  } else if (!cena.getFlag(MOD, "climaOk")) {                                                     // o FXMaster só desenha depois de um desliga-liga
    for (const r of comFx) for (const b of r.behaviors.filter(b => b.type === "fxmaster.particleEffectsRegion" && !b.disabled)) { await b.update({ disabled: true }); await b.update({ disabled: false }); }
  } else return true;
  await cena.setFlag(MOD, "climaOk", true);
  return true;
}
/* Rótulos (título, alas, portões, nomes dos locais) de cenas criadas antes da correção da âncora: quem ainda está na posição do gerador
   passa a ser medido pelo canto. Rótulo que o mestre moveu à mão não é tocado. */
async function consertarRotulos(cena = cenaWestruun(), D = null) {
  if (!cena || !game.user.isGM) return 0;
  D ??= await lerDados(cena.getFlag(MOD, "lang") ?? "pt");
  const k = cena.width / D.cena.largura < 0.75 ? 0.5 : 1, upd = [];
  for (const t of cena.tiles) {
    const tipo = t.getFlag(MOD, "rotulo"); if (!tipo || (t.texture.anchorX === 0 && t.texture.anchorY === 0)) continue;
    const r = D.rotulos.find(x => x.tipo === tipo && x.id === t.getFlag(MOD, "id")); if (!r) continue;
    if (Math.abs(t.x - Math.round(r.x * k)) <= 2 && Math.abs(t.y - Math.round(r.y * k)) <= 2) upd.push({ _id: t.id, "texture.anchorX": 0, "texture.anchorY": 0 });
  }
  if (upd.length) await cena.updateEmbeddedDocuments("Tile", upd);
  return upd.length;
}

/* ---------------------------------------------------------------- atualizar um mundo já construído ---------------------------------------------------------------- */
/* Aplica o que mudou em data/westruun_<lang>.json SEM recriar nada: troca o fundo da cena, os trovões, as luzes do módulo (a planta da cidade mudou),
   os arquivos dos sons e das faixas, e os diários e fichas marcados como "mudou" pelo gerador (página a página; o que você escreveu em páginas que não mudaram fica).
   Pins, nomes, regiões, tokens e tudo o que foi criado à mão não são tocados.  Uso: game.modules.get("arcano-westruun").api.atualizar()   ({tudo: true} força tudo) */
async function sincronizarPaginas(j, pages, tudo = false) {
  const usados = new Set(), novas = [], upd = [];
  for (const p of pages) {
    const e = j.pages.find(x => x.name === p.name && x.type === p.type && !usados.has(x.id));
    if (!e) { novas.push(semMarca(p)); continue; }
    usados.add(e.id);
    const u = { _id: e.id };                                       // ordem e "só o mestre" seguem sempre o gerador; texto e imagem, só se mudaram
    if (e.sort !== p.sort) u.sort = p.sort;
    if (p.ownership && e.ownership?.default !== p.ownership.default) u["ownership.default"] = p.ownership.default;
    if (tudo || p._mudou) {
      if (p.type === "image") { if (e.src !== p.src) u.src = p.src; if ((p.image?.caption ?? "") && e.image?.caption !== p.image.caption) u["image.caption"] = p.image.caption; }
      else if (e.text?.content !== p.text.content) u["text.content"] = p.text.content;
    }
    if (Object.keys(u).length > 1) upd.push(u);
  }
  if (upd.length) await j.updateEmbeddedDocuments("JournalEntryPage", upd);
  if (novas.length) await j.createEmbeddedDocuments("JournalEntryPage", novas);
  return upd.length + novas.length;
}
async function atualizar({ lang = null, tudo = false } = {}) {
  if (!game.user.isGM) return ui.notifications.warn(L("SoMestre"));
  const cena = game.scenes.find(s => s.getFlag(MOD, "mapa")) ?? (tudo ? await adotarCena() : null);
  if (!cena) return ui.notifications.warn(L("Vazio"));
  lang ??= cena.getFlag(MOD, "lang") ?? "pt";
  const D = await lerDados(lang), T = D.textos, pt = lang === "pt", C = D.cena, R = { geracao: D.geracao, lang };
  if (tudo) R.adotadosDiarios = await adotarDiarios(D, lang);
  const k = cena.width / C.largura < 0.75 ? 0.5 : 1, mapa = k === 0.5 ? C.mapa8k : C.mapa;
  // ---- 1. fundo da cena
  const nivel = cena.levels?.contents?.[0] ?? null;
  if (nivel) { if (nivel.background?.src !== mapa) { await cena.updateEmbeddedDocuments("Level", [{ _id: nivel.id, "background.src": mapa }]); R.mapa = mapa; } }
  else if (cena.background?.src !== mapa) { await cena.update({ "background.src": mapa }); R.mapa = mapa; }
  // ---- 2. trovões
  await cena.update({ flags: F({ trovao: C.trovao ?? null, trovoes: C.trovoes ?? [], geracao: D.geracao ?? null }) });
  // ---- 2b. título e nomes medidos pelo canto (título cortado no alto do mapa) e clima (nuvens, chuva, névoa, pássaros)
  R.rotulos = await consertarRotulos(cena, D);
  R.clima = await garantirClima(cena, C, k);
  R.nuvens = await garantirNuvens(cena);
  // ---- 3. luzes do módulo (postes, marcos, portões, fogueiras, casas): se a lista mudou, troca todas; luzes postas à mão ficam
  const velhas = cena.lights.filter(l => l.getFlag(MOD, "luz")), novasL = C.luzes.map(z => dadosLuz(z, k));
  const chave = ls => ls.map(l => `${l.x},${l.y},${(l.flags?.[MOD] ?? {}).luz}`).sort().join("|");
  if (chave(velhas.map(l => l.toObject())) !== chave(novasL)) {
    const casasApagadas = velhas.some(l => l.getFlag(MOD, "luz") === "casa" && l.hidden);
    if (casasApagadas) for (const l of novasL) if (l.flags[MOD].luz === "casa") l.hidden = true;
    if (velhas.length) await cena.deleteEmbeddedDocuments("AmbientLight", velhas.map(l => l.id));
    await cena.createEmbeddedDocuments("AmbientLight", novasL); R.luzes = novasL.length;
  }
  // ---- 4. sons ambientes do módulo: só o arquivo (posição, raio e volume ficam como estão na cena)
  R.sons = 0;
  for (const sm of C.sons ?? []) for (const d of cena.sounds.filter(x => x.getFlag(MOD, "som") === sm.id)) if (d.path !== sm.src) { await d.update({ path: sm.src }); R.sons++; }
  // ---- 5. playlists: troca o arquivo das faixas de mesmo nome e cria as que faltam
  R.faixas = 0;
  const fP = game.folders.find(f => f.type === "Playlist" && f.getFlag(MOD, "raiz"));
  for (const p of D.playlists) {
    const pl = game.playlists.find(x => x.name === p.nome);
    if (!pl) { await Playlist.create({ name: p.nome, folder: fP?.id ?? null, mode: CONST.PLAYLIST_MODES.SEQUENTIAL, fade: 2000,
      sounds: p.faixas.map(f => ({ name: f.nome, path: f.src, repeat: false, volume: 0.5, description: f.desc })) }); R.faixas += p.faixas.length; continue; }
    for (const f of p.faixas) {
      const sd = pl.sounds.find(x => x.name === f.nome);
      if (!sd) { await pl.createEmbeddedDocuments("PlaylistSound", [{ name: f.nome, path: f.src, repeat: false, volume: 0.5, description: f.desc }]); R.faixas++; }
      else if (sd.path !== f.src) { try { await sd.update({ path: f.src, description: f.desc }); } catch (e) { if (!String(e).includes("audio is unlocked")) throw e; }   // navegador sem áudio liberado: o servidor grava mesmo assim
        R.faixas++; }
    }
  }
  // ---- 6. NPCs: ficha, retrato e token dos que mudaram; os novos são criados (ou reaproveitam o ator que a macro do mapa de batalha já criou, sem mexer na ficha dele)
  const porFlag = (col, f) => Object.fromEntries(col.filter(d => d.getFlag(MOD, f)).map(d => [d.getFlag(MOD, f), d]));
  const cenasLocal = {}; for (const sc of game.scenes) { const l = sc.getFlag(MOD, "interna"); if (l) (cenasLocal[l] ??= []).push(sc); }
  const X = { npcJ: porFlag(game.journal, "npc"), atores: porFlag(game.actors, "npc"), diarios: porFlag(game.journal, "local"), cenasLocal, baseSRD: {},
    nomeNpc: Object.fromEntries(D.npcs.map(n => [n.id, n.nome])), nomeLocal: Object.fromEntries(D.locais.map(l => [l.id, l.nome])), pt };
  const resolver = fazResolver(X);
  const raizJ = game.folders.find(f => f.type === "JournalEntry" && f.getFlag(MOD, "raiz")), sub = (nome, pai) => game.folders.find(f => f.type === "JournalEntry" && f.name === nome && f.folder?.id === pai?.id);
  const fNpcJ = sub(T.npcs, raizJ), fAlas = sub(T.alas, raizJ), fA = game.folders.find(f => f.type === "Actor" && f.getFlag(MOD, "raiz"));
  const npcsMud = D.npcs.filter(n => tudo || n.mudou); R.npcs = 0; R.npcsNovos = 0;
  const nomeOutro = {}; if (tudo) { try { for (const o of (await lerDados(pt ? "en" : "pt")).npcs) nomeOutro[o.id] = o.nome; } catch (e) { /* sem o outro idioma: casa só pelo nome deste */ } }
  for (const n of npcsMud) {
    let a = X.atores[n.id];
    const tex = { src: n.tok || n.img }, ring = { enabled: !!n.ring, subject: { texture: n.img } };
    if (!a) {
      const livre = nome => nome ? game.actors.find(x => x.name === nome && !x.getFlag(MOD, "npc") && !deOutroArcano(x)) : null, doMundo = livre(n.mundo) ?? livre(n.nome) ?? livre(nomeOutro[n.id]);
      if (doMundo && !doMundo.getFlag(MOD, "npc") && !deOutroArcano(doMundo)) { a = doMundo; await a.setFlag(MOD, "npc", n.id);
        if (await artePropria(a)) await a.setFlag(MOD, "deFora", true);
        else { await a.update({ img: n.img, "prototypeToken.texture.src": tex.src, "prototypeToken.ring": ring }); R.adotados = (R.adotados ?? 0) + 1; } }
      else {
        let o = await fichaSRD(n.base); if (!o) o = { type: "npc", system: {} };
        X.baseSRD[n.id] = o._base; delete o._base; delete o._id; delete o.folder; delete o._stats; delete o.ownership; delete o.sort;
        o.name = n.nome; o.img = n.img; o.folder = fA?.id ?? null;
        o.prototypeToken = foundry.utils.mergeObject(o.prototypeToken ?? {}, { name: n.nome, actorLink: true, displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
          disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL, texture: tex, ring });
        o.flags = foundry.utils.mergeObject(o.flags ?? {}, F({ npc: n.id })); a = await Actor.create(o); R.npcsNovos++;
      }
      X.atores[n.id] = a;
    } else if (!a.getFlag(MOD, "deFora") || !(await artePropria(a))) await a.update({ img: n.img, "prototypeToken.texture.src": tex.src, "prototypeToken.ring": ring });
  }
  for (const n of npcsMud) {                                       // diários dos NPCs (depois dos atores, para os links de ficha)
    const pages = [Object.assign(pagTexto(T.ficha, resolver(n.ficha), 0), { _mudou: true })]; if (!n.faltaImg) pages.push(Object.assign(pagImg(T.retrato, n.img, 100), { _mudou: true }));
    let j = X.npcJ[n.id];
    if (!j) j = X.npcJ[n.id] = await JournalEntry.create({ name: n.nome, folder: fNpcJ?.id ?? null, pages: pages.map(semMarca), ownership: { default: NIVEIS.NONE }, flags: F({ npc: n.id }) });
    else await sincronizarPaginas(j, pages, true);
    R.npcs++;
  }
  for (const n of npcsMud) { const a = X.atores[n.id];             // biografia na ficha (só nos atores do módulo)
    if (a && !a.getFlag(MOD, "deFora")) await a.update({ "system.details.biography.value": resolver(n.ficha) + `<p>${link(X.npcJ[n.id])}</p>` }); }
  // ---- 7. diários dos locais que mudaram, página a página
  R.locais = 0; R.paginas = 0;
  for (const l of D.locais.filter(x => tudo || x.mudou)) {
    const pages = paginasProntas(l.paginas.filter(p => pt || !p.camp)).map(p => (p.type === "text" ? (p.text.content = resolver(p.text.content)) : 0, p));
    let j = X.diarios[l.id];
    if (!j) { const pastaL = sub(D.alas.find(a => a.id === l.ala)?.nome, fAlas) ?? sub(pt ? "Arredores e outros" : "Outskirts and others", fAlas) ?? fAlas;
      j = X.diarios[l.id] = await JournalEntry.create({ name: l.nome, folder: pastaL?.id ?? null, pages: pages.map(semMarca), ownership: { default: l.descoberto ? NIVEIS.OBSERVER : NIVEIS.NONE },
        flags: F({ local: l.id, ala: l.ala, descoberto: !!l.descoberto, secreto: !!l.secreto, campanha: !!l.campanhaSo }) }); R.paginas += pages.length; }
    else R.paginas += await sincronizarPaginas(j, pages, tudo);
    // prévias de mapa de batalha que saíram dos dados (o mapa do local ainda vai ser lançado): a página antiga é apagada
    const previas = j.pages.filter(p => p.type === "image" && /-previa\./.test(p.src ?? "") && !pages.some(x => x.src === p.src)).map(p => p.id);
    if (previas.length) { await j.deleteEmbeddedDocuments("JournalEntryPage", previas); R.paginas += previas.length; }
    R.locais++;
  }
  // ---- 8. só no "tudo" (reparo): visão geral das alas e diários gerais (mapa dos jogadores, a cidade)
  if (tudo) {
    const comLinks = ps => ps.map(p => (p.type === "text" ? (p.text.content = resolver(p.text.content)) : 0, p));
    for (const a of D.alasDiario) { const j = game.journal.find(x => x.getFlag(MOD, "ala") === a.id && !x.getFlag(MOD, "local")); if (j) R.paginas += await sincronizarPaginas(j, comLinks(paginasProntas(a.paginas)), true); }
    for (const g of D.diariosGerais) { const j = game.journal.find(x => x.getFlag(MOD, "geral") === g.id); if (!j) continue;
      const pages = g.paginas.map((p, i) => Object.assign(p.tipo === "image" ? pagImg(p.nome, p.src, i * 100) : pagTexto(p.nome, resolver(p.html), i * 100), { _mudou: true }));
      R.paginas += await sincronizarPaginas(j, pages, true); }
  }
  ui.notifications.info(L("Atualizada", { npcs: R.npcs, novos: R.npcsNovos, locais: R.locais, paginas: R.paginas, faixas: R.faixas }));
  return R;
}

/* ---------------------------------------------------------------- instalar, reparar, organizar ---------------------------------------------------------------- */
const confirmar = (titulo, html) => foundry.applications.api.DialogV2.confirm({ window: { title: titulo }, content: html, rejectClose: false });
let _ocupado = false;
/* Porta única de entrada (compêndio de Aventura e painel): monta a cidade num mundo vazio; num mundo que já tem Westruun, oferece o reparo. */
async function instalar({ lang = null, resolucao = "16k" } = {}) {
  if (!game.user.isGM) return ui.notifications.warn(L("SoMestre"));
  if (_ocupado) return ui.notifications.warn(L("Ocupado"));
  lang ??= game.i18n.lang.startsWith("pt") ? "pt" : "en";
  if (temWestruun()) return reparar();
  if (!await confirmar(L("InstalarTitulo"), `<p>${L("InstalarTexto", { lang: lang.toUpperCase() })}</p>`)) return;
  _ocupado = true;
  try { const cena = await construir({ lang, resolucao }); Painel.abrir(); return cena; } finally { _ocupado = false; }
}
/* Reparo de um mundo que já tem Westruun (importação antiga, retratos sumidos, título cortado, sem nuvens, diários fora do lugar): nada é recriado. */
async function reparar({ perguntar = true } = {}) {
  if (!game.user.isGM) return ui.notifications.warn(L("SoMestre"));
  if (_ocupado) return ui.notifications.warn(L("Ocupado"));
  if (perguntar && !await confirmar(L("RepararTitulo"), `<p>${L("RepararTexto")}</p>`)) return;
  _ocupado = true;
  try {
    const R = await atualizar({ tudo: true }); if (!R) return R;
    R.cenas = await garantirCenas({ lang: R.lang }); R.creditos = await garantirCreditos({ lang: R.lang, tudo: true }); R.tokens = await consertarTokens(); R.cura = await curarCaminhos();
    R.organizados = await organizarDiarios({ avisar: false });
    ui.notifications.info(L("ReparoFeito", { cenas: R.cenas.criadas, tokens: R.tokens }));
    await relatorioReparo(R);
    return R;
  } finally { _ocupado = false; Painel._inst?.render(); }
}
/* Organizar os diários: cada diário do módulo volta para a pasta certa (a cidade, uma pasta por ala, NPCs, figuras históricas), as páginas voltam
   para a ordem do gerador e só a Descrição fica aberta aos jogadores (o resto é do mestre). Não mexe em texto, em quem pode ver o diário, nem em diários que não são do módulo. */
async function organizarDiarios({ lang = null, avisar = true } = {}) {
  if (!game.user.isGM) return ui.notifications.warn(L("SoMestre"));
  lang ??= cenaWestruun()?.getFlag(MOD, "lang") ?? (game.i18n.lang.startsWith("pt") ? "pt" : "en");
  const D = await lerDados(lang), T = D.textos, pt = lang === "pt", AZUL = "#1e3a6e";
  const achar = (nome, pai) => game.folders.find(f => f.type === "JournalEntry" && f.name === nome && (f.folder?.id ?? null) === (pai?.id ?? null));
  const pasta = async (nome, pai = null, extra = {}) => achar(nome, pai) ?? Folder.create({ name: nome, type: "JournalEntry", folder: pai?.id ?? null, sorting: "a", ...extra });
  const raiz = game.folders.find(f => f.type === "JournalEntry" && f.getFlag(MOD, "raiz")) ?? await pasta(T.pasta, null, { color: AZUL, flags: F({ raiz: true }) });
  const fCidade = await pasta(T.cidade, raiz), fAlas = await pasta(T.alas, raiz), fNpc = await pasta(T.npcs, raiz), fHist = await pasta(T.hist, raiz);
  const fAla = {}; for (const a of D.alas) fAla[a.id] = await pasta(a.nome, fAlas);
  const fOutros = await pasta(pt ? "Arredores e outros" : "Outskirts and others", fAlas);
  const fCamp = game.folders.find(f => f.type === "JournalEntry" && f.getFlag(MOD, "campanha") && !f.folder);
  const locD = Object.fromEntries(D.locais.map(l => [l.id, l])), alaD = Object.fromEntries(D.alasDiario.map(a => [a.id, a])), nomesHist = new Set(D.historicos.map(h => h.nome));
  let movidos = 0, paginas = 0;
  const mover = async (j, f) => { if (f && j.folder?.id !== f.id) { await j.update({ folder: f.id }); movidos++; } };
  const ordenar = async (j, ps) => {                               // ordem e "só o mestre" de cada página, pelo nome e tipo; o texto fica como está
    const usados = new Set(), upd = [];
    for (const p of ps) {
      const e = j.pages.find(x => x.name === p.name && x.type === p.type && !usados.has(x.id)); if (!e) continue; usados.add(e.id);
      const u = { _id: e.id }; if (e.sort !== p.sort) u.sort = p.sort;
      if (p.ownership && e.ownership?.default !== p.ownership.default) u["ownership.default"] = p.ownership.default;
      if (Object.keys(u).length > 1) upd.push(u);
    }
    if (upd.length) { await j.updateEmbeddedDocuments("JournalEntryPage", upd); paginas += upd.length; }
  };
  for (const j of game.journal.contents) {
    if (j.getFlag(MOD, "campanha") && !j.getFlag(MOD, "local")) continue;                         // diários soltos da campanha ficam onde o mestre pôs
    const local = j.getFlag(MOD, "local"), npc = j.getFlag(MOD, "npc"), ala = j.getFlag(MOD, "ala"), geral = j.getFlag(MOD, "geral");
    if (local) { const l = locD[local];
      await mover(j, l?.campanhaSo ? (fCamp ?? fOutros) : (fAla[l?.ala ?? ala] ?? fOutros));
      if (l) await ordenar(j, paginasProntas(l.paginas.filter(p => pt || !p.camp))); }
    else if (npc) await mover(j, fNpc);
    else if (ala) { await mover(j, fAla[ala] ?? fAlas); if (alaD[ala]) await ordenar(j, paginasProntas(alaD[ala].paginas)); }
    else if (geral) await mover(j, geral === "creditos" ? raiz : fCidade);
    else if (j.getFlag(MOD, "hist") || (nomesHist.has(j.name) && (!j.folder || j.folder.ancestors?.some(f => f.id === raiz.id) || j.folder.id === raiz.id))) await mover(j, fHist);
  }
  for (const f of [raiz, fCidade, fAlas, fNpc, fHist, fOutros, ...Object.values(fAla)]) if (f.sorting !== "a") await f.update({ sorting: "a" });
  if (avisar) ui.notifications.info(L("OrganizarFeito", { movidos, paginas }));
  return { movidos, paginas };
}

/* ---------------------------------------------------------------- cenas das ilustrações, nuvens, créditos, tokens ---------------------------------------------------------------- */
let _imagens = null;
async function lerImagens() { if (_imagens) return _imagens; const r = await fetch(`${ROOT}/data/imagens.json`); return (_imagens = r.ok ? await r.json() : {}); }
/* uma cena por ilustração de local (as prévias dos mapas de batalha ficam de fora) mais as cenas avulsas dos dados */
function listaCenas(D, IMG) {
  const out = [], vistos = new Set();
  for (const l of D.locais) {
    const ps = l.paginas.filter(p => p.tipo === "image" && !/-previa\./.test(p.src) && IMG[p.src]);
    for (const p of ps) { if (vistos.has(p.src)) continue; vistos.add(p.src);
      out.push({ src: p.src, local: l.id, ala: l.ala, nome: ps.length > 1 ? `${l.nome} — ${p.nome}` : l.nome, ...IMG[p.src] }); }
  }
  for (const c of D.cenasInternas ?? []) if (!vistos.has(c.src)) { vistos.add(c.src); out.push({ src: c.src, local: c.local ?? null, ala: c.ala, nome: c.nome, w: c.w, h: c.h, mini: IMG[c.src]?.mini }); }
  return out;
}
const dadosCena = (c, pastaId) => ({ name: c.nome, folder: pastaId, navigation: false, width: c.w, height: c.h, padding: 0, ...(c.mini ? { thumb: c.mini } : {}),
  levels: [{ name: c.nome, background: { src: c.src, color: "#000000" } }], grid: { type: CONST.GRID_TYPES.GRIDLESS }, tokenVision: false,
  fog: { mode: CONST.FOG_EXPLORATION_MODES.DISABLED }, environment: { globalLight: { enabled: true } }, flags: F({ interna: c.local ?? "", img: c.src }) });
const fundoDaCena = s => s.levels?.contents?.[0]?.background?.src ?? s.background?.src ?? null;
function cenaDaImagem(src) {
  return game.scenes.find(s => s.getFlag(MOD, "img") === src) ?? game.scenes.find(s => s.getFlag(MOD, "interna") !== undefined && !s.getFlag(MOD, "mapa") && fundoDaCena(s) === src) ?? null;
}
async function pastaCenas(D, alaId) {
  const T = D.textos, acha = (nome, pai) => game.folders.find(f => f.type === "Scene" && f.name === nome && (f.folder?.id ?? null) === (pai?.id ?? null));
  const cria = async (nome, pai, extra = {}) => acha(nome, pai) ?? Folder.create({ name: nome, type: "Scene", folder: pai?.id ?? null, sorting: "a", ...extra });
  const raiz = game.folders.find(f => f.type === "Scene" && f.getFlag(MOD, "raiz")) ?? await cria(T.pasta, null, { color: "#1e3a6e", flags: F({ raiz: true }) });
  let fInt = acha(T.interiores, raiz) ?? ["Cenas internas", "Interior scenes"].map(n => acha(n, raiz)).find(Boolean);
  if (fInt && fInt.name !== T.interiores) await fInt.update({ name: T.interiores });
  fInt ??= await cria(T.interiores, raiz);
  return cria(D.alas.find(a => a.id === alaId)?.nome ?? (T.cidade.startsWith("A ") ? "Cidade" : "City"), fInt);
}
/* Cria as cenas que faltam e liga cada uma ao diário do local e à página da imagem. Com os dados sem o mapa do Covil do Oni, a cena antiga dele é apagada. */
async function garantirCenas({ lang = null, D = null } = {}) {
  if (!game.user.isGM) return { criadas: 0, ligadas: 0 };
  lang ??= cenaWestruun()?.getFlag(MOD, "lang") ?? (game.i18n.lang.startsWith("pt") ? "pt" : "en"); D ??= await lerDados(lang);
  const IMG = await lerImagens(), diarios = Object.fromEntries(game.journal.filter(j => j.getFlag(MOD, "local")).map(j => [j.getFlag(MOD, "local"), j]));
  let criadas = 0, ligadas = 0, apagadas = 0, notas = 0;
  for (const c of listaCenas(D, IMG)) {
    let s = cenaDaImagem(c.src);
    if (!s) { s = await Scene.create(dadosCena(c, (await pastaCenas(D, c.ala)).id)); criadas++; }
    const j = c.local ? diarios[c.local] : null, pg = j?.pages.find(p => p.type === "image" && p.src === c.src), u = {};
    if (s.getFlag(MOD, "img") !== c.src) u[`flags.${MOD}.img`] = c.src;
    if (j && s._source.journal !== j.id) u.journal = j.id;
    if (pg && s._source.journalEntryPage !== pg.id) u.journalEntryPage = pg.id;
    if (Object.keys(u).length) { await s.update(u); ligadas++; }
    // nota do diário dentro da cena: um marcador no canto de baixo que abre o diário do local (quem não pode ler o diário não vê a nota)
    if (j && !s.notes.some(n => n.getFlag(MOD, "local") === c.local)) {
      const desc = j.pages.find(p => p.type === "text");
      await s.createEmbeddedDocuments("Note", [{ entryId: j.id, pageId: desc?.id ?? null, x: Math.round(s.width * 0.045), y: Math.round(s.height * 0.92), iconSize: Math.max(40, Math.round(s.width / 30)),
        fontSize: Math.max(24, Math.round(s.width / 55)), text: j.name, textAnchor: CONST.TEXT_ANCHOR_POINTS?.RIGHT ?? 4, global: true,
        texture: { src: "icons/svg/book.svg", tint: "#f0d27a" }, flags: F({ local: c.local, notaDeCena: true }) }]);
      notas++;
    }
  }
  if (!D.caverna) for (const s of game.scenes.filter(x => x.getFlag(MOD, "interna") !== undefined && /caverna_oni\.webp$/.test(fundoDaCena(x) ?? ""))) { await s.delete(); apagadas++; }
  return { criadas, ligadas, apagadas, notas };
}
/* Nuvens passando por cima do mapa inteiro, ligadas por padrão (efeito de cena do FXMaster, o mesmo do botão Nuvens do painel dele).
   Entra uma vez só por cena: se o mestre desligar no FXMaster, o módulo não liga de novo. */
const NUVENS = { scale: 5, direction: 90, speed: 1, lifetime: 1, density: 0.01, alpha: 1, tint: { apply: false, value: "#FFFFFF" }, dropShadow: false };
async function garantirNuvens(cena = cenaWestruun(), { forcar = false } = {}) {
  if (!cena || !game.user.isGM || !game.modules.get("fxmaster")?.active) return false;
  if (cena.getFlag(MOD, "nuvensOk") && !forcar) return true;
  const ef = cena.getFlag("fxmaster", "effects") ?? {};
  if (!Object.values(ef).some(e => e?.type === "clouds")) await cena.setFlag("fxmaster", "effects", { ...ef, core_clouds: { type: "clouds", options: NUVENS } });
  await cena.setFlag(MOD, "nuvensOk", true);
  return true;
}
/* Diário "Créditos e direitos": aviso de conteúdo de fã, a quem pertence Tal'Dorei, onde comprar o livro e os créditos de música, fontes e regras. */
async function garantirCreditos({ lang = null, pasta = null, tudo = false } = {}) {
  if (!game.user.isGM) return null;
  lang ??= cenaWestruun()?.getFlag(MOD, "lang") ?? (game.i18n.lang.startsWith("pt") ? "pt" : "en");
  const r = await fetch(`${ROOT}/data/creditos.json`); if (!r.ok) return null;
  const C = (await r.json())[lang]; if (!C) return null;
  const pages = C.paginas.map((p, i) => Object.assign(pagTexto(p.nome, p.html, i * 100), { _mudou: true }));
  let j = game.journal.find(x => x.getFlag(MOD, "geral") === "creditos");
  if (!j) {
    pasta ??= game.folders.find(f => f.type === "JournalEntry" && f.getFlag(MOD, "raiz")) ?? null;          // solto na pasta Westruun, fora das subpastas
    j = await JournalEntry.create({ name: C.nome, folder: pasta?.id ?? null, pages: pages.map(semMarca), ownership: { default: NIVEIS.OBSERVER }, flags: F({ geral: "creditos" }) });
  } else {                                                          // o aviso de direitos é do módulo: texto sempre atual e sempre fora das subpastas
    await sincronizarPaginas(j, pages, true);
    const raiz = game.folders.find(f => f.type === "JournalEntry" && f.getFlag(MOD, "raiz"));
    if (raiz && j.folder?.id !== raiz.id) await j.update({ folder: raiz.id });
  }
  return j;
}
/* ---------------------------------------------------------------- reparo de mundos de importação antiga (1.0.1) ----------------------------------------------------------------
   Mundo que importou a Aventura antiga (ou atualizou o módulo por cima) pode ter a cena, os NPCs e os diários SEM a marca do módulo, e imagens que apontam para
   arquivos que não existem mais. O reparo adota esses documentos pelo nome, cura os caminhos quebrados e mostra no chat o que fez e o que não conseguiu. */
const CAMP = "modules/arcano-westruun-campanha";
const _existe = new Map();
async function existe(url) {
  if (!url) return false; const u = String(url).split("?")[0]; if (!/^(modules|worlds|assets|systems|icons|ui)\//.test(u)) return true;      // http, data: e afins não se conferem
  if (!_existe.has(u)) { let ok = false; try { ok = (await fetch(encodeURI(decodeURI(u)), { method: "HEAD", cache: "no-store" })).ok; } catch (e) { ok = false; } _existe.set(u, ok); }
  return _existe.get(u);
}
const deOutroArcano = doc => Object.keys(doc?.flags ?? {}).some(k => k.startsWith("arcano-") && k !== MOD && !["arcano-formas", "arcano-doors", "arcano-hub"].includes(k));
/* O ator tem arte própria (de outro módulo ou do mundo) que existe? Então é "de fora" e a ficha/arte dele não é tocada. Arte do próprio módulo, ou quebrada, não conta. */
async function artePropria(a) {
  const img = a.img ?? "", tok = a.prototypeToken?.texture?.src ?? "";
  if (img.startsWith(`${ROOT}/`) || tok.startsWith(`${ROOT}/`) || /mystery-man/.test(img)) return false;
  return (await existe(img)) && (await existe(tok));
}
function temWestruun() {
  return game.scenes.some(s => s.getFlag(MOD, "mapa")) || game.actors.some(a => a.getFlag(MOD, "npc")) || game.journal.some(j => j.getFlag(MOD, "local")) || !!cenaAntiga();
}
function cenaAntiga() {           // cena de Westruun de importação antiga: sem a marca, mas com o mapa do módulo no fundo
  const doModulo = s => [s.background?.src, ...(s.levels?.contents ?? []).map(l => l.background?.src)].some(x => String(x ?? "").startsWith(`${ROOT}/assets/mapa/`));
  return game.scenes.find(s => !s.getFlag(MOD, "interna") && doModulo(s)) ?? null;
}
async function adotarCena() {
  const cena = cenaAntiga(); if (!cena) return null;
  const en = game.journal.some(j => /Sunkissed Tavern|Cobalt Reserve|Greystone Tower/i.test(j.name)), lang = en ? "en" : "pt";
  await cena.update({ flags: F({ mapa: true, lang }) }); return cena;
}
/* Diários de NPC e de local que vieram sem a marca: casa pelo nome (em português ou em inglês) e marca. Não toca em diário de outro módulo Arcano. */
async function adotarDiarios(D, lang) {
  let O = null; try { O = await lerDados(lang === "pt" ? "en" : "pt"); } catch (e) { O = null; }
  const nomes = (lista, outra, id) => { const o = outra?.find(x => x.id === id); return [lista.find(x => x.id === id)?.nome, o?.nome].filter(Boolean); };
  const livres = game.journal.filter(j => !j.getFlag(MOD, "npc") && !j.getFlag(MOD, "local") && !j.getFlag(MOD, "geral") && !j.getFlag(MOD, "hist") && !deOutroArcano(j));
  const temNpc = new Set(game.journal.map(j => j.getFlag(MOD, "npc")).filter(Boolean)), temLocal = new Set(game.journal.map(j => j.getFlag(MOD, "local")).filter(Boolean)); let n = 0;
  for (const l of D.locais) { if (temLocal.has(l.id)) continue; const ns = nomes(D.locais, O?.locais, l.id), j = livres.find(x => ns.includes(x.name) && !x.getFlag(MOD, "local"));
    if (j) { await j.update({ flags: F({ local: l.id, ala: l.ala, descoberto: !!l.descoberto, secreto: !!l.secreto, campanha: !!l.campanhaSo }) }); temLocal.add(l.id); n++; } }
  for (const p of D.npcs) { if (temNpc.has(p.id)) continue; const ns = nomes(D.npcs, O?.npcs, p.id), j = livres.find(x => ns.includes(x.name) && !x.getFlag(MOD, "local") && !x.getFlag(MOD, "npc"));
    if (j) { await j.setFlag(MOD, "npc", p.id); temNpc.add(p.id); n++; } }
  return n;
}
/* Cura: todo caminho do módulo que não existe mais é trocado pelo arquivo atual de mesmo nome (com ou sem a mesma extensão). O que não tem substituto vai para o relatório. */
async function curarCaminhos() {
  const validos = new Map(), porNome = (p) => p.split("/").pop().toLowerCase(), semExt = p => porNome(p).replace(/\.[a-z0-9]+$/, "");
  for (const lg of ["pt", "en"]) { let t = ""; try { t = await (await fetch(`${ROOT}/data/westruun_${lg}.json`)).text(); } catch (e) { continue; }
    for (const m of t.matchAll(/modules\/arcano-westruun\/[^"'\\<>()?]+?\.(?:webp|png|jpe?g|svg|ogg|mp3|wav|webm)/gi)) { const u = decodeURI(m[0]); validos.set(porNome(u), u); if (!validos.has("~" + semExt(u))) validos.set("~" + semExt(u), u); } }
  const R = { trocados: 0, semSubstituto: new Map(), fora: new Map() };
  const novo = async (src, onde) => {
    const u = String(src ?? "").split("?")[0]; if (!u || await existe(u)) return null;
    if (!u.startsWith(`${ROOT}/`)) { R.fora.set(u, onde); return null; }
    const comp = u.replace(`${ROOT}/`, `${CAMP}/`); if (await existe(comp)) return comp;          // conteúdo da campanha: mora no módulo particular arcano-westruun-campanha
    const cand = validos.get(porNome(u)) ?? validos.get("~" + semExt(u));
    if (cand && cand !== u && await existe(cand)) return cand;
    R.semSubstituto.set(u, onde); return null;
  };
  for (const a of game.actors) { const u = {};
    const i = await novo(a.img, a.name); if (i) u.img = i;
    const t = await novo(a.prototypeToken?.texture?.src, a.name); if (t) u["prototypeToken.texture.src"] = t;
    const anel = a.prototypeToken?.ring?.subject?.texture, r = await novo(anel, a.name); if (r) u["prototypeToken.ring.subject.texture"] = r;
    else if (anel && !(await existe(anel)) && (a.getFlag(MOD, "npc") || a.getFlag(MOD, "campanha"))) { u["prototypeToken.ring.subject.texture"] = u.img ?? a.img; R.fora.delete(String(anel).split("?")[0]); }   // anel apontando para um acervo que só existe no PC de quem montou
    if (Object.keys(u).length) { await a.update(u); R.trocados += Object.keys(u).length; } }
  for (const j of game.journal) { const upd = [];
    for (const pg of j.pages) { const u = { _id: pg.id }; let mudou = false;
      if (pg.type === "image") { const x = await novo(pg.src, `${j.name} / ${pg.name}`); if (x) { u.src = x; mudou = true; } }
      else if (pg.type === "text" && pg.text?.content?.includes(`${ROOT}/`)) { let c = pg.text.content;
        for (const m of [...c.matchAll(/modules\/arcano-westruun\/[^"'\\<>()?]+?\.(?:webp|png|jpe?g|svg)/gi)]) { const x = await novo(m[0], `${j.name} / ${pg.name}`); if (x) c = c.split(m[0]).join(x); }
        if (c !== pg.text.content) { u["text.content"] = c; mudou = true; } }
      if (mudou) upd.push(u); }
    if (upd.length) { await j.updateEmbeddedDocuments("JournalEntryPage", upd); R.trocados += upd.length; } }
  for (const sc of game.scenes) { const tk = [];
    for (const t of sc.tokens) { const x = await novo(t.texture?.src, `${sc.name} / token ${t.name}`); if (x) tk.push({ _id: t.id, "texture.src": x }); }
    if (tk.length) { await sc.updateEmbeddedDocuments("Token", tk); R.trocados += tk.length; }
    const lv = []; for (const l of sc.levels?.contents ?? []) { const x = await novo(l.background?.src, `${sc.name} / fundo`); if (x) lv.push({ _id: l.id, "background.src": x }); }
    if (lv.length) { await sc.updateEmbeddedDocuments("Level", lv); R.trocados += lv.length; }
    const tl = []; for (const t of sc.tiles) { const x = await novo(t.texture?.src, `${sc.name} / tile`); if (x) tl.push({ _id: t.id, "texture.src": x }); }
    if (tl.length) { await sc.updateEmbeddedDocuments("Tile", tl); R.trocados += tl.length; }
    const th = await novo(sc.thumb, `${sc.name} / miniatura`); if (th) { await sc.update({ thumb: th }); R.trocados++; } }
  for (const pl of game.playlists) { const sd = [];
    for (const f of pl.sounds) { const x = await novo(f.path, `${pl.name} / ${f.name}`); if (x) sd.push({ _id: f.id, path: x }); }
    if (sd.length) { try { await pl.updateEmbeddedDocuments("PlaylistSound", sd); R.trocados += sd.length; } catch (e) { if (!String(e).includes("audio is unlocked")) throw e; } } }
  const faltaCamp = [...R.semSubstituto.keys()].filter(u => u.startsWith(`${ROOT}/assets/campanha/`)).length;
  return { trocados: R.trocados, semSubstituto: [...R.semSubstituto], fora: [...R.fora], faltaCamp };
}
/* Relatório do reparo, só para os mestres: o que foi feito e o que continua quebrado (para mandar ao Arcano Lab se precisar). */
async function relatorioReparo(R) {
  const pt = (R.lang ?? "pt") === "pt", c = R.cura ?? { trocados: 0, semSubstituto: [], fora: [] };
  const li = xs => xs.slice(0, 30).map(([u, onde]) => `<li><code>${esc(u)}</code><br><small>${esc(onde)}</small></li>`).join("") + (xs.length > 30 ? `<li>… +${xs.length - 30}</li>` : "");
  const linhas = pt ? [`NPCs atualizados: <b>${R.npcs ?? 0}</b> (${R.npcsNovos ?? 0} criados, ${R.adotados ?? 0} adotados de importação antiga)`, `Locais: <b>${R.locais ?? 0}</b> (${R.paginas ?? 0} páginas)`,
      `Diários adotados pelo nome: <b>${R.adotadosDiarios ?? 0}</b>`, `Cenas de locais criadas: <b>${R.cenas?.criadas ?? 0}</b>`, `Tokens em cena corrigidos: <b>${R.tokens ?? 0}</b>`, `Imagens e sons com caminho curado: <b>${c.trocados}</b>`]
    : [`NPCs updated: <b>${R.npcs ?? 0}</b> (${R.npcsNovos ?? 0} created, ${R.adotados ?? 0} adopted from an old import)`, `Locations: <b>${R.locais ?? 0}</b> (${R.paginas ?? 0} pages)`,
      `Journals adopted by name: <b>${R.adotadosDiarios ?? 0}</b>`, `Location scenes created: <b>${R.cenas?.criadas ?? 0}</b>`, `Placed tokens fixed: <b>${R.tokens ?? 0}</b>`, `Images and sounds with healed paths: <b>${c.trocados}</b>`];
  let html = `<h3>Westruun ${game.modules.get(MOD).version} — ${pt ? "reparo" : "repair"}</h3><ul>${linhas.map(l => `<li>${l}</li>`).join("")}</ul>`;
  if (c.semSubstituto.length) html += `<p><b>${pt ? "Arquivos do módulo que não existem mais e não têm substituto" : "Module files that no longer exist and have no replacement"} (${c.semSubstituto.length}):</b></p><ul>${li(c.semSubstituto)}</ul>`;
  if (c.faltaCamp) html += `<p><b>${pt ? `${c.faltaCamp} imagens são da campanha particular. Instale o módulo <code>arcano-westruun-campanha</code> no servidor e rode o reparo de novo.` : `${c.faltaCamp} images belong to the private campaign pack. Install the <code>arcano-westruun-campanha</code> module on the server and run the repair again.`}</b></p>`;
  if (c.fora.length) html += `<p><b>${pt ? "Arquivos de fora do módulo que não existem neste servidor" : "Files outside the module that do not exist on this server"} (${c.fora.length}):</b></p><ul>${li(c.fora)}</ul>`;
  if (!c.semSubstituto.length && !c.fora.length) html += `<p>${pt ? "Nenhuma imagem ou som quebrado no mundo." : "No broken image or sound left in this world."}</p>`;
  await ChatMessage.create({ content: html, whisper: game.users.filter(u => u.isGM).map(u => u.id), speaker: { alias: "Westruun" } });
}

/* Tokens já colocados em cena que ainda mostram o retrato (ou o boneco padrão) passam a usar o token do NPC. */
async function consertarTokens() {
  if (!game.user.isGM) return 0; let n = 0;
  for (const sc of game.scenes) {
    const upd = [];
    for (const t of sc.tokens) {
      const a = game.actors.get(t.actorId); if (!a?.getFlag(MOD, "npc") || a.getFlag(MOD, "deFora")) continue;
      const src = a.prototypeToken?.texture?.src, atual = t.texture?.src ?? "";
      if (src && atual !== src && (atual === a.img || /mystery-man/.test(atual))) upd.push({ _id: t.id, "texture.src": src, "ring.enabled": !!a.prototypeToken.ring?.enabled });
    }
    if (upd.length) { await sc.updateEmbeddedDocuments("Token", upd); n += upd.length; }
  }
  return n;
}

/* luzes das casas (liga/desliga todas de uma vez) */
async function alternarLuzesCasas(cena = cenaWestruun()) {
  const ls = cena?.lights.filter(l => l.getFlag(MOD, "luz") === "casa") ?? []; if (!ls.length) return;
  const esconder = !ls[0].hidden;
  await cena.updateEmbeddedDocuments("AmbientLight", ls.map(l => ({ _id: l.id, hidden: esconder })));
  ui.notifications.info(L(esconder ? "CasasOff" : "CasasOn", { n: ls.length }));
}

/* remove tudo que é da campanha (para publicar) */
async function removerCampanha() {
  const tem = d => d.getFlag?.(MOD, "campanha");
  let n = 0;
  for (const j of game.journal) {
    if (tem(j)) { await j.delete(); n++; continue; }
    const ps = j.pages.filter(p => p.getFlag(MOD, "campanha")).map(p => p.id); if (ps.length) { await j.deleteEmbeddedDocuments("JournalEntryPage", ps); n += ps.length; }
  }
  for (const a of game.actors.filter(tem)) { await a.delete(); n++; }
  for (const s of game.scenes) { const ns = s.notes.filter(x => x.getFlag(MOD, "campanha")).map(x => x.id); if (ns.length) await s.deleteEmbeddedDocuments("Note", ns); }
  for (const f of game.folders.filter(tem)) if (game.folders.get(f.id)) await f.delete({ deleteSubfolders: true, deleteContents: true });
  ui.notifications.info(L("CampanhaFeito", { n }));
}

/* ---------------------------------------------------------------- painel do mestre ---------------------------------------------------------------- */
const PATREON = "https://www.patreon.com/arcanolab", LOGO = `${ROOT}/assets/marca/arcanolab.svg`;
/* assinatura Arcano Lab com o link do Patreon (mesmo desenho dos outros módulos do Lab) */
const assinatura = () => `<footer class="aw-assinatura">
    <div class="aw-marca"><img src="${LOGO}" alt="Arcano Lab"><div><strong>Westruun · Tal'Dorei</strong><span>${L("By")}</span><em>${L("Tagline")}</em></div></div>
    <a class="aw-patreon" href="${PATREON}" target="_blank" rel="noopener"><i class="fa-brands fa-patreon"></i> ${L("Cta")}</a></footer>`;
class Painel extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${MOD}-painel`, classes: [`${MOD}-painel`], window: { title: "ARCWES.Painel", resizable: true, icon: "fa-solid fa-map-location-dot" },
    position: { width: 640, height: 820 } };
  static abrir() { (this._inst ??= new Painel()).render(true); }
  _filtro = ""; _fechados = new Set();
  _dados() {
    const cena = cenaWestruun(); if (!cena) return null;
    const tiles = cena.tiles.filter(t => t.getFlag(MOD, "rotulo"));
    const tileDe = (tipo, id) => tiles.find(t => t.getFlag(MOD, "rotulo") === tipo && t.getFlag(MOD, "id") === id);
    const locais = game.journal.filter(j => j.getFlag(MOD, "local")).map(j => {
      const id = j.getFlag(MOD, "local"), nivel = j.ownership.default ?? 0;
      return { id, nome: j.name, ala: j.folder?.name ?? "", j, pin: nivel >= NIVEIS.LIMITED, diario: nivel >= NIVEIS.OBSERVER, tile: tileDe("local", id),
        secreto: j.getFlag(MOD, "secreto"), descoberto: j.getFlag(MOD, "descoberto") };
    });
    const grupos = {}; for (const l of locais) (grupos[l.ala] ??= []).push(l);
    const casas = cena.lights.filter(l => l.getFlag(MOD, "luz") === "casa");
    return { cena, locais, grupos, nomesFixos: tiles.filter(t => t.getFlag(MOD, "rotulo") !== "local"), casasOn: casas.length && !casas[0].hidden,
      temCampanha: game.folders.some(f => f.getFlag(MOD, "campanha")) };
  }
  _cabeca() {
    const ativo = id => !!game.modules.get(id)?.active;
    const chip = (ok, nome, serve) => `<span class="aw-mod ${ok ? "ok" : "falta"}" title="${esc(serve)}"><i class="fa-solid ${ok ? "fa-check" : "fa-xmark"}"></i> ${nome}</span>`;
    return `<header class="aw-cabeca"><img src="${LOGO}" alt="">
      <div class="aw-tit"><strong>Westruun</strong><span>Tal'Dorei · Exandria</span></div>
      <div class="aw-mods">${chip(ativo("fxmaster"), "FXMaster", L("ChipFx"))}${chip(ativo("sequencer"), "Sequencer", L("ChipSeq"))}${chip(ativo("JB2A_DnD5e"), "JB2A", L("ChipJb2a"))}</div></header>
      ${ativo("fxmaster") ? "" : `<p class="aw-aviso"><i class="fa-solid fa-cloud"></i> ${L("AvisoClima")}</p>`}`;
  }
  async _renderHTML() {
    const d = this._dados();
    const botao = (acao, icone, texto, { cls = "", dica = "", id = "" } = {}) =>
      `<button type="button" class="aw-b ${cls}" data-acao="${acao}" data-id="${id}" title="${esc(dica)}"><i class="fa-solid ${icone}"></i> <span>${texto}</span></button>`;
    if (!d) return `${this._cabeca()}<div class="aw-vazio"><i class="fa-solid fa-map-location-dot"></i><p>${L("Vazio")}</p>
        <div class="aw-linha">${botao("instalar", "fa-hammer", L("InstalarPt"), { cls: "aw-pri", id: "pt" })}${botao("instalar", "fa-hammer", L("InstalarEn"), { cls: "aw-pri", id: "en" })}</div>
        <label class="aw-res"><input type="checkbox" name="aw8k"> ${L("Res8k")}</label></div>${assinatura()}`;
    const olho = (on, acao, id, t) => `<button type="button" class="aw-t ${on ? "on" : ""}" data-acao="${acao}" data-id="${id}" title="${esc(t)}"><i class="fa-solid ${on ? "fa-eye" : "fa-eye-slash"}"></i></button>`;
    const estado = on => `<b class="aw-estado ${on ? "on" : ""}">${on ? L("On") : L("Off")}</b>`;
    const grupo = (chave, titulo, linhas, n) => `<section class="aw-g ${this._fechados.has(chave) ? "fechado" : ""}" data-g="${esc(chave)}">
        <h3 data-acao="dobrar" data-id="${esc(chave)}"><i class="fa-solid fa-chevron-down"></i> ${esc(titulo)} <small>${n}</small></h3><div class="aw-linhas">${linhas}</div></section>`;
    const fixos = d.nomesFixos.map(t => `<div class="aw-l" data-nome="${esc(nomeTela(t.getFlag(MOD, "id")).toLowerCase())}"><span>${esc(nomeTela(t.getFlag(MOD, "id")))}</span><em>${esc(tipoTela(t.getFlag(MOD, "rotulo")))}</em><span></span><span></span>${olho(!t.hidden, "tile", t.id, L("ColNome"))}</div>`).join("");
    const grupos = Object.entries(d.grupos).sort(([a], [b]) => a.localeCompare(b)).map(([ala, ls]) => grupo(`ala:${ala}`, ala ? nomeTela(ala) : L("Outros"), ls.sort((a, b) => a.nome.localeCompare(b.nome)).map(l => `
      <div class="aw-l ${l.secreto ? "secreto" : ""}" data-nome="${esc(l.nome.toLowerCase())}"><span>${esc(l.nome)}${l.descoberto ? ` <i class="fa-solid fa-check" title="${L("Descoberto")}"></i>` : ""}</span>
        ${olho(l.pin, "pin", l.id, L("ColPin"))}${olho(l.diario, "diario", l.id, L("ColDiario"))}${l.tile ? olho(!l.tile.hidden, "tile", l.tile.id, L("ColNome")) : "<span></span>"}</div>`).join(""), ls.length)).join("");
    return `${this._cabeca()}
      <div class="aw-acoes">
        <div class="aw-bloco"><h4>${L("GJogadores")}</h4><div class="aw-linha">
          ${botao("descobertos", "fa-map", L("Descobertos"))}${botao("tudo", "fa-eye", L("Tudo"))}${botao("nada", "fa-eye-slash", L("Nada"))}</div></div>
        <div class="aw-bloco"><h4>${L("GCidade")}</h4><div class="aw-linha">
          ${botao("casas", "fa-house-chimney-window", `${L("Casas")} ${estado(d.casasOn)}`)}${botao("raio", "fa-bolt", `${L("Raios")} ${estado(game.settings.get(MOD, "raio"))}`)}</div></div>
        <div class="aw-bloco"><h4>${L("GArrumar")}</h4><div class="aw-linha">
          ${botao("organizar", "fa-folder-tree", L("Organizar"), { cls: "aw-pri", dica: L("OrganizarDica") })}${botao("reparar", "fa-wand-magic-sparkles", L("Reparar"), { dica: L("RepararDica") })}
          ${d.temCampanha ? botao("campanha", "fa-trash", L("Campanha"), { cls: "aw-perigo" }) : ""}</div></div>
      </div>
      <div class="aw-barra"><input type="search" class="aw-busca" placeholder="${esc(L("Buscar"))}" value="${esc(this._filtro)}">
        <span class="aw-cols"><i class="fa-solid fa-location-dot" title="${esc(L("ColPin"))}"></i><i class="fa-solid fa-book-open" title="${esc(L("ColDiario"))}"></i><i class="fa-solid fa-font" title="${esc(L("ColNome"))}"></i></span></div>
      <div class="aw-lista">${grupo("fixos", L("Fixos"), fixos, d.nomesFixos.length)}${grupos}</div>
      ${assinatura()}`;
  }
  _replaceHTML(result, content) {
    const rolagem = content.querySelector(".aw-lista")?.scrollTop ?? 0;
    content.innerHTML = result;
    content.querySelectorAll("[data-acao]").forEach(b => b.addEventListener("click", ev => this._acao(ev.currentTarget.dataset, ev.currentTarget)));
    const busca = content.querySelector(".aw-busca");
    busca?.addEventListener("input", () => { this._filtro = busca.value; this._filtrar(content); });
    this._filtrar(content);
    const lista = content.querySelector(".aw-lista"); if (lista) lista.scrollTop = rolagem;
  }
  _filtrar(content) {
    const f = this._filtro.trim().toLowerCase();
    content.querySelectorAll(".aw-l").forEach(l => l.classList.toggle("oculto", !!f && !l.dataset.nome?.includes(f)));
    content.querySelectorAll(".aw-g").forEach(g => { g.classList.toggle("oculto", !!f && !g.querySelector(".aw-l:not(.oculto)")); g.classList.toggle("filtrando", !!f); });
  }
  async _trabalhar(el, fn) {                                       // botão ocupado enquanto a ação roda (as ações em lote demoram)
    el?.classList.add("aw-ocupado"); if (el) el.disabled = true;
    try { await fn(); } catch (e) { console.error(e); ui.notifications.error(`Westruun: ${e.message ?? e}`); } finally { this.render(); }
  }
  async _acao({ acao, id }, el) {
    if (acao === "dobrar") { this._fechados.has(id) ? this._fechados.delete(id) : this._fechados.add(id); return el.closest(".aw-g")?.classList.toggle("fechado"); }
    if (acao === "instalar") return instalar({ lang: id, resolucao: this.element.querySelector("[name=aw8k]")?.checked ? "8k" : "16k" }).then(() => this.render());
    if (acao === "reparar") return reparar();
    if (acao === "organizar") return this._trabalhar(el, () => organizarDiarios());
    if (acao === "raio") { await game.settings.set(MOD, "raio", !game.settings.get(MOD, "raio")); return this.render(); }
    if (acao === "campanha") {
      if (await confirmar(L("CampanhaTitulo"), `<p>${L("CampanhaTexto")}</p>`)) await removerCampanha();
      return this.render();
    }
    const d = this._dados(); if (!d) return;
    if (acao === "casas") return this._trabalhar(el, () => alternarLuzesCasas(d.cena));
    const setNivel = (l, nivel) => l.j.update({ "ownership.default": nivel });
    if (acao === "tile") { const t = d.cena.tiles.get(id); await t?.update({ hidden: !t.hidden }); }
    else if (acao === "pin") { const l = d.locais.find(x => x.id === id); await setNivel(l, l.pin ? NIVEIS.NONE : NIVEIS.LIMITED); }
    else if (acao === "diario") { const l = d.locais.find(x => x.id === id); await setNivel(l, l.diario ? NIVEIS.LIMITED : NIVEIS.OBSERVER); }
    else if (["descobertos", "tudo", "nada"].includes(acao)) return this._trabalhar(el, async () => {
      for (const l of d.locais) { const on = acao === "tudo" || (acao === "descobertos" && l.descoberto); await setNivel(l, on ? NIVEIS.OBSERVER : NIVEIS.NONE); if (l.tile) await l.tile.update({ hidden: !on }); }
    });
    this.render();
  }
}

/* ---------------------------------------------------------------- raios na torre ---------------------------------------------------------------- */
const Raio = {
  _t: null, _ocupado: false, NOME: `${MOD}-nuvem-torre`,
  NUVEM: "modules/JB2A_DnD5e/Library/3rd_Level/Call_Lightning/CallLightning_01_Blue_1000x1000.webm",
  RAIOS: ["modules/JB2A_DnD5e/Library/Generic/Lightning/LightningStrike01_01_Regular_Blue_800x800.webm", "modules/JB2A_DnD5e/Library/Generic/Lightning/LightningStrike01_02_Regular_Blue_800x800.webm"],
  async reiniciar() { clearTimeout(this._t); this._t = null; if (this._ocupado) return; this._ocupado = true; try { await this._reiniciar(); } finally { this._ocupado = false; } },
  async _reiniciar() {
    if (!game.user?.isGM || !game.modules.get("sequencer")?.active || !canvas.ready) return;
    const r = canvas.scene?.getFlag(MOD, "raio"), ligado = game.settings.get(MOD, "raio");
    const salvos = Object.values(canvas.scene?.flags?.sequencer?.effects ?? {}).map(e => Array.isArray(e) ? e[1] : e);
    const achar = () => Sequencer.EffectManager.getEffects({ name: this.NOME }), cenaId = canvas.scene?.id;
    let tem = achar().length > 0 || salvos.some(e => e?.name === this.NOME) || (this._criada?.cena === cenaId && Date.now() - this._criada.t < 15000);
    // logo que a cena abre o Sequencer ainda não devolveu os efeitos persistentes: espera um pouco antes de concluir que a nuvem não existe
    // (sem esta espera nascia uma nuvem nova a cada abertura da cena, e elas se empilhavam até virar uma mancha preta)
    if (r && ligado && !tem && game.user === game.users.activeGM) { await new Promise(ok => setTimeout(ok, 2500)); if (canvas.scene?.id !== cenaId) return; tem = achar().length > 0; }
    if (r && ligado && !tem && game.user === game.users.activeGM) {
      this._criada = { cena: canvas.scene.id, t: Date.now() };
      const k = r.escala ?? 1;
      await new Sequence({ moduleName: MOD }).effect().name(this.NOME).file(this.NUVEM).atLocation({ x: r.x, y: r.y }).size({ width: 1150 * k, height: 1150 * k }).opacity(0.5).persist().belowTokens(false).play();
    } else if ((!r || !ligado) && tem) await Sequencer.EffectManager.endEffects({ name: this.NOME });
    if (r && ligado) this._agenda();
    // garante uma nuvem só (o Sequencer às vezes duplica quando a cena é redesenhada logo depois de criada)
    setTimeout(() => this.umaSo(), 3000);
  },
  /* fica só a nuvem mais antiga; as repetidas (de versões anteriores do módulo) são encerradas pelo identificador */
  async umaSo() {
    if (game.user !== game.users.activeGM || !game.modules.get("sequencer")?.active) return 0;
    const es = Sequencer.EffectManager.getEffects({ name: this.NOME }).sort((a, b) => (a.data.creationTimestamp ?? 0) - (b.data.creationTimestamp ?? 0));
    if (es.length > 1) await Sequencer.EffectManager.endEffects({ effects: es.slice(1).map(e => e.id) });
    return Math.max(0, es.length - 1);
  },
  _agenda() { const min = game.settings.get(MOD, "raioMin"), max = Math.max(min + 1, game.settings.get(MOD, "raioMax"));
    this._t = setTimeout(() => { this.cair().finally(() => this._agenda()); }, (min + Math.random() * (max - min)) * 1000); },
  async cair() {
    const cena = canvas.scene, r = cena?.getFlag(MOD, "raio");
    if (!r || !game.modules.get("sequencer")?.active || !game.settings.get(MOD, "raio") || game.user !== game.users.activeGM) return;
    const k = r.escala ?? 1, dx = (Math.random() - 0.5) * 220 * k, dy = (Math.random() - 0.5) * 220 * k, seq = new Sequence({ moduleName: MOD });
    seq.effect().file(this.RAIOS[Math.floor(Math.random() * this.RAIOS.length)]).atLocation({ x: r.x + dx, y: r.y + dy }).size({ width: 900 * k, height: 900 * k }).randomRotation().belowTokens(false);
    const lista = cena.getFlag(MOD, "trovoes"), trovao = lista?.length ? lista[Math.floor(Math.random() * lista.length)] : cena.getFlag(MOD, "trovao");   // sorteia um dos trovões
    if (trovao) seq.sound().file(trovao).volume(0.5).delay(250 + Math.random() * 900);
    await seq.play();
  }
};
Hooks.on("canvasReady", () => Raio.reiniciar());
/* clima: com o FXMaster ativo, a cena de Westruun ganha (ou religa) as nuvens, a chuva, a névoa e os pássaros na primeira vez que o mestre a abre */
Hooks.on("canvasReady", async () => {
  const cena = canvas.scene; if (game.user !== game.users.activeGM || !cena?.getFlag(MOD, "mapa")) return;
  try {
    if (!cena.getFlag(MOD, "rotulosOk")) { await consertarRotulos(cena); await cena.setFlag(MOD, "rotulosOk", true); }   // título cortado no alto do mapa (cenas criadas antes da 0.3.0)
    if (!cena.getFlag(MOD, "climaOk")) await garantirClima(cena);
    if (!cena.getFlag(MOD, "nuvensOk")) await garantirNuvens(cena);
  } catch (e) { console.warn("Westruun: não consegui acertar a cena.", e); }
});

/* ---------------------------------------------------------------- dia e noite ---------------------------------------------------------------- */
function escuridaoPorHora(h) {
  if (h >= 8 && h < 17.5) return 0;
  if (h >= 17.5 && h < 20.5) return (h - 17.5) / 3 * 0.75;
  if (h >= 20.5 || h < 5) return 0.75;
  return 0.75 - (h - 5) / 3 * 0.75;
}
Hooks.on("updateWorldTime", async worldTime => {
  if (game.user !== game.users.activeGM || !game.settings.get(MOD, "ciclo")) return;
  const cena = cenaWestruun(); if (!cena) return;
  const dia = game.time.calendar?.days?.hoursPerDay ? game.time.calendar.days.hoursPerDay * 3600 : 86400;
  const alvo = Math.round(escuridaoPorHora(((worldTime % dia) + dia) % dia / 3600) * 100) / 100;
  if (Math.abs((cena.environment.darknessLevel ?? 0) - alvo) >= 0.02) await cena.update({ "environment.darknessLevel": alvo }, { animateDarkness: 4000 });
});

/* ---------------------------------------------------------------- compêndio (Aventura) ---------------------------------------------------------------- */
async function exportarAventura({ lang = "pt" } = {}) {
  const pack = game.packs.get(`${MOD}.westruun-${lang}`); if (!pack) return ui.notifications.error(L("SemCompendio"));
  if (pack.locked) await pack.configure({ locked: false });
  const raiz = game.folders.filter(f => (f.getFlag(MOD, "raiz") || f.getFlag(MOD, "campanha")) && !f.folder);
  const pastas = new Set(); const juntar = f => { pastas.add(f); f.children.forEach(c => juntar(c.folder)); }; raiz.forEach(juntar);
  const ids = new Set([...pastas].map(f => f.id)), dentro = d => ids.has(d.folder?.id);
  const data = { scenes: game.scenes.filter(dentro), journal: game.journal.filter(dentro), playlists: game.playlists.filter(dentro), actors: game.actors.filter(dentro) };
  for (const old of await pack.getDocuments()) await old.delete();
  await Adventure.create({ name: lang === "pt" ? "Westruun — A Cidade (Tal'Dorei)" : "Westruun — The City (Tal'Dorei)", img: `${ROOT}/assets/mapa/capa.webp`, caption: "Arcano Lab",
    description: lang === "pt" ? "<p>Westruun em 16k com todos os locais, NPCs com ficha, cenas internas, nomes que o mestre revela aos poucos, luzes de dia e noite, trilhas e raios na Torre de Ardósia.</p>"
      : "<p>Westruun in 16k with every location, statted NPCs, interior scenes, names the GM reveals one by one, day and night lighting, music and lightning over Greystone Tower.</p>",
    scenes: data.scenes.map(d => d.toObject()), journal: data.journal.map(d => d.toObject()), playlists: data.playlists.map(d => d.toObject()),
    actors: data.actors.map(d => d.toObject()), folders: [...pastas].map(f => f.toObject()), sort: 0 }, { pack: pack.collection });
  await pack.configure({ locked: true });
  ui.notifications.info(L("Exportada", { nome: pack.title, cenas: data.scenes.length, diarios: data.journal.length, atores: data.actors.length, playlists: data.playlists.length }));
}

// ---- Níveis (19/11/2026): JOGADOR não interage com token de OUTRO andar. Com os andares de cima recortados, os tokens de baixo ficavam "clicáveis":
// ao passar o mouse aparecia a moldura e o nome de quem estava no térreo. Para quem não é mestre, token de outro nível não recebe mouse nem mostra nome.
Hooks.on("refreshToken", token => {
  if (game.user.isGM) return;
  const nv = canvas.level?.id, doNivel = token.document.level;
  const outro = !!(nv && doNivel && doNivel !== nv);
  if (outro) { token.eventMode = "none"; token.interactive = false; if (token.nameplate) token.nameplate.visible = false; if (token.tooltip) token.tooltip.visible = false; if (token.bars) token.bars.visible = false; if (token.border) token.border.visible = false; }
  else if (token.eventMode === "none") { token.eventMode = "static"; token.interactive = true; }
});
