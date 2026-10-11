# Versionado y etiquetas (tags) de git

Desde la versión **1.0.0** el código se versiona con [SemVer](https://semver.org/lang/es/) y cada versión publicada lleva una **etiqueta anotada** `vX.Y.Z` en git.

| Cambio | Sube | Ejemplos |
|---|---|---|
| Rompe algo existente o exige una acción manual al actualizar (migración, reconfigurar) | **X** (mayor) | Cambiar el formato de `tenants.settings` sin compatibilidad; eliminar un endpoint |
| Función nueva compatible | **Y** (menor) | Plantillas de formularios, nuevo proveedor de mensajería |
| Corrección o mejora interna sin función nueva | **Z** (parche) | Arreglar el conteo «Sin asesor», un texto, un estilo |

## Dónde vive la versión

- **`VERSION`** (raíz): número de la última versión etiquetada. Lo actualiza `bin/tag-release`.
- **Etiqueta git `vX.Y.Z`**: apunta al commit exacto desplegado. El mensaje de la etiqueta es la sección de esa versión del `CHANGELOG.md`.
- **`CHANGELOG.md`**: resumen curado por versión (qué cambió y qué debe saber quien opera).
- **`docs/referencia/HISTORIAL.md`**: historial completo de commits agrupado por etiqueta (se genera solo).
- **Release de producción** (`bin/crmhub release:publish`): guarda en `control_releases.commit_ref` el resultado de `git describe --tags --always`, así que el Centro de control muestra `v1.2.0` (o `v1.2.0-3-gabc1234` si hay commits posteriores a la etiqueta).

## Cómo sacar una versión (paso a paso)

1. Termina y prueba los cambios en **dev**; haz commit en `main`.
2. Agrega al inicio de `CHANGELOG.md` una sección `## [X.Y.Z] - AAAA-MM-DD` con lo nuevo, lo cambiado y lo corregido (mueve ahí lo que esté en «Sin publicar»). Si cambiaste el manual (`manual.tpl`) o la API, la documentación derivada se regenera sola en el paso siguiente.
3. Ejecuta:
   ```bash
   bin/tag-release X.Y.Z            # valida, regenera docs, actualiza VERSION, commit, etiqueta y push
   bin/tag-release X.Y.Z --dry-run  # solo muestra qué haría
   ```
   El script se niega a continuar si: no estás en `main`, hay cambios sin commit, la versión no es SemVer, la etiqueta ya existe, no hay sección en el `CHANGELOG.md`, o `bin/gen-docs --check` detecta documentación desactualizada.
4. Despliega esa versión (ver [OPERACION](OPERACION.md)): respaldo → `release:publish` → `tenant:upgrade` de cada empresa.

## Consultar y volver a una versión

```bash
git tag -n3 --sort=-creatordate        # versiones y su resumen
git show v1.0.0                        # qué incluye
git diff v1.0.0 v1.1.0 --stat          # qué cambió entre dos versiones
git checkout v1.0.0                    # ver el código de esa versión (solo lectura)
git log v1.0.0..HEAD --oneline         # qué hay después de la última versión
```

Para **volver atrás en producción** no se reescribe el historial: se crea un commit de reversión (`git revert`), se etiqueta un parche (`vX.Y.Z+1`) y se despliega. Las empresas ya actualizadas recuperan la versión anterior con `tenant:upgrade`. Antes de cada despliegue se hace `bin/backup` (incluye un `git bundle` completo en la carpeta del respaldo).

## Reglas

- Nunca muevas ni borres una etiqueta publicada: si te equivocaste, saca la siguiente versión.
- Un despliegue a producción debería hacerse desde una **versión etiquetada** (o desde un commit que será la siguiente). Evita publicar con cambios sin commit: el release lo marca con `+cambios-sin-commit`.
- Las versiones de la base de datos no tienen migraciones numeradas: los cambios de esquema son aditivos (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) y se aplican al arrancar el Hub.
