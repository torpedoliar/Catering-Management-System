<p align="center">
  <img src="https://img.icons8.com/fluency/96/restaurant.png" alt="Catering Management System Logo" width="96" height="96">
</p>

<h1 align="center">🍽️ Catering Management System</h1>

<p align="center">
  <strong>Modern & Efficient Corporate Catering Management Solution</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node">
  <img src="https://img.shields.io/badge/typescript-%5E5.0.0-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/react-%5E18.0.0-61dafb.svg" alt="React">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma">
  <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind">
</p>

---

## 📋 Overview

**Catering Management System** adalah solusi lengkap untuk mengelola pemesanan katering perusahaan dengan fitur modern seperti multi-shift scheduling, QR code check-in, real-time updates, dan sistem blacklist otomatis untuk mengurangi food waste.

### ✨ Key Features

| Feature | Description |
|---------|-------------|
| 📅 **Multi-Day Ordering** | Pesan makanan untuk beberapa hari ke depan |
| ⏰ **Multi-Shift Support** | Dukungan untuk berbagai shift dengan waktu fleksibel |
| 📱 **QR Code Check-in** | Verifikasi pengambilan makanan dengan QR code unik |
| 🏢 **Department Access Control** | Kontrol akses berdasarkan struktur organisasi |
| 🔔 **Real-time Updates** | Server-Sent Events (SSE) untuk update status instan |
| 🚫 **Auto Blacklist System** | Sistem strike otomatis untuk mengurangi no-show |
| 🕐 **NTP Time Sync** | Sinkronisasi waktu server untuk akurasi cutoff |
| 📊 **Comprehensive Reports** | Export laporan detail ke Excel |
| 📝 **Audit Log** | Pencatatan lengkap semua aktivitas sistem |

---

## 🖼️ Screenshots

<details>
<summary>📸 Click to view screenshots</summary>

### Login Page
Modern login interface dengan gradient design

### Dashboard
Real-time statistics dan overview

### Order Management
Intuitive ordering interface dengan shift selection

### Admin Panel
Comprehensive admin controls dan configurations

</details>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │  Pages  │  │Components│  │Contexts │  │     Utils       │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP/SSE
┌────────────────────────────▼────────────────────────────────┐
│                   Backend (Express + Node.js)                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │ Routes  │  │Services │  │Middleware│  │   Controllers   │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ Prisma ORM
┌────────────────────────────▼────────────────────────────────┐
│                      PostgreSQL Database                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │  Users  │  │ Orders  │  │ Shifts  │  │   Audit Logs    │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/torpedoliar/Catering-Management-System.git
cd Catering-Management-System
```

2. **Setup Backend**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npx prisma migrate dev
npx prisma db seed
npm run dev
```

3. **Setup Frontend**
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

4. **Access the application**
- Frontend: http://localhost:3011
- Backend API: http://localhost:3012

### 🐳 Docker Deployment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

---

## 📁 Project Structure

```
Catering-Management-System/
├── 📂 backend/
│   ├── 📂 prisma/
│   │   ├── schema.prisma      # Database schema
│   │   ├── migrations/        # Database migrations
│   │   └── seed.ts            # Database seeder
│   ├── 📂 src/
│   │   ├── 📂 controllers/    # Request handlers
│   │   ├── 📂 middleware/     # Auth & validation
│   │   ├── 📂 routes/         # API routes
│   │   ├── 📂 services/       # Business logic
│   │   └── index.ts           # Entry point
│   └── package.json
│
├── 📂 frontend/
│   ├── 📂 src/
│   │   ├── 📂 components/     # Reusable components
│   │   ├── 📂 contexts/       # React contexts
│   │   ├── 📂 pages/          # Page components
│   │   ├── 📂 utils/          # Utility functions
│   │   ├── App.tsx            # Main app component
│   │   └── main.tsx           # Entry point
│   └── package.json
│
├── 📂 docs/                   # Documentation
├── docker-compose.yml         # Docker configuration
└── README.md
```

---

## 🔐 User Roles

| Role | Permissions |
|------|------------|
| **USER** | Order food, view history, cancel orders |
| **CANTEEN** | Check-in orders via QR/manual, view today's orders |
| **ADMIN** | Full access: manage users, shifts, settings, reports |

### Default Credentials

| Role | ID | Password |
|------|-----|----------|
| Admin | `admin` | `admin123` |
| Canteen | `canteen` | `canteen123` |

⚠️ **Important:** Change default passwords after first login!

---

## 🛠️ Tech Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** JWT
- **Real-time:** Server-Sent Events (SSE)
- **Time Sync:** NTP

### Frontend
- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **State:** React Context
- **Router:** React Router v6
- **QR Code:** qrcode.react

---

## 📊 API Endpoints

<details>
<summary>📡 View API Documentation</summary>

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/auth/me` | Get current user |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | Get all orders (Admin) |
| POST | `/api/orders` | Create new order |
| POST | `/api/orders/checkin/qr` | Check-in via QR |
| POST | `/api/orders/:id/cancel` | Cancel order |
| GET | `/api/orders/export` | Export to Excel |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | Get all users |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| POST | `/api/users/import` | Import from Excel |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |

</details>

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

<p align="center">
  <img src="https://github.com/torpedoliar.png" width="100" height="100" style="border-radius: 50%;" alt="Yohanes Octavian Rizky">
</p>

<p align="center">
  <strong>Yohanes Octavian Rizky</strong>
</p>

<p align="center">
  <em>"Peningkatan kecil setiap hari pada akhirnya menghasilkan hasil yang besar."</em>
</p>

<p align="center">
  <a href="https://github.com/torpedoliar">
    <img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub">
  </a>
  <a href="mailto:yohanesorizky@gmail.com">
    <img src="https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Email">
  </a>
</p>

---

<p align="center">
  Made with ❤️ in Indonesia
</p>

<p align="center">
  © 2026 Catering Management System
</p>
