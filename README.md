# NestJS + MySQL + Prisma

REST API CRUD sederhana menggunakan **NestJS**, **MySQL**, dan **Prisma ORM**.

## Fitur

- CRUD `users` (create, read, update, delete)
- Validasi input dengan **DTO** + `class-validator`
- Penanganan error: 404 (tidak ditemukan), 409 (email duplikat), 400 (validasi gagal)
- Konfigurasi lewat `.env` (`@nestjs/config`)
- MySQL lewat Docker Compose

## Struktur Folder

```
prisma/
├── schema.prisma          # definisi model / tabel
└── migrations/            # riwayat migrasi database
src/
├── main.ts                # entry point + ValidationPipe global
├── app.module.ts
├── prisma/
│   ├── prisma.module.ts   # modul global
│   └── prisma.service.ts  # koneksi PrismaClient
└── users/
    ├── dto/
    │   ├── create-user.dto.ts
    │   └── update-user.dto.ts
    ├── users.controller.ts
    ├── users.service.ts
    └── users.module.ts
```

## Cara Menjalankan

### 1. Install dependensi

```bash
npm install
```

### 2. Siapkan file `.env`

```bash
cp .env.example .env
```

Sesuaikan `DATABASE_URL` dengan MySQL Anda:

```env
DATABASE_URL="mysql://root:password@localhost:3306/nestjs_db"
```

### 3. Jalankan MySQL (via Docker)

```bash
docker compose up -d
```

Atau gunakan MySQL yang sudah terpasang di komputer Anda (buat database `nestjs_db` terlebih dahulu).

### 4. Jalankan migrasi

```bash
npm run prisma:migrate
```

### 5. Jalankan aplikasi

```bash
npm run start:dev
```

API berjalan di `http://localhost:3000`.

## Endpoint

| Method | URL          | Keterangan          |
|--------|--------------|---------------------|
| POST   | `/users`     | Tambah user         |
| GET    | `/users`     | Ambil semua user    |
| GET    | `/users/:id` | Ambil user by id    |
| PATCH  | `/users/:id` | Update user         |
| DELETE | `/users/:id` | Hapus user          |

### Contoh request

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Budi","email":"budi@mail.com","age":25}'
```

## Script Prisma

| Script                   | Fungsi                                   |
|--------------------------|------------------------------------------|
| `npm run prisma:generate`| Generate Prisma Client                   |
| `npm run prisma:migrate` | Buat & jalankan migrasi (development)    |
| `npm run prisma:deploy`  | Jalankan migrasi (production)            |
| `npm run prisma:studio`  | Buka GUI untuk melihat data              |
