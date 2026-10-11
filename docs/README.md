# Documentación de Crm Hub 360

| Documento | Para qué sirve |
|---|---|
| [`../README.md`](../README.md) | Visión general, instalación y comandos básicos |
| [ARQUITECTURA](ARQUITECTURA.md) | Piezas, aislamiento por empresa, ajustes, tablas y flujos |
| [OPERACION](OPERACION.md) | Despliegue a prod y empresas, respaldos, pruebas y problemas conocidos |
| [VERSIONES](VERSIONES.md) | SemVer, etiquetas de git, cómo sacar una versión y volver atrás |
| [DESARROLLO](DESARROLLO.md) | Estructura del repo, convenciones y recetas |
| [ESPOCRM-PERSONALIZACION](ESPOCRM-PERSONALIZACION.md) | Qué se agrega a EspoCRM (PHP, hooks, cliente, tema, PWA) |
| [MANUAL-USUARIO](MANUAL-USUARIO.md) | Manual de usuario completo (generado desde el del CRM) |

**Módulos** (cómo funciona cada área por dentro): [Formularios web](modulos/FORMULARIOS.md) · [Comercial virtual](modulos/COMERCIAL-VIRTUAL.md) · [Mensajería](modulos/MENSAJERIA.md) · [Tiempo real y notificaciones](modulos/TIEMPO-REAL.md) · [Centro de control](modulos/CENTRO-DE-CONTROL.md)

**Referencia generada** (`bin/gen-docs`): [API del Hub](referencia/API-HUB.md) · [API del Centro](referencia/API-CENTRO.md) · [Rutas de EspoCRM](referencia/RUTAS-ESPO.md) · [Módulos y archivos](referencia/MODULOS.md) · [Historial](referencia/HISTORIAL.md)

Además: [`../CHANGELOG.md`](../CHANGELOG.md).

> Los archivos de `referencia/` y `MANUAL-USUARIO.md` se generan: no se editan a mano. Ejecuta `bin/gen-docs` tras cambiar el código.
