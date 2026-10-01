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

/**
 * Lo que va en cada página, en el orden de la portada. `fuentes` se concatenan
 * en el orden dado. `indice` añade "En esta página" arriba: las páginas largas
 * lo piden; la de borrar datos no, porque lo que importa está ya a la vista.
 */
const paginas = [
  {
    salida: "borrar-datos.html",
    titulo: "Eliminar tus datos",
    entradilla:
      "Cómo eliminar tu cuenta y todo lo que tenga asociado, con la aplicación instalada o sin ella.",
    fuentes: [{ fichero: join(aqui, "contenido", "borrar-datos.txt") }],
  },
  {
    salida: "privacidad.html",
    titulo: "Protección de datos",
    entradilla:
      "Qué datos registra MyGarden AI, dónde se guardan y qué puedes hacer con ellos.",
    fuentes: [{ fichero: join(raw, "legal_datos.txt") }],
    indice: true,
  },
  {
    salida: "ia.html",
    titulo: "Uso de inteligencia artificial",
    entradilla:
      "Qué se envía al modelo, con qué límites, y hasta dónde llega lo que responde.",
    // Dos ficheros en una página: en la app son dos apartados plegables del
    // mismo bloque, y separarlos aquí obligaría a leer medio asunto. Cada
    // fichero abre con su título (h2) y sus apartados cuelgan de él (h3).
    fuentes: [
      { fichero: join(raw, "legal_ia.txt"), titulo: "Cómo se tratan tus imágenes" },
      { fichero: join(raw, "legal_ia_limites.txt"), titulo: "Límites de la información" },
    ],
    indice: true,
  },
  {
    salida: "terminos.html",
    titulo: "Condiciones de uso",
    entradilla: "Las condiciones que acepta quien usa la aplicación.",
    fuentes: [{ fichero: join(raw, "legal_terminos.txt") }],
    indice: true,
  },
];

/**
 * El responsable y el correo salen de strings.xml, que es de donde los saca
 * también la aplicación. Leerlos de ahí y no repetirlos aquí es lo que evita
 * que la web nombre a un responsable y la app a otro.
 */
function valorDeStrings(nombre, carpeta = "values") {
  const xml = readFileSync(join(app, carpeta, "strings.xml"), "utf8");
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

/**
 * El lema de la portada. Sale de `values-es` y no del fichero base porque esta
 * web está en español; en la app viaja aparte del dibujo del logo por lo mismo
 * que aquí: dentro del PNG se quedaría en un solo idioma.
 */
const lema = valorDeStrings("app_tagline", "values-es");

function escapar(texto) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Parte el formato de res/raw en trozos de texto: los que empiezan por "# " son
 * subtítulos y el resto párrafos. Es deliberadamente pobre, igual que el que
 * pinta la aplicación: párrafos separados por una línea en blanco, y nada más,
 * porque nada más hay.
 *
 * Las líneas de dentro de un párrafo van cortadas a lo ancho del fichero y se
 * vuelven a unir: los saltos son del fichero, no del texto.
 *
 * **Un subtítulo se lleva solo su primera línea.** En los ficheros el "# " no
 * lleva línea en blanco detrás, así que el título y el párrafo que le sigue
 * caen en el mismo bloque; sin separarlos, el párrafo entero se pinta como
 * título. La aplicación tenía este mismo fallo y se arregló a la vez.
 */
function trozos(texto) {
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
    .filter((trozo) => trozo.length > 0);
}

/**
 * El id de un título, para poder enlazarlo: en minúsculas, sin tildes y con
 * guiones. Si ya hay uno igual en la página se numera, porque un id repetido
 * lleva siempre al primero sin avisar.
 */
function idDe(texto, usados) {
  const base =
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "apartado";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  usados.add(id);
  return id;
}

/**
 * Pasa los trozos a html. Cada uno es `{ nivel, texto }` si es un título (2 o
 * 3) o `{ texto }` si es un párrafo. Devuelve también los títulos con su id,
 * que es lo que necesita el índice de la página.
 */
function apartados(items) {
  const usados = new Set();
  const titulos = [];
  const html = items
    .map(({ nivel, texto }) => {
      if (!nivel) return `      <p>${enlazar(escapar(texto))}</p>`;
      const id = idDe(texto, usados);
      titulos.push({ nivel, texto, id });
      return `      <h${nivel} id="${id}">${enlazar(escapar(texto))}</h${nivel}>`;
    })
    .join("\n");
  return { html, titulos };
}

/**
 * "En esta página", plegado: las páginas largas son decenas de pantallas en un
 * móvil, pero desplegado empujaría el texto hacia abajo antes de empezar. Los
 * apartados de segundo nivel van sangrados, nada más: la lista es plana.
 */
function indicePagina(titulos) {
  const enlaces = titulos
    .map(
      ({ nivel, texto, id }) =>
        `          <li${nivel === 3 ? ' class="sub"' : ""}><a href="#${id}">${escapar(texto)}</a></li>`
    )
    .join("\n");
  return `      <nav class="contenido" aria-label="En esta página">
        <details>
          <summary>En esta página</summary>
          <ul>
${enlaces}
          </ul>
        </details>
      </nav>`;
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
    <link rel="stylesheet" href="estilo.css" />
  </head>
  <body>
    <div class="envoltorio">
      <header${esPortada ? ' class="portada"' : ""}>
        ${
          // En la portada no hay marca sobre el título: el título ya es la
          // marca, y repetirla dejaba "MyGarden AI" dos veces seguidas.
          esPortada ? "" : '<a class="marca" href="index.html">&larr; MyGarden AI</a>'
        }
        ${
          // En la portada el título es el logo, que ya trae el nombre dibujado
          // dentro: va dentro del h1 para que el encabezado siga existiendo
          // para quien no ve la imagen, con el nombre en su texto alternativo.
          //
          // **El fondo blanco del dibujo viaja pegado** y aquí hay modo
          // oscuro, así que se ve un recuadro claro. Es a propósito (David,
          // sep 2026): es el mismo recorte con esquinas redondeadas que la app
          // pone sobre la foto de la portada.
          esPortada
            ? `<h1 class="logo"><img src="logo.jpg" alt="MyGarden AI" width="1024" height="806" /></h1>
        <p class="lema">${escapar(lema)}</p>`
            : `<h1>${escapar(titulo)}</h1>`
        }
        ${
          // La portada no lleva entradilla: debajo del logo y el lema, una
          // tercera frase presentando la aplicación sobraba (David, sep 2026).
          // El texto sigue existiendo como `description` de la página, que es
          // lo que leen los buscadores y lo que se ve al compartir el enlace.
          esPortada ? "" : `<p class="entradilla">${escapar(entradilla)}</p>`
        }
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
  const items = pagina.fuentes.flatMap(({ fichero, titulo }) => {
    const texto = readFileSync(fichero, "utf8")
      .replaceAll("{responsable}", responsable)
      .replaceAll("{contacto}", contacto);
    // Un fichero con título propio es un grupo (h2) y sus apartados cuelgan de
    // él (h3); sin título, los apartados son el primer nivel de la página.
    const nivel = titulo ? 3 : 2;
    return [
      ...(titulo ? [{ nivel: 2, texto: titulo }] : []),
      ...trozos(texto).map((t) =>
        t.startsWith("# ") ? { nivel, texto: t.slice(2) } : { texto: t }
      ),
    ];
  });
  const { html, titulos } = apartados(items);
  const cuerpo = (pagina.indice ? indicePagina(titulos) + "\n" : "") + html;

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
