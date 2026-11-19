/*
 * Actualiza SOLO la base de profesores (BDC: formación + experiencia) a partir de un
 * archivo de experiencia (hoja "Report" con columnas IDENTIFICACIÓN, NOMBRE, ..., FORMACIÓN
 * ACADÉMICA, EMPRESA, TIPO DE EXPERIENCIA, FECHA INICIO, FECHA FIN, DURACIÓN, ESTADO ACTUAL,
 * UNIDAD ACADÉMICA) y, opcionalmente, un archivo de formación académica aparte (columnas
 * IDENTIFICACIÓN, NOMBRE, NIVEL DE FORMACIÓN, PROGRAMA, INSTITUCIÓN, ...) que reemplaza el
 * fallback de texto por títulos verificados. Reutiliza los planes de estudio ya guardados en
 * data/datos_base.js (no hace falta volver a cargar esos Excel) y refresca los perfiles
 * docentes en vivo desde Firestore, igual que scripts/generar.js.
 *
 * Uso:  node scripts/actualizar_bdc.js "ruta/al/BDC.xlsx" ["ruta/a/FORMACION.xlsx"]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const Engine = require('../js/engine.js');
const Reportes = require('../js/reportes.js');
const { obtenerPerfilDocs } = require('./perfiles_firebase.js');

const APP = path.join(__dirname, '..');
const BDC_FILE = path.resolve(process.argv[2]);
const FORMACION_FILE = process.argv[3] ? path.resolve(process.argv[3]) : null;

(async () => {
  if (!fs.existsSync(BDC_FILE)) { console.error('No encuentro el archivo:', BDC_FILE); process.exit(1); }
  if (FORMACION_FILE && !fs.existsSync(FORMACION_FILE)) { console.error('No encuentro el archivo:', FORMACION_FILE); process.exit(1); }
  const hoy = Date.now();
  const ahoraISO = new Date(hoy).toISOString();

  // 1. Reutilizar los planes de estudio ya procesados en la última generación.
  global.window = {};
  const RUTA_DATOS = path.join(APP, 'data', 'datos_base.js');
  delete require.cache[require.resolve(RUTA_DATOS)];
  require(RUTA_DATOS);
  const anterior = global.window.DATOS_BASE;
  if (!anterior || !anterior.fuentes || !anterior.fuentes.planes || !anterior.fuentes.planes.length) {
    console.error('data/datos_base.js no tiene planes de estudio guardados; corre primero scripts/generar.js con los Excel de planes.');
    process.exit(1);
  }
  const planes = anterior.fuentes.planes;

  // 2. Perfiles docentes en vivo desde Firestore.
  const perfilDocs = await obtenerPerfilDocs();

  // 3. Nueva base BDC consolidada (formación + experiencia en un solo archivo).
  const buf = fs.readFileSync(BDC_FILE);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: false });
  const hojaNombre = wb.SheetNames.find(n => /^report$/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[hojaNombre], { defval: '', raw: false });
  const exp = Engine.procesarExperiencia(rows, hoy);

  // 3b. Formación académica aparte (opcional) — reemplaza el fallback de texto por títulos verificados.
  let formacion = null, bufForm = null, formNombre = null, formHoja = null;
  if (FORMACION_FILE) {
    bufForm = fs.readFileSync(FORMACION_FILE);
    const wbForm = XLSX.read(bufForm, { type: 'buffer', cellDates: false, raw: false });
    formHoja = wbForm.SheetNames.find(n => /^report$/i.test(n)) || wbForm.SheetNames[0];
    const rowsForm = XLSX.utils.sheet_to_json(wbForm.Sheets[formHoja], { defval: '', raw: false });
    const form = Engine.procesarFormacion(rowsForm);
    formNombre = path.basename(FORMACION_FILE);
    formacion = { archivo: formNombre, personas: [...form.profesores.values()] };
  }

  const fuentes = {
    planes,
    perfilDocs,
    formacion, // null => el motor extrae los títulos del texto "FORMACIÓN ACADÉMICA" de la experiencia
    experiencia: { archivo: path.basename(BDC_FILE), personas: [...exp.experiencia.values()] },
  };

  const huella = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
  const archivos = anterior.archivos.filter((a) => a.tipo === 'Plan de estudios');
  perfilDocs.forEach((d) => {
    const db = Buffer.from(JSON.stringify(d));
    archivos.push({
      tipo: 'Perfiles docentes', nombre: d.archivo,
      detalle: (d.programaDetectado || 'Programa no identificado') + ' · ' + d.perfiles.length + ' perfiles (Firestore: perfilesPublicos)',
      filas: d.perfiles.length, tamano: db.length, cargado: ahoraISO, huella: huella(db),
    });
  });
  archivos.push({
    tipo: formacion ? 'Profesores – experiencia (BDC)' : 'Profesores – formación y experiencia (BDC)', nombre: path.basename(BDC_FILE),
    detalle: 'hoja "' + hojaNombre + '" · ' + exp.filas + ' registros · ' + exp.experiencia.size + ' personas',
    filas: exp.filas, tamano: buf.length, cargado: ahoraISO, huella: huella(buf),
  });
  if (formacion) {
    archivos.push({
      tipo: 'Profesores – formación académica', nombre: formNombre,
      detalle: 'hoja "' + formHoja + '" · ' + formacion.personas.reduce((s, p) => s + p.titulos.length, 0) + ' títulos · ' + formacion.personas.length + ' personas',
      filas: formacion.personas.length, tamano: bufForm.length, cargado: ahoraISO, huella: huella(bufForm),
    });
  }

  const { ds, meta } = Engine.construirDataset(fuentes);
  meta.archivos = archivos;
  meta.generado = ahoraISO;

  const an = Engine.analizar(ds, Engine.DEFAULT_CONFIG, {});
  const ctx = Reportes.contexto(ds, an, { meta, fecha: hoy });

  // 4. Datos base para la aplicación
  const base = { version: Engine.VERSION, generado: meta.generado, archivos: meta.archivos, fuentes };
  fs.writeFileSync(RUTA_DATOS,
    '/* Datos base generados automáticamente a partir de los archivos fuente (' + ahoraISO + '). No editar a mano. */\n' +
    'window.DATOS_BASE = ' + JSON.stringify(base) + ';\n');

  // 5. Reportes
  const R = path.join(APP, 'Reportes');
  const RP = path.join(R, 'Por_programa');
  fs.mkdirSync(RP, { recursive: true });
  await Reportes.libroConsolidado(ExcelJS, ctx).xlsx.writeFile(path.join(R, 'Consolidado_Asignacion_Docente_Licenciaturas.xlsx'));
  await Reportes.libroPendientes(ExcelJS, ctx).xlsx.writeFile(path.join(R, 'Asignaturas_sin_docente_asignado.xlsx'));
  await Reportes.libroInventario(ExcelJS, ctx).xlsx.writeFile(path.join(R, 'Inventario_asignaturas_por_componente.xlsx'));
  await Reportes.libroMatriz(ExcelJS, ctx).xlsx.writeFile(path.join(R, 'Matriz_correspondencia_perfiles.xlsx'));
  for (const p of meta.programasPlan) {
    await Reportes.libroPrograma(ExcelJS, ctx, p).xlsx.writeFile(path.join(RP, 'Asignacion_' + Reportes.nombreArchivo(p) + '.xlsx'));
  }

  // 6. Resumen en consola
  const st = ctx.stats;
  console.log('BDC experiencia:', exp.experiencia.size, 'profesores (', exp.filas, 'registros )');
  if (formacion) console.log('Formación académica:', formacion.personas.length, 'profesores (', formacion.personas.reduce((s, p) => s + p.titulos.length, 0), 'títulos )');
  console.log('Programas:', st.programas, '| Asignaturas:', st.total, JSON.stringify(st.porComp));
  console.log('Estados:', JSON.stringify(st.porEstado));
  console.log('Docentes con carga:', st.docentes);
  ctx.qa.forEach((q) => console.log('[' + q.estado + ']', q.nombre, '—', q.detalle.slice(0, 160)));
  fs.writeFileSync(path.join(APP, 'data', 'resumen_generacion.json'), JSON.stringify({ fecha: ahoraISO, stats: { ...st }, qa: ctx.qa, archivos: meta.archivos }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
