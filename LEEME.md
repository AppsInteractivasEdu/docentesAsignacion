# APLICATIVO 2.0 — Asignación Docente · Licenciaturas

Herramienta de apoyo del Departamento de Pedagogía y Didáctica para proponer, revisar y aprobar la asignación docente de los componentes Pedagógico, Didáctica de las Disciplinas y Práctica Pedagógica Investigativa (PPI). Esta versión incorpora la **Fase 7** (continuidad 2026-II → 2027-I) y un rediseño visual.

## Cómo abrirla
- **Windows:** doble clic en `Abrir_aplicacion_Windows.bat`. Usa Python si está instalado; si no, usa `servidor.ps1` (PowerShell, sin instalar nada). Abre `http://localhost:8765`.
- **Directo:** abrir `index.html` en Chrome o Edge (funciona sin internet; la tipografía Inter/Plus Jakarta Sans requiere conexión la primera vez y, si no hay, se usa una fuente del sistema).
- La primera vez se crea el usuario Administrador. Los datos (usuarios, decisiones) se guardan **en el navegador y por dirección**: `file://` y `localhost:8765` son almacenes distintos. Use siempre la misma forma de abrirla o restaure un respaldo `.json`.

## Regenerar los datos base (`data/datos_base.js`)
Ese archivo (no editar a mano) se genera con:
```
cd scripts
npm install        # solo la primera vez
node generar.js    # lee la carpeta padre del proyecto (o la que se le pase como argumento)
```
Lee de la carpeta indicada: `*plan*.xlsx` (plan de estudios), el archivo de formación académica (`*formaci*.xlsx`) y el de experiencia (`*experiencia*.xlsx`) de los profesores.

**Los perfiles docentes por asignatura (pregrado, posgrado, experiencia, competencias, idoneidad) ya NO se leen de los `.docx` "Perfil docente *.docx".** Se leen en vivo desde `perfilesPublicos`, una colección pública de solo lectura en el Firestore del aplicativo [perfiles-docentes](https://appsinteractivasedu.github.io/PerfilesdeProgramas/) (ver `scripts/perfiles_firebase.js`). Así siempre se usa el último texto aprobado por el Director de Departamento en ese aplicativo, sin pasos manuales ni archivos Word que mantener sincronizados. Requiere conexión a internet al generar; no necesita credenciales (la colección es de lectura pública).

## Archivos nuevos o modificados en la Fase 7
| Archivo | Cambio |
|---|---|
| `js/engine.js` | Reglas de continuidad, progresión cíclica de PPI, pregrado en PPI, carga institucional total, nuevos estados |
| `js/fase7.js` | Indicadores y alertas de continuidad (integrados en «Asignación docente») |
| `js/reportes.js` | Hojas «COMPARATIVO 2026-II vs 2027-I», «NO ASIGNADOS 2026-II», «AUTORIZACIONES PPI» |
| `js/app.js`, `index.html`, `css/app.css` | Carga de archivos de la Fase 7, nuevas vistas y rediseño |

## Formato del archivo «Asignación Docente 2026-2.xlsx»
Hoja preferida **CONSOLIDADO** (si no existe, se leen todas). Columnas requeridas: `PROGRAMA`, `NUMERO` (identificación, se cruza con la base de profesores), `DOCENTE`, `ASIGNATURA`. Se usan además `PERIODO`, `GRUPO` y `COD. MAT`.

## Archivo opcional de carga institucional 2027-I
Primera hoja con una columna de identificación (`IDENTIFICACIÓN`, `CEDULA`, `NUMERO` o `DOCUMENTO`) o de nombre (`NOMBRE`/`DOCENTE`) y una columna `HORAS` con las horas ya comprometidas en otras unidades académicas.

## Reglas aplicadas (Fase 7)
- Continuidad: se propone al profesor de 2026-II solo si acredita el perfil vigente (requisitos verificables acreditados) y le queda carga.
- Progresión PPI: nivel n → n+1; PPI VI / Práctica Profesional → PPI I. Tiene prioridad sobre repetir el nivel. El docente que venía en el nivel anterior **se propone siempre**, sin exigir ningún requisito del perfil (pregrado, posgrado, experiencia, hoja de vida) — esa validación la hace el Director manualmente al revisar la propuesta ya hecha. El único límite que sigue aplicando es el tope de horas: si no cabe, no se propone automáticamente; el Director puede igual asignarlo a mano con «Seleccionar por continuidad» (avisado del exceso de carga), y esa decisión queda registrada con motivo en la trazabilidad.
- Pregrado primero (componentes Pedagógico y Didáctica de las Disciplinas, y PPI fuera de una cadena de progresión): solo se proponen y sugieren docentes con pregrado afín. Sin pregrado afín se evalúa el posgrado, pero no se asigna: queda «Pendiente de autorización del Director» y el Director decide manualmente.
- Antecedente del componente Pedagógico (Plan anterior): estas asignaturas son transversales y en el histórico 2026-II suelen quedar registradas bajo «Facultad Ciencias de la Educación», no bajo cada licenciatura. Por eso, además de buscar en el propio programa, la continuidad también revisa esas filas de Facultad (con las mismas reglas de afinidad de perfil que cualquier continuidad — PPI no se ve afectado por esto, conserva su propia restricción de progresión por nivel).
- Continuidad: el docente de 2026-II continúa solo si su pregrado es afín y cumple el resto del perfil; si no, se sugieren otros docentes.
- Carga total máxima de 8 h = horas de esta propuesta + horas comprometidas en otras unidades.
- Todas las asignaciones son propuestas sujetas a revisión y aprobación académica.
