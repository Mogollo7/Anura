# Integración de Preferencias de Usuario - Resumen de Cambios

## 📋 Descripción General
Se ha organizado completamente el flujo de preferencias de usuario para que:
1. Los datos de preferencias se guarden y recuperen correctamente de la BD
2. Al registrarse, se creen preferencias por defecto
3. Al hacer login, se devuelvan las preferencias
4. El frontend cargue las preferencias automáticamente al autenticarse
5. Los usuarios existentes ya tengan datos de preferencias (datos aleatorios)

---

## 🔄 Cambios Realizados

### 1. **Backend - Auth Service**

#### 📄 `services/auth-service/src/services/authService.js`
- ✅ Agregado import de `preferencesRepository`
- ✅ **Función `registrar`**: Ahora crea preferencias por defecto para nuevos usuarios
- ✅ **Función `login`**: Ahora devuelve preferencias junto con token y usuario

```javascript
// Nuevo: Al registrarse se crean preferencias automáticamente
await preferencesRepository.create(newUser.id, {});

// Nuevo: Al hacer login se devuelven las preferencias
let preferences = await preferencesRepository.findByUserId(user.id);
if (!preferences) {
  preferences = await preferencesRepository.create(user.id, {});
}
return {
  message: '...',
  user: user.toJSON(),
  preferences: preferences.toJSON(),  // ← NUEVO
  token
};
```

**Infraestructura Existente (sin cambios):**
- ✅ `models/UserPreferences.js` - Modelo correctamente definido
- ✅ `repositories/preferencesRepository.js` - CRUD completo (findByUserId, create, update, upsert)
- ✅ `services/preferencesService.js` - Servicio funcional
- ✅ `controllers/preferencesController.js` - Controlador con get y update
- ✅ `routes/preferences.routes.js` - Rutas protegidas con JWT

---

### 2. **Frontend - React**

#### 📄 `frontend/src/store/preferencesStore.js`
- ✅ Agregado método `initializeFromBackend(backendPreferences)`
  - Mapea preferencias del backend al formato del frontend
  - Guarda en localStorage
  - Aplica cambios visuales en el DOM

```javascript
initializeFromBackend: (backendPreferences) => set((state) => {
  const mapped = mapBackendToFrontend(backendPreferences)
  // Guardar en localStorage y aplicar en DOM
  // ...
  return { preferences: mapped }
}),
```

#### 📄 `frontend/src/App.jsx`
- ✅ Actualizado `Login` component
  - Importa `initializeFromBackend` del store
  - Al hacer login exitoso, inicializa preferencias del backend
  - Mapeo automático de preferencias recibidas del API

```javascript
// Nuevo: Inicializar preferencias desde el backend
if (data.preferences) {
  initializeFromBackend(data.preferences)
}
```

---

### 3. **Base de Datos**

#### 📄 `infrastructure/postgres/init.sql`
- ✅ Tabla `auth.user_preferences` ya existe con estructura correcta
```sql
CREATE TABLE IF NOT EXISTS auth.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'dark',
    interface_mode VARCHAR(30) DEFAULT 'standard',
    accessibility_mode BOOLEAN DEFAULT FALSE,
    language VARCHAR(10) DEFAULT 'es',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    exact_location_enabled BOOLEAN DEFAULT FALSE,
    public_profile BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 📄 `infrastructure/postgres/seed_preferences.sql` (NUEVO)
- ✅ Script para llenar preferencias de usuarios existentes
- ✅ Datos aleatorios realistas por usuario:
  - Theme: light/dark/auto
  - Interface mode: standard/educational/scientific/virtual
  - Language: es/en/fr/pt
  - Accesibilidad: random 30%
  - Notificaciones: random 80%
  - Ubicación exacta: random 15%
  - Perfil público: random 90%

**Resultado:** ✅ 6 usuarios existentes ahora tienen preferencias

---

## 🔄 Flujo Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. REGISTRO (Sign Up)                                       │
├─────────────────────────────────────────────────────────────┤
│ User → Frontend → POST /api/auth/register                   │
│        ↓                                                     │
│ Backend: authService.registrar()                            │
│   • Crear usuario                                           │
│   • Crear preferencias por defecto ← NUEVO                  │
│        ↓                                                     │
│ Response: { usuario, message }                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. LOGIN                                                     │
├─────────────────────────────────────────────────────────────┤
│ User → Frontend → POST /api/auth/login                      │
│                    { email, password }                      │
│        ↓                                                     │
│ Backend: authService.login()                                │
│   • Verificar credenciales                                  │
│   • Obtener/crear preferencias ← NUEVO                      │
│   • Generar JWT token                                       │
│        ↓                                                     │
│ Response: {                                                 │
│   user: { ... },                                            │
│   preferences: { ... },  ← NUEVO                            │
│   token: "jwt...",                                          │
│   message: "Te has logueado correctamente"                  │
│ }                                                           │
│        ↓                                                     │
│ Frontend: handleLogin()                                     │
│   • Guardar token en localStorage                           │
│   • initializeFromBackend(data.preferences) ← NUEVO         │
│   • Redirigir a /preferences o /home/camara                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 3. GUARDAR/ACTUALIZAR PREFERENCIAS                          │
├─────────────────────────────────────────────────────────────┤
│ User en /preferences → Frontend → PUT /api/preferences      │
│        ↓                                                     │
│ Backend: preferencesController.updatePreferences()          │
│   • Validar JWT token                                       │
│   • Actualizar en BD via upsert                             │
│        ↓                                                     │
│ Response: { preferencias actualizadas }                     │
│        ↓                                                     │
│ Frontend: savePreferences()                                 │
│   • Guardar en localStorage                                 │
│   • Mostrar notificación de éxito                           │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ Checklist de Implementación

- [x] Tabla de preferencias en BD (ya existía)
- [x] Modelo de preferencias (ya existía)
- [x] Repository (CRUD) (ya existía)
- [x] Service de preferencias (ya existía)
- [x] Controller de preferencias (ya existía)
- [x] Routes de preferencias (ya existía)
- [x] **NUEVO:** Backend devuelve preferencias en login
- [x] **NUEVO:** Backend crea preferencias al registrar
- [x] **NUEVO:** Frontend inicializa preferencias desde login
- [x] **NUEVO:** Script para llenar datos existentes
- [x] **NUEVO:** Ejecución del script (6 usuarios poblados)

---

## 🧪 Cómo Probar

### 1. **Verificar preferencias en BD**
```bash
docker exec anura_postgres psql -U anura_user -d anura \
  -c "SELECT user_id, theme, interface_mode, language FROM auth.user_preferences LIMIT 5;"
```

### 2. **Probar flujo de login**
```bash
# Desde frontend o Postman:
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'

# Respuesta incluirá:
# {
#   "user": {...},
#   "preferences": {
#     "theme": "dark",
#     "interface_mode": "standard",
#     "language": "es",
#     ...
#   },
#   "token": "eyJ..."
# }
```

### 3. **Probar actualización de preferencias**
```bash
curl -X PUT http://localhost:3001/api/preferences \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "theme": "light",
    "interface_mode": "educational",
    "language": "en"
  }'
```

### 4. **Probar en Frontend**
1. Ir a `/login`
2. Ingresar credenciales
3. Deberías ser redirigido a `/preferences` o `/home/camara`
4. Las preferencias se cargarán automáticamente
5. Cambiar preferencias y hacer click en "Guardar"
6. Recarga de página - las preferencias se mantienen

---

## 📝 Notas Importantes

1. **Mapeo Frontend↔Backend:**
   - Frontend: `mode`, `accessibility.highContrast`, `accessibility.fontSize`, etc.
   - Backend: `interface_mode`, `accessibility_mode`, sin fontSize (se maneja en localStorage)

2. **Valores por Defecto:**
   - Backend: theme='dark', interface_mode='standard', language='es'
   - Frontend: carga desde localStorage o defaults

3. **Persistencia:**
   - localStorage: Para disponibilidad offline y carga rápida
   - PostgreSQL: Para sincronizar entre dispositivos
   - API: Sincronización bidireccional

4. **Seguridad:**
   - Las rutas de preferencias requieren JWT token
   - Solo el usuario propietario puede actualizar sus preferencias
   - Foreign key ON DELETE CASCADE protege integridad

---

## 🚀 Próximos Pasos (Opcionales)

1. Crear endpoint GET `/api/me/preferences` para obtener solo preferencias
2. Agregar endpoint para reset a preferencias por defecto
3. Validación más estricta de valores permitidos
4. Notificaciones en tiempo real cuando preferencias cambian
5. Historial de cambios de preferencias para auditoría
