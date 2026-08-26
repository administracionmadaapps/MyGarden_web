# Web de MyGarden AI

Las páginas legales públicas de la aplicación. Existen porque Google Play exige
dos URLs accesibles **sin instalar nada**: la política de privacidad, que va en
la ficha de la app, y una vía para pedir el borrado de datos, que se declara en
el formulario de seguridad de datos.

## Los HTML no se editan a mano

Se generan desde los ficheros legales de la propia aplicación:

```
node build.mjs
```

Eso lee `../MyGarden/app/src/main/res/raw/legal_*.txt` y `../MyGarden/app/src/
main/res/values/strings.xml`, y escribe los `.html` de esta carpeta.

**Por qué se genera en vez de copiar.** Los mismos textos legales viven en dos
sitios: dentro del apk y aquí. Copiándolos a mano, el día que se retoque un
párrafo la web se queda vieja sin que nadie se entere, y entonces la aplicación
y la web dirían cosas distintas sobre cómo se tratan los datos de alguien. Eso
no es un despiste, es un incumplimiento.

Hay que volver a ejecutarlo cada vez que cambie:

- cualquier `legal_*.txt` de la aplicación,
- `contenido/borrar-datos.txt`, que es el único texto propio de la web,
- `legal_owner` o `legal_contact` en `strings.xml`.

El script asume que **este repositorio y el de la aplicación son carpetas
hermanas**. Si dejan de estarlo, la ruta está en una sola línea de `build.mjs`.

## Qué hay

| fichero | de dónde sale |
|---|---|
| `index.html` | escrito en `build.mjs`; es la puerta, no un texto legal |
| `privacidad.html` | `legal_datos.txt` |
| `borrar-datos.html` | `contenido/borrar-datos.txt` |
| `terminos.html` | `legal_terminos.txt` |
| `ia.html` | `legal_ia.txt` + `legal_ia_limites.txt` |

`estilo.css` se edita a mano. Los colores son los de la aplicación, para que
quien llegue desde la ficha de Play reconozca que es lo mismo.

## Limitación que conviene tener presente

GitHub Pages sirve ficheros estáticos y nada más. La baja de datos **no puede
ser un formulario** que envíe nada: es un correo. Para Play eso vale, y además
evita montar un sitio donde se recogen datos personales para tramitar que se
borren datos personales.
