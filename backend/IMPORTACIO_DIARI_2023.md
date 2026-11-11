# Importar el diari de Reciclajes de 2023

El PDF `diari2023reciclajes.pdf` conté una remesa amb un únic apunt de compte a
zero: l'assentament `2023000709`, pàgina 50. El lector LISTADO conserva aquesta
línia original, el compte `5720000036`, els imports zero i el número d'assentament.

També conté una capçalera amb una fila completament buida, sense compte i amb
total zero: `2023001486`, pàgina 100. La previsualització indica que s'omet;
el document original es conserva. Una capçalera sense cap fila, una fila sense
compte amb import diferent de zero o un total que no quadra continuen sent errors.

La lectura i la importació completa s'han verificat en una empresa temporal:

- 253 pàgines, 3.741 assentaments i 10.839 apunts.
- 551 subcomptes de 10 dígits.
- Deure i haver: 20.703.639,50 € cadascun.
- Repetir la mateixa importació no duplica dades.
- Les còpies de seguretat conserven i restauren els assentaments d'una sola línia zero.

## Publicar la correcció amb SFTP

Pugeu `artifacts/correccio-diari2023.zip` a `/var/www/app/`. El ZIP actualitzat
conté els lectors i serveis `pdf-journal-listado.js`, `journal-import.js` i
`backup-format.js`, el component de previsualització i el `frontend/dist` complet
ja compilat. També incorpora `host-session.js` i `accountingRoutes.js` amb la
correcció de les rutes dels informes, inclosa la compatibilitat amb el frontend
anterior. Les rutes són relatives a l'arrel de l'aplicació. No conté contrasenyes
ni dades comptables.

Al servidor:

```bash
cd /var/www/app
unzip -o correccio-diari2023.zip -d /var/www/app
pm2 restart app --update-env
```

Si el servidor web serveix el frontend des d'una altra carpeta, publiqueu-hi el
contingut de `frontend/dist`, inclosa `accounting-app`. Recarregueu amb Ctrl+F5.
No cal aplicar migracions ni instal·lar dependències noves per aquesta correcció.
Aquest paquet actualitza una instal·lació que ja inclou el mòdul de Comptabilitat.
Si falten fitxers del mòdul, feu servir el paquet complet de
[desplegament de Comptabilitat](../DESPLEGAMENT_SFTP.md).

## Pujar el document

A Comptabilitat, seleccioneu o creeu l'exercici de l'01/01/2023 al 31/12/2023 i
pugeu-hi el PDF. Reviseu els totals i l'avís de l'assentament buit abans de
confirmar. El document inclou el tancament: en confirmar, l'exercici queda tancat.
Les proves no han incorporat aquests moviments a l'empresa real.
