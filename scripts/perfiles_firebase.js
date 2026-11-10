/*
 * Obtiene fuentes.perfilDocs directamente desde Firestore (colección pública
 * de solo lectura "perfilesPublicos" del aplicativo perfiles-docentes,
 * https://appsinteractivasedu.github.io/PerfilesdeProgramas/), en vez de
 * parsear los .docx "Perfil docente *.docx". Así los requisitos de perfil
 * que usa este motor de asignación siempre reflejan lo último aprobado por
 * el Director de Departamento en ese otro aplicativo, sin pasos manuales.
 *
 * No requiere credenciales: esa colección es de lectura pública (ver
 * firestore.rules del proyecto perfiles-de-programas). Usa el fetch nativo
 * (Node 18+ o navegador) contra la API REST de Firestore.
 *
 * Funciona tanto en Node (require('./perfiles_firebase.js'), usado por
 * scripts/cargar_fuentes.js al generar data/datos_base.js) como en el
 * navegador (<script src="scripts/perfiles_firebase.js">, usado por
 * js/app.js para refrescar los perfiles EN VIVO cada vez que se abre la
 * aplicación, sin depender de que alguien haya corrido generar.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PerfilesFirebase = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

const PROJECT_ID = 'perfiles-de-programas';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/perfilesPublicos`;

/* ---------- decodificación del formato REST de Firestore ---------- */
function decodeValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields((v.mapValue && v.mapValue.fields) || {});
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(decodeValue);
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}
function decodeFields(fields) {
  const out = {};
  for (const k of Object.keys(fields || {})) out[k] = decodeValue(fields[k]);
  return out;
}

async function listarTodos() {
  const docs = [];
  let pageToken = '';
  do {
    const url = BASE_URL + '?pageSize=300' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Firestore REST respondió ' + res.status + ' al leer perfilesPublicos (¿sigue publicada la regla de lectura pública?).');
    const data = await res.json();
    for (const d of data.documents || []) {
      const id = d.name.split('/').pop();
      docs.push({ id, ...decodeFields(d.fields) });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

/* ---------- misma convención que perfiles-docentes: "Nombre\nDescripción" ---------- */
function partirCompetencia(valor) {
  valor = valor || '';
  const i = valor.indexOf('\n');
  if (i === -1) return [valor.trim(), ''];
  return [valor.slice(0, i).trim(), valor.slice(i + 1).trim()];
}
const esCompetencia = (clave) => /^comp\d+$/.test(clave);

/**
 * PPI si el nombre empieza por "Práctica (Pedagógica|Profesional)"; Didáctica
 * si contiene "didáctica"; si no, Pedagógico. Mismo criterio de respaldo que
 * usa js/engine.js (esNombrePPI / compDeEncabezado) cuando no hay un
 * encabezado "Componente ..." explícito que lo diga. La clasificación que de
 * verdad usa el motor para evaluar viene del plan de estudios (Excel), no de
 * este campo — aquí solo evita que quede null (ver aplicaExclusionCN en
 * engine.js, que sí lo necesita para el caso de Ciencias Naturales).
 */
function inferirComponenteDoc(nombre) {
  const n = (nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/^practica (pedagogica|profesional)/.test(n)) return 'Práctica Pedagógica Investigativa';
  if (/didactic/.test(n)) return 'Didáctica de las Disciplinas';
  return 'Pedagógico';
}

/** Construye un "perfil" con la misma forma que produce Engine.parsePerfiles() para un curso de un .docx. */
function construirPerfil(doc) {
  const titulo = doc.nombre || '';
  const transicion = /\(\s*plan de transi[cç]+i[oó]n\s*\)\s*$/i.test(titulo);
  const asignatura = titulo.replace(/\s*\(\s*plan de transi[cç]+i[oó]n\s*\)\s*$/i, '').trim();
  const componentes = doc.componentes || {};

  const competencias = Object.keys(componentes)
    .filter(esCompetencia)
    .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10))
    .map((clave) => {
      const [nombre, descripcion] = partirCompetencia(componentes[clave].valor);
      return { nombre: componentes[clave].etiqueta || nombre, descripcion };
    });

  const perfil = {
    id: '', // Engine.construirDataset lo recalcula siempre (hash de programa+título); no hace falta ponerlo aquí.
    programa: null, // idem: Engine.construirDataset lo resuelve con matchPrograma(programaDetectado, ...).
    archivo: 'perfilesPublicos (Firestore: ' + doc.id + ')',
    titulo,
    asignatura,
    planTransicion: transicion,
    componenteDoc: inferirComponenteDoc(asignatura),
    descripcion: '',
    pregrado: (componentes.pregrado && componentes.pregrado.valor) || '',
    posgrado: (componentes.posgradual && componentes.posgradual.valor) || '',
    experiencia: (componentes.experiencia && componentes.experiencia.valor) || '',
    investigacion: '', // perfiles-docentes no maneja esta categoría por separado.
    idoneidad: (componentes.idoneidad && componentes.idoneidad.valor) || '',
    competencias,
    otros: [],
    alertas: [],
  };
  if (!perfil.pregrado) perfil.alertas.push('El perfil no define la formación de pregrado.');
  if (!perfil.posgrado) perfil.alertas.push('El perfil no define la formación posgradual.');
  if (!perfil.experiencia) perfil.alertas.push('El perfil no define la sección de experiencia docente y profesional.');
  if (/^t[ií]tulo de licenciad/i.test(perfil.posgrado)) {
    perfil.alertas.push('La sección de formación posgradual contiene texto de pregrado (posible error de edición del documento).');
  }
  return perfil;
}

/**
 * Devuelve fuentes.perfilDocs: un "documento" sintético por programa (igual
 * forma que si fuera un .docx cargado), listo para Engine.construirDataset.
 */
async function obtenerPerfilDocs() {
  const docs = await listarTodos();
  const porPrograma = new Map();
  for (const d of docs) {
    const clave = d.programaId || d.nombrePrograma || '(sin programa)';
    if (!porPrograma.has(clave)) porPrograma.set(clave, { programaId: clave, nombrePrograma: d.nombrePrograma, asignaturas: [] });
    porPrograma.get(clave).asignaturas.push(d);
  }
  return [...porPrograma.values()]
    .sort((a, b) => (a.nombrePrograma || '').localeCompare(b.nombrePrograma || '', 'es'))
    .map((grupo) => ({
      archivo: 'perfilesPublicos:' + grupo.programaId,
      programaDetectado: grupo.nombrePrograma,
      programa: null,
      perfiles: grupo.asignaturas
        .slice()
        .sort((a, b) => (b.orden ?? 0) - (a.orden ?? 0))
        .map(construirPerfil),
    }));
}

  return { obtenerPerfilDocs };
});

if (typeof module === 'object' && module.exports && require.main === module) {
  module.exports.obtenerPerfilDocs()
    .then((docs) => {
      console.log(`Programas leídos de Firestore: ${docs.length}`);
      for (const d of docs) console.log(`  ${d.programaDetectado}: ${d.perfiles.length} asignaturas`);
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
