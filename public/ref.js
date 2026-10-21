/* Indique e ganhe: guarda o código do link (?ref=) por 30 dias e avisa o servidor da visita */
(function () {
  var CHAVE = 'vunby_ref';
  function ler() {
    try { var v = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (v && v.ate > Date.now()) return v; } catch (e) {}
    return null;
  }
  var codigo = null;
  try { codigo = new URLSearchParams(location.search).get('ref'); } catch (e) {}
  if (codigo && /^[A-Za-z0-9-]{3,24}$/.test(codigo)) {
    codigo = codigo.toLowerCase();
    var salvo = { c: codigo, ate: Date.now() + 30 * 864e5, bonus: 7 };
    try { localStorage.setItem(CHAVE, JSON.stringify(salvo)); } catch (e) {}
    fetch('/api/ref/visita', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: codigo }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.valido) { try { localStorage.removeItem(CHAVE); } catch (e) {} } })
      .catch(function () {});
  }
  window.VunbyRef = { codigo: function () { var v = ler(); return v ? v.c : null; } };

  // Contador de visitas (sem cookie): de onde a pessoa veio
  window.VunbyVisita = function (pagina) {
    var o = 'direto', q;
    try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
    var r = '';
    try { r = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    if (q && q.get('ref')) o = 'ref:' + q.get('ref');
    else if (q && (q.get('gclid') || /google/i.test(q.get('utm_source') || ''))) o = 'google-ads';
    else if (q && q.get('utm_source')) o = q.get('utm_source');
    else if (/google\./.test(r)) o = 'google';
    else if (/instagram|facebook|fb\./.test(r)) o = 'instagram-facebook';
    else if (/whatsapp|wa\.me/.test(r)) o = 'whatsapp';
    else if (r && r !== location.hostname) o = r.replace(/^www\./, '');
    else if (r === location.hostname) o = 'site';
    try {
      fetch('/api/v', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: pagina, o: o }) }).catch(function () {});
    } catch (e) {}
  };
})();
