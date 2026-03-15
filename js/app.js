const app = {
  config: {
    apiKey: 'AIzaSyC9tIl6Y5a6gawqEd_my7Gx05mkgOHRv5E',
    authDomain: 'domingos-donde-marta.firebaseapp.com',
    databaseURL: 'https://domingos-donde-marta-default-rtdb.firebaseio.com',
    projectId: 'domingos-donde-marta',
    storageBucket: 'domingos-donde-marta.firebasestorage.app',
    messagingSenderId: '186101886983',
    appId: '1:186101886983:web:626d82f036dcf5aa3abaa2',
    measurementId: 'G-XQ7RDQX7DS',
  },
  productos: [],
  pendientes: [],
  historial: [],
  nombreUsuario: '',
  modo: '',
  mesaAct: null,
  carrito: [],
  catActual: 'comida',
  _vistaActual: 'comanda', // NUEVO: Para renderizado inteligente (Lazy Render)
  _procesandoPago: false, // NUEVO: Bloqueo anti-spam de Firebase
  PIN_ADMIN: '0510',
  PIN_MESERO: '1234',
  init() {
    firebase.initializeApp(this.config);
    this.db = firebase.database().ref('marta_v1');

    // --- LÓGICA DE CACHÉ INTELIGENTE ---
    const hoy = new Date().toLocaleDateString();
    const fechaCache = localStorage.getItem('marta_fecha_cache');
    const productosCache = localStorage.getItem('marta_productos_cache');

    // Carga inicial instantánea desde el teléfono
    if (fechaCache === hoy && productosCache) {
      this.productos = JSON.parse(productosCache);
      console.log('⚡ Menú cargado desde caché local');
    }

    // --- LISTENER OPTIMIZADO: Productos (Una sola vez en el día o bajo demanda) ---
    this.db
      .child('productos')
      .once('value')
      .then((snapshot) => {
        const data = snapshot.val();
        const nuevosProductos = (
          data ? (Array.isArray(data) ? data : Object.values(data)) : []
        ).filter((x) => x !== null);
        const productosString = JSON.stringify(nuevosProductos);

        if (
          !productosCache ||
          productosString !== productosCache ||
          fechaCache !== hoy
        ) {
          this.productos = nuevosProductos;
          localStorage.setItem('marta_productos_cache', productosString);
          localStorage.setItem('marta_fecha_cache', hoy);
          console.log('🔄 Menú descargado desde Firebase');
        }

        // Forzar primer render de mesa si ya hay usuario
        if (this.nombreUsuario && this._vistaActual === 'comanda') {
          this.renderMesas();
        }
      });

    // --- LISTENER OPTIMIZADO: Pendientes (Tiempo real obligatorio para Cocina/Mesas) ---
    this.db.child('pendientes').on('value', (snapshot) => {
      const data = snapshot.val();
      this.pendientes = (
        data ? (Array.isArray(data) ? data : Object.values(data)) : []
      ).filter((x) => x !== null);

      if (this.nombreUsuario) {
        // Solo renderizar si la vista actual lo exige
        if (this._vistaActual === 'comanda') this.renderMesas();
      }
    });

    // --- LISTENER OPTIMIZADO: Historial (Bajo demanda o una vez al inicio) ---
    // No usamos .on(), porque el historial crece mucho y consume bajada inútil a meseros
    this.db
      .child('historial')
      .once('value')
      .then((snapshot) => {
        const data = snapshot.val();
        this.historial = (
          data ? (Array.isArray(data) ? data : Object.values(data)) : []
        ).filter((x) => x !== null);
      });

    // --- LÓGICA DE LOGIN ORIGINAL ---
    const sn = localStorage.getItem('marta_nombre');
    const sm = localStorage.getItem('marta_modo');
    if (sn) {
      this.nombreUsuario = sn;
      this.modo = sm;
      this.entrarPanel();
    }
    // Si no hay sesión, la pantalla de login con los botones de rol ya es visible en el HTML
  },

  ejecutarRenders() {
    // Deprecado: Ya no se renderiza todo a la vez para ahorrar ciclos de CPU
    // Se mantiene solo por retrocompatibilidad de algunas funciones
    this.ejecutarRenderActual();
  },

  ejecutarRenderActual() {
    // Lazy Rendering: Solo pinta lo que el usuario está viendo
    switch (this._vistaActual) {
      case 'comanda':
        this.renderMesas();
        break;

      case 'inventario':
        if (this.modo === 'admin') this.renderInventarioDash();
        break;
      case 'reportetotal':
        this.renderReporteDash();
        this.renderGrafico();
        this.renderVentas();
        break;
    }
  },

  // BUG FIX: Método auxiliar para sincronizar caché con Firebase
  actualizarCacheProductos() {
    try {
      const hoy = new Date().toLocaleDateString();
      const productosString = JSON.stringify(this.productos);
      localStorage.setItem('marta_productos_cache', productosString);
      localStorage.setItem('marta_fecha_cache', hoy);
    } catch (e) {
      console.warn('Error al actualizar caché:', e);
    }
  },

  // --- NAVEGACIÓN Y LOGIN ---
  // detectarDispositivo ELIMINADA: Ya no se detecta el dispositivo.
  // Los botones de rol están SIEMPRE visibles en el HTML.

  prepararIngreso(tipo) {
    this.modo = tipo;
    document.getElementById('contenedorLogin').style.display = 'none';
    document.getElementById('formNombre').style.display = 'block';
    document.getElementById('loginPin').style.display = 'block';
    const pinInput = document.getElementById('loginPin');
    pinInput.placeholder = tipo === 'admin' ? 'PIN Admin' : 'PIN Mesero';
    document.getElementById('txtInstruccion').innerText =
      tipo === 'admin' ? 'Ingreso como Administrador' : 'Ingreso como Mesero';
  },

  volverSelectorRol() {
    document.getElementById('formNombre').style.display = 'none';
    document.getElementById('contenedorLogin').style.display = 'block';
    document.getElementById('loginNombre').value = '';
    document.getElementById('loginPin').value = '';
  },

  ejecutarLogin() {
    const nom = document.getElementById('loginNombre').value.trim();
    const pin = document.getElementById('loginPin').value;
    if (!nom) return alert('Nombre requerido');
    if (!pin) return alert('PIN requerido');

    const pinCorrecto =
      this.modo === 'admin' ? this.PIN_ADMIN : this.PIN_MESERO;
    if (pin !== pinCorrecto) {
      return alert('PIN incorrecto. Intenta de nuevo.');
    }

    this.nombreUsuario = nom;
    localStorage.setItem('marta_nombre', nom);
    localStorage.setItem('marta_modo', this.modo);
    this.entrarPanel();
  },

  entrarPanel() {
    document.getElementById('vistaLogin').style.display = 'none';
    document.getElementById('appBody').style.display = 'block';
    document.getElementById('txtTag').innerText =
      this.modo === 'admin' ? 'Admin' : 'Mesero';
    document.getElementById('txtNombre').innerText = this.nombreUsuario;

    const navReporte = document.getElementById('navReporte');
    if (navReporte) {
      if (this.modo === 'admin') {
        navReporte.innerHTML =
          '<span class="material-symbols-rounded">bar_chart</span> Dashboard';
      } else {
        navReporte.innerHTML =
          '<span class="material-symbols-rounded">receipt_long</span> Mis Ventas';
      }
    }

    if (this.modo === 'admin') {
      document.getElementById('navInventario').style.display = 'block';
    }
    this.navegar('comanda');
  },

  navegar(id) {
    this._vistaActual = id;

    document
      .querySelectorAll('.modulo')
      .forEach((m) => (m.style.display = 'none'));
    const view = document.getElementById('v-' + id);
    if (view) view.style.display = 'block';

    // Si es reporte, forzamos descarga de info fresca del historial DENTRO de Reportes
    if (id === 'reportetotal') {
      // Descargamos historial fresco solo cuando entras a verlo
      this.db
        .child('historial')
        .once('value')
        .then((snapshot) => {
          const data = snapshot.val();
          this.historial = (
            data ? (Array.isArray(data) ? data : Object.values(data)) : []
          ).filter((x) => x !== null);
          this.renderReporteDash();
          this.renderGrafico();
          this.renderVentas();
        });
    }

    // Si es inventario, renderizar
    if (id === 'inventario') {
      this.renderInventarioDash();
    }

    if (id === 'comanda') {
      this.renderMesas();
    }
  },

  mostrarDashboardSegunModo() {
    // FUNCIÓN ELIMINADA: El dashboard ahora es visible para todos por defecto.
    // Solo se protegen elementos específicos (PDF, Limpiar) y el Inventario.
  },

  // --- GESTIÓN DE MESAS ---
  renderMesas() {
    const grid = document.getElementById('gridMesas');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 1; i <= 15; i++) this.crearBotonMesa(grid, i.toString());

    this.pendientes.forEach((p) => {
      if (isNaN(parseInt(p.mesa)) || parseInt(p.mesa) > 15)
        this.crearBotonMesa(grid, p.mesa);
    });

    const btnExtra = document.createElement('div');
    btnExtra.className = 'mesa-card libre';
    btnExtra.style.border = '2px dashed #ccc';
    btnExtra.innerHTML = `<b>+</b><br><small>Extra</small>`;
    btnExtra.onclick = () => {
      const m = prompt('Nombre/Número de mesa:');
      if (m) this.abrirMesa(m);
    };
    grid.appendChild(btnExtra);
  },
  //DE DJGV
  crearBotonMesa(contenedor, id) {
    const ocup = this.pendientes.find((p) => p.mesa === id);
    const div = document.createElement('div');
    if (ocup) {
      div.className = 'mesa-card ocupada';
      div.innerHTML = `<b>MESA ${id}</b><br><small>${ocup.mesero}</small>`;
      div.onclick = () => this.abrirMesa(id);
    } else {
      div.className = 'mesa-card libre';
      div.innerHTML = `<b>MESA ${id}</b><br><small>Libre</small>`;
      div.onclick = () => this.abrirMesa(id);
    }
    contenedor.appendChild(div);
  },

  abrirMesa(n) {
    this.mesaAct = n;
    const ex = this.pendientes.find((p) => p.mesa == n);
    this.carrito = ex ? JSON.parse(JSON.stringify(ex.items)) : [];
    this.meseroOriginal = ex ? ex.mesero : this.nombreUsuario;
    document.getElementById('mesaNum').innerText = 'Mesa: ' + n;
    document.getElementById('modalMesa').style.display = 'block';
    document.getElementById('cantLlevar').value = ex ? ex.cantLlevar || 0 : 0;

    // Resetear método de pago y campos de pago
    const metodoPago = document.getElementById('metodoPago');
    if (metodoPago) metodoPago.value = '';
    const cashReceived = document.getElementById('cashReceived');
    if (cashReceived) cashReceived.value = '0';
    const efBox = document.getElementById('efectivoBox');
    if (efBox) efBox.style.display = 'none';
    const trBox = document.getElementById('transferBox');
    if (trBox) trBox.style.display = 'none';
    const mixedBox = document.getElementById('mixedBox');
    if (mixedBox) mixedBox.style.display = 'none';

    this.setCat('comida');
    this.renderCarrito();
  },

  // --- CARRITO Y PRODUCTOS ---
  getSubcategoria(producto, categoria) {
    if (producto.subcategoria) return producto.subcategoria;
    // Fallback retrocompatible
    const nombre = producto.nombre.toLowerCase();

    if (categoria === 'comida') {
      const sopasKeywords = ['sopa', 'mute', 'sancocho'];
      if (sopasKeywords.some((kw) => nombre.includes(kw))) return 'Sopas';

      const extrasKeywords = [
        'extra',
        'acompañamiento',
        'entrada',
        'porciones',
        'porción',
      ];
      if (extrasKeywords.some((kw) => nombre.includes(kw))) return 'Extras';

      return 'Platos Fuertes';
    } else if (categoria === 'bebida') {
      const alcoholKeywords = [
        'cerveza',
        'vino',
        'corona',
        'poker',
        'aguila',
        'alcohol',
        'licor',
        'lata',
        'tequila',
      ];
      if (alcoholKeywords.some((kw) => nombre.includes(kw))) return 'Cervezas';
      return 'Jugos';
    }
    return '';
  },

  renderSubcategoryTabs(categoria) {
    const tabsContainer = document.getElementById('subCategoryTabs');
    const subcategorias =
      categoria === 'comida'
        ? ['Sopas', 'Platos Fuertes', 'Extras']
        : ['Jugos', 'Cervezas'];

    tabsContainer.innerHTML = '';
    const icons = {
      'Platos Fuertes': 'restaurant',
      Sopas: 'soup_kitchen',
      Extras: 'local_dining',
      Jugos: 'local_drink',
      Cervezas: 'sports_bar',
    };

    subcategorias.forEach((sub) => {
      const btn = document.createElement('button');
      btn.className = 'tabs-cat-sub';
      btn.innerHTML = `<span class="material-symbols-rounded" style="font-size: 1.1em;">${icons[sub] || 'category'}</span> ${sub}`;
      btn.onclick = () => this.setSubcat(categoria, sub);
      tabsContainer.appendChild(btn);
    });

    if (subcategorias.length > 0) {
      tabsContainer.style.display = 'flex';
      // Seleccionar Platos Fuertes o Jugos por defecto
      const defaultSubcat = categoria === 'comida' ? 'Platos Fuertes' : 'Jugos';
      this.setSubcat(categoria, defaultSubcat);
    }
  },

  setSubcat(categoria, subcategoria) {
    const cont = document.getElementById('listaItems');
    cont.innerHTML = '';

    // Actualizar estilo de tabs activos
    document.querySelectorAll('.tabs-cat-sub').forEach((btn) => {
      if (btn.innerHTML.includes(subcategoria)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.productos
      .filter(
        (p) =>
          p.categoria === categoria &&
          this.getSubcategoria(p, categoria) === subcategoria,
      )
      .forEach((p) => {
        const b = document.createElement('button');
        const cantEnCarrito = this.carrito.reduce(
          (sum, item) => (item.id === p.id ? sum + (item.cantidad || 1) : sum),
          0,
        );
        const stockDisponible = (p.stock || 0) - cantEnCarrito;
        const agotado = stockDisponible <= 0;

        b.className = agotado ? 'btn-agotado' : '';
        b.disabled = agotado;
        b.innerHTML = `${p.nombre}<br>$${p.precio}${agotado ? '<br>AGOTADO' : '<br><small>Stock: ' + stockDisponible + '</small>'}`;
        b.onclick = () => {
          // Agrupar items iguales (bebidas y comidas no entregadas)
          const itemExistente =
            p.categoria === 'bebida'
              ? this.carrito.find((x) => x.id === p.id)
              : this.carrito.find((x) => x.id === p.id && !x.entregado);
          if (itemExistente) {
            itemExistente.cantidad = (itemExistente.cantidad || 1) + 1;
          } else {
            this.carrito.push({
              ...p,
              uid: Date.now() + Math.random(),
              cantidad: 1,
              entregado: false,
            });
          }
          this.renderCarrito();
          this.setSubcat(categoria, subcategoria);
        };
        cont.appendChild(b);
      });
  },

  setCat(c) {
    this.catActual = c;
    // Limpiar tabs de subcategoría y mostrar nuevos
    this.renderSubcategoryTabs(c);

    // Actualizar tab activo visualmente
    const tabComida = document.getElementById('tab-comida');
    const tabBebida = document.getElementById('tab-bebida');

    if (c === 'comida') {
      tabComida?.classList.add('active');
      tabBebida?.classList.remove('active');
    } else {
      tabBebida?.classList.add('active');
      tabComida?.classList.remove('active');
    }
  },

  renderCarrito() {
    const cont = document.getElementById('itemsCarrito');
    cont.innerHTML = '';
    this.carrito.forEach((i) => {
      const mostrarCant = i.cantidad > 1 ? ` x${i.cantidad}` : '';
      let botonesCont = '';

      // Para bebidas: mostrar + y -
      // Para comidas: mostrar 👨‍🍳
      if (i.categoria === 'bebida') {
        botonesCont = `
            <button class="btn-cart-action" onclick="app.incrementarItem('${i.uid}')"><span class="material-symbols-rounded">add</span></button>
            <button class="btn-cart-action" onclick="app.decrementarItem('${i.uid}')"><span class="material-symbols-rounded">remove</span></button>
            <button class="btn-cart-delete" onclick="app.borrarItem('${i.uid}')"><span class="material-symbols-rounded">close</span></button>`;
      } else {
        botonesCont = `
            <button class="btn-cart-action" onclick="app.incrementarItem('${i.uid}')"><span class="material-symbols-rounded">add</span></button>
            <button class="btn-cart-action" onclick="app.decrementarItem('${i.uid}')"><span class="material-symbols-rounded">remove</span></button>
            <button class="${i.entregado ? 'btn-cart-ready' : 'btn-cart-cooking'}" onclick="app.toggleListo('${i.uid}')"><span class="material-symbols-rounded">${i.entregado ? 'check_circle' : 'outdoor_grill'}</span></button>
            <button class="btn-cart-delete" onclick="app.borrarItem('${i.uid}')"><span class="material-symbols-rounded">close</span></button>`;
      }

      cont.innerHTML += `
        <div class="item-car">
          <span style="${i.entregado ? 'text-decoration:line-through' : ''}">${i.nombre}${mostrarCant}</span>
          <div>
            ${botonesCont}
          </div>
        </div>`;
    });
    this.actualizarTotal();
  },

  actualizarTotal() {
    let t = this.carrito.reduce(
      (acc, i) => acc + i.precio * (i.cantidad || 1),
      0,
    );
    const cantLlevar =
      parseInt(document.getElementById('cantLlevar').value) || 0;
    t += cantLlevar * 1000;
    document.getElementById('totalMesa').innerText = 'Total: $' + t;
  },

  incrementarLlevar() {
    document.getElementById('cantLlevar').value =
      (parseInt(document.getElementById('cantLlevar').value) || 0) + 1;
    this.actualizarTotal();
  },

  decrementarLlevar() {
    let v = (parseInt(document.getElementById('cantLlevar').value) || 0) - 1;
    document.getElementById('cantLlevar').value = v < 0 ? 0 : v;
    this.actualizarTotal();
  },

  decrementarItem(uid) {
    const i = this.carrito.find((x) => x.uid == uid);
    if (i) {
      i.cantidad = (i.cantidad || 1) - 1;
      if (i.cantidad <= 0) {
        this.borrarItem(uid);
      } else {
        this.renderCarrito();
      }
    }
  },
  //DE DJGV
  incrementarItem(uid) {
    const i = this.carrito.find((x) => x.uid == uid);
    if (i) {
      i.cantidad = (i.cantidad || 1) + 1;
      this.renderCarrito();
    }
  },

  toggleListo(uid) {
    const i = this.carrito.find((x) => x.uid == uid);
    if (i) {
      i.entregado = !i.entregado;
      this.renderCarrito();
      this.guardarPedido(true);
    }
  },

  borrarItem(uid) {
    this.carrito = this.carrito.filter((x) => x.uid != uid);
    this.renderCarrito();
    this.setCat(this.catActual);
    this.setCat(this.catActual);
  },

  guardarPedido(silencioso = false) {
    // BLOQUEADOR ANTI-SPAM (Evita 3 clicks rápidos mandando 3 ventas iguales a Firebase)
    if (this._procesandoPago) return;

    if (this.carrito.length === 0) return alert('El carrito está vacío');
    const pago = document.getElementById('metodoPago').value;

    const btnPay = document.querySelector('.btn-confirmar');
    if (!silencioso && btnPay) {
      this._procesandoPago = true;
      btnPay.style.opacity = '0.5';
      btnPay.innerText = 'Guardando...';
    }

    const cantLlevar =
      parseInt(document.getElementById('cantLlevar').value) || 0;
    const ex = this.pendientes.find((p) => p.mesa == this.mesaAct);
    const idPedido = ex ? ex.id : Date.now();
    const tBase = this.carrito.reduce(
      (s, i) => s + (i.precio || 0) * (i.cantidad || 1),
      0,
    );

    const reg = {
      id: idPedido,
      mesa: this.mesaAct,
      mesero: this.meseroOriginal,
      cobradoPor: pago ? this.nombreUsuario : '',
      items: this.carrito,
      total: tBase + cantLlevar * 1000,
      cantLlevar: cantLlevar,
      pago: pago,
      // campos opcionales para efectivo/transferencia
      cashReceived: 0,
      change: 0,
      transferRef: '',
      fecha: new Date().toLocaleString(),
    };

    // Primero quitar la mesa actual de pendientes (para que el duplicate check no la encuentre)
    this.pendientes = this.pendientes.filter((p) => p.mesa != this.mesaAct);

    // Verificar si el pedido ya fue registrado en historial (evitar duplicados reales)
    if (this.historial.some((h) => h.id === idPedido)) {
      console.warn('⚠️ Pedido duplicado en historial, cancelando...');
      this._procesandoPago = false;
      if (btnPay) {
        btnPay.style.opacity = '1';
        btnPay.innerHTML =
          '<span class="material-symbols-rounded" style="font-size: 1.1rem">save</span> Guardar / Pagar';
      }
      return;
    }

    if (pago) {
      // Manejo por método de pago
      if (pago === 'Efectivo') {
        const recibido =
          parseFloat(document.getElementById('cashReceived')?.value) || 0;
        const totalVenta = reg.total;
        if (recibido < totalVenta) {
          alert(
            'El monto recibido es menor al total. Ingrese el efectivo correcto.',
          );
          return;
        }
        reg.cashReceived = recibido;
        reg.change = recibido - totalVenta;
        const changeEl = document.getElementById('changeDisplay');
        if (changeEl)
          changeEl.textContent = `Cambio: $${reg.change.toLocaleString()}`;
      } else if (pago === 'Transferencia') {
        reg.transferRef = document.getElementById('transferRef')?.value || '';
        reg.transferAmount =
          parseFloat(document.getElementById('transferAmount')?.value) ||
          reg.total;
      } else if (pago === 'Mixto') {
        const trAmt =
          parseFloat(document.getElementById('mixedTransferAmount')?.value) ||
          0;
        const cashReceived =
          parseFloat(document.getElementById('mixedCashReceived')?.value) || 0;
        const trRef = document.getElementById('mixedTransferRef')?.value || '';
        const totalVenta = reg.total;
        const cashPortion = Math.max(0, totalVenta - trAmt);
        if (trAmt < 0 || trAmt > totalVenta) {
          alert(
            'El monto de transferencia no puede ser mayor al total ni negativo.',
          );
          return;
        }
        if (cashReceived < cashPortion) {
          alert(
            'El efectivo recibido es menor al monto necesario para completar el pago.',
          );
          return;
        }
        reg.transferAmount = trAmt;
        reg.cashReceived = cashReceived;
        reg.change = Math.max(0, cashReceived - cashPortion);
        reg.transferRef = trRef;
        const mixedChangeEl = document.getElementById('mixedChangeDisplay');
        if (mixedChangeEl)
          mixedChangeEl.textContent = `Cambio: $${reg.change.toLocaleString()}`;
      }

      // descontar stock y guardar
      this.carrito.forEach((item) => {
        const pReal = this.productos.find((pr) => pr.id === item.id);
        if (pReal && pReal.stock > 0) {
          const cantDescontar = Math.min(item.cantidad || 1, pReal.stock);
          pReal.stock -= cantDescontar;
        }
      });
      this.historial.push(reg);
    } else if (this.carrito.length > 0) {
      this.pendientes.push(reg);
    }

    // NUEVA ESTRUCTURA DE GUARDADO FRAGMENTADA (Otorga más velocidad y evita PERMISSION_DENIED por exceso de tamaño)
    let updates = {};

    try {
      // Solo actualizar el registro modificado de pendientes (null para borrar, objeto para guardar)
      if (this.pendientes.some((p) => p.id === reg.id)) {
        updates['pendientes/' + reg.id] = reg;
      } else {
        updates['pendientes/' + reg.id] = null; // Eliminar la mesa de pendientes si fue pagada
      }

      if (pago) {
        // Registrar solo esta VENTA específica en el historial
        updates['historial/' + reg.id] = reg;

        // Actualizar SOLO los productos que cambiaron su stock
        this.carrito.forEach((item) => {
          const idx = this.productos.findIndex((pr) => pr.id === item.id);
          if (idx !== -1) {
            updates['productos/' + idx + '/stock'] = this.productos[idx].stock;
          }
        });
        this.actualizarCacheProductos(); // Sincronizo local storage
      }

      // SANITIZACIÓN: Firebase rechaza cualquier objeto que contenga 'undefined'
      // Convertimos a JSON y de vuelta para purgar cualquier undefined oculto
      const safeUpdates = JSON.parse(JSON.stringify(updates));

      // DEBUG: Para ver si llega hasta aca
      // alert("Estructurando guardado exitoso. Enviando a Firebase...");

      // Inyectar a Firebase solo los nodos que cambiaron
      this.db
        .update(safeUpdates)
        .then(() => {
          if (!silencioso) {
            if (btnPay) {
              btnPay.style.opacity = '1';
              btnPay.innerHTML =
                '<span class="material-symbols-rounded" style="font-size: 1.1rem">save</span> Guardar / Pagar';
            }
            this._procesandoPago = false;
            this.cerrarMesa();
          }
        })
        .catch((e) => {
          console.error('Error guardando en Firebase:', e);
          alert(
            'Hubo un error contactando a la base de datos (Paso 3): ' +
              e.message,
          );
          this._procesandoPago = false;
          if (btnPay) {
            btnPay.style.opacity = '1';
            btnPay.innerHTML = 'Error. Reintentar';
          }
        });
    } catch (syncError) {
      console.error('Error estructurando los datos:', syncError);
      alert(
        'Hubo un error interno al crear datos (Paso 2): ' + syncError.message,
      );
      this._procesandoPago = false;
      if (btnPay) {
        btnPay.style.opacity = '1';
        btnPay.innerHTML = 'Error Inesperado';
      }
    }
  },

  onPaymentMethodChange() {
    const metodo = document.getElementById('metodoPago').value;
    const efBox = document.getElementById('efectivoBox');
    const trBox = document.getElementById('transferBox');
    const mixedBox = document.getElementById('mixedBox');
    if (efBox) efBox.style.display = metodo === 'Efectivo' ? 'block' : 'none';
    if (trBox)
      trBox.style.display = metodo === 'Transferencia' ? 'block' : 'none';
    if (mixedBox)
      mixedBox.style.display = metodo === 'Mixto' ? 'block' : 'none';
    this.updateChange();
  },

  updateChange() {
    const totalText =
      document.getElementById('totalMesa')?.textContent || 'Total: $0';
    const totalMatch = totalText.match(/\$([\d.,]+)/);
    let total = 0;
    if (totalMatch) {
      total = parseFloat(totalMatch[1].replace(/[,]/g, '')) || 0;
    }

    const metodo = document.getElementById('metodoPago')?.value;
    if (metodo === 'Efectivo') {
      const recibido =
        parseFloat(document.getElementById('cashReceived')?.value) || 0;
      const cambio = Math.max(0, recibido - total);
      const changeEl = document.getElementById('changeDisplay');
      if (changeEl)
        changeEl.textContent = `Cambio: $${cambio.toLocaleString()}`;
    } else if (metodo === 'Transferencia') {
      // mostrar monto transferencia si existe (no hay cambio)
      const trAmt =
        parseFloat(document.getElementById('transferAmount')?.value) || 0;
      // opcional: podrías reflejar trAmt en algún elemento si quieres
    } else if (metodo === 'Mixto') {
      const trAmt =
        parseFloat(document.getElementById('mixedTransferAmount')?.value) || 0;
      const cashReceived =
        parseFloat(document.getElementById('mixedCashReceived')?.value) || 0;
      const cashPortion = Math.max(0, total - trAmt);
      const cambio = Math.max(0, cashReceived - cashPortion);
      const mixedChangeEl = document.getElementById('mixedChangeDisplay');
      if (mixedChangeEl)
        mixedChangeEl.textContent = `Cambio: $${cambio.toLocaleString()}`;
    } else {
      const changeEl = document.getElementById('changeDisplay');
      if (changeEl) changeEl.textContent = `Cambio: $0`;
      const mixedChangeEl = document.getElementById('mixedChangeDisplay');
      if (mixedChangeEl) mixedChangeEl.textContent = `Cambio: $0`;
    }
  },

  // --- REPORTES PDF CON CANTIDAD DE EMPAQUES MEJORADO ---
  generarPDFReporte() {
    try {
      // Validar que haya datos
      if (!this.historial || this.historial.length === 0) {
        alert('No hay ventas registradas para descargar');
        return;
      }

      let tDinero = 0,
        tEfectivo = 0,
        tTransfer = 0;
      let productosVendidos = {};
      let ventasPorMesero = {};
      let totalLlevarCant = 0,
        tLlevarDinero = 0;

      // Calcular totales
      this.historial.forEach((v) => {
        if (!v || !v.items) return;
        tDinero += v.total || 0;
        if (v.pago === 'Efectivo') tEfectivo += v.total || 0;
        if (v.pago === 'Transferencia') tTransfer += v.total || 0;
        if (v.pago === 'Mixto') {
          tEfectivo += v.cashReceived || 0;
          tTransfer += v.transferAmount || 0;
        }

        if (!ventasPorMesero[v.mesero]) {
          ventasPorMesero[v.mesero] = 0;
        }
        ventasPorMesero[v.mesero] += v.total || 0;

        if (v.cantLlevar) {
          totalLlevarCant += parseInt(v.cantLlevar);
          tLlevarDinero += v.cantLlevar * 1000;
        }

        v.items.forEach((it) => {
          if (!productosVendidos[it.nombre]) {
            productosVendidos[it.nombre] = {
              cantidad: 0,
              precio: it.precio,
              total: 0,
            };
          }
          productosVendidos[it.nombre].cantidad += it.cantidad || 1;
          productosVendidos[it.nombre].total += it.precio * (it.cantidad || 1);
        });
      });

      let htmlContent =
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Reporte Marta</title><style>';
      htmlContent +=
        'body { font-family: Arial, sans-serif; color: #333; padding: 20px; margin: 0; background: white; }';
      htmlContent += '@media print { body { padding: 0; } }';
      htmlContent +=
        'h1 { color: #1a3c40; text-align: center; margin: 0 0 5px 0; font-size: 24px; }';
      htmlContent +=
        'h2 { color: #1a3c40; font-size: 16px; border-bottom: 2px solid #1a3c40; padding-bottom: 5px; margin: 20px 0 10px 0; }';
      htmlContent +=
        '.fecha { text-align: center; color: #999; font-size: 12px; margin-bottom: 20px; }';
      htmlContent +=
        '.resumen { display: flex; justify-content: space-between; gap: 10px; margin: 15px 0; }';
      htmlContent +=
        '.resumen-item { flex: 1; text-align: center; padding: 10px; background: #f5f5f5; border: 1px solid #ddd; }';
      htmlContent +=
        '.resumen-item.total { background: #1a3c40; color: white; }';
      htmlContent +=
        '.resumen-label { font-size: 12px; color: #666; font-weight: bold; }';
      htmlContent += '.resumen-item.total .resumen-label { color: #fff; }';
      htmlContent +=
        '.resumen-valor { font-size: 18px; font-weight: bold; color: #1a3c40; margin-top: 5px; }';
      htmlContent += '.resumen-item.total .resumen-valor { color: #fff; }';
      htmlContent +=
        'table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }';
      htmlContent +=
        'th { background: #1a3c40; color: white; padding: 10px; text-align: left; font-weight: bold; border: 1px solid #1a3c40; }';
      htmlContent += 'td { padding: 8px; border: 1px solid #ddd; }';
      htmlContent += 'tr:nth-child(even) { background: #f9f9f9; }';
      htmlContent +=
        '.pie { text-align: center; color: #999; font-size: 11px; margin-top: 30px; padding-top: 10px; border-top: 1px dashed #ccc; }';
      htmlContent +=
        '.no-print { print-color-adjust: exact; -webkit-print-color-adjust: exact; }';
      htmlContent += '</style></head><body>';

      // Encabezado
      htmlContent += '<h1>DOMINGOS DONDE MARTA</h1>';
      htmlContent +=
        '<h2 style="text-align: center; border: none; color: #666;">REPORTE DE CAJA</h2>';
      htmlContent +=
        '<div class="fecha">Fecha: ' +
        new Date().toLocaleDateString('es-ES') +
        ' | Hora: ' +
        new Date().toLocaleTimeString('es-ES') +
        '</div>';

      // Resumen
      htmlContent += '<div class="resumen">';
      htmlContent +=
        '<div class="resumen-item"><div class="resumen-label">EFECTIVO</div><div class="resumen-valor">$' +
        tEfectivo.toLocaleString() +
        '</div></div>';
      htmlContent +=
        '<div class="resumen-item"><div class="resumen-label">TRANSFERENCIA</div><div class="resumen-valor">$' +
        tTransfer.toLocaleString() +
        '</div></div>';
      htmlContent +=
        '<div class="resumen-item total"><div class="resumen-label">TOTAL</div><div class="resumen-valor">$' +
        tDinero.toLocaleString() +
        '</div></div>';
      htmlContent += '</div>';

      // Ventas por mesero
      htmlContent += '<h2>VENTAS POR MESERO</h2>';
      htmlContent +=
        '<table><tr><th>Mesero</th><th style="text-align: right;">Total Generado</th></tr>';
      Object.entries(ventasPorMesero)
        .sort((a, b) => b[1] - a[1])
        .forEach(([mesero, total]) => {
          htmlContent +=
            '<tr><td>' +
            mesero +
            '</td><td style="text-align: right; font-weight: bold;">$' +
            total.toLocaleString() +
            '</td></tr>';
        });
      htmlContent += '</table>';

      // Detalle de Ventas e Inventario
      htmlContent += '<h2>DETALLE DE VENTAS E INVENTARIO</h2>';
      htmlContent +=
        '<table><tr><th>Producto</th><th style="text-align: center;">Vendidos</th><th style="text-align: center;">Stock Queda</th><th style="text-align: right;">Ingresos</th></tr>';

      // Combinar productos vendidos con el inventario actual
      let reporteProductos = [];
      this.productos.forEach((p) => {
        const prodVendido = productosVendidos[p.nombre];
        reporteProductos.push({
          nombre: p.nombre,
          vendidos: prodVendido ? prodVendido.cantidad : 0,
          stock: p.stock || 0,
          total: prodVendido ? prodVendido.total : 0,
        });
      });

      // Ordenar por cantidad vendida (mayor a menor)
      reporteProductos.sort((a, b) => b.vendidos - a.vendidos);

      reporteProductos.forEach((p) => {
        // Mostrar si se vendió algo o si hay stock (omite eliminados por completo)
        if (p.vendidos > 0 || p.stock > 0) {
          htmlContent +=
            '<tr><td>' +
            p.nombre +
            '</td><td style="text-align: center; font-weight:bold;">' +
            p.vendidos +
            '</td><td style="text-align: center; color: ' +
            (p.stock <= 5 ? 'red' : 'inherit') +
            ';">' +
            p.stock +
            '</td><td style="text-align: right;">$' +
            p.total.toLocaleString() +
            '</td></tr>';
        }
      });

      if (totalLlevarCant > 0) {
        htmlContent +=
          '<tr style="background: #fff3cd; font-weight: bold;"><td>Empaques Para Llevar</td><td style="text-align: center;">x' +
          totalLlevarCant +
          '</td><td style="text-align: right;">$' +
          tLlevarDinero.toLocaleString() +
          '</td></tr>';
      }
      htmlContent += '</table>';

      htmlContent +=
        '<div class="pie">Generado automaticamente por Sistema de Gestion<br>Domingos Donde Marta - ' +
        new Date().getFullYear() +
        '</div>';
      htmlContent += '</body></html>';

      // Abrir en nueva ventana
      const newWindow = window.open('', '', 'width=900,height=600');
      newWindow.document.write(htmlContent);
      newWindow.document.close();

      // Mostrar diálogo de impresión después de cargar
      setTimeout(() => {
        newWindow.print();
      }, 500);

      alert(
        'Se abrió la ventana del reporte. Usa Ctrl+P para guardar como PDF',
      );
    } catch (error) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    }
  },

  renderVentas() {
    const lista = document.getElementById('listaVentas');
    if (!lista) return;

    const historyToRender =
      this.modo === 'admin'
        ? this.historial
        : this.historial.filter((v) => v.mesero === this.nombreUsuario);

    if (historyToRender.length === 0) {
      lista.innerHTML =
        '<div style="text-align:center; padding:40px; color:var(--dashboard-text-light); font-size:1.1rem;">' +
        '<span class="material-symbols-rounded" style="font-size:3rem; display:block; margin-bottom:10px; opacity:0.3;">receipt_long</span>' +
        (this.modo === 'admin'
          ? 'Sin transacciones globales'
          : 'Aún no has realizado ventas hoy') +
        '</div>';
      return;
    }

    lista.innerHTML = historyToRender
      .slice()
      .reverse()
      .map((v, idx) => {
        // Agrupar productos por nombre (sumar cantidades iguales)
        const productosAgrupados = {};
        v.items.forEach((item) => {
          if (!productosAgrupados[item.nombre]) {
            productosAgrupados[item.nombre] = {
              nombre: item.nombre,
              cantidad: 0,
            };
          }
          productosAgrupados[item.nombre].cantidad += item.cantidad || 1;
        });

        const productsHTML = Object.values(productosAgrupados)
          .map(
            (item) => `
          <div style="background: rgba(79, 70, 229, 0.05); padding: 8px 12px; border-radius: 6px; border-left: 3px solid var(--primary);">
            <div style="font-weight: 500; color: #334155;">${item.nombre}</div>
            <div style="font-size: 0.85rem; color: #64748b;">x${item.cantidad}</div>
          </div>
        `,
          )
          .join('');

        const icon = v.pago ? 'payments' : 'hourglass_empty';
        const iconColor = v.pago
          ? 'var(--primary)'
          : 'var(--dashboard-warning)';

        return `
        <div class="transaction-item" style="cursor: pointer;" onclick="app.toggleDetalleVenta(${idx})">
          <div class="trx-icon" style="background: ${v.pago ? '#ecfdf5' : '#fff7ed'}; color: ${iconColor};">
            <span class="material-symbols-rounded">${icon}</span>
          </div>
          <div class="trx-details">
            <b>Mesa ${v.mesa} <span style="font-weight:400; color:var(--dashboard-text-light); font-size:0.8rem;">(Mesero: ${v.mesero})</span></b>
            <span>${v.cobradoPor ? 'Cobrado por: ' + v.cobradoPor + ' | ' : ''} Fecha: ${v.fecha.split(',')[0]} | Hora:${v.fecha.split(',')[1] || ''}</span>
          </div>
          <div class="trx-amount">$${(v.total || 0).toLocaleString()}</div>
          <div class="trx-method">${v.pago || 'Pendiente'}</div>
          
          <div class="transaction-products" id="detalleVenta-${idx}" style="display: none; grid-column: 1 / -1; margin-top: 12px; padding: 16px; background: #f8fafc; border-radius: 12px; border: 1px solid var(--dashboard-border);">
            <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px; font-size:0.85rem;">
              <div style="font-weight:700; color:var(--primary);">📦 PRODUCTOS:</div>
              <div style="color:var(--dashboard-text-light);">Empaques llevar: <strong>${v.cantLlevar || 0}</strong></div>
              ${(v.pago === 'Efectivo' || v.pago === 'Mixto') && typeof v.cashReceived !== 'undefined' ? `<div style="color:var(--dashboard-text-light);">Recibido: <strong>$${(v.cashReceived || 0).toLocaleString()}</strong></div>` : ''}
              ${typeof v.change !== 'undefined' && v.change !== null ? `<div style="color:var(--primary);">Cambio: <strong>$${(v.change || 0).toLocaleString()}</strong></div>` : ''}
              ${(v.pago === 'Transferencia' || v.pago === 'Mixto') && typeof v.transferAmount !== 'undefined' ? `<div style="color:var(--dashboard-text-light);">Transferencia: <strong>$${(v.transferAmount || 0).toLocaleString()}</strong></div>` : ''}
              ${(v.pago === 'Transferencia' || v.pago === 'Mixto') && v.transferRef ? `<div style="color:var(--dashboard-text-light);">Referencia: <strong>${v.transferRef}</strong></div>` : ''}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
              ${productsHTML}
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  },

  renderListaEdicion() {
    const cont = document.getElementById('listaEdicion');
    if (!cont) return;
    cont.innerHTML =
      '<h3>Inventario</h3>' +
      this.productos
        .map(
          (p) => `
      <div class="edit-prod" style="display:flex; justify-content:space-between; background:white; padding:10px; margin-bottom:5px; border-radius:10px;">
        <span>${p.nombre}</span>
        <div>
          Stock: <input type="number" value="${p.stock || 0}" onchange="app.ajStock(${p.id}, this.value)" style="width:50px">
          <button onclick="app.eliminarItem(${p.id})" class="btn-delete-item"><span class="material-symbols-rounded">delete</span></button>
        </div>
      </div>`,
        )
        .join('');
  },

  ajStock(id, v) {
    const stockValue = parseInt(v, 10);
    if (isNaN(stockValue) || stockValue < 0) {
      alert('Ingrese un valor válido');
      return;
    }
    const p = this.productos.find((x) => x.id === id);
    if (p) {
      p.stock = stockValue;
      this.db.update({ productos: this.productos });
      // BUG FIX #3: Sincronizar caché cuando se ajusta stock
      this.actualizarCacheProductos();
    }
  },

  crearItem(categoria) {
    let n, p, sub;
    if (categoria === 'comida') {
      n = document.getElementById('newNombreComida').value;
      p = parseInt(document.getElementById('newPrecioComida').value);
      sub = document.getElementById('newSubcatComida').value;
    } else if (categoria === 'bebida') {
      n = document.getElementById('newNombreBebida').value;
      p = parseInt(document.getElementById('newPrecioBebida').value);
      sub = document.getElementById('newSubcatBebida').value;
    }
    if (!n || !p) return alert('Nombre y precio requeridos');
    this.productos.push({
      id: Date.now(),
      nombre: n,
      precio: p,
      categoria: categoria,
      subcategoria: sub,
      stock: 50,
    });
    this.db.update({ productos: this.productos });
    // BUG FIX #4: Sincronizar caché cuando se crea producto
    this.actualizarCacheProductos();
    if (categoria === 'comida') {
      document.getElementById('newNombreComida').value = '';
      document.getElementById('newPrecioComida').value = '';
    } else if (categoria === 'bebida') {
      document.getElementById('newNombreBebida').value = '';
      document.getElementById('newPrecioBebida').value = '';
    }
    alert('Producto creado correctamente.');
    this.renderInventarioDash();
  },

  eliminarItem(id) {
    if (!this.validarAdmin()) return;
    if (confirm('⚠️ ¿Eliminar producto?')) {
      const idNum = parseInt(id);
      this.productos = this.productos.filter(
        (p) => p.id !== idNum && p.id !== id,
      );
      this.db.update({ productos: this.productos });
      // BUG FIX #5: Sincronizar caché cuando se elimina producto
      this.actualizarCacheProductos();
      this.renderInventarioDash(); // Recarga el inventario
      alert('Producto eliminado correctamente.');
    }
  },

  // --- VALIDACIÓN DE SEGURIDAD ---
  validarAdmin() {
    const pin = prompt('🔐 Ingrese PIN de administrador:');
    if (pin === null) return false;
    if (pin !== this.PIN_ADMIN) {
      alert('❌ PIN incorrecto');
      return false;
    }
    return true;
  },

  ajStockSeguro(id, v) {
    if (!this.validarAdmin()) return;
    const idNum = parseInt(id);
    const p = this.productos.find((x) => x.id === idNum || x.id === id);
    if (p) {
      const newStock = parseInt(v);
      if (!isNaN(newStock) && newStock >= 0) {
        p.stock = newStock;
        this.db.update({ productos: this.productos });
        // BUG FIX #6: Sincronizar caché cuando se ajusta stock seguro
        this.actualizarCacheProductos();
        this.renderInventarioDash(); // Recarga el inventario
        alert('Stock actualizado.');
      } else {
        alert('❌ Ingrese un valor válido');
      }
    }
  },

  crearItemSeguro(categoria = 'comida') {
    if (!this.validarAdmin()) return;
    this.crearItem(categoria);
  },

  limpiarReporteSeguro() {
    if (!this.validarAdmin()) return;
    if (
      confirm(
        '⚠️ ¿Está seguro que desea limpiar el reporte de hoy? Esta acción no se puede deshacer.',
      )
    ) {
      this.historial = [];
      this.db.update({ historial: this.historial });
      alert('Reporte de ventas limpiado correctamente.');
      this.renderReporteDash();
      this.renderGrafico();
    }
  },

  // --- DASHBOARD MODERNO ---
  renderReporteDash() {
    // Calcular estadísticas
    let tDinero = 0,
      tEfectivo = 0,
      tTransfer = 0;
    let cComida = 0,
      cBebida = 0,
      totalLlevarCant = 0,
      tLlevarDinero = 0;
    let productosVendidos = {};

    this.historial.forEach((v) => {
      if (!v || !v.items) return;
      tDinero += v.total;
      if (v.pago === 'Efectivo') tEfectivo += v.total;
      if (v.pago === 'Transferencia') tTransfer += v.total;
      if (v.pago === 'Mixto') {
        tEfectivo += v.cashReceived || 0;
        tTransfer += v.transferAmount || 0;
      }

      if (v.cantLlevar) {
        totalLlevarCant += parseInt(v.cantLlevar);
        tLlevarDinero += v.cantLlevar * 1000;
      }

      v.items.forEach((it) => {
        const qty = it.cantidad || 1;
        if (it.categoria === 'comida') cComida += qty;
        else if (it.categoria === 'bebida') cBebida += qty;
        if (!productosVendidos[it.nombre]) {
          productosVendidos[it.nombre] = {
            cantidad: 0,
            precio: it.precio,
            total: 0,
            categoria: it.categoria,
          };
        }
        productosVendidos[it.nombre].cantidad += qty;
        productosVendidos[it.nombre].total += it.precio * qty;
      });
    });

    // Dashboard ya no renderiza inventario directamente (ahora es vista separada)
    // this.renderInventarioDash();

    document.querySelectorAll('.admin-only-dashboard').forEach((el) => {
      el.style.display = this.modo === 'admin' ? 'block' : 'none';
    });

    if (this.modo !== 'admin') {
      // Si es mesero, paramos aquí y solo dejamos que el historial se renderice abajo.
      this.renderVentas();
      return;
    }

    // Renderizar Resumen de Caja (DealDeck Style)
    const summaryHTML = `
      <div class="summary-stats-grid">
        <div class="stat-card">
          <div class="stat-card-header">
            <div class="stat-icon-box" style="background: rgba(79, 70, 229, 0.1); color: var(--primary);">
              <span class="material-symbols-rounded">lunch_dining</span>
            </div>
            <div class="stat-badge success">+${Math.floor(Math.random() * 10) + 5}%</div>
          </div>
          <div class="stat-content">
            <div class="stat-value">${cComida}</div>
            <div class="stat-label">Comidas Vendidas</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card-header">
            <div class="stat-icon-box" style="background: rgba(59, 130, 246, 0.1); color: var(--accent);">
              <span class="material-symbols-rounded">local_cafe</span>
            </div>
          </div>
          <div class="stat-content">
            <div class="stat-value">${cBebida}</div>
            <div class="stat-label">Bebidas Vendidas</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card-header">
            <div class="stat-icon-box" style="background: rgba(245, 158, 11, 0.1); color: var(--dashboard-warning);">
              <span class="material-symbols-rounded">inventory</span>
            </div>
          </div>
          <div class="stat-content">
            <div class="stat-value">${totalLlevarCant}</div>
            <div class="stat-label">Empaques</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card-header">
            <div class="stat-icon-box" style="background: rgba(79, 70, 229, 0.1); color: var(--dashboard-success);">
              <span class="material-symbols-rounded">payments</span>
            </div>
          </div>
          <div class="stat-content">
            <div class="stat-value">$${tEfectivo.toLocaleString()}</div>
            <div class="stat-label">Total Efectivo</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card-header">
            <div class="stat-icon-box" style="background: rgba(14, 165, 233, 0.1); color: var(--dashboard-info);">
              <span class="material-symbols-rounded">account_balance</span>
            </div>
          </div>
          <div class="stat-content">
            <div class="stat-value">$${tTransfer.toLocaleString()}</div>
            <div class="stat-label">Total Transferencia</div>
          </div>
        </div>

        <div class="stat-card featured">
          <div class="stat-card-header">
            <div class="stat-icon-box" style="background: rgba(255, 255, 255, 0.2); color: white;">
              <span class="material-symbols-rounded">account_balance_wallet</span>
            </div>
            <div class="stat-badge white">Balance Hoy</div>
          </div>
          <div class="stat-content">
            <div class="stat-value">$${tDinero.toLocaleString()}</div>
            <div class="stat-label">Balance Total de Caja</div>
          </div>
        </div>
      </div>
    `;

    const summaryStatsContainer = document.getElementById('summaryStats');
    if (summaryStatsContainer) {
      summaryStatsContainer.innerHTML = summaryHTML;
    } else {
      const header = document.querySelector('.summary-card .card-header');
      if (header && header.parentElement) {
        header.insertAdjacentHTML(
          'afterend',
          `<div id="summaryStats">${summaryHTML}</div>`,
        );
      }
    }

    // Renderizar Top Ventas por Categoría
    const productosPorCategoria = {
      comida: [],
      bebida: [],
    };

    // Organizar productos por categoría
    Object.entries(productosVendidos).forEach(([nombre, data]) => {
      const producto = this.productos.find((p) => p.nombre === nombre);
      if (producto) {
        const categoria = producto.categoria || 'comida';
        productosPorCategoria[categoria].push({
          nombre,
          cantidad: data.cantidad,
        });
      }
    });

    // Ordenar por cantidad vendida (descendente)
    productosPorCategoria.comida.sort((a, b) => b.cantidad - a.cantidad);
    productosPorCategoria.bebida.sort((a, b) => b.cantidad - a.cantidad);

    // Guardar datos de comidas y bebidas para los tabs
    window.productosComidas = productosPorCategoria.comida;
    window.productosBebidas = productosPorCategoria.bebida;

    // Renderizar Comidas (TODAS)
    const comidasHTML = productosPorCategoria.comida
      .map(
        (prod) => `
      <div class="category-item">
        <div class="category-item-name">${prod.nombre}</div>
        <div class="category-item-qty">x${prod.cantidad}</div>
      </div>
    `,
      )
      .join('');

    const comidasContainer = document.getElementById('topSalesComidas');
    if (comidasContainer) {
      comidasContainer.innerHTML =
        comidasHTML ||
        '<p style="text-align:center; color:#999; font-size:0.85rem;">Sin ventas de comidas</p>';
    }

    // Renderizar Bebidas (TODAS)
    const bebidasHTML = productosPorCategoria.bebida
      .map(
        (prod) => `
      <div class="category-item">
        <div class="category-item-name">${prod.nombre}</div>
        <div class="category-item-qty">x${prod.cantidad}</div>
      </div>
    `,
      )
      .join('');

    const bebidasContainer = document.getElementById('topSalesBebidas');
    if (bebidasContainer) {
      bebidasContainer.innerHTML =
        bebidasHTML ||
        '<p style="text-align:center; color:#999; font-size:0.85rem;">Sin ventas de bebidas</p>';
    }

    // Renderizar Transacciones
    this.renderVentas();

    // Ajustar títulos y visibilidad
    const reportTitle = document.querySelector(
      '.transactions-card .card-title',
    );
    if (reportTitle) {
      reportTitle.innerHTML =
        this.modo === 'admin'
          ? '<span class="material-symbols-rounded">receipt</span> Historial de Ventas Global'
          : '<span class="material-symbols-rounded">receipt_long</span> Mi Registro de Ventas';
    }

    // Ocultar botones de administración si no es admin
    const actionBtns = document.querySelector('.action-buttons');
    if (actionBtns) {
      actionBtns.style.display = this.modo === 'admin' ? 'flex' : 'none';
    }
  },

  switchSalesTab(categoria) {
    // Ocultar todas las secciones
    document.getElementById('sales-comida-section').classList.remove('active');
    document.getElementById('sales-bebida-section').classList.remove('active');
    // Desactivar todos los botones
    document.getElementById('tab-sales-comida').classList.remove('active');
    document.getElementById('tab-sales-bebida').classList.remove('active');
    // Mostrar la sección seleccionada
    if (categoria === 'comida') {
      document.getElementById('sales-comida-section').classList.add('active');
      document.getElementById('tab-sales-comida').classList.add('active');
    } else if (categoria === 'bebida') {
      document.getElementById('sales-bebida-section').classList.add('active');
      document.getElementById('tab-sales-bebida').classList.add('active');
    }
  },

  switchInventoryTab(categoria) {
    // Ocultar todas las secciones
    document.getElementById('inv-comida-section').classList.remove('active');
    document.getElementById('inv-bebida-section').classList.remove('active');
    // Desactivar todos los botones
    document.getElementById('tab-inv-comida').classList.remove('active');
    document.getElementById('tab-inv-bebida').classList.remove('active');
    // Mostrar la sección seleccionada
    if (categoria === 'comida') {
      document.getElementById('inv-comida-section').classList.add('active');
      document.getElementById('tab-inv-comida').classList.add('active');
    } else if (categoria === 'bebida') {
      document.getElementById('inv-bebida-section').classList.add('active');
      document.getElementById('tab-inv-bebida').classList.add('active');
    }
  },

  renderInventarioDash() {
    // Renderizar Comidas con subcategorías
    const comidasLista = this.productos.filter((p) => p.categoria === 'comida');
    const contComidas = document.getElementById('inventarioComidasList');
    if (contComidas) {
      // Agrupar por subcategoría
      const comidasPorSubcat = {};
      comidasLista.forEach((p) => {
        const subcat = this.getSubcategoria(p, 'comida');
        if (!comidasPorSubcat[subcat]) comidasPorSubcat[subcat] = [];
        comidasPorSubcat[subcat].push(p);
      });

      const subcatOrder = ['Platos Fuertes', 'Sopas', 'Extras'];
      const icons = {
        'Platos Fuertes': 'restaurant',
        Sopas: 'soup_kitchen',
        Extras: 'local_dining',
      };

      contComidas.innerHTML = Object.keys(comidasPorSubcat)
        .sort((a, b) => subcatOrder.indexOf(a) - subcatOrder.indexOf(b))
        .map(
          (subcat) => `
          <div class="inventory-subcat-section">
            <h4 class="inventory-subcat-title" style="display:flex; align-items:center; gap:8px;"><span class="material-symbols-rounded" style="color:var(--dashboard-accent-green);">${icons[subcat] || 'category'}</span> ${subcat}</h4>
            <div class="inventory-grid-header">
              <span>Nombre</span>
              <span>Precio</span>
              <span>Subcategoría</span>
              <span>Stock</span>
              <span>Acción</span>
            </div>
            ${comidasPorSubcat[subcat]
              .map(
                (p) => `
              <div class="inventory-item-row" data-id="${p.id}">
                <div class="inventory-col-name"><b>${String(p.nombre || '').substring(0, 50)}</b></div>
                <div class="inventory-col-price">$${(p.precio || 0).toLocaleString()}</div>
                <div class="inventory-col-subcat">
                  <select class="subcat-select" onchange="app.cambiarSubcategoria(${p.id}, this.value)">
                    <option value="Sopas" ${this.getSubcategoria(p, 'comida') === 'Sopas' ? 'selected' : ''}>Sopas</option>
                    <option value="Platos Fuertes" ${this.getSubcategoria(p, 'comida') === 'Platos Fuertes' ? 'selected' : ''}>Platos Fuertes</option>
                    <option value="Extras" ${this.getSubcategoria(p, 'comida') === 'Extras' ? 'selected' : ''}>Extras</option>
                  </select>
                </div>
                <div class="inventory-col-stock">
                  <input type="number" class="stock-input" value="${p.stock || 0}" min="0" />
                </div>
                <div class="inventory-col-action">
                  <button class="btn-delete-item" title="Eliminar"><span class="material-symbols-rounded">delete</span></button>
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        `,
        )
        .join('');

      const self = this;
      contComidas.querySelectorAll('.stock-input').forEach((input) => {
        input.addEventListener('change', (e) => {
          const id = e.target.closest('.inventory-item-row').dataset.id;
          self.ajStockSeguro(id, e.target.value);
        });
      });

      contComidas.querySelectorAll('.btn-delete-item').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const id = e.target.closest('.inventory-item-row').dataset.id;
          self.eliminarItem(id);
        });
      });
    }

    // Renderizar Bebidas con subcategorías
    const bebidasLista = this.productos.filter((p) => p.categoria === 'bebida');
    const contBebidas = document.getElementById('inventarioBebidasList');
    if (contBebidas) {
      // Agrupar por subcategoría
      const bebidasPorSubcat = {};
      bebidasLista.forEach((p) => {
        const subcat = this.getSubcategoria(p, 'bebida');
        if (!bebidasPorSubcat[subcat]) bebidasPorSubcat[subcat] = [];
        bebidasPorSubcat[subcat].push(p);
      });

      const subcatOrder = ['Jugos', 'Cervezas'];
      const icons = { Jugos: 'local_drink', Cervezas: 'sports_bar' };

      contBebidas.innerHTML = Object.keys(bebidasPorSubcat)
        .sort((a, b) => subcatOrder.indexOf(a) - subcatOrder.indexOf(b))
        .map(
          (subcat) => `
          <div class="inventory-subcat-section">
            <h4 class="inventory-subcat-title" style="display:flex; align-items:center; gap:8px;"><span class="material-symbols-rounded" style="color:var(--dashboard-accent-green);">${icons[subcat] || 'category'}</span> ${subcat}</h4>
            <div class="inventory-grid-header">
              <span>Nombre</span>
              <span>Precio</span>
              <span>Subcategoría</span>
              <span>Stock</span>
              <span>Acción</span>
            </div>
            ${bebidasPorSubcat[subcat]
              .map(
                (p) => `
              <div class="inventory-item-row" data-id="${p.id}">
                <div class="inventory-col-name"><b>${String(p.nombre || '').substring(0, 50)}</b></div>
                <div class="inventory-col-price">$${(p.precio || 0).toLocaleString()}</div>
                <div class="inventory-col-subcat">
                  <select class="subcat-select" onchange="app.cambiarSubcategoria(${p.id}, this.value)">
                    <option value="Jugos" ${this.getSubcategoria(p, 'bebida') === 'Jugos' ? 'selected' : ''}>Jugos</option>
                    <option value="Cervezas" ${this.getSubcategoria(p, 'bebida') === 'Cervezas' ? 'selected' : ''}>Cervezas</option>
                  </select>
                </div>
                <div class="inventory-col-stock">
                  <input type="number" class="stock-input" value="${p.stock || 0}" min="0" />
                </div>
                <div class="inventory-col-action">
                  <button class="btn-delete-item" title="Eliminar"><span class="material-symbols-rounded">delete</span></button>
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        `,
        )
        .join('');

      const self = this;
      contBebidas.querySelectorAll('.stock-input').forEach((input) => {
        input.addEventListener('change', (e) => {
          const id = e.target.closest('.inventory-item-row').dataset.id;
          self.ajStockSeguro(id, e.target.value);
        });
      });

      contBebidas.querySelectorAll('.btn-delete-item').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const id = e.target.closest('.inventory-item-row').dataset.id;
          self.eliminarItem(id);
        });
      });
    }
  },

  cambiarSubcategoria(id, nuevaSubcat) {
    if (!this.validarAdmin()) return;
    const p = this.productos.find((x) => x.id === id);
    if (p) {
      p.subcategoria = nuevaSubcat;
      this.db.update({ productos: this.productos });
      this.actualizarCacheProductos();
      this.renderInventarioDash();
    }
  },

  // --- GRÁFICOS MODERNOS CON TABS ---
  mostrarGraficoMetodosPago() {
    window.tipoGraficoActual = 'metodos';
    this.actualizarBotonesGrafico('metodos');
    this.renderGraficoMetodosPago();
  },

  mostrarGraficoProductos() {
    window.tipoGraficoActual = 'productos';
    this.actualizarBotonesGrafico('productos');
    this.renderGraficoProductos();
  },

  actualizarBotonesGrafico(tipo) {
    const botones = document.querySelectorAll('.chart-tab-btn');
    botones.forEach((btn) => btn.classList.remove('active'));

    if (tipo === 'metodos') {
      botones[0]?.classList.add('active');
    } else if (tipo === 'productos') {
      botones[1]?.classList.add('active');
    }
  },

  renderGraficoMetodosPago() {
    const canvasElement = document.getElementById('analysisChart');
    if (!canvasElement) {
      console.error('Canvas element not found');
      return;
    }

    let tEfectivo = 0,
      tTransfer = 0;

    this.historial.forEach((v) => {
      if (v.pago === 'Efectivo') tEfectivo += v.total;
      if (v.pago === 'Transferencia') tTransfer += v.total;
      if (v.pago === 'Mixto') {
        tEfectivo += v.cashReceived || 0;
        tTransfer += v.transferAmount || 0;
      }
    });

    // Destruir gráfico anterior
    if (window.analysisChart instanceof Chart) {
      window.analysisChart.destroy();
      window.analysisChart = null;
    }

    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2D context');
      return;
    }

    window.analysisChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Efectivo', 'Transferencia'],
        datasets: [
          {
            label: 'Monto ($)',
            data: [tEfectivo, tTransfer],
            backgroundColor: ['#4f46e5', '#3b82f6'],
            borderColor: ['#4338ca', '#2563eb'],
            borderWidth: 0,
            borderRadius: 8,
            hoverBackgroundColor: ['#4338ca', '#2563eb'],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return '$' + value.toLocaleString();
              },
            },
          },
        },
      },
    });
  },

  renderGraficoProductos() {
    const canvasElement = document.getElementById('analysisChart');
    if (!canvasElement) {
      console.error('Canvas element not found');
      return;
    }

    let productosVendidos = {};

    this.historial.forEach((venta) => {
      venta.items.forEach((item) => {
        if (!productosVendidos[item.nombre]) {
          productosVendidos[item.nombre] = {
            cantidad: 0,
            precio: item.precio,
            total: 0,
          };
        }
        const qty = item.cantidad || 1;
        productosVendidos[item.nombre].cantidad += qty;
        productosVendidos[item.nombre].total += item.precio * qty;
      });
    });

    // Top 7 productos
    const top7 = Object.entries(productosVendidos)
      .sort((a, b) => b[1].cantidad - a[1].cantidad)
      .slice(0, 7)
      .map(([nombre, datos]) => ({
        nombre,
        cantidad: datos.cantidad,
      }));

    // Destruir gráfico anterior
    if (window.analysisChart instanceof Chart) {
      window.analysisChart.destroy();
      window.analysisChart = null;
    }

    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2D context');
      return;
    }

    const labels = top7.map((p) => p.nombre);
    const data = top7.map((p) => p.cantidad);

    window.analysisChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Cantidad Vendida',
            data: data,
            backgroundColor: '#4f46e5',
            borderColor: '#4f46e5',
            borderWidth: 0,
            borderRadius: 12,
            hoverBackgroundColor: '#4338ca',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
            },
          },
        },
      },
    });
  },

  renderGrafico() {
    if (!window.tipoGraficoActual) {
      window.tipoGraficoActual = 'metodos';
    }

    if (window.tipoGraficoActual === 'metodos') {
      this.renderGraficoMetodosPago();
    } else {
      this.renderGraficoProductos();
    }
  },

  logout() {
    localStorage.removeItem('marta_nombre');
    localStorage.removeItem('marta_modo');
    location.reload();
  },

  toggleDetalleVenta(idx) {
    const el = document.getElementById('detalleVenta-' + idx);
    if (el) {
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
  },

  cerrarMesa() {
    document.getElementById('modalMesa').style.display = 'none';
    const changeEl = document.getElementById('changeDisplay');
    if (changeEl) changeEl.textContent = 'Cambio: $0';

    // limpiar campos de transferencia
    const tr = document.getElementById('transferRef');
    if (tr) tr.value = '';
    const trAmt = document.getElementById('transferAmount');
    if (trAmt) trAmt.value = '0';

    // limpiar campos mixtos
    const mTrAmt = document.getElementById('mixedTransferAmount');
    if (mTrAmt) mTrAmt.value = '0';
    const mCash = document.getElementById('mixedCashReceived');
    if (mCash) mCash.value = '0';
    const mRef = document.getElementById('mixedTransferRef');
    if (mRef) mRef.value = '';
    const mChangeEl = document.getElementById('mixedChangeDisplay');
    if (mChangeEl) mChangeEl.textContent = 'Cambio: $0';

    // ocultar inputs
    const efBox = document.getElementById('efectivoBox');
    const trBox = document.getElementById('transferBox');
    const mixedBox = document.getElementById('mixedBox');
    if (efBox) efBox.style.display = 'none';
    if (trBox) trBox.style.display = 'none';
    if (mixedBox) mixedBox.style.display = 'none';
  },
};

window.onload = () => {
  app.init();
  // Controlar visibilidad del dashboard al cambiar tamaño de pantalla
  window.addEventListener('resize', () => {
    if (document.getElementById('v-reportetotal').style.display !== 'none') {
      app.mostrarDashboardSegunModo();
    }
  });
};
