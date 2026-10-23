// Renders the localized pages (home, download, pro, phone guide) for every language in site-src/i18n into site/.
// English lives at the root; other languages under /<lang>/. Run: node site-src/build.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SITE = "https://desktopsteward.com";
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const langs = fs.readdirSync(path.join(ROOT, "site-src/i18n")).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "site-src/i18n", f), "utf8")));
const byLang = Object.fromEntries(langs.map((l) => [l.lang, l]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const prefix = (lang) => (lang === "en" ? "" : `/${lang}`);
const url = (lang, p) => `${SITE}${prefix(lang)}${p}`;
const links = (lang) => ({ chatgpt: `${prefix(lang)}/chatgpt/`, home: `${prefix(lang)}/`, download: `${prefix(lang)}/download/`, pro: `${prefix(lang)}/pro/`, phone: `${prefix(lang)}/guides/${byLang[lang].phone.slug}/`, security: "/security/", privacy: "/privacy/", guides: "/guides/" });
const fill = (s, L) => String(s).replace(/\{(home|download|pro|phone|chatgpt|security|privacy|guides|version)\}/g, (_, k) => (k === "version" ? VERSION : L[k]));

function head(t, lang, pagePath, title, desc, extra = "") {
  const alternates = langs.map((l) => `<link rel="alternate" hreflang="${l.lang}" href="${url(l.lang, pagePath(l))}">`).join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${url("en", pagePath(byLang.en))}">`;
  return `<!doctype html>
<html lang="${lang}" dir="${t.dir}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url(lang, pagePath(t))}">
${alternates}
<link rel="icon" href="/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="/style.css">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url(lang, pagePath(t))}"><meta property="og:image" content="${SITE}/icon.png">
${extra}
</head>
<body>
<div class="orbs" aria-hidden="true"><span></span><span></span><span></span></div>
<div class="grid-bg" aria-hidden="true"></div>
<div class="wrap">`;
}
function header(t, L, navItems) {
  return `<header><a class="logo" href="${L.home}"><img src="/icon.png" alt="Desktop Steward" width="32" height="32"> Desktop Steward</a><nav aria-label="Main">${navItems.map(([h, l]) => `<a href="${h}">${l}</a>`).join("")}<a class="btn" href="${L.download}">${t.nav.download}</a></nav></header>`;
}
function footer(t, L, lang, pagePath) {
  const switcher = langs.map((l) => (l.lang === lang ? `<b>${l.name}</b>` : `<a href="${url(l.lang, pagePath(l)).replace(SITE, "")}" hreflang="${l.lang}">${l.name}</a>`)).join(" · ");
  return `<footer><div class="links"><a href="${L.download}">${t.nav.download}</a><a href="${L.pro}">${t.nav.pro}</a><a href="${L.guides}">${t.nav.guides}</a><a href="${L.security}">${t.nav.security}</a><a href="${L.privacy}">${t.nav.privacy}</a><a href="https://github.com/desktopsteward/desktop-steward">GitHub</a><a href="mailto:hello@desktopsteward.com">${t.nav.contact}</a></div>
<p>${t.footer.rights}</p>
<p style="margin-top:10px"><span style="color:var(--muted)">${t.footer.languages}:</span> ${switcher}</p></footer>
</div>`;
}
const card = (h, p) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`;
const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>`;
const clientIcons = [
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>`,
];
const outIcons = [
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`,
];
const icons = [`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`, `<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>`, `<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>`, `<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`, `<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h6"/>`];

function home(t, lang) {
  const L = links(lang); const h = t.home; const pp = (l) => "/";
  const faqLd = JSON.stringify({ "@context": "https://schema.org", "@graph": [
    { "@type": "SoftwareApplication", name: "Desktop Steward", url: url(lang, "/"), applicationCategory: "UtilitiesApplication", operatingSystem: "macOS, Windows", softwareVersion: VERSION, downloadUrl: `${SITE}/downloads/desktop-steward-${VERSION}-mac.mcpb`, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, description: h.desc, publisher: { "@type": "Organization", name: "ED&EU LTD", url: SITE, email: "hello@desktopsteward.com" } },
    { "@type": "FAQPage", mainEntity: h.faq.items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: fill(a, L).replace(/<[^>]+>/g, "") } })) } ] });
  return head(t, lang, pp, h.title, h.desc, `<link rel="alternate" type="text/markdown" href="${SITE}/index.md">\n<script type="application/ld+json">${faqLd}</script>`) +
header(t, L, [["#how", t.nav.how], ["#safety", t.nav.safety], [L.chatgpt, t.nav.chatgpt], ["#compare", t.nav.compare], ["#faq", t.nav.faq], [L.pro, t.nav.pro]]) + `
<main>
<section class="hero" id="top">
  <div>
    <span class="pill"><i></i> ${h.pill}</span>
    <h1>${h.h1a}<em>${h.h1b}</em></h1>
    <p class="lead">${h.lead}</p>
    <div class="choose" role="tablist" aria-label="${esc(h.choose.title)}"><span class="choose-title">${h.choose.title}</span>
      <button class="choice" data-for="claude" role="tab" aria-selected="true"><b>${h.choose.claude[0]}</b><small>${h.choose.claude[1]}</small></button>
      <button class="choice" data-for="chatgpt" role="tab" aria-selected="false"><b>${h.choose.chatgpt[0]}</b><small>${h.choose.chatgpt[1]}</small></button></div>
    <div class="cta"><a class="btn" href="${L.download}">${h.cta}</a><a class="btn ghost" href="#how">${h.cta2}</a></div>
    <div class="trust">${h.trust.map((x) => `<span>${check} ${x}</span>`).join("")}</div>
  </div>
  <div class="diagram" aria-label="${esc(h.diagram.center[0])}">
    <div class="d-row d-clients">${h.diagram.clients.map(([a, b], i) => `<div class="d-node"><div class="d-tile t${i}">${clientIcons[i]}</div><b>${a}</b><small>${b}</small></div>`).join("")}</div>
    <svg class="d-lines" viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true">${[50, 150, 250, 350].map((x) => `<path d="M${x} 0 C ${x} 60, 200 40, 200 110" fill="none" stroke="rgba(124,179,255,.35)" stroke-width="1.5"/><circle r="3" fill="#7cb3ff"><animateMotion dur="${2.4 + x / 500}s" repeatCount="indefinite" path="M${x} 0 C ${x} 60, 200 40, 200 110"/></circle>`).join("")}</svg>
    <div class="d-center"><div class="d-core"><img src="/icon.png" alt=""></div><b>${h.diagram.center[0]}</b><small>${h.diagram.center[1]}</small></div>
    <svg class="d-lines" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden="true">${[66, 200, 334].map((x) => `<path d="M200 0 C 200 40, ${x} 30, ${x} 70" fill="none" stroke="rgba(74,222,128,.35)" stroke-width="1.5"/><circle r="3" fill="#4ade80"><animateMotion dur="${2.2 + x / 700}s" repeatCount="indefinite" path="M200 0 C 200 40, ${x} 30, ${x} 70"/></circle>`).join("")}</svg>
    <div class="d-row d-outputs">${h.diagram.outputs.map((o, i) => `<div class="d-out">${outIcons[i]} ${o}</div>`).join("")}</div>
    <p class="d-note">${h.diagram.note}</p>
  </div>
</section>
<section id="how" class="reveal"><p class="eyebrow">${h.how.eyebrow}</p><h2>${h.how.h2}</h2>
<div class="tabs" role="tablist"><button class="tab" data-for="claude" aria-selected="true">${h.how.claudeTab}</button><button class="tab" data-for="chatgpt" aria-selected="false">${h.how.chatgptTab}</button></div>
<div class="path" data-path="claude"><p class="sub">${h.how.sub}</p><div class="steps">${h.how.steps.map(([a, b]) => `<div><h3>${a}</h3><p>${b}</p></div>`).join("")}</div></div>
<div class="path" data-path="chatgpt" hidden><p class="sub">${h.how.chatgptSub}</p><div class="steps">${h.how.chatgptSteps.map(([a, b]) => `<div><h3>${a}</h3><p>${b}</p></div>`).join("")}</div><p class="note"><a class="btn ghost" href="${L.chatgpt}">${h.how.chatgptCta} →</a></p></div>
</section>
<section id="look" class="reveal"><p class="eyebrow">${h.look.eyebrow}</p><h2>${h.look.h2}</h2><p class="sub">${h.look.sub}</p>
  <div class="demo" aria-label="${esc(h.look.h2)}">
    <div class="bar"><i></i><i></i><i></i><b>Claude</b> · Desktop Steward</div>
    <div class="msgs" id="msgs"></div>
    <div class="dialog" id="dlg" role="img" aria-label="${esc(h.dialog.text)}"><img src="/icon.png" alt=""><div><b>${h.dialog.title}</b><p>${h.dialog.text}</p></div><div class="btns"><span class="pri">${h.dialog.deny}</span><span class="ok">${h.dialog.allow}</span></div></div>
  </div>
</section>
<section id="safety" class="reveal"><p class="eyebrow">${h.safety.eyebrow}</p><h2>${h.safety.h2}</h2><p class="sub">${h.safety.sub}</p><div class="grid">${h.safety.cards.map(([a, b], i) => `<div class="card"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[i] ?? icons[0]}</svg></div><h3>${a}</h3><p>${b}</p></div>`).join("")}</div><p class="note">${fill(h.safety.note, L)}</p></section>
<section id="tasks" class="reveal"><p class="eyebrow">${h.tasks.eyebrow}</p><h2>${h.tasks.h2}</h2><p class="sub">${h.tasks.sub}</p><div class="grid">${h.tasks.cards.map(([a, b]) => card(a, b)).join("")}</div></section>
<section id="compare" class="reveal"><p class="eyebrow">${h.compare.eyebrow}</p><h2>${h.compare.h2}</h2><p class="sub">${h.compare.sub}</p>
<table><thead><tr>${h.compare.head.map((x) => `<th scope="col">${x}</th>`).join("")}</tr></thead><tbody>${h.compare.rows.map(([f, a, b, ya, yb]) => `<tr><td>${f}</td><td class="${ya ? "yes" : "no"}">${a}</td><td class="${yb ? "yes" : "no"}">${b}</td></tr>`).join("")}</tbody></table></section>
<section id="faq" class="reveal"><p class="eyebrow">${h.faq.eyebrow}</p><h2>${h.faq.h2}</h2>${h.faq.items.map(([q, a]) => `<details><summary>${q}</summary><p>${fill(a, L)}</p></details>`).join("\n")}</section>
<section class="final reveal"><h2>${h.final.h2}</h2><p class="sub" style="margin:0 auto 26px">${h.final.sub}</p><a class="btn" href="${L.download}">${h.final.cta}</a><p class="note">${fill(h.final.note, L)}</p></section>
</main>
${footer(t, L, lang, pp)}
<script>window.DS_DEMO=${JSON.stringify(h.demo)};</script>
<script src="/app.js" defer></script>
</body></html>`;
}

function download(t, lang) {
  const L = links(lang); const d = t.download; const pp = (l) => "/download/";
  const steps = (xs) => `<div class="steps">${xs.map(([a, b]) => `<div><h3>${a}</h3><p>${b}</p></div>`).join("")}</div>`;
  return head(t, lang, pp, d.title, d.desc) + header(t, L, [[L.pro, t.nav.pro], [L.security, t.nav.security], [L.home, t.nav.home]]) + `
<main>
<div class="hero" style="grid-template-columns:1fr;padding-bottom:12px"><div><h1>${d.h1}</h1><p class="lead">${fill(d.lead, L)}</p></div></div>
<section style="padding-top:0"><h2 style="font-size:22px">${d.whichH2}</h2><ul class="which">${d.which.map((x) => `<li>${x}</li>`).join("")}</ul></section>
<section id="extension"><h2>${d.extH2}</h2>
<div class="cta"><a class="btn" href="/downloads/desktop-steward-${VERSION}-mac.mcpb">${d.mac}</a><a class="btn ghost" href="/downloads/desktop-steward-${VERSION}-windows.mcpb">${d.win}</a></div><p class="note">${d.note}</p>
<h3 class="sub-h">${d.h2}</h3>${steps(d.steps)}</section>
<section id="app"><h2>${d.appH2}</h2><p class="lead" style="max-width:760px">${d.appLead}</p>
<div class="cta"><a class="btn" href="/downloads/app/mac">${d.appMac}</a><a class="btn ghost" href="/downloads/app/windows">${d.appWin}</a></div><p class="note">${d.appNote}</p>
${steps(d.appSteps)}</section>
<section><h2>${d.uninstallH2}</h2><p class="note">${d.uninstall}</p></section>
</main>
${footer(t, L, lang, pp)}
</body></html>`;
}

function pro(t, lang) {
  const L = links(lang); const p = t.pro; const pp = (l) => "/pro/";
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "Desktop Steward Pro", description: p.desc, brand: { "@type": "Brand", name: "Desktop Steward" }, offers: { "@type": "Offer", price: "10", priceCurrency: "USD", url: url(lang, "/pro/"), availability: "https://schema.org/InStock" } });
  return head(t, lang, pp, p.title, p.desc, `<script type="application/ld+json">${ld}</script>\n<style>.price{font-size:48px;font-weight:800;letter-spacing:-.03em}.price small{font-size:18px;color:var(--muted);font-weight:600}form input{width:100%;font-size:17px;padding:13px;border-radius:12px;border:1px solid var(--line);background:#0c1018;color:#fff;margin:10px 0}form button{width:100%}.beta{border:1px solid rgba(74,222,128,.4);background:rgba(74,222,128,.08);border-radius:12px;padding:14px 18px;margin:18px 0}</style>`) +
header(t, L, [[L.guides, t.nav.guides], [L.security, t.nav.security]]) + `
<main>
<div class="hero"><div><p class="eyebrow">${p.eyebrow}</p><h1>${p.h1}</h1><p class="lead">${p.lead}</p><p class="price">${p.price} <small>${p.priceNote}</small></p><div class="beta">${p.trial}</div><ul class="rules">${p.bullets.map((b) => `<li>${b}</li>`).join("")}</ul></div>
<div class="card" id="buy"><h3>${p.buyH3}</h3><p style="color:var(--muted);font-size:15px">${p.buyNote}</p><form id="f"><input type="email" name="email" placeholder="${esc(p.email)}" required autocomplete="email"><button class="btn" type="submit">${p.buy}</button></form><p class="note" id="msg">${p.payNote}</p></div></div>
<section><h2>${p.howH2}</h2><div class="steps">${p.steps.map(([a, b]) => `<div><h3>${a}</h3><p>${fill(b, L)}</p></div>`).join("")}</div></section>
</main>
${footer(t, L, lang, pp)}
<script>
document.getElementById("f").addEventListener("submit", async (e) => { e.preventDefault(); const msg = document.getElementById("msg"); msg.textContent = ${JSON.stringify(p.opening)};
  try { const r = await fetch("https://relay.desktopsteward.com/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e.target.email.value }) }); const j = await r.json(); if (j.ok) location.href = j.url; else msg.textContent = j.error || ${JSON.stringify(p.unavailable)}; } catch { msg.textContent = ${JSON.stringify(p.unavailable)}; } });
</script>
</body></html>`;
}

function phone(t, lang) {
  const L = links(lang); const g = t.phone; const pp = (l) => `/guides/${l.phone.slug}/`;
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.desc, datePublished: "2026-10-23", inLanguage: lang, author: { "@type": "Organization", name: "ED&EU LTD" }, publisher: { "@type": "Organization", name: "ED&EU LTD", logo: { "@type": "ImageObject", url: `${SITE}/icon.png` } }, mainEntityOfPage: url(lang, pp(t)) });
  const chat = (pairs) => `<div class="chat">${pairs.map((x, i) => `<p class="${i % 2 ? "a" : "u"}">${x}</p>`).join("")}</div>`;
  return head(t, lang, pp, g.title, g.desc, `<script type="application/ld+json">${ld}</script>\n<style>article{max-width:760px}article h2{font-size:26px;margin:36px 0 10px}article p,article li{color:#d8dde7;margin:10px 0}article li{margin-left:20px}article .tip{background:var(--panel);border:1px solid var(--panel-b);border-left:3px solid var(--accent);border-radius:12px;padding:14px 18px;margin:18px 0}article .chat{background:var(--panel);border:1px solid var(--panel-b);border-radius:14px;padding:14px 18px;font-size:15px;margin:16px 0}article .chat p{margin:6px 0}article .chat .u{color:var(--fg);font-weight:600}article .chat .a{color:var(--muted)}</style>`) +
header(t, L, [[L.guides, t.nav.guides], [L.security, t.nav.security]]) + `
<main><article>
<div class="hero" style="grid-template-columns:1fr;padding-bottom:10px"><div><p class="eyebrow">${g.eyebrow}</p><h1 style="font-size:clamp(30px,4.5vw,44px)">${g.h1}</h1><p class="lead">${g.lead}</p></div></div>
<h2>${g.needH2}</h2><ul>${g.need.map((x) => `<li>${fill(x, L)}</li>`).join("")}</ul>
<div class="tip">${fill(g.tip1, L)}</div>
<h2>${g.s1H2}</h2><ol style="margin-left:20px">${g.s1.map((x) => `<li>${x}</li>`).join("")}</ol>${chat(g.s1chat)}<p>${g.s1note}</p>
<h2>${g.s2H2}</h2><p><strong>${g.s2app}</strong></p><ol style="margin-left:20px">${g.s2.map((x) => `<li>${x}</li>`).join("")}</ol><p>${g.s2web}</p><p>${g.s2gpt}</p>
<h2>${g.s3H2}</h2>${chat(g.s3chat)}<p>${g.s3note}</p>
<h2>${g.okH2}</h2><p>${g.ok}</p>
<h2>${g.fixH2}</h2><ul>${g.fix.map((x) => `<li>${x}</li>`).join("")}</ul>
<h2>${g.offH2}</h2><p>${g.off}</p>
<section class="final" style="padding:50px 0 30px"><h2>${g.finalH2}</h2><p class="sub" style="margin:0 auto 22px">${g.finalSub}</p><a class="btn" href="${L.download}">${g.finalCta}</a></section>
</article></main>
${footer(t, L, lang, pp)}
</body></html>`;
}

function chatgpt(t, lang) {
  const L = links(lang); const g = t.chatgpt; const pp = (l) => `/${l.chatgpt.slug}/`;
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "HowTo", name: g.h1, description: g.desc, inLanguage: lang, step: [...g.s1, ...g.s2].map((x, i) => ({ "@type": "HowToStep", position: i + 1, text: x.replace(/<[^>]+>/g, "") })) });
  const chat = (pairs) => `<div class="chat">${pairs.map((x, i) => `<p class="${i % 2 ? "a" : "u"}">${x}</p>`).join("")}</div>`;
  return head(t, lang, pp, g.title, g.desc, `<script type="application/ld+json">${ld}</script>\n<style>article{max-width:760px}article h2{font-size:26px;margin:36px 0 10px}article p,article li{color:#d8dde7;margin:10px 0}article li{margin-left:20px}article .tip{background:var(--panel);border:1px solid var(--panel-b);border-left:3px solid var(--accent);border-radius:12px;padding:14px 18px;margin:18px 0}article .chat{background:var(--panel);border:1px solid var(--panel-b);border-radius:14px;padding:14px 18px;font-size:15px;margin:16px 0}article .chat p{margin:6px 0}article .chat .u{color:var(--fg);font-weight:600}article .chat .a{color:var(--muted)}</style>`) +
header(t, L, [[L.phone, t.nav.guides], [L.pro, t.nav.pro]]) + `
<main><article>
<div class="hero" style="grid-template-columns:1fr;padding-bottom:10px"><div><p class="eyebrow">${g.eyebrow}</p><h1 style="font-size:clamp(30px,4.5vw,44px)">${g.h1}</h1><p class="lead">${g.lead}</p></div></div>
<h2>${g.needH2}</h2><ul>${g.need.map((x) => `<li>${fill(x, L)}</li>`).join("")}</ul>
<h2>${g.s1H2}</h2><ol style="margin-left:20px">${g.s1.map((x) => `<li>${fill(x, L)}</li>`).join("")}</ol>
<h2>${g.s2H2}</h2><ol style="margin-left:20px">${g.s2.map((x) => `<li>${x}</li>`).join("")}</ol>
<h2>${g.s3H2}</h2>${chat(g.s3chat)}<p>${g.s3note}</p>
<h2>${g.whyH2}</h2><p>${g.why}</p>
<h2>${g.fixH2}</h2><ul>${g.fix.map((x) => `<li>${x}</li>`).join("")}</ul>
<h2>${g.proH2}</h2><p>${fill(g.pro, L)}</p>
<section class="final" style="padding:50px 0 30px"><h2>${g.finalH2}</h2><p class="sub" style="margin:0 auto 22px">${g.finalSub}</p><a class="btn" href="${L.download}">${g.finalCta}</a></section>
</article></main>
${footer(t, L, lang, pp)}
</body></html>`;
}

const write = (rel, html) => { const f = path.join(ROOT, "site", rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };
const sitemapExtra = [];
write("downloads/latest.json", JSON.stringify({ version: VERSION, page: `${SITE}/download/`, mac: `${SITE}/downloads/app/mac`, windows: `${SITE}/downloads/app/windows`, extensionMac: `${SITE}/downloads/desktop-steward-${VERSION}-mac.mcpb`, extensionWindows: `${SITE}/downloads/desktop-steward-${VERSION}-windows.mcpb` }) + "\n");
for (const t of langs) {
  const p = prefix(t.lang);
  write(`${p}/index.html`, home(t, t.lang));
  write(`${p}/download/index.html`, download(t, t.lang));
  write(`${p}/pro/index.html`, pro(t, t.lang));
  write(`${p}/guides/${t.phone.slug}/index.html`, phone(t, t.lang));
  write(`${p}/${t.chatgpt.slug}/index.html`, chatgpt(t, t.lang));
  if (t.lang !== "en") sitemapExtra.push(`${p}/`, `${p}/download/`, `${p}/pro/`, `${p}/guides/${t.phone.slug}/`, `${p}/${t.chatgpt.slug}/`);
}
// sitemap: keep English entries from the hand-written list, add localized ones
const sm = path.join(ROOT, "site/sitemap.xml");
let xml = fs.readFileSync(sm, "utf8").replace(/<url><loc>https:\/\/desktopsteward\.com\/[a-z]{2}\/[^<]*<\/loc><\/url>\n?/g, "");
xml = xml.replace("</urlset>", sitemapExtra.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join("\n") + "\n</urlset>");
fs.writeFileSync(sm, xml);
console.log(`built ${langs.length} language(s):`, langs.map((l) => l.lang).join(" "));
