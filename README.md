# HR API — NestJS + MySQL + Prisma

Backend aplikasi HR: data karyawan, pengajuan cuti, dan approval atasan.

> **Status:** autentikasi JWT, manajemen user, data karyawan, hari libur
> nasional, serta pengajuan & approval cuti sudah tersedia.

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
│   ├── dto/                    # PaginationQueryDto
│   ├── filters/                # PrismaExceptionFilter (P2002→409, P2025→404)
│   └── utils/                  # utilitas tanggal & hari kerja
├── prisma/                     # PrismaService (global)
├── auth/
│   ├── dto/                    # LoginDto, RefreshTokenDto, ChangePasswordDto
│   ├── guards/                 # JwtAuthGuard, RolesGuard (global)
│   ├── interfaces/
│   ├── auth.controller.ts
│   └── auth.service.ts
├── users/                      # CRUD akun user (khusus ADMIN)
├── employees/                  # data karyawan & hierarki atasan
├── holidays/                   # hari libur & perhitungan hari kerja
└── leaves/                     # saldo cuti, pengajuan, approval
test/
├── auth.e2e-spec.ts
├── holidays.e2e-spec.ts
└── leaves.e2e-spec.ts
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

Akun hasil seed (data contoh atasan & karyawan hanya dibuat di luar production):

| Role     | Email               | Password       |
|----------|---------------------|----------------|
| ADMIN    | `admin@hr.local`    | `Admin123!`    |
| MANAGER  | `manager@hr.local`  | `Password123!` |
| EMPLOYEE | `karyawan@hr.local` | `Password123!` |

**Ganti password admin & secret JWT di production.**

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

| Role       | Hak akses                                                        |
|------------|------------------------------------------------------------------|
| `ADMIN`    | Mengelola user, karyawan, jatah cuti; bisa memproses semua cuti  |
| `MANAGER`  | Atasan: menyetujui / menolak cuti **bawahan langsungnya**        |
| `EMPLOYEE` | Karyawan: mengajukan, melihat, dan membatalkan cuti sendiri      |

## Karyawan

| Method | Endpoint                          | Akses          | Keterangan                                  |
|--------|-----------------------------------|----------------|---------------------------------------------|
| POST   | `/api/employees`                  | ADMIN          | Buat akun login + data karyawan sekaligus   |
| GET    | `/api/employees`                  | ADMIN          | Daftar karyawan (`?search=&department=&page=&limit=`) |
| GET    | `/api/employees/:id`              | ADMIN          | Detail karyawan                             |
| PATCH  | `/api/employees/:id`              | ADMIN          | Ubah data / atasan (`managerId: null` = tanpa atasan) |
| GET    | `/api/employees/me`               | Login          | Data kepegawaian sendiri                    |
| GET    | `/api/employees/me/subordinates`  | MANAGER, ADMIN | Daftar bawahan langsung                     |

Atasan harus ber-role `MANAGER`/`ADMIN`, tidak boleh diri sendiri, dan tidak
boleh membentuk hierarki melingkar. Menonaktifkan karyawan dilakukan lewat
`PATCH /api/users/:id` dengan `isActive: false`.

## Hari Libur

| Method | Endpoint             | Akses | Keterangan                                        |
|--------|----------------------|-------|---------------------------------------------------|
| GET    | `/api/holidays`      | Login | Daftar hari libur (`?year=`, default tahun ini)   |
| POST   | `/api/holidays`      | ADMIN | Tambah satu hari libur `{ date, name }`           |
| POST   | `/api/holidays/bulk` | ADMIN | Import banyak sekaligus; tanggal yang sudah ada dilewati |
| PATCH  | `/api/holidays/:id`  | ADMIN | Ubah nama / tanggal                               |
| DELETE | `/api/holidays/:id`  | ADMIN | Hapus hari libur                                  |

Seed hanya menambahkan hari libur **bertanggal tetap** (1 Jan, 1 Mei, 1 Jun,
17 Agu, 25 Des) untuk tahun ini dan tahun depan. Hari libur yang tanggalnya
berubah setiap tahun (Imlek, Isra Mi'raj, Nyepi, Idul Fitri, Waisak, Idul Adha,
dll.) serta **cuti bersama** perlu diimpor ADMIN sesuai SKB 3 Menteri:

```bash
curl -X POST http://localhost:3000/api/holidays/bulk \
  -H "Authorization: Bearer <token-admin>" \
  -H "Content-Type: application/json" \
  -d '{ "holidays": [
        { "date": "2027-03-10", "name": "Hari Raya Idul Fitri" },
        { "date": "2027-03-11", "name": "Hari Raya Idul Fitri" }
      ] }'
```

> Tanggal di atas hanya contoh format, gunakan tanggal resmi dari pemerintah.

Saat hari libur ditambah, diubah, atau dihapus, jumlah hari pada pengajuan
cuti yang masih **PENDING** dihitung ulang otomatis. Cuti yang sudah diproses
(APPROVED, dll.) tidak diubah agar saldo yang sudah terpotong tetap konsisten.

## Cuti

### Alur

```
Karyawan mengajukan ──► PENDING ──► atasan approve ──► APPROVED (saldo berkurang)
                            │
                            ├────► atasan reject  ──► REJECTED (saldo tetap)
                            └────► karyawan cancel ─► CANCELLED (saldo tetap)
```

| Method | Endpoint                                         | Akses          | Keterangan                                    |
|--------|--------------------------------------------------|----------------|-----------------------------------------------|
| POST   | `/api/leave-requests`                            | Login          | Ajukan cuti `{ startDate, endDate, reason }`  |
| GET    | `/api/leave-requests/me`                         | Login          | Riwayat cuti sendiri (`?status=&year=`)       |
| GET    | `/api/leave-requests/approvals`                  | MANAGER, ADMIN | Pengajuan yang bisa diproses (`?status=PENDING`) |
| GET    | `/api/leave-requests/:id`                        | Pemilik / atasan / ADMIN | Detail pengajuan                    |
| PATCH  | `/api/leave-requests/:id/approve`                | MANAGER, ADMIN | Setujui `{ note? }`                           |
| PATCH  | `/api/leave-requests/:id/reject`                 | MANAGER, ADMIN | Tolak `{ note }` (alasan wajib)               |
| PATCH  | `/api/leave-requests/:id/cancel`                 | Pemilik        | Batalkan pengajuan PENDING                    |
| GET    | `/api/leave-balances/me`                         | Login          | Saldo cuti sendiri (`?year=`)                 |
| GET    | `/api/leave-balances/employees/:employeeId`      | ADMIN          | Saldo cuti karyawan                           |
| PUT    | `/api/leave-balances/employees/:employeeId/:year`| ADMIN          | Atur jatah cuti `{ quota }`                   |

Contoh response saldo:

```json
{ "year": 2026, "quota": 12, "used": 3, "pending": 2, "remaining": 9, "available": 7 }
```

- `used`: cuti yang sudah disetujui; `pending`: menunggu persetujuan
- `remaining = quota - used`; `available = remaining - pending` (yang masih bisa diajukan)

### Aturan bisnis

- Jumlah hari = **hari kerja**: akhir pekan dan hari libur (tabel `holidays`)
  tidak dihitung.
- Jatah default per tahun diatur lewat `LEAVE_DEFAULT_QUOTA` (default 12) dan
  dibuat otomatis saat pertama kali dibutuhkan; ADMIN bisa mengubahnya per karyawan.
- Tanggal mulai tidak boleh lewat (menurut `APP_TIMEZONE`, default `Asia/Jakarta`),
  satu pengajuan tidak boleh lintas tahun, dan tidak boleh bentrok dengan cuti
  PENDING/APPROVED lain.
- Pengajuan ditolak jika melebihi `available`.
- Yang bisa memproses: **atasan langsung** atau **ADMIN**; tidak ada yang bisa
  memproses pengajuannya sendiri.
- Approval dan pemotongan saldo terjadi dalam **satu transaksi database**:
  status hanya berubah jika masih PENDING (approve ganda → 409), dan transaksi
  dibatalkan jika saldo tidak mencukupi, sehingga saldo tidak pernah minus.

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
                     # data test dibuat & dihapus sendiri (email *.local khusus test)
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
