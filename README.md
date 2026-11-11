# Reciclajes Bajo Cinca

El mòdul **Comptabilitat** incorpora comptes, assentaments, factures, cartera, conciliació i informes del projecte `contabilitat`, amb la sessió i els permisos d'aquesta aplicació. Per preparar-lo, executeu `npm run install:all` i `npm run db:migrate:accounting`; després, `npm run dev`. Consulteu [la instal·lació i l'abast del mòdul](modules/accounting/README.md).

Aplicació empresarial modular amb Vue 3 + Vite, API REST Express i MySQL. Inclou autenticació, usuaris, rols i permisos, configuració corporativa, auditoria, vendes de clients, control horari i comptabilitat.

## Estructura

```text
frontend/src/{components,layouts,router,services,stores,styles,views}
backend/src/{config,middleware,repositories,routes,services,validations,scripts}
backend/test
```

El model usa `companies`, `users`, `roles`, `permissions`, `role_permissions`, `refresh_tokens`, `audit_logs` i `schema_versions`. Les claus segueixen `modul.view` / `modul.manage`. El menú respecta els permisos, però la validació efectiva es fa sempre a l'API amb middleware. L'Administrador rep sempre tots els permisos. No hi ha eliminació física d'usuaris.

## Instal·lació

Requisits: Node 22.13+ i MySQL 8 (verificat amb 8.0.46).

1. Copieu `backend/.env.example` a `backend/.env` i ajusteu MySQL, JWT, CORS i l'administrador inicial.
2. Opcionalment copieu `frontend/.env.example` a `frontend/.env`.
   L’API i les migracions carreguen `backend/.env` amb una ruta fixa, independentment de la carpeta d’arrencada. `npm run config:check` mostra el fitxer carregat i si la recuperació està configurada, sense mostrar secrets. Per seleccionar un altre fitxer, definiu la variable de procés `RBC_ENV_FILE` amb la seva ruta absoluta abans d’executar l’API o les migracions. Les variables ja definides pel gestor del servei tenen prioritat i es mostren només pel nom a `overriddenKeys`.
3. Executeu:

```bash
npm run install:all
npm run db:init
npm run dev
```

Obriu `http://localhost:5174`. L'ordre `npm run dev` manté actius frontend i backend al mateix terminal. L'API queda a `http://localhost:3100/api`; salut: `GET /api/health`. L’administrador inicial usa `ADMIN_USERNAME` (per defecte `admin`) i `ADMIN_PASSWORD`; `ADMIN_EMAIL` és l’adreça del compte. Canviar aquestes variables no restableix la contrasenya d’un compte existent. Consulteu [la recuperació de l’administrador de producció](backend/RECUPERAR_ADMIN.md) per actualitzar només el compte indicat amb `npm run admin:reset-password`. Canvieu les credencials temporals i `JWT_ACCESS_SECRET` abans de producció.

La pantalla d’accés inclou **He oblidat la contrasenya**. Totes les recuperacions s’envien al correu central `PASSWORD_RECOVERY_TO` del `backend/.env`, incloses les d’administradors. Consulteu [l’activació i la migració a producció](backend/RECUPERACIO_CONTRASENYES.md).

## Validació

La [revisió de neteja i arxius prescindibles](LIMPIEZA.md) diferencia els fitxers locals, els de producció i les dades que cal conservar.

```bash
npm test
npm run build
npm run db:init
npm run db:init
```

`db:init` és idempotent: crea objectes amb `IF NOT EXISTS` i sembra dades amb upserts/`INSERT IGNORE`. Els access tokens són curts; els refresh tokens roten, són revocables, viatgen en cookie `httpOnly`/`SameSite=Strict` i només se'n desa el hash.

## Desplegament separat

Publiqueu `frontend/dist` com a SPA amb fallback a `index.html`. Executeu el backend rere HTTPS/reverse proxy amb `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `CORS_ORIGINS` exacte i un usuari MySQL de privilegi mínim. El frontend utilitza `VITE_API_URL=/api`: les peticions van al mateix domini que serveix el web, i el proxy ha de dirigir `/api` al backend. En desenvolupament, Vite ja configura aquest proxy. Si l'API es publica en un domini diferent, configureu-ne l'URL pública a `frontend/.env.production` abans de compilar. Les variables `VITE_*` queden incorporades als fitxers de `frontend/dist`; després de canviar-les cal recompilar i tornar a publicar aquest directori.

Per afegir un mòdul: declareu permisos `view/manage`, migració idempotent, repositori, servei, validació, ruta protegida, auditoria, entrada de navegació i vistes. Les pujades futures han de respectar `MAX_UPLOAD_MB` i validar MIME/signatura abans de persistir-se.

## Mòdul Vendes clients

El menú **Vendes clients** permet consultar totals confirmats entre dates i gestionar importacions PDF. El flux és: pujar PDF → revisar resum i incidències → corregir línies → confirmar. Una previsualització pendent no apareix a les vendes. Els endpoints són `/api/imports/delivery-notes/preview`, `/api/imports`, `/api/imports/:id`, `/api/imports/:id/rows/:rowId`, `/api/imports/:id/confirm` i `/api/sales/clients`.

L'extractor treballa localment amb la capa de text i coordenades del PDF. Els documents escanejats sense text es rebutgen amb el codi `PDF_WITHOUT_TEXT`; l'OCR local queda com a ampliació posterior per evitar introduir dependències pesades o serveis externs sense configuració explícita.

## Actualització de centres i valoracions a producció

Després de publicar el backend amb centres de procedència, executeu des de l’arrel del projecte, amb la configuració MySQL de producció a `backend/.env` o a les variables d’entorn:

```bash
npm run db:migrate:centres
```

Aquesta migració afegeix `sales_import_rows.centre_name` i `identity_hash` si falten, calcula les identitats de les línies existents per detectar duplicats, incorpora els comptadors i el motiu de descart d’importacions, i crea `sales_centre_ratings` si no existeix. Es pot repetir; conserva les vendes, les importacions i les puntuacions existents. No executa la sembra inicial d’usuaris. L’usuari MySQL de migració necessita permisos per crear la taula i modificar l’esquema.

Reinicieu el backend amb la nova versió quan la migració acabi correctament. La previsualització i les vendes per client necessiten aquests objectes. Si l’error continua, consulteu el codi i el missatge del registre del backend per distingir errors d’esquema, límits de pujada i errors del proxy.

## Reimportació i comparació d’albarans

Abans d’arrencar el backend actualitzat sobre una base existent, executeu `npm run db:migrate:imports`. La migració és idempotent i no modifica les vendes. Permet revisions repetides del mateix PDF i conserva les línies idèntiques que apareguin legítimament més d’una vegada dins d’un albarà. Les instal·lacions noves ja incorporen aquesta migració a `db:init`.

A **Vendes clients → Importacions**, seleccioneu el PDF i premeu **Previsualitzar importació**. El resum diferencia albarans nous, iguals i modificats. La coincidència es determina per empresa, client (amb les agrupacions configurades), número d’albarà i any. Es comparen totes les línies, els camps del client i del centre, les dates, els articles, les matrícules, les quantitats i els imports. L’ordre de les línies i els zeros decimals de representació no generen canvis; el nombre de vegades que apareix cada línia sí que es conserva.

En confirmar, els albarans iguals s’ometen sense modificar les vendes existents. Si hi ha qualsevol diferència, se substitueix l’albarà sencer per totes les línies del PDF, incloses les correccions de preus que ja eren diferents de zero i l’eliminació de línies antigues absents del nou albarà. Els nous s’afegeixen i els albarans que no surten al PDF es conserven. Cal aportar albarans complets. La comparació es torna a comprovar dins de la transacció, serialitzada per empresa; les versions substituïdes es mantenen a l’historial i l’operació queda auditada. Les peticions antigues amb mode `overwrite` segueixen admeses i apliquen aquesta mateixa comparació.

Per incorporar la categoria **Fruita** en una base existent, executeu `npm run db:migrate:fruita` i reinicieu el backend. Les tones i imports de Fruita se sumen a **Resta d’articles**. Les instal·lacions noves ja la inclouen amb `db:init`.

Per incorporar **Paper** en una base existent, executeu `npm run db:migrate:paper` (o, des de `backend`, `node src/scripts/migratePaperCategory.js`) i reinicieu el backend. Paper suma a **Resta d’articles** i apareix en el desglossament anual. Cal publicar també el frontend actualitzat.

## Classificació per codi de descripció

A Vendes clients → Classificació per codi, cerqueu el codi complet entre parèntesis (per exemple `020103` o `(020103)`). La cerca ignora espais i majúscules, però conserva signes com `*`. Reviseu els articles i escolliu la nova classificació; el canvi afecta totes les seves vendes, de tots els anys. Només es canvien els articles trobats de la mateixa empresa, amb permís de gestió i auditoria transaccional. No es crea una regla automàtica per a futurs articles. Cal publicar frontend i backend i reiniciar el servei; aquesta funció no necessita migració de base de dades.

La pestanya de classificació per codi també permet filtrar tots els articles, només els que tenen LER o els que no en tenen, cercar per nom/codi, escollir anys i límits de tones sobre el total del període i ordenar els resultats. El LER es detecta a la descripció entre parèntesis: sis dígits, amb espais i asterisc opcional. Les caselles permeten classificar només els articles marcats; canviar filtres desmarca la selecció. El canvi és transaccional, comprova la classificació anterior i afecta tots els anys de vendes dels articles seleccionats. Aquesta ampliació requereix publicar frontend i backend, sense migració.

## Preus per classificació

La pestanya mostra el preu mitjà ponderat anual: suma de bases imposables sense IVA dividida per tones. Inclou totes les classificacions amb dades, també Sense classificar i No comptabilitzar. Només calcula línies confirmades amb data, quantitat no nul·la i diferent de zero i base informada; conserva els imports zero i les rectificacions. Si la quantitat neta suma zero, mostra —. En clicar un valor es despleguen els preus mitjans, tones i bases per client i centre, amb les mateixes agrupacions de clients que Vendes per client. Cal publicar frontend i backend i reiniciar el servei; no necessita migració.

Per incorporar **Fusta** i **Mat Inade** en una base existent, executeu `npm run db:migrate:fusta-mat-inade` i reinicieu el backend. Les dues classificacions sumen a **Resta** i apareixen al desglossament anual i als preus per classificació. Les instal·lacions noves les inclouen amb `db:init`. Cal publicar també el frontend actualitzat.
