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
})();
