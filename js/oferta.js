/*
 * Oferta 2027-I definida por los directores de programa (aplicativo Perfiles Docentes).
 *
 * La colección `ofertas2027I` de Firestore NO es pública: cada director solo ve la de su programa y
 * el Director de Departamento ve todas. Por eso este módulo pide iniciar sesión (una sola vez por
 * equipo/navegador; la sesión de Firebase queda guardada) con la cuenta del Director de Departamento
 * del aplicativo de Perfiles Docentes, y luego sigue la colección EN TIEMPO REAL (onSnapshot).
 * El SDK de Firebase se carga bajo demanda desde gstatic.com (requiere internet). La contraseña solo
 * viaja a Firebase Authentication; esta aplicación no la guarda.
 *
 * Cada fila entregada: { id, programaId, nombrePrograma, acuerdo, plan, asignatura, creditos,
 *   componente, orden, grupos (null = sin definir, 0 = SIN OFERTAR, 1..10), actualizadoPor, actualizadoEn (ms) }
 *
 * Estado que se informa (onEstado): { modo, ok, ultima, usuario, error } con modo =
 *   'conectando' | 'requiere-sesion' | 'tiempo-real' | 'sin-permiso' | 'sin-conexion'
 */
(function (root) {
  'use strict';

  const COLECCION = 'ofertas2027I';
  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  // Configuración web pública del proyecto (la misma que ya usa el aplicativo de Perfiles Docentes).
  const CONFIG = {
    apiKey: 'AIzaSyC8asRnWPBAkPSjKBUwfp4zVdHdvcZQdCE',
    authDomain: 'perfiles-de-programas.firebaseapp.com',
    projectId: 'perfiles-de-programas',
    storageBucket: 'perfiles-de-programas.firebasestorage.app',
    messagingSenderId: '482154630881',
    appId: '1:482154630881:web:5b37c805ed10b474a6f1a0',
  };

  let M = null; // { auth, fs, db, auth }
  let bajaDatos = null, bajaAuth = null, onDatos = null, onEstado = null;

  function aFila(id, d) {
    let t = d.actualizadoEn;
    if (t && typeof t.toMillis === 'function') t = t.toMillis();
    else if (typeof t === 'string') t = Date.parse(t) || null;
    return {
      id, programaId: d.programaId, nombrePrograma: d.nombrePrograma, acuerdo: d.acuerdo, plan: d.plan,
      asignatura: d.asignatura, creditos: d.creditos, componente: d.componente, orden: d.orden,
      grupos: d.grupos == null ? null : Number(d.grupos), actualizadoPor: d.actualizadoPor || '', actualizadoEn: t || null,
    };
  }

  async function cargarSDK() {
    if (M) return M;
    const [app, au, fs] = await Promise.all([
      import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
    ]);
    const a = app.getApps().find(x => x.name === 'oferta-lectura') || app.initializeApp(CONFIG, 'oferta-lectura');
    M = { au, fs, auth: au.getAuth(a), db: fs.getFirestore(a) };
    return M;
  }

  function cerrarDatos() { if (bajaDatos) { try { bajaDatos(); } catch (e) { /* ya cerrado */ } bajaDatos = null; } }

  function seguirDatos(usuario) {
    cerrarDatos();
    onEstado({ modo: 'conectando', ok: false, ultima: Date.now(), usuario: usuario.email });
    bajaDatos = M.fs.onSnapshot(M.fs.collection(M.db, COLECCION), snap => {
      onDatos(snap.docs.map(d => aFila(d.id, d.data())));
      onEstado({ modo: 'tiempo-real', ok: true, ultima: Date.now(), usuario: usuario.email, enCache: snap.metadata.fromCache });
    }, err => {
      const sinPermiso = err && err.code === 'permission-denied';
      onEstado({
        modo: sinPermiso ? 'sin-permiso' : 'sin-conexion', ok: false, ultima: Date.now(), usuario: usuario.email,
        error: sinPermiso ? 'La cuenta ' + usuario.email + ' no puede ver toda la oferta (debe ser la del Director de Departamento).' : String(err && err.message || err),
      });
    });
  }

  function iniciar(datos, estado) {
    detener();
    onDatos = datos; onEstado = estado || function () {};
    cargarSDK().then(m => {
      bajaAuth = m.au.onAuthStateChanged(m.auth, usuario => {
        if (!usuario) { cerrarDatos(); onEstado({ modo: 'requiere-sesion', ok: false, ultima: Date.now() }); return; }
        seguirDatos(usuario);
      });
    }).catch(e => {
      console.warn('Oferta 2027-I: no se pudo cargar el SDK de Firebase (¿sin internet?).', e);
      onEstado({ modo: 'sin-conexion', ok: false, ultima: Date.now(), error: 'No se pudo conectar con Firebase (revise su conexión a internet).' });
    });
  }

  function detener() {
    cerrarDatos();
    if (bajaAuth) { try { bajaAuth(); } catch (e) { /* ya cerrado */ } bajaAuth = null; }
  }

  async function iniciarSesion(correo, clave) {
    const m = await cargarSDK();
    return m.au.signInWithEmailAndPassword(m.auth, String(correo).trim(), clave);
  }
  async function cerrarSesion() {
    if (!M) return;
    await M.au.signOut(M.auth);
  }

  function mensajeError(e) {
    switch (e && e.code) {
      case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': return 'Usuario o contraseña incorrectos.';
      case 'auth/invalid-email': return 'El correo no tiene un formato válido.';
      case 'auth/too-many-requests': return 'Demasiados intentos. Espere un momento e inténtelo de nuevo.';
      case 'auth/network-request-failed': return 'No hay conexión con Firebase. Revise su internet.';
      default: return 'No fue posible iniciar sesión' + (e && e.message ? ' (' + e.message + ')' : '') + '.';
    }
  }

  root.Oferta = { iniciar, detener, iniciarSesion, cerrarSesion, mensajeError, COLECCION };
})(typeof self !== 'undefined' ? self : this);
