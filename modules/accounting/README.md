# Comptabilitat de Reciclajes Bajo Cinca

Per a producció amb SFTP, consulteu [els passos per publicar el mòdul complet i reparar un fitxer absent](../../DESPLEGAMENT_SFTP.md).

Mòdul basat en el codi de `F:/code/contabilitat`, incorporat al projecte el 28/10/2026. Inclou comptes i subcomptes, exercicis, assentaments, factures, cartera, documents, conciliació bancària, importacions, major, sumes i saldos, balanç i pèrdues i guanys. Conserva les funcionalitats addicionals i les proves de domini de l'origen, inclosos els esborranys d'IVA i VERI*FACTU de proves.

## Instal·lació i arrencada

Des de l'arrel del projecte:

```powershell
npm run install:all
npm run db:migrate:accounting
npm run dev
```

Obriu `/accounting` des de **Comptabilitat** al menú. La migració aplica els 33 fitxers SQL originals en taules amb prefix `accounting_` i crea l'empresa i un exercici inicial buit. Es pot repetir: només aplica migracions pendents i conserva els exercicis i moviments existents. No executa les llavors Demo ni copia dades o credencials de l'aplicació original.

Abans d'importar el diari, comproveu **Empresas → Actualizar datos → Longitud de las subcuentas**. Ha de coincidir amb els dígits del PDF; el LISTADO de Reciclajes de 2026 utilitza 10 dígits. Es pot ajustar entre 6 i 20 mentre el pla estigui buit. Quan ja hi ha comptes, el servidor bloqueja el canvi, també davant de peticions concurrents.

Els LISTADO també admeten assentaments amb una única línia de compte a zero, com el cobrament de remesa `2023000709` del diari de 2023. Es conserven el compte, els imports zero i la posició originals. Les capçaleres que només contenen files buides sense compte i amb total zero s'ometen amb un avís i els seus números a la previsualització; el PDF original es conserva. Les comprovacions dels totals de cada assentament i del total general continuen sent obligatòries. El diari de 2023 s'ha de pujar a l'exercici de l'01/01/2023 al 31/12/2023.

S'utilitzen els `DB_*` del fitxer que carrega el backend principal i la mateixa base `DB_NAME`. Les taules comptables, les restriccions i el registre de migracions tenen prefix propi: `accounting_companies`, `accounting_accounts`, `accounting_schema_migrations`, etc. L'adaptador SQL aplica aquest prefix també a les transaccions, les claus foranes, les consultes de metadades i les còpies; no canvia els valors ni el format de les còpies originals. Les taules del projecte principal conserven els seus noms.

El compte actual necessita permisos de dades i d'esquema dins de `DB_NAME`. No necessita crear una base nova ni administrar el servidor. Si MySQL impedeix crear triggers per `log_bin` i manca de `SUPER`, la migració continua: el servei ja bloqueja la fila d'empresa dins de la transacció i rebutja els exercicis solapats. Les restauracions també validen els períodes i adquireixen aquest bloqueig. Les escriptures s'han de fer a través dels serveis del mòdul. Les restriccions SQL de dates, exercici predeterminat, relacions i imports continuen actives.

Opcionalment es pot configurar una base dedicada amb `ACCOUNTING_DB_NAME`; també utilitzarà prefix. En aquest cas, si el compte no hi té accés, un gestor de MySQL ha de preparar-la, substituint els noms de l'exemple pels de l'entorn:

```sql
CREATE DATABASE IF NOT EXISTS reciclajes_bajo_cinca_accounting
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, TRIGGER
  ON reciclajes_bajo_cinca_accounting.* TO 'reciclajes_app'@'localhost';
```

Aquest pas només és necessari per a una base dedicada sense permisos previs. Cal usar el nom configurat a `ACCOUNTING_DB_NAME` i el compte/host MySQL real. Això no canvia cap contrasenya. Després repetiu `npm run db:migrate:accounting`.

## Accés i dades

- `accounting.view`: consultar la comptabilitat i els informes.
- `accounting.manage`, juntament amb consulta: registrar, modificar, importar, gestionar exercicis i executar les operacions amb confirmació que ja ofereix el projecte d'origen.
- L'Administrador rep aquests permisos amb la migració. Els altres rols s'assignen des de **Rols i permisos → Comptabilitat**.
- La sessió i els usuaris són els del projecte principal. El mòdul no ofereix un segon sistema d'usuaris.
- Cada petició es limita a l'empresa de l'usuari autenticat, inclosos logotips, documents, descàrregues i còpies. Les altres empreses del projecte original no s'importen.
- Les operacions correctes que modifiquen dades registren usuari, mètode i ruta a l'auditoria principal. Les còpies automàtiques es desen a `uploads/accounting-backups/`.

## Compilació i proves

```powershell
npm run build
npm test
node modules/accounting/scripts/verify-integration.mjs
```

El frontend del mòdul es compila a `frontend/public/accounting-app/`, inclòs en el `frontend/dist` final. El contenidor aïlla els estils originals i renova la sessió sense posar tokens a les URLs. L'API es publica sota `/api/accounting` al mateix backend, sense ports addicionals.

El pont del frontend afegeix aquest prefix a totes les peticions de l'API original.
Les rutes d'informes ja contenen `/accounting/` al mòdul original, de manera que
el balance integrat es consulta a `/api/accounting/accounting/balance-sheet`.
La prova de navegador comprova aquesta ruta i el balance amb comparació i sense;
un prefix omès retornava 404 i es mostrava com un error genèric de dades.
El backend principal també accepta les URLs anteriors dels cinc informes, com
`/api/accounting/balance-sheet`, amb els mateixos controladors i controls d'accés.
Això permet publicar el backend sense exigir que els navegadors ja hagin
carregat el frontend nou. Consulteu el [parxe de rutes per a producció](../../DESPLEGAMENT_SFTP.md).

Les proves MySQL són opcionals (`TEST_MYSQL=1`); usen l'adaptador de prefix i creen i netegen les seves pròpies empreses temporals. Preferiu un entorn de proves: consumeixen identificadors AUTO_INCREMENT. Verifiquen també exercicis concurrents sense triggers, precisió monetària, restauracions i atomicitat. La integració amb sessió, permisos, separació entre empreses i la preparació inicial es comprova amb les proves específiques del backend principal.

La prova de navegador és opcional: necessita `npm run dev` en marxa i Microsoft Edge instal·lat. Simula les respostes de l'API i no modifica dades reals; comprova la navegació, els perfils de consulta i gestió, la renovació de sessió i el format mòbil. Les comprovacions amb MySQL real requereixen haver preparat una base amb els permisos anteriors.

Les modificacions d'integració respecte a l'origen són la configuració compartida del backend, l'adaptador SQL i el catàleg `database/objects.json`, la validació dels períodes dins de còpies, el prefix dels logotips, la navegació amb hash, el pont de sessió del frontend i la retirada dels controls d'inici de sessió i canvi d'usuari independents. Quan s'afegeixin taules o restriccions amb nom a noves migracions, cal afegir-les també al catàleg d'objectes.
