# Bàscula USB: instal·lació i operació

La bàscula es connecta exclusivament a l'ordinador Windows. `scale-agent` obre el COM i una connexió **sortint WSS** a `/api/scale/agent` del backend existent. El servidor no obre cap port nou. Vue consulta l'API autenticada cada segon, amb els JWT, renovació de sessió i permisos del projecte. Les lectures caduquen als 5 segons, també a la pantalla si la xarxa queda bloquejada. La captura torna a validar el pes al servidor; les captures romanen a l'estat de la vista fins que se'n surt.

## Fitxers

- `scale-agent/src/index.js`: detecció Prolific, port sèrie, reconnexió independent del COM i de la xarxa, WSS, diagnòstic, persistència i ordres.
- `scale-agent/src/protocol.js`: opcions, delimitació de trames i parser local configurable.
- `scale-agent/config.example.json`, `ScaleAgent.xml.example`, `package.json`, `package-lock.json`, `test/protocol.test.js`.
- `backend/src/services/scaleService.js`: receptor WebSocket, credencial per dispositiu, identitat exclusiva, estat per empresa, validació, caducitat i ordres amb confirmació de recepció.
- `backend/src/routes/scaleRoutes.js`: consulta, captura, configuració i ordres amb permisos i auditoria.
- `backend/src/scripts/migrateScale.js`, `backend/test/scale.test.js`.
- Integració a `backend/src/app.js`, `server.js`, `backend/package.json`, `backend/package-lock.json`, `backend/.env.example`.
- `frontend/src/views/ScaleView.vue`, ruta i menú a `router/index.js` i `layouts/AppLayout.vue`.
- Exemple Nginx existent i exclusions locals a `.gitignore`.

## Preparar el servidor

1. Instal·lar dependències: `npm.cmd ci --prefix backend`. A Linux utilitzar `npm`.
2. Executar `npm.cmd run db:migrate:scale --prefix backend` amb la configuració habitual de MySQL. És una migració idempotent i només afegeix els permisos de bàscula. **No executar `db:init` sobre una instal·lació existent per afegir aquest mòdul.**
3. Generar un token aleatori a Windows i obtenir-ne el hash amb les ordres de la secció següent. Transferir només el hash al servidor mitjançant el canal administratiu habitual.
4. Afegir al fitxer `.env` que carrega el backend:

   ```dotenv
   SCALE_DEVICES=[{"id":"factory-1","companyId":1,"tokenHash":"SUBSTITUIR_PEL_SHA256_DE_64_CARACTERS","simulation":false}]
   ```

   Utilitzar l'identificador real de l'empresa autoritzada, un ID únic i una credencial diferent per cada agent. No pujar tokens ni `.env` al repositori. Un array buit desactiva l'admissió d'agents. Per revocar o rotar una credencial, modificar el hash i reiniciar el backend; el reinici tanca les connexions existents. Una identitat només admet un agent alhora, en **un únic procés backend**. No fer servir clúster ni múltiples rèpliques sense afegir un coordinador d'estat i bloqueig distribuït.
5. Al proxy HTTPS existent, afegir la ubicació `/api/scale/agent` de l'exemple `deployment/nginx/compostatge.coopbellcaire.com.conf` al bloc TLS que realment serveix el domini. El fitxer del repositori només conté un exemple HTTP; **no configura ni emet certificats TLS**. Conservar els ports, les rutes i la resta del proxy. Habilitar Upgrade/Connection i HTTP/1.1 cap al mateix backend 3100. Restringir l'accés directe al port intern. Validar amb `nginx -t` abans de recarregar.
6. Compilar: `npm.cmd run build --prefix frontend`. Desplegar i reiniciar el backend amb el procediment existent.
7. Els administradors reben `scale.view`, `scale.configure` i `scale.command`. Assignar `scale.view` als rols de consulta; `scale.configure` permet veure diagnòstic i modificar COM. Les ordres manuals també exigeixen `scale.command` i el rol `Administrador`. Tornar a carregar la sessió després d'assignar permisos.

## Preparar l'ordinador Windows

1. Instal·lar una versió LTS compatible de Node.js des de https://nodejs.org/en/download (projecte: Node >=22.13). Comprovar `node --version` i `npm.cmd --version`. Instal·lar el controlador oficial del Prolific PL2303GT si Windows no el reconeix. Consultar l'Administrador de dispositius per identificar el COM.
2. Copiar **tota la carpeta `scale-agent`** a `C:\RBC\scale-agent`, sense `node_modules`, i obrir PowerShell en aquesta carpeta:

   ```powershell
   npm.cmd ci
   Copy-Item config.example.json config.json
   node -e "const f=require('fs'),c=require('crypto');const t=c.randomBytes(32).toString('hex');f.writeFileSync('agent-token.txt',t,{flag:'wx'});console.log('SHA256: '+c.createHash('sha256').update(t).digest('hex'))"
   npm.cmd run ports
   ```

   Només s'imprimeix el hash. El token queda a `agent-token.txt`. Configurar aquest hash al backend. Protegir el directori i el fitxer perquè només l'administrador i el compte del servei hi tinguin accés; no copiar-lo a carpetes compartides. El compte del servei necessita escriure `config.json` i els logs, i llegir el token.
3. Editar `config.json`: URL `wss://DOMINI_REAL/api/scale/agent`, `scaleId` coincident amb el servidor, ruta relativa al fitxer del token i `simulation:false`. Configurar el COM o deixar `auto`: només s'escull automàticament si hi ha exactament un port Prolific (VID 067B o fabricant Prolific). Si n'hi ha diversos, seleccionar el COM explícitament.
4. Valor inicial: 9600, 8 bits, sense paritat, 1 bit de parada i sense control de flux. Modificables al formulari de configuració del port de la web. No confondre el xip USB amb el protocol del terminal: aquests paràmetres s'han de contrastar amb el manual de la bàscula. Sincronitzar l'hora de Windows i del servidor: es rebutgen lectures amb més de 5 segons d'antiguitat o més de 2 segons en el futur.
5. Tancar PuTTY i qualsevol programa que utilitzi el COM. El port és exclusiu.
6. Executar `npm.cmd start` per comprovar connexió. Entrar a Bàscula des del programa amb un usuari autoritzat. Obrir Diagnòstic i comprovar port, baud rate i dades ASCII/HEX. Els blocs en brut es mostregen com a màxim quatre vegades per segon i es limiten a 512 bytes; les últimes deu trames també es mostren. No es desa un historial permanent de lectures ni dades en brut als logs.

## Configurar el protocol sense inventar pesos

Per defecte `protocol.parser` és `disabled`: es poden veure bytes i trames però el pes es mostra `-- kg`. Identificar primer les trames reals al diagnòstic.

Editar localment `config.json` amb l'agent aturat. Escollir `framing`: `CR`, `LF`, `CRLF` o `fixed` amb `length` d'1 a 1024. Amb `parser:"regex"`, `pattern` ha de capturar el pes al **primer grup**. Per exemple, només si el terminal realment envia `1250,5 kg\r\n`:

```json
{"framing":"CRLF","length":16,"parser":"regex","pattern":"^([+-]?[0-9]+(?:[.,][0-9]+)?) kg$","unit":"kg","stablePattern":""}
```

`stablePattern` buit significa estabilitat desconeguda. Posar-hi una expressió que identifiqui el marcador real d'estabilitat només quan es conegui el protocol. La unitat es configura segons el protocol real; no es converteix automàticament. Les expressions regulars són configuració local de confiança i no es poden executar des de la web. Reiniciar l'agent després de canviar el parser.

La web pot modificar només les opcions del COM: `path`, `baudRate`, `dataBits`, `parity`, `stopBits`, `rtscts`, `xon`, `xoff`. Es validen als dos extrems i es desen abans de reobrir el port. Una confirmació de configuració indica que s'ha desat; comprovar després l'estat per saber si el COM s'ha pogut obrir. Un canvi remot incorrecte pot deixar sense dades la bàscula fins a corregir-lo.

Les ordres manuals ASCII/HEX exigeixen confirmació explícita i perfil administrador. HEX ha de contenir parelles de caràcters sense espais. ASCII permet bytes de control si el client els proporciona realment, no els textos literals `\\r` o `\\n`. No s'envia cap ordre automàtica. L'auditoria registra usuari, dispositiu, tipus, longitud, hash de l'ordre i resultat, sense contingut que pugui incloure secrets. Un timeout deixa resultat desconegut: comprovar el dispositiu abans de repetir una ordre, perquè podria haver-se executat abans de perdre la connexió.

## Servei Windows sense finestra

Utilitzar **WinSW**, disponible a https://github.com/winsw/winsw/releases i documentat a https://winsw.github.io/v2/. Escollir una versió estable compatible de la branca 2.x i verificar-ne l'origen. No cal instal·lar un altre servidor web.

1. Desar el binari WinSW com `C:\RBC\scale-agent\ScaleAgent.exe`.
2. Copiar `ScaleAgent.xml.example` a `ScaleAgent.xml` al mateix directori. Ajustar la ruta de `node.exe` si cal. L'exemple usa arrencada automàtica, reinici després d'error i rotació de logs.
3. En PowerShell amb permisos d'administrador, dins del directori de l'agent:

   ```powershell
   .\ScaleAgent.exe install
   ```

4. Abans d'iniciar, a `services.msc`, configurar la pestanya **Iniciar sessió** del servei `RBC Bàscula` amb un compte de servei dedicat amb els permisos mínims per al COM, xarxa i directori de l'agent. L'exemple WinSW no fixa cap compte; verificar aquesta configuració perquè no quedi executant-se amb privilegis innecessaris.
5. Iniciar i comprovar:

   ```powershell
   .\ScaleAgent.exe start
   .\ScaleAgent.exe status
   ```

   Reiniciar Windows i comprovar que connecta sense iniciar sessió. Per manteniment: `stop`, `restart`, `uninstall`. No executar alhora `npm.cmd start` i el servei amb la mateixa identitat. No incloure tokens al XML. Per PKI privada, instal·lar la cadena de confiança correcta o configurar `NODE_EXTRA_CA_CERTS` per al servei; no desactivar la validació TLS.

## Simulació i comprovacions

Crear una **altra identitat** al servidor amb `simulation:true`, una credencial pròpia, i la configuració de l'agent amb `simulation:true`. La web mostra **SIMULACIÓ** al pes i a cada captura. El servidor rebutja discrepàncies entre el mode declarat per l'agent i el mode assignat a la identitat. El simulador genera valors al voltant de 1250 kg i no obre cap COM. No reutilitzar la identitat productiva per fer proves simulades.

Proves automatitzades:

```powershell
npm.cmd test --prefix backend
npm.cmd test --prefix scale-agent
npm.cmd run build --prefix frontend
```

La prova d'integració executa el procés real de l'agent en simulació contra el receptor WebSocket en un port loopback efímer. L'excepció `SCALE_ALLOW_LOCAL_WS=true` només permet `ws://` a loopback per a proves i **no s'ha de configurar al servei productiu**. Verifica credencial incorrecta, identitat duplicada, recepció, ACK de configuració, persistència, opcions invàlides, desconnexió i reconnexió del servidor. Les proves unitàries cobreixen caducitat, separació d'empreses, retirada del pes en desconnectar el COM, validació i delimitadors. No equivalen a provar el hardware, la xarxa real ni el certificat públic.

Comprovació a fàbrica: desendollar USB (ha de desaparèixer el pes), reconnectar (ha de recuperar-se), tallar Internet (el pes ha de caducar), restaurar-lo (ha de reconnectar), verificar hora i estabilitat amb el terminal i fer una captura. Validar també la pantalla amb una sessió de consulta i una d'administrador. La reconnexió fa espera progressiva amb variació aleatòria fins a uns 30 segons. El heartbeat del servidor detecta agents absents en uns 10–15 segons; el pes deixa de ser vigent als 5 segons.

## Servei reutilitzable

Importar `scales` de `backend/src/services/scaleService.js` i consultar `scales.snapshot(scaleId, companyId)`. `reading:null` significa que no hi ha pes vàlid vigent. Conservar sempre el filtre d'empresa i l'indicador `simulation`; per a processos reals futurs rebutjar simulació. L'estat es manté en memòria i es reconstrueix amb les noves lectures després d'un reinici.

API autenticada: `GET /api/scale`, `POST /api/scale/:id/capture`, `POST /api/scale/:id/command`. Cap ruta HTTP accepta pesos enviats pel navegador. El canal de l'agent rebutja l'Origin del navegador i requereix el token específic; mai reutilitza JWT d'usuaris com a credencial de dispositiu.
