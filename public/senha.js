/* Olhinho para mostrar/esconder a senha em todos os campos de senha */
(function () {
  var OLHO = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var FECHADO = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9"/><path d="M9.9 4.2A9.6 9.6 0 0 1 12 4c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
  function aplicar(inp) {
    if (inp.dataset.olho) return; inp.dataset.olho = '1';
    var box = document.createElement('div');
    box.style.cssText = 'position:relative';
    inp.parentNode.insertBefore(box, inp); box.appendChild(inp);
    inp.style.paddingRight = '52px';
    var b = document.createElement('button');
    b.type = 'button'; b.innerHTML = OLHO; b.setAttribute('aria-label', 'Mostrar senha');
    b.style.cssText = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:none;background:transparent;color:#6B7280;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:10px';
    b.addEventListener('click', function () {
      var mostrar = inp.type === 'password';
      inp.type = mostrar ? 'text' : 'password';
      b.innerHTML = mostrar ? FECHADO : OLHO;
      b.setAttribute('aria-label', mostrar ? 'Esconder senha' : 'Mostrar senha');
      inp.focus();
    });
    box.appendChild(b);
  }
  function tudo() { document.querySelectorAll('input[type="password"]').forEach(aplicar); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tudo); else tudo();
})();
