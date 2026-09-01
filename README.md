# Reciclajes Bajo Cinca

Base empresarial modular amb Vue 3 + Vite, API REST Express i MySQL. Aquesta fase inclou autenticació, usuaris, rols/permisos, configuració corporativa i auditoria, però cap mòdul de negoci.

## Estructura

```text
frontend/src/{components,layouts,router,services,stores,styles,views}
backend/src/{config,middleware,repositories,routes,services,validations,scripts}
backend/test
```

El model usa `companies`, `users`, `roles`, `permissions`, `role_permissions`, `refresh_tokens`, `audit_logs` i `schema_versions`. Les claus segueixen `modul.view` / `modul.manage`. El menú respecta els permisos, però la validació efectiva es fa sempre a l'API amb middleware. L'Administrador rep sempre tots els permisos. No hi ha eliminació física d'usuaris.

## Instal·lació

Requisits: Node 20.19+ (o 22.12+) i MySQL 8.

1. Copieu `backend/.env.example` a `backend/.env` i ajusteu MySQL, JWT, CORS i l'administrador inicial.
2. Opcionalment copieu `frontend/.env.example` a `frontend/.env`.
3. Executeu:

```bash
npm run install:all
npm run db:init
npm run dev
```

Obriu `http://localhost:5174`. L'ordre `npm run dev` manté actius frontend i backend al mateix terminal. L'API queda a `http://localhost:3100/api`; salut: `GET /api/health`. L'administrador usa `ADMIN_EMAIL` i `ADMIN_PASSWORD`. Canvieu les credencials temporals i `JWT_ACCESS_SECRET` abans de producció.

## Validació

```bash
npm test
npm run build
npm run db:init
npm run db:init
```

`db:init` és idempotent: crea objectes amb `IF NOT EXISTS` i sembra dades amb upserts/`INSERT IGNORE`. Els access tokens són curts; els refresh tokens roten, són revocables, viatgen en cookie `httpOnly`/`SameSite=Strict` i només se'n desa el hash.

## Desplegament separat

Publiqueu `frontend/dist` com a SPA amb fallback a `index.html`. Executeu el backend rere HTTPS/reverse proxy amb `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `CORS_ORIGINS` exacte i un usuari MySQL de privilegi mínim. Configureu `VITE_API_URL` amb l'URL pública de l'API.

Per afegir un mòdul: declareu permisos `view/manage`, migració idempotent, repositori, servei, validació, ruta protegida, auditoria, entrada de navegació i vistes. Les pujades futures han de respectar `MAX_UPLOAD_MB` i validar MIME/signatura abans de persistir-se.

## Mòdul Vendes clients

El menú **Vendes clients** permet consultar totals confirmats entre dates i gestionar importacions PDF. El flux és: pujar PDF → revisar resum i incidències → corregir línies → confirmar. Una previsualització pendent no apareix a les vendes. Els endpoints són `/api/imports/delivery-notes/preview`, `/api/imports`, `/api/imports/:id`, `/api/imports/:id/rows/:rowId`, `/api/imports/:id/confirm` i `/api/sales/clients`.

L'extractor treballa localment amb la capa de text i coordenades del PDF. Els documents escanejats sense text es rebutgen amb el codi `PDF_WITHOUT_TEXT`; l'OCR local queda com a ampliació posterior per evitar introduir dependències pesades o serveis externs sense configuració explícita.
