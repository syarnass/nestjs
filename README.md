# HR API — NestJS + MySQL + Prisma

Backend aplikasi HR: data karyawan, pengajuan cuti, dan approval atasan.

> **Status:** autentikasi JWT & manajemen user (role) selesai.
> Modul karyawan dan cuti menyusul.

## Tech Stack

- **NestJS 10** (TypeScript)
- **MySQL 8** + **Prisma 6** (ORM)
- **JWT** (access token + refresh token dengan rotasi)
- **class-validator** (validasi DTO & environment)
- **Swagger** (dokumentasi API), **Helmet**, **Throttler** (rate limit)

## Struktur Folder

```
prisma/
├── schema.prisma               # model database
├── migrations/                 # riwayat migrasi
└── seed.ts                     # membuat akun admin awal
src/
├── main.ts                     # bootstrap: helmet, CORS, prefix /api, Swagger
├── app.module.ts               # guard & filter global
├── config/
│   └── env.validation.ts       # validasi .env saat start
├── common/
│   ├── decorators/             # @Public, @Roles, @CurrentUser
│   └── filters/                # PrismaExceptionFilter (P2002→409, P2025→404)
├── prisma/                     # PrismaService (global)
├── auth/
│   ├── dto/                    # LoginDto, RefreshTokenDto, ChangePasswordDto
│   ├── guards/                 # JwtAuthGuard, RolesGuard (global)
│   ├── interfaces/
│   ├── auth.controller.ts
│   └── auth.service.ts
└── users/                      # CRUD user (khusus ADMIN)
test/
└── auth.e2e-spec.ts
```

## Cara Menjalankan

```bash
npm install
cp .env.example .env          # lalu sesuaikan nilainya
docker compose up -d          # menjalankan MySQL
npm run prisma:migrate        # membuat tabel
npm run prisma:seed           # membuat akun admin awal
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs` (hanya di luar production)

Akun admin default (dari `.env`): `admin@hr.local` / `Admin123!`, **ganti di production**.

## Autentikasi

Semua endpoint **wajib login** secara default (guard global). Endpoint publik
ditandai dengan `@Public()`; pembatasan role memakai `@Roles(Role.ADMIN, ...)`.

| Method | Endpoint                    | Akses   | Keterangan                                 |
|--------|-----------------------------|---------|--------------------------------------------|
| POST   | `/api/auth/login`           | Publik  | Login → `accessToken` + `refreshToken`     |
| POST   | `/api/auth/refresh`         | Publik  | Tukar refresh token dengan token baru      |
| POST   | `/api/auth/logout`          | Login   | Mengakhiri sesi (refresh token dicabut)    |
| GET    | `/api/auth/me`              | Login   | Profil user yang sedang login              |
| POST   | `/api/auth/change-password` | Login   | Ganti password (sesi lain ikut berakhir)   |
| CRUD   | `/api/users`                | ADMIN   | Kelola akun & role user                    |

Kirim access token di header:

```
Authorization: Bearer <accessToken>
```

### Role

| Role       | Rencana hak akses                                  |
|------------|----------------------------------------------------|
| `ADMIN`    | Mengelola user & data karyawan                     |
| `MANAGER`  | Atasan: menyetujui / menolak cuti bawahannya       |
| `EMPLOYEE` | Karyawan: mengajukan cuti                          |

### Keamanan yang diterapkan

- Password di-hash dengan **bcrypt**; tidak pernah dikembalikan di response.
- **Access token** berumur pendek (default 15 menit), **refresh token** 7 hari.
- Refresh token **dirotasi** setiap dipakai dan hanya hash SHA-256-nya yang
  disimpan; token lama langsung tidak berlaku. Logout, ganti password, dan
  menonaktifkan user mencabut sesi.
- Pesan error login sama untuk email salah & password salah.
- Rate limit login: 5 percobaan / menit per IP.
- Aplikasi menolak start jika `.env` tidak valid (mis. secret JWT < 32 karakter).

## Testing

```bash
npm test             # unit test
npm run test:e2e     # e2e, butuh database berjalan (DATABASE_URL)
```

## Script

| Script                    | Fungsi                                 |
|---------------------------|----------------------------------------|
| `npm run start:dev`       | Menjalankan app (watch mode)           |
| `npm run build`           | Build ke `dist/`                       |
| `npm run lint`            | ESLint                                 |
| `npm run prisma:migrate`  | Buat & jalankan migrasi (development)  |
| `npm run prisma:deploy`   | Jalankan migrasi (production)          |
| `npm run prisma:seed`     | Buat akun admin awal                   |
| `npm run prisma:studio`   | GUI untuk melihat data                 |
