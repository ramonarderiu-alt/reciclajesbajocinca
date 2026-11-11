# Comptabilitat a producció amb SFTP

L'error `ERR_MODULE_NOT_FOUND` amb la ruta
`/var/www/app/modules/accounting/backend/src/db/pool.js` indica que el desplegament
no inclou el backend del mòdul. `npm run build` compila els frontends; el servidor
també necessita els fitxers originals de `modules/accounting`, les dependències
del mòdul i les migracions SQL.

## Reparar el desplegament actual

Pugeu `artifacts/comptabilitat-produccio.zip` a `/var/www/app/` amb SFTP. El ZIP
conté les rutes `modules/accounting/...`; descomprimiu-lo a l'arrel de l'aplicació,
sense crear una carpeta intermèdia addicional:

```bash
cd /var/www/app
unzip -o comptabilitat-produccio.zip -d /var/www/app
test -f modules/accounting/backend/src/db/pool.js
npm ci --prefix modules/accounting --omit=dev
node backend/src/scripts/migrateAccounting.js
pm2 restart app --update-env
pm2 logs app --lines 30
```

Executeu cada ordre només si l'anterior ha acabat correctament. La migració
carrega la mateixa configuració que el backend principal, aplica només les
migracions pendents i conserva els moviments existents.

Aquest paquet completa el mòdul del backend que ja heu publicat. No conté `.env`,
`node_modules`, dades d'usuaris ni còpies de bases de dades. Les dependències
s'instal·len al servidor amb `npm ci`.

## Pujades futures

Publiqueu conjuntament el backend principal i `modules/accounting`, inclosos
`backend/src`, `shared`, `database`, els manifests i el lockfile del mòdul. El
backend comptable importa també la configuració i l'adaptador SQL del backend
principal. Manteniu les mateixes versions de totes dues parts.

Publiqueu el contingut del `frontend/dist` generat per `npm run build` a l'arrel
web que serveix l'SPA, inclosa la subcarpeta `accounting-app`. El directori
`frontend/dist` no substitueix els fitxers de servidor de `modules/accounting`.

Conserveu la configuració pròpia del servidor a `backend/.env` o a PM2 i les dades
persistents a `uploads/`.

## Si el balance continua retornant 404 a `/api/accounting/balance-sheet`

El frontend que envia aquesta URL utilitza la ruta anterior. El backend actual
també l'accepta, amb els mateixos controladors, sessió, permisos i empresa que
`/api/accounting/accounting/balance-sheet`. La compatibilitat també cobreix
`profit-loss`, `trial-balance`, `ledger` i `review`.

Per aplicar només aquest canvi, pugeu `artifacts/correccio-404-informes.zip` a
`/var/www/app/`. Conté únicament `backend/src/routes/accountingRoutes.js`:

```bash
cd /var/www/app
unzip -o correccio-404-informes.zip -d /var/www/app
pm2 restart app --update-env
```

Executeu cada ordre només si l'anterior acaba correctament. També podeu pujar el
fitxer directament amb SFTP a `/var/www/app/backend/src/routes/accountingRoutes.js`
i reiniciar PM2. Aquest canvi de rutes no requereix compilar el frontend,
instal·lar dependències ni executar migracions.

Torneu a prémer **Consultar**: la mateixa URL anterior ha de ser vàlida. La prova
local amb MySQL real i els filtres `company_id=1`, `exercise_id=1`,
`date=2026-12-31`, `model=abbreviated`, `digits=0` i `compare_previous=true` retorna
200 a totes dues URLs i comprova que els resultats són idèntics. La publicació
i la comprovació del servidor de producció continuen pendents.

## Reparar el Balance de Situación i la resta d'informes

El pont de sessió del frontend confonia les rutes originals dels informes
`/api/accounting/balance-sheet`, `profit-loss`, `trial-balance`, `ledger` i
`review` amb rutes ja adaptades al backend principal. Això ometia el prefix del
mòdul: el balance rebia un 404 `NOT_FOUND` i el frontend mostrava el missatge
genèric de MySQL. La ruta integrada que utilitza el frontend corregit és
`/api/accounting/accounting/balance-sheet`: el primer `accounting` és el punt de
muntatge del mòdul i el segon forma part de la ruta original de l'informe. El
backend també admet `/api/accounting/balance-sheet` per als frontends anteriors.

La correcció s'ha compilat a `frontend/dist`. El paquet
`artifacts/correccio-balance-produccio.zip` inclou aquest frontend, el backend
principal, el backend complet de Comptabilitat, `shared`, les 33 migracions i
els manifests de dependències. No inclou `.env`, `node_modules` ni `uploads`.

Pugeu el ZIP a `/var/www/app/` i executeu **cada ordre només si l'anterior acaba
correctament**:

```bash
cd /var/www/app
unzip -o correccio-balance-produccio.zip -d /var/www/app
test -f modules/accounting/backend/src/db/pool.js
npm ci --prefix backend --omit=dev
npm ci --prefix modules/accounting --omit=dev
node backend/src/scripts/migrateAccounting.js
node backend/src/scripts/checkAccounting.js
pm2 restart app --update-env
pm2 logs app --lines 30 --nostream
```

La migració aplica només els fitxers pendents i conserva els moviments. No cal
executar `db:init` per aquesta correcció. Si el diagnòstic falla, reviseu-ne el
codi abans de continuar. Apliqueu-hi les mateixes variables d'entorn que al servei
PM2 si aquest les defineix fora de `backend/.env`.

Si Nginx o Apache serveix els fitxers estàtics des d'un altre directori, publiqueu
també allí **tot el contingut de `frontend/dist`**, incloent `accounting-app`.
Després feu Ctrl+F5 i torneu a consultar el balance, amb comparació i sense.
Les proves locals comproven tots dos casos al navegador i els imports amb MySQL;
el paquet encara s'ha d'aplicar i verificar a producció.

Els registres `ERR_MODULE_NOT_FOUND` per `db/pool.js` indiquen que faltaven
fitxers al servidor quan es van generar. L'avís `ER_NO_SUCH_TABLE` de còpies
automàtiques indica que faltava almenys una taula comptable en aquell moment.
Poden ser línies antigues: comproveu les noves entrades després del reinici.
El paquet complet i l'execució de les migracions resolen aquests prerequisits.

## Comptabilitat mostra «No se puede acceder al servicio de datos»

Aquest missatge és genèric i també pot aparèixer quan l'API retorna un codi
que el frontend no reconeix. No confirma, per si sol, que MySQL estigui aturat.

Publiqueu `backend/src/scripts/checkAccounting.js` juntament amb la versió actual
del backend i del mòdul. Des de `/var/www/app`, amb el mateix fitxer i les mateixes
variables d'entorn del servei, executeu:

```bash
node backend/src/scripts/checkAccounting.js
```

També es pot executar amb `npm run db:check:accounting` després de publicar els
`package.json` actualitzats. El diagnòstic només llegeix el registre de migracions
i comprova taules i columnes amb `LIMIT 0`; no modifica dades ni mostra contrasenyes,
tokens, consultes fallides o moviments comptables. Retorna `ok: false` i un codi de
sortida diferent de zero si alguna comprovació falla.

- `ECONNREFUSED`, `ETIMEDOUT` o `ENOTFOUND`: reviseu el servei MySQL, `DB_HOST` i `DB_PORT`.
- `ER_ACCESS_DENIED_ERROR` o `ER_DBACCESS_DENIED_ERROR`: reviseu les credencials i els permisos del compte sobre la base indicada.
- `ER_BAD_DB_ERROR`: comproveu `DB_NAME` i, si està definit, `ACCOUNTING_DB_NAME`.
- `pending` amb fitxers pendents o `ER_NO_SUCH_TABLE`: executeu `npm run db:migrate:accounting` amb la mateixa configuració.
- `ER_BAD_FIELD_ERROR` amb totes les migracions aplicades: l'esquema i el codi publicat no coincideixen; conserveu el resultat abans de modificar la base.

Si totes les comprovacions són correctes, cal identificar la petició que falla
a **Xarxa / Network** del navegador i el seu codi JSON `error.code`, i revisar
`pm2 logs app --lines 50`. El diagnòstic local no comprova el servidor de producció.
Si PM2 defineix variables pròpies, s'han d'aplicar també al diagnòstic: una ordre
executada des d'una sessió SSH no les hereta automàticament.

## El login crida localhost des de producció

El frontend utilitza `VITE_API_URL=/api`, configurat a `frontend/.env.production`.
Això fa que el login cridi `/api/auth/login` al mateix domini públic del web. El
backend principal ja serveix aquesta ruta; si hi ha un servidor web intermedi,
ha de dirigir `/api` al backend.

Després de modificar `VITE_API_URL`, executeu `npm run build` i publiqueu el nou
`frontend/dist`, inclosos `index.html` i `assets`. Recarregueu el navegador amb
Ctrl+F5. Canviar només el `.env` del servidor o reiniciar PM2 no actualitza les
URLs que ja estan incorporades als fitxers JavaScript compilats.

## El login retorna 429

El login limita els intents fallits a 10 per IP en una finestra de 15 minuts.
Els accessos correctes no consumeixen aquest límit. Quan s'assoleix, l'API retorna
`LOGIN_RATE_LIMIT`, la capçalera `Retry-After` en segons i un missatge amb el temps
d'espera. Les versions anteriors també comptaven els accessos correctes.

Publiqueu `backend/src/routes/authRoutes.js` i reinicieu `pm2 restart app --update-env`
per aplicar el canvi. El comptador actual és en memòria: el reinici també elimina
el bloqueig vigent. Sense reiniciar, espereu el temps indicat per `Retry-After`.

Si hi ha un únic reverse proxy davant del backend, configureu `TRUST_PROXY=true`
a l'entorn del servei i feu que el proxy enviï `X-Forwarded-For` amb la IP del
client. Sense aquesta configuració, tots els usuaris poden compartir la IP del
proxy i consumir el mateix límit. No exposeu directament el backend en aquesta
configuració: la capçalera ha de provenir del proxy de confiança. Si hi ha més
d'un proxy, cal adaptar la configuració de confiança a aquesta topologia.
