// Genera las páginas de la web a partir de los textos legales de la app.
//
// Existe por un motivo concreto: **los textos legales tienen que decir lo
// mismo en los dos sitios**. La aplicación los lleva empaquetados en
// res/raw y Google Play exige publicarlos en una URL pública. Copiándolos a
// mano, el día que se retoque un párrafo la web se queda vieja sin que nadie
// se entere, y en un texto legal eso no es un despiste: es decir dos cosas
// distintas sobre cómo se tratan los datos de alguien.
//
// Se ejecuta con:  node build.mjs
//
// Hay que volver a ejecutarlo cada vez que cambie un fichero de res/raw o los
// valores de legal_owner y legal_contact.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));

// La app, como carpeta hermana de esta. Si algún día dejan de estar juntas,
// esta línea es lo único que hay que cambiar.
const app = join(aqui, "..", "MyGarden", "app", "src", "main", "res");
const raw = join(app, "raw");

/** Lo que va en cada página. `fuentes` se concatenan en el orden dado. */
const paginas = [
  {
    salida: "privacidad.html",
    titulo: "Protección de datos",
    entradilla:
      "Qué datos registra MyGarden AI, dónde se guardan y qué puedes hacer con ellos.",
    fuentes: [{ fichero: join(raw, "legal_datos.txt") }],
  },
  {
    salida: "borrar-datos.html",
    titulo: "Eliminar tus datos",
    entradilla:
      "Cómo eliminar tu cuenta y todo lo que tenga asociado, con la aplicación instalada o sin ella.",
    fuentes: [{ fichero: join(aqui, "contenido", "borrar-datos.txt") }],
  },
  {
    salida: "terminos.html",
    titulo: "Condiciones de uso",
    entradilla: "Las condiciones que acepta quien usa la aplicación.",
    fuentes: [{ fichero: join(raw, "legal_terminos.txt") }],
  },
  {
    salida: "ia.html",
    titulo: "Uso de inteligencia artificial",
    entradilla:
      "Qué se envía al modelo, con qué límites, y hasta dónde llega lo que responde.",
    // Dos ficheros en una página: en la app son dos apartados plegables del
    // mismo bloque, y separarlos aquí obligaría a leer medio asunto.
    fuentes: [
      { fichero: join(raw, "legal_ia.txt"), titulo: "Cómo se tratan tus imágenes" },
      { fichero: join(raw, "legal_ia_limites.txt"), titulo: "Límites de la información" },
    ],
  },
];

/**
 * El responsable y el correo salen de strings.xml, que es de donde los saca
 * también la aplicación. Leerlos de ahí y no repetirlos aquí es lo que evita
 * que la web nombre a un responsable y la app a otro.
 */
function valorDeStrings(nombre) {
  const xml = readFileSync(join(app, "values", "strings.xml"), "utf8");
  const encontrado = xml.match(
    new RegExp(`<string name="${nombre}"[^>]*>([^<]*)</string>`)
  );
  if (!encontrado) {
    throw new Error(`Falta ${nombre} en strings.xml`);
  }
  return encontrado[1].trim();
}

const responsable = valorDeStrings("legal_owner");
const contacto = valorDeStrings("legal_contact");

function escapar(texto) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convierte el formato de res/raw en html. Es deliberadamente pobre, igual
 * que el que pinta la aplicación: párrafos separados por una línea en blanco,
 * y los que empiezan por "# " son subtítulos. Nada más, porque nada más hay.
 *
 * Las líneas de dentro de un párrafo van cortadas a lo ancho del fichero y se
 * vuelven a unir: los saltos son del fichero, no del texto.
 *
 * **Un subtítulo se lleva solo su primera línea.** En los ficheros el "# " no
 * lleva línea en blanco detrás, así que el título y el párrafo que le sigue
 * caen en el mismo bloque; sin separarlos, el párrafo entero se pinta como
 * título. La aplicación tenía este mismo fallo y se arregló a la vez.
 */
function aHtml(texto) {
  return texto
    .trim()
    .split(/\n\s*\n/)
    .flatMap((bloque) => {
      const limpio = bloque.trim();
      if (!limpio.startsWith("# ")) return [limpio];
      const salto = limpio.indexOf("\n");
      return salto === -1
        ? [limpio]
        : [limpio.slice(0, salto), limpio.slice(salto + 1)];
    })
    .map((trozo) => trozo.trim().split("\n").map((l) => l.trim()).join(" "))
    .filter((trozo) => trozo.length > 0)
    .map((trozo) =>
      trozo.startsWith("# ")
        ? `      <h2>${enlazar(escapar(trozo.slice(2)))}</h2>`
        : `      <p>${enlazar(escapar(trozo))}</p>`
    )
    .join("\n");
}

/**
 * Los dos únicos enlaces que aparecen en estos textos, puestos a mano y no
 * detectando direcciones por su forma: un detector se equivoca con los puntos
 * finales y aquí solo hay dos casos.
 *
 * Se hace después de escapar para no romper las comillas del atributo.
 */
function enlazar(html) {
  return html
    .replaceAll(contacto, `<a href="mailto:${contacto}">${contacto}</a>`)
    .replaceAll(
      "www.aepd.es",
      '<a href="https://www.aepd.es" rel="noopener">www.aepd.es</a>'
    );
}

function plantilla({ titulo, entradilla, cuerpo, esPortada = false }) {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esPortada ? "MyGarden AI" : `${escapar(titulo)} · MyGarden AI`}</title>
    <meta name="description" content="${escapar(entradilla)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="estilo.css" />
  </head>
  <body>
    <div class="envoltorio">
      <header>
        ${
          // En la portada no hay marca sobre el título: el título ya es la
          // marca, y repetirla dejaba "MyGarden AI" dos veces seguidas.
          esPortada ? "" : '<a class="marca" href="index.html">&larr; MyGarden AI</a>'
        }
        <h1>${escapar(titulo)}</h1>
        <p class="entradilla">${escapar(entradilla)}</p>
      </header>
${cuerpo}
      <footer>
        <p>
          Responsable: ${escapar(responsable)} &middot;
          <a href="mailto:${contacto}">${contacto}</a>
        </p>
        <p>Última actualización: ${hoy()}</p>
      </footer>
    </div>
  </body>
</html>
`;
}

/**
 * La fecha se pone al generar y no a mano: una política de privacidad sin
 * fecha, o con una que se quedó vieja, no dice desde cuándo rige.
 */
function hoy() {
  return new Date().toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

for (const pagina of paginas) {
  const cuerpo = pagina.fuentes
    .map(({ fichero, titulo }) => {
      const texto = readFileSync(fichero, "utf8")
        .replaceAll("{responsable}", responsable)
        .replaceAll("{contacto}", contacto);
      const encabezado = titulo ? `      <h2>${escapar(titulo)}</h2>\n` : "";
      return encabezado + aHtml(texto);
    })
    .join("\n");

  writeFileSync(join(aqui, pagina.salida), plantilla({ ...pagina, cuerpo }), "utf8");
  console.log(`  ${pagina.salida}`);
}

// La portada se escribe aquí y no sale de ningún .txt: no es un texto legal,
// es la puerta. Su trabajo es que quien llega buscando una cosa concreta
// —normalmente borrar sus datos— la encuentre sin leer nada más.
const portada = `      <ul class="indice">
        <li>
          <a href="borrar-datos.html">
            <strong>Eliminar tus datos</strong>
            <span>Cómo borrar tu cuenta, con la aplicación o sin ella</span>
          </a>
        </li>
        <li>
          <a href="privacidad.html">
            <strong>Protección de datos</strong>
            <span>Qué se registra, dónde se guarda y qué derechos tienes</span>
          </a>
        </li>
        <li>
          <a href="ia.html">
            <strong>Uso de inteligencia artificial</strong>
            <span>Qué se envía al modelo y hasta dónde llega su respuesta</span>
          </a>
        </li>
        <li>
          <a href="terminos.html">
            <strong>Condiciones de uso</strong>
            <span>Las condiciones que acepta quien usa la aplicación</span>
          </a>
        </li>
      </ul>`;

writeFileSync(
  join(aqui, "index.html"),
  plantilla({
    titulo: "MyGarden AI",
    entradilla:
      "Aplicación para cuidar tus plantas: identifícalas con una foto, apunta sus riegos y sigue cómo están.",
    cuerpo: portada,
    esPortada: true,
  }),
  "utf8"
);
console.log("  index.html");
