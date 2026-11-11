# Recuperar l’administrador de la web publicada

La contrasenya d’un compte existent està guardada com a hash a MySQL. Canviar `ADMIN_PASSWORD` al fitxer `.env` no modifica aquest compte. Tampoc ho fa `db:init`, que conserva el hash dels comptes existents.

Cal executar la recuperació **al servidor que allotja la web**, amb la configuració de la seva base de dades. Editar una còpia com `backup/.env production` al teu ordinador no actualitza la web.

1. Puja el fitxer `backend/src/scripts/resetAdminPassword.js` del projecte a la mateixa ruta del servidor. Utilitza les dependències `dotenv`, `mysql2` i `bcryptjs` que ja necessita el backend.
2. Obre un terminal del servidor i entra a la carpeta `backend` del programa.
3. Edita el fitxer `.env` d’aquesta carpeta i indica el compte administrador i la nova contrasenya:

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ESCRIU_AQUI_LA_NOVA_CONTRASENYA
```

La contrasenya ha de tenir entre 8 i 200 caràcters. Mantén la resta de camps de producció, especialment els de MySQL i la signatura de sessions.

4. Des d’aquesta carpeta `backend`, executa:

```bash
node src/scripts/resetAdminPassword.js
```

L’ordre llegeix el fitxer `backend/.env` del servidor i restableix només el compte administrador indicat. Conserva les vendes, els altres comptes i els permisos; revoca les sessions de renovació d’aquest compte i registra el canvi a l’auditoria. No imprimeix la contrasenya. No cal reiniciar l’API perquè l’inici de sessió llegeix el hash de MySQL en cada accés.

Si no recordes el nom d’usuari administrador, consulta’ls sense modificar-los:

```bash
node src/scripts/resetAdminPassword.js --list
```

Amb el codi i els scripts npm actualitzats també es pot executar `npm run admin:reset-password` des de `backend`. No executis `db:init` com a recuperació de contrasenya.
