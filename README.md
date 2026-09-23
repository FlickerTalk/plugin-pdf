# plugin-pdf

**PDF** para [FlickerTalk](https://flickertalk.com). Juntar varias fotos en un PDF, una por página, con modo documento (gris y contraste).

Todo ocurre en el teléfono: el plugin no tiene red, no ve la conversación, no ve
las claves y solo recibe el fichero que **el usuario** elige en el selector del
sistema. Lo que produce lo envía la app, nunca el plugin.

## Qué es un plugin de FlickerTalk

Una carpeta con un `module.json` y un `dist/index.js` que registra un web component.
Corre dentro de un iframe aislado (origen opaco, CSP propia) y solo puede usar lo que
el núcleo expone (`ft.pickFile`, `ft.send`, `ft.say`, `ft.save`, `ft.print`, `ft.fetch`,
`ft.store`, `ft.close`). El contrato está en
[plugin-sdk](https://github.com/FlickerTalk/plugin-sdk).

## Desarrollo

```sh
npm install
npm test
```

El paquete `.ftplugin` lo firma el catálogo de FlickerTalk; no se construye aquí.

## Licencia

MIT.
