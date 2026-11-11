# Recuperar contrasenyes per correu

A **Iniciar sessió → He oblidat la contrasenya**, qualsevol usuari pot indicar el seu nom d’usuari. El servidor envia un enllaç per restablir la contrasenya **sempre al mateix correu central**, configurat a `PASSWORD_RECOVERY_TO`. Inclou els comptes administradors. No s’envia al correu de la fitxa de l’usuari ni a adreces aportades pel navegador.

La persona que gestiona aquesta bústia verifica la petició amb el titular del compte i utilitza l’enllaç, o l’hi facilita per un canal de confiança. La contrasenya existent està desada com a hash i no es pot recuperar en text; l’enllaç permet escollir-ne una de nova i confirmar-la.

## Activació a producció

1. Publica el backend i el frontend actualitzats i configura el servei SMTP per a les recuperacions.
2. Al **`backend/.env` del servidor**, configura:

```dotenv
PASSWORD_RECOVERY_TO=correu-de-recuperacio@empresa.cat
APP_PUBLIC_URL=https://app.reciclajesbajocinca.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=el-compte-emissor@gmail.com
SMTP_PASSWORD=CONTRASENYA_D_APLICACIO
MAIL_FROM=el-compte-emissor@gmail.com
```

Si SMTP ja funciona, només cal afegir `PASSWORD_RECOVERY_TO`. No modifiquis les credencials de MySQL ni les signatures de sessions. L’adreça de recuperació no té cap valor per defecte: si queda buida, el servei no s’activa. A producció, `APP_PUBLIC_URL` ha de ser HTTPS. La configuració del `.env` de l’arrel o d’una còpia de seguretat no substitueix la del `backend/.env` del servidor.

3. Des de l’arrel del projecte, amb la configuració de producció, executa:

```bash
npm run db:migrate:password-recovery
npm run build
```

La migració es pot repetir. Crea `password_reset_tokens` i afegeix `auth_version` a `users` i `refresh_tokens`; conserva els comptes i les dades. Cal un compte MySQL amb permisos `CREATE` i `ALTER` per executar-la. Després, el compte de l’API necessita llegir i escriure les dues taules de tokens, actualitzar `users` i inserir a `audit_logs`. En instal·lacions noves s’inclou a `db:init`.

4. Reinicia l’API amb la nova configuració i publica `frontend/dist` si el frontend se serveix per separat.
5. Prova-ho amb un compte propi: sol·licita la recuperació, comprova la bústia central, obre l’enllaç, desa una nova contrasenya i inicia sessió. Les proves automàtiques utilitzen un transport de correu simulat; no envien correus reals.

## Si producció mostra «La recuperació de contrasenyes encara no està activada»

Aquest missatge indica que el procés de l’API no té una configuració de recuperació vàlida. Els canvis al `backend/.env` de l’ordinador local no actualitzen el `backend/.env` del servidor.

Al servidor de `app.reciclajesbajocinca.com`, comprova `PASSWORD_RECOVERY_TO`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` i `MAIL_FROM`. Configura `NODE_ENV=production` i `APP_PUBLIC_URL=https://app.reciclajesbajocinca.com`. A producció no s’accepta una URL de localhost. Conserva la configuració MySQL de producció.

Si el correu ja funciona al local, introdueix els mateixos valors SMTP i el destinatari al servidor. Introdueix-hi la contrasenya d’aplicació directament, sense publicar-la ni compartir-la al xat. Reinicia el servei de l’API després de desar els canvis; si el gestor del procés defineix variables d’entorn, actualitza-les també, perquè tenen prioritat sobre el fitxer `.env`.

`npm run build` genera el frontend. La configuració de recuperació i l’enviament de correus es carreguen al backend quan arrenca.

## Comprovar quin fitxer carrega l’API

Des de l’arrel del projecte o des de `backend`, executa:

```bash
npm run config:check
```

La sortida mostra `envFile` amb la ruta absoluta del fitxer, `fileLoaded`, `passwordRecoveryConfigured` i els noms dels camps de correu que falten. No mostra contrasenyes ni tokens. L’API també imprimeix la ruta del fitxer als registres d’arrencada.

Per defecte sempre es carrega `backend/.env`, encara que s’executi `node backend/src/server.js` des de l’arrel. Per utilitzar expressament un altre fitxer, estableix `RBC_ENV_FILE` al mateix entorn del procés. Per exemple, en un servidor Linux:

```bash
export RBC_ENV_FILE=/ruta/al/projecte/.env
npm run config:check
npm start
```

En PowerShell:

```powershell
$env:RBC_ENV_FILE='F:\code\reciclajes-bajo-cinca\.env'
npm.cmd run config:check
npm.cmd start
```

Un fitxer seleccionat explícitament que no es pot llegir atura l’arrencada. Les variables heretades del gestor del servei conserven prioritat sobre el fitxer; si tenen un valor diferent, `overriddenKeys` en mostra els noms. Configura la mateixa selecció al servei de producció i reinicia’l perquè apliqui els canvis.

## Errors d’arrencada o recuperació amb PM2

Si els registres de `pm2 logs app` mostren `ERR_MODULE_NOT_FOUND`, consulta la primera línia de l’error. `Cannot find package` identifica una dependència que falta; `Cannot find module` amb una ruta identifica un fitxer del backend que no s’ha publicat. Publica el backend complet, inclosos els fitxers nous de configuració i els seus `package.json` i `package-lock.json`.

Des de l’arrel del projecte al servidor, després de publicar-lo:

```bash
npm ci --omit=dev --prefix backend
npm run config:check
npm run db:migrate:password-recovery
pm2 restart app --update-env
pm2 logs app --lines 40 --nostream
```

Si no coneixes la carpeta d’arrencada, `pm2 describe app` mostra el directori de treball i el fitxer que s’executa. Comprova la línia `Configuració:` del registre d’arrencada: mostra el `.env` que carrega realment el procés de PM2. Si hi ha variables heretades amb prioritat, el registre en mostra els noms.

Els errors de recuperació mostren codis operatius: `ER_NO_SUCH_TABLE` o `ER_BAD_FIELD_ERROR` indiquen que cal revisar la migració; `ER_TABLEACCESS_DENIED_ERROR` o `ER_DBACCESS_DENIED_ERROR` indiquen permisos MySQL; `MAIL_SEND_FAILED` amb `causeCode: EAUTH` i `causeResponseCode: 535` indica autenticació SMTP rebutjada. No es registren la contrasenya, el token ni la consulta SQL.

Si el backend publicat encara mostra només el missatge genèric, puja el fitxer independent `src/scripts/diagnosePasswordRecovery.js` a la mateixa ruta de `backend` del servidor. Des de `/var/www/app/backend`, executa:

```bash
node src/scripts/diagnosePasswordRecovery.js
```

Mostra el `.env` seleccionat, els noms de possibles variables heretades i comprovacions separades per a l’esquema MySQL i l’autenticació SMTP. Les consultes d’esquema no retornen cap fila; la comprovació SMTP no envia correus. No modifica dades ni necessita reiniciar PM2. Un diagnòstic correcte verifica lectura, esquema i autenticació; no comprova els permisos d’escriptura ni el lliurament a la bústia final.

## Proves a localhost

Perquè els enllaços del correu obrin la web local, configura el `backend/.env` del teu ordinador:

```dotenv
NODE_ENV=development
APP_PUBLIC_URL=http://localhost:5174
COOKIE_SECURE=false
```

Mantén el destinatari `PASSWORD_RECOVERY_TO` i la configuració SMTP. Reinicia l’API després de modificar el fitxer. Obre `http://localhost:5174/forgot-password` i demana un enllaç nou amb el nom d’usuari d’inici de sessió. El correu nou apuntarà a `http://localhost:5174/reset-password#token=…`. Els correus que ja s’havien enviat conserven l’adreça anterior.

Els enllaços de localhost es permeten amb `NODE_ENV=development` o `test`. A producció es continua exigint una adreça pública HTTPS. L’URL surt exclusivament de la configuració del servidor.

## Comportament

- L’enllaç dura 30 minuts i és d’un sol ús. Només s’emmagatzema el hash del token. No s’envien contrasenyes per correu.
- Un restabliment invalida tots els enllaços pendents i totes les sessions anteriors del compte. Un enllaç tampoc serveix si la contrasenya s’ha canviat des que es va demanar.
- Els comptes desactivats o eliminats no es recuperen. La resposta pública és la mateixa per als noms existents i inexistents, i es retorna abans de consultar el compte i enviar el correu.
- Hi ha un límit de 5 peticions per IP cada 15 minuts, una petició enviada per compte i minut, i 100 peticions per hora per al servei. Demanar la recuperació no canvia la contrasenya ni bloqueja el compte.
- El token viatja al fragment de l’enllaç (`#token=…`), que no arriba als registres HTTP del servidor. La pantalla el retira de l’adreça en obrir-se; si es recarrega, cal tornar a obrir l’enllaç del correu.
- L’enviament es processa en segon pla dins de l’API. Una confirmació del formulari indica que la petició s’ha rebut. Si no arriba el correu, revisa la configuració, la carpeta de correu brossa i els registres de l’API. Si l’API es reinicia durant l’enviament, pot caldre repetir la petició passat un minut.

La recuperació manual de l’administrador continua disponible a [RECUPERAR_ADMIN.md](RECUPERAR_ADMIN.md).

El flux segueix les recomanacions d’[OWASP per a la recuperació de contrasenyes](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): resposta genèrica, tokens aleatoris amb caducitat, límits de peticions i revocació de sessions.
