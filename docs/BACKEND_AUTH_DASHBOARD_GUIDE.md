# Backend Authentication & Dashboard Workflow Guide

This document explains the architecture, flow, and code structure for authentication and dashboard data in the **MedBridge** backend.

---

## 1. Authentication & Dashboard Architecture Flow

```
[ Frontend Client ] 
        │
        │ 1. POST /api/auth/login { email, password }
        ▼
[ auth.routes.js ]
        │
        │ 2. Validate body & delegate
        ▼
[ auth.service.js ] ──► bcrypt.compare() ──► signToken(JWT)
        │
        │ 3. Returns { token, user }
        ▼
[ Frontend Client ] (Stores token in localStorage / memory)
        │
        │ 4. GET /api/dashboard/stats (Header: "Authorization: Bearer <token>")
        ▼
[ requireAuth Middleware ] (auth.js)
        │ 5. Verifies JWT signature & attaches user to req.user
        ▼
[ dashboard.controller.js ]
        │ 6. Extracts req.user.hospitalId
        ▼
[ dashboard.service.js ] ──► Queries Prisma DB filtered by hospitalId
        │
        ▼
[ 200 OK Response with Dashboard Stats ]
```

---

## 2. Why Use a "Bearer Token"?

- **Standardization**: HTTP `Authorization` headers accept different auth schemes (`Basic`, `Bearer`, `Digest`). The `Bearer` prefix tells the backend that the token string is an unencrypted OAuth2/JWT token.
- **Literal Meaning**: "Bearer" means *"grant access to the holder (bearer) of this token"*.
- **Stateless**: The server doesn't store session state in memory. Each request carries the user's signed token.

---

## 3. Core Layer Roles (Separation of Concerns)

| Layer | File Example | Responsibility |
| :--- | :--- | :--- |
| **Routes** | [auth.routes.js](file:///C:/Users/Lenovo/Desktop/Medbridge/apps/backend/src/routes/auth.routes.js) | Maps HTTP paths (`/login`, `/stats`) to middlewares and controllers. |
| **Middleware** | [auth.js](file:///C:/Users/Lenovo/Desktop/Medbridge/apps/backend/src/middleware/auth.js) | Security gatekeeper. Verifies JWT tokens (`requireAuth`) and roles (`requireRole`). |
| **Controller** | [auth.controller.js](file:///C:/Users/Lenovo/Desktop/Medbridge/apps/backend/src/controllers/auth.controller.js) | Reads request input (`req.body`, `req.user`) and sends HTTP responses (`res.json`). |
| **Service** | [auth.service.js](file:///C:/Users/Lenovo/Desktop/Medbridge/apps/backend/src/services/auth.service.js) | Business logic & DB queries. Hashes passwords (`bcrypt`), generates tokens, calls Prisma. |

---

## 4. Supporting Backend Utilities & Config Files

- **`apps/backend/src/app.js`**: Initializes Express, CORS, JSON parser, routes, and global error handlers.
- **`apps/backend/src/index.js`**: Starts the server listener on port 5000.
- **`apps/backend/src/config/db.js`**: Exported Prisma Client instance for database connection.
- **`apps/backend/src/utils/jwt.js`**: Helper functions `signToken()` and `verifyToken()`.
- **`apps/backend/src/utils/ApiError.js`**: Custom error class with HTTP status code.
- **`apps/backend/src/utils/asyncHandler.js`**: Catches async errors automatically and routes to error handlers.
- **`apps/backend/src/middleware/validate.js`**: Validates request bodies against Zod schemas.
- **`apps/backend/src/middleware/errorHandler.js`**: Catches missing routes (404) and global errors, returning JSON responses.
