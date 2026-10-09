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

Desde la 1.1.4 la ventana va en los envoltorios de Ionic que la app presta al marco (barra en
`ion-header`, cuerpo en `ion-content`, botones de Ionic), así que se ve como el resto de
FlickerTalk; pide la app 1.6.0 (`minCoreVersion`) y el paquete no lleva Ionic. `@ionic/core` es
solo `devDependency`, para que los tests pinten lo mismo que el teléfono.

## Desarrollo

```sh
npm install
npm test
```

El paquete `.ftplugin` lo firma el catálogo de FlickerTalk; no se construye aquí.

## Licencia

MIT.
