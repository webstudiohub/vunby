/* Cortar e dar zoom na imagem antes de usar como logo.
   VunbyCortar(file) -> Promise<dataURL | null>  (null = cancelou) */
(function () {
  function carregar(file) {
    return new Promise(function (ok, erro) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { erro(new Error('Não foi possível ler essa imagem.')); };
      img.src = URL.createObjectURL(file);
    });
  }

  window.VunbyCortar = function (file) {
    return carregar(file).then(function (img) {
      return new Promise(function (resolver) {
        var png = file.type !== 'image/jpeg';
        var fundo = document.createElement('div');
        fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-modal', 'true'); fundo.setAttribute('aria-label', 'Ajustar a imagem');
        fundo.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(7,15,35,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;color:#fff;font-family:inherit';
        fundo.innerHTML =
          '<div style="width:100%;max-width:420px">' +
          '<div style="font-size:20px;font-weight:800;margin-bottom:4px">Ajuste a sua logo</div>' +
          '<div style="font-size:15px;opacity:.8;margin-bottom:12px">Arraste para mover. Use o controle ou dois dedos para dar zoom.</div>' +
          '<canvas style="width:100%;aspect-ratio:1/1;border-radius:14px;touch-action:none;background:#111;display:block"></canvas>' +
          '<div style="display:flex;gap:8px;margin:14px 0 10px">' +
          '<button type="button" data-fmt="1" style="flex:1;min-height:44px;border-radius:10px;border:2px solid #E8B931;background:#E8B931;color:#0B1E4A;font-weight:800;font-family:inherit;font-size:15px">Quadrada</button>' +
          '<button type="button" data-fmt="2" style="flex:1;min-height:44px;border-radius:10px;border:2px solid rgba(255,255,255,.5);background:transparent;color:#fff;font-weight:800;font-family:inherit;font-size:15px">Retangular</button></div>' +
          '<label style="display:flex;align-items:center;gap:10px;margin:0 0 14px;color:#fff;font-weight:600">Zoom <input type="range" min="1" max="4" step="0.01" value="1" style="flex:1;padding:0;border:none;background:transparent;-webkit-appearance:auto;appearance:auto"/></label>' +
          '<div style="display:flex;gap:10px">' +
          '<button type="button" data-cancelar style="flex:1;min-height:48px;border-radius:12px;border:2px solid rgba(255,255,255,.5);background:transparent;color:#fff;font-weight:800;font-family:inherit;font-size:16px">Cancelar</button>' +
          '<button type="button" data-usar style="flex:1;min-height:48px;border-radius:12px;border:none;background:#E8B931;color:#0B1E4A;font-weight:800;font-family:inherit;font-size:16px">Usar imagem</button></div></div>';
        document.body.appendChild(fundo);

        var cv = fundo.querySelector('canvas'), ctx = cv.getContext('2d');
        var zoomEl = fundo.querySelector('input[type=range]');
        var dpr = Math.min(window.devicePixelRatio || 1, 3);
        var W = 0, aspecto = 1, fw, fh, fx, fy, base, zoom = 1, ox = 0, oy = 0;

        function medir() {
          W = cv.clientWidth; cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr);
          fw = W * 0.86; fh = fw / aspecto; fx = (W - fw) / 2; fy = (W - fh) / 2;
          base = Math.max(fw / img.width, fh / img.height);   // escala mínima que cobre a moldura
        }
        function escala() { return base * zoom; }
        function limitar() {
          var s = escala(), iw = img.width * s, ih = img.height * s;
          ox = Math.min(fx, Math.max(fx + fw - iw, ox));
          oy = Math.min(fy, Math.max(fy + fh - ih, oy));
        }
        function centralizar() {
          var s = escala(); ox = (W - img.width * s) / 2; oy = (W - img.height * s) / 2; limitar();
        }
        function desenhar() {
          var s = escala();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, W, W);
          ctx.drawImage(img, ox, oy, img.width * s, img.height * s);
          ctx.fillStyle = 'rgba(0,0,0,.55)';
          ctx.fillRect(0, 0, W, fy); ctx.fillRect(0, fy + fh, W, W - fy - fh);
          ctx.fillRect(0, fy, fx, fh); ctx.fillRect(fx + fw, fy, W - fx - fw, fh);
          ctx.strokeStyle = '#E8B931'; ctx.lineWidth = 2; ctx.strokeRect(fx, fy, fw, fh);
        }
        function mudarZoom(novo, cx, cy) {
          novo = Math.min(4, Math.max(1, novo));
          var s0 = escala(); zoom = novo; var s1 = escala();
          if (cx == null) { cx = fx + fw / 2; cy = fy + fh / 2; }
          ox = cx - (cx - ox) * s1 / s0; oy = cy - (cy - oy) * s1 / s0;
          limitar(); zoomEl.value = zoom; desenhar();
        }

        medir(); centralizar(); desenhar();

        // Arrastar e pinça
        var toques = {}, ultimaDist = 0;
        function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
        cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); toques[e.pointerId] = pos(e); ultimaDist = 0; });
        cv.addEventListener('pointermove', function (e) {
          if (!toques[e.pointerId]) return;
          var p = pos(e), ids = Object.keys(toques);
          if (ids.length === 1) { ox += p.x - toques[e.pointerId].x; oy += p.y - toques[e.pointerId].y; toques[e.pointerId] = p; limitar(); desenhar(); return; }
          toques[e.pointerId] = p;
          var a = toques[ids[0]], b = toques[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (ultimaDist) mudarZoom(zoom * d / ultimaDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
          ultimaDist = d;
        });
        function soltar(e) { delete toques[e.pointerId]; ultimaDist = 0; }
        cv.addEventListener('pointerup', soltar); cv.addEventListener('pointercancel', soltar);
        cv.addEventListener('wheel', function (e) { e.preventDefault(); var p = pos(e); mudarZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.92), p.x, p.y); }, { passive: false });
        zoomEl.addEventListener('input', function () { mudarZoom(Number(zoomEl.value)); });

        fundo.querySelectorAll('[data-fmt]').forEach(function (b) {
          b.addEventListener('click', function () {
            aspecto = Number(b.getAttribute('data-fmt'));
            fundo.querySelectorAll('[data-fmt]').forEach(function (x) {
              var on = x === b; x.style.background = on ? '#E8B931' : 'transparent'; x.style.color = on ? '#0B1E4A' : '#fff'; x.style.borderColor = on ? '#E8B931' : 'rgba(255,255,255,.5)';
            });
            zoom = 1; zoomEl.value = 1; medir(); centralizar(); desenhar();
          });
        });

        function fechar(valor) { fundo.remove(); URL.revokeObjectURL(img.src); window.removeEventListener('resize', aoRedimensionar); resolver(valor); }
        function aoRedimensionar() { var cx = (fx + fw / 2 - ox) / escala(), cy = (fy + fh / 2 - oy) / escala(); medir(); var s = escala(); ox = fx + fw / 2 - cx * s; oy = fy + fh / 2 - cy * s; limitar(); desenhar(); }
        window.addEventListener('resize', aoRedimensionar);
        fundo.querySelector('[data-cancelar]').addEventListener('click', function () { fechar(null); });
        fundo.querySelector('[data-usar]').addEventListener('click', function () {
          var s = escala(), sx = (fx - ox) / s, sy = (fy - oy) / s, sw = fw / s, sh = fh / s;
          var max = 400, k = Math.min(1, max / Math.max(sw, sh));
          var out = document.createElement('canvas'); out.width = Math.max(1, Math.round(sw * k)); out.height = Math.max(1, Math.round(sh * k));
          out.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
          var url = out.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88);
          if (url.length > 500000) url = out.toDataURL('image/jpeg', 0.8);
          fechar(url);
        });
      });
    });
  };
})();
